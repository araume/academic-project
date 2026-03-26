const express = require('express');
const pool = require('../db/pool');
const { getMongoDb } = require('../db/mongo');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getSignedUrl } = require('../services/storage');
const { hasAdminPrivileges, getPlatformRole } = require('../services/roleAccess');
const { isSubjectsEnabled, isUnifiedVisibilityEnabled } = require('../services/featureFlags');
const { autoScanIncomingContent, isInappropriateScan } = require('../services/aiContentScanService');
const { ensureAiGovernanceReady } = require('../services/aiGovernanceService');
const { getOpenAIClient, getOpenAIModel, getOpenAIKey } = require('../services/openaiClient');
const { parseReportPayload } = require('../services/reporting');
const { createNotificationsForRecipients, isBlockedEitherDirection } = require('../services/notificationService');
const {
  ensureDepartmentWorkflowReady,
  loadUserCourseAccess,
  canUserAccessLibraryDocumentRow,
} = require('../services/departmentAccess');

const router = express.Router();

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const SUBJECTS_ACCESS_MODEL = 'auto_course_membership';
const RATE_WINDOW_MS = 60 * 1000;
const SUBJECT_AI_CONTEXT_POST_LIMIT = 6;
const SUBJECT_AI_HISTORY_LIMIT = 14;
const SUBJECT_AI_CONTEXT_BODY_CHARS = 700;
const SUBJECT_AI_CONTEXT_SUMMARY_CHARS = 240;
const SUBJECT_KIND_UNIT = 'unit';
const SUBJECT_KIND_THREAD = 'thread';
const SUBJECT_POST_APPROVAL_STATUSES = new Set(['approved', 'pending', 'rejected']);
const SUBJECT_MEMBERSHIP_STATES = new Set(['pending', 'member', 'left', 'suspended', 'banned']);
const SUBJECT_REPORT_STATUSES = new Set([
  'open',
  'under_review',
  'resolved_action_taken',
  'resolved_no_action',
  'rejected',
]);
const SUBJECT_REPORT_ACTIONS = new Set([
  'none',
  'take_down_subject_post',
  'take_down_subject_comment',
  'warn_target_user',
  'suspend_target_user',
  'request_ban_target_user',
]);
const SUBJECT_BAN_REQUEST_STATUSES = new Set(['open', 'under_review', 'approved_banned', 'rejected']);
const MAX_SUBJECT_SUSPENSION_HOURS = 24 * 365;
const rateBuckets = new Map();
const COURSE_SUBJECT_SOURCES = [
  {
    canonicalCourseName: 'Computer Science',
    aliases: ['computer science', 'comsci', 'cs', 'bscs', 'bs computer science'],
  },
  {
    canonicalCourseName: 'History',
    aliases: ['history', 'ba history'],
  },
  {
    canonicalCourseName: 'Psychology',
    aliases: ['psychology', 'bs psychology', 'ab psychology'],
  },
  {
    canonicalCourseName: 'Physics',
    aliases: ['physics', 'bs physics'],
  },
  {
    canonicalCourseName: 'Civil Engineering',
    aliases: ['civil engineering', 'ce', 'bsce', 'bs civil engineering'],
  },
];
let ensureDepAdminAssignmentsReadyPromise = null;
let ensureSubjectEngagementReadyPromise = null;
let ensureSubjectAiIndexesPromise = null;

router.use('/api/subjects', requireAuthApi);

router.use('/api/subjects', async (req, res, next) => {
  if (!isSubjectsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Subjects feature is disabled.' });
  }
  try {
    await ensureDepartmentWorkflowReady();
    await ensureSubjectEngagementReady();
    await ensureAiGovernanceReady();
    req.subjectCourseAccess = await loadUserCourseAccess(req.user && req.user.uid ? req.user.uid : '');
    return next();
  } catch (error) {
    console.error('Subjects governance bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Units service is unavailable.' });
  }
});

function normalizeText(value, max = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeContextText(text) {
  if (!text) return '';
  return String(text).replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateContextText(text, max = 1200) {
  const normalized = normalizeContextText(text);
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max).trim()}...` : normalized;
}

function normalizeCourse(value) {
  return normalizeText(value, 200);
}

function normalizeCourseKey(value) {
  return normalizeCourse(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveCourseSubjectSource(courseValue) {
  const key = normalizeCourseKey(courseValue);
  if (!key) return null;
  return (
    COURSE_SUBJECT_SOURCES.find((entry) => entry.aliases.some((alias) => normalizeCourseKey(alias) === key)) ||
    null
  );
}

function canonicalCourseNameForSubjects(courseValue) {
  const source = resolveCourseSubjectSource(courseValue);
  if (source && source.canonicalCourseName) {
    return source.canonicalCourseName;
  }
  return normalizeCourse(courseValue);
}

async function ensureDepAdminAssignmentsReady(client = pool) {
  if (!ensureDepAdminAssignmentsReadyPromise) {
    ensureDepAdminAssignmentsReadyPromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS course_dep_admin_assignments (
          id BIGSERIAL PRIMARY KEY,
          course_code TEXT,
          course_name TEXT NOT NULL UNIQUE,
          depadmin_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS course_dep_admin_assignments_depadmin_uid_idx
          ON course_dep_admin_assignments(depadmin_uid, updated_at DESC);
      `);
    })().catch((error) => {
      ensureDepAdminAssignmentsReadyPromise = null;
      throw error;
    });
  }
  await ensureDepAdminAssignmentsReadyPromise;
}

async function ensureSubjectEngagementReady(client = pool) {
  if (!ensureSubjectEngagementReadyPromise) {
    ensureSubjectEngagementReadyPromise = (async () => {
      await client.query(`
        ALTER TABLE subjects
          ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'unit';

        ALTER TABLE subjects
          DROP CONSTRAINT IF EXISTS subjects_kind_check;

        ALTER TABLE subjects
          ADD CONSTRAINT subjects_kind_check
            CHECK (kind IN ('unit', 'thread'));

        ALTER TABLE subjects
          DROP CONSTRAINT IF EXISTS subjects_course_name_subject_name_key;

        CREATE UNIQUE INDEX IF NOT EXISTS subjects_course_kind_name_unique_idx
          ON subjects(lower(course_name), kind, lower(subject_name));

        ALTER TABLE subject_memberships
          ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

        ALTER TABLE subject_memberships
          ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

        ALTER TABLE subject_memberships
          ADD COLUMN IF NOT EXISTS suspended_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

        ALTER TABLE subject_memberships
          DROP CONSTRAINT IF EXISTS subject_memberships_state_check;

        ALTER TABLE subject_memberships
          ADD CONSTRAINT subject_memberships_state_check
            CHECK (state IN ('pending', 'member', 'left', 'suspended', 'banned'));

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false;

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ;

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS approved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS rejected_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

        ALTER TABLE subject_posts
          ADD COLUMN IF NOT EXISTS rejection_note TEXT;

        ALTER TABLE subject_posts
          DROP CONSTRAINT IF EXISTS subject_posts_approval_status_check;

        ALTER TABLE subject_posts
          ADD CONSTRAINT subject_posts_approval_status_check
            CHECK (approval_status IN ('approved', 'pending', 'rejected'));

        CREATE TABLE IF NOT EXISTS subject_post_bookmarks (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES subject_posts(id) ON DELETE CASCADE,
          user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (subject_id, post_id, user_uid)
        );

        CREATE TABLE IF NOT EXISTS subject_post_reports (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES subject_posts(id) ON DELETE CASCADE,
          reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          category TEXT,
          custom_reason TEXT,
          details TEXT,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'under_review', 'resolved_action_taken', 'resolved_no_action', 'rejected')),
          moderation_action TEXT,
          resolution_note TEXT,
          resolved_at TIMESTAMPTZ,
          resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (post_id, reporter_uid)
        );

        CREATE INDEX IF NOT EXISTS subject_post_bookmarks_user_created_idx
          ON subject_post_bookmarks(user_uid, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_post_reports_subject_status_idx
          ON subject_post_reports(subject_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_post_reports_target_idx
          ON subject_post_reports(post_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS subject_comment_reports (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          comment_id BIGINT NOT NULL REFERENCES subject_comments(id) ON DELETE CASCADE,
          reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          category TEXT,
          custom_reason TEXT,
          details TEXT,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'under_review', 'resolved_action_taken', 'resolved_no_action', 'rejected')),
          moderation_action TEXT,
          resolution_note TEXT,
          resolved_at TIMESTAMPTZ,
          resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (comment_id, reporter_uid)
        );

        CREATE INDEX IF NOT EXISTS subject_comment_reports_subject_status_idx
          ON subject_comment_reports(subject_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_comment_reports_target_idx
          ON subject_comment_reports(comment_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS subject_posts_subject_approval_created_idx
          ON subject_posts(subject_id, approval_status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_memberships_user_state_suspended_idx
          ON subject_memberships(user_uid, state, suspended_until);
        CREATE INDEX IF NOT EXISTS subject_memberships_subject_state_suspended_idx
          ON subject_memberships(subject_id, state, suspended_until);

        CREATE TABLE IF NOT EXISTS subject_warnings (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          issued_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS subject_warnings_subject_created_idx
          ON subject_warnings(subject_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_warnings_target_created_idx
          ON subject_warnings(target_uid, created_at DESC);

        CREATE TABLE IF NOT EXISTS subject_ban_requests (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          requested_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'under_review', 'approved_banned', 'rejected')),
          reason TEXT,
          request_note TEXT,
          admin_note TEXT,
          resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS subject_ban_requests_status_created_idx
          ON subject_ban_requests(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_ban_requests_subject_status_idx
          ON subject_ban_requests(subject_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_ban_requests_target_status_idx
          ON subject_ban_requests(target_uid, status, created_at DESC);
      `);
    })().catch((error) => {
      ensureSubjectEngagementReadyPromise = null;
      throw error;
    });
  }
  await ensureSubjectEngagementReadyPromise;
}

async function hasDepAdminAssignmentForCourse(uid, courseName, client = pool) {
  if (!uid || !courseName) return false;
  await ensureDepAdminAssignmentsReady(client);
  const result = await client.query(
    `SELECT 1
     FROM course_dep_admin_assignments
     WHERE depadmin_uid = $1
       AND lower(course_name) = lower($2)
     LIMIT 1`,
    [uid, courseName]
  );
  return result.rows.length > 0;
}

function normalizeSubjectKind(value, fallback = SUBJECT_KIND_UNIT) {
  const normalized = normalizeText(value, 40).toLowerCase();
  if (normalized === SUBJECT_KIND_THREAD || normalized === SUBJECT_KIND_UNIT) {
    return normalized;
  }
  return fallback;
}

function normalizeSubjectPostApprovalStatus(value, fallback = 'approved') {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUBJECT_POST_APPROVAL_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeSubjectMembershipState(value, fallback = 'member') {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUBJECT_MEMBERSHIP_STATES.has(normalized) ? normalized : fallback;
}

function normalizeSubjectReportStatus(value, fallback = 'open') {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUBJECT_REPORT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeSubjectReportAction(value, fallback = 'none') {
  const normalized = normalizeText(value, 80).toLowerCase();
  return SUBJECT_REPORT_ACTIONS.has(normalized) ? normalized : fallback;
}

function normalizeSubjectBanRequestStatus(value, fallback = 'open') {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUBJECT_BAN_REQUEST_STATUSES.has(normalized) ? normalized : fallback;
}

function parseSubjectSuspensionDurationHours(value, fallback = 72) {
  const parsed = parsePositiveInt(value, fallback, MAX_SUBJECT_SUSPENSION_HOURS);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_SUBJECT_SUSPENSION_HOURS);
}

function isMemberRoleForSubjectGovernance(user) {
  return getPlatformRole(user) === 'member';
}

function canViewerAutoApproveSubjectPost(user) {
  return !isMemberRoleForSubjectGovernance(user);
}

function formatSubjectLabel(kind, plural = false) {
  if (normalizeSubjectKind(kind) === SUBJECT_KIND_THREAD) {
    return plural ? 'threads' : 'thread';
  }
  return plural ? 'units' : 'unit';
}

function buildSubjectPostTargetUrl(subjectId, postId) {
  if (!subjectId || !postId) return '/subjects';
  return `/subjects?subjectId=${encodeURIComponent(subjectId)}&postId=${encodeURIComponent(postId)}`;
}

function buildSubjectMyPostsTargetUrl(subjectId, { postId = null, status = 'all' } = {}) {
  if (!subjectId) return '/subjects';
  const params = new URLSearchParams();
  params.set('subjectId', String(subjectId));
  params.set('myPosts', '1');
  const normalizedStatus = ['approved', 'pending', 'rejected', 'removed'].includes(String(status || '').toLowerCase())
    ? String(status).toLowerCase()
    : 'all';
  if (normalizedStatus !== 'all') {
    params.set('myPostStatus', normalizedStatus);
  }
  if (postId) {
    params.set('myPostId', String(postId));
  }
  return `/subjects?${params.toString()}`;
}

function getSubjectNotificationName(subject) {
  return subject && (subject.subject_name || subject.subjectName) ? subject.subject_name || subject.subjectName : '';
}

async function createSubjectPostOwnerNotification({
  recipientUid,
  actorUid,
  type,
  subject,
  postId,
  postTitle,
  targetUrl,
}) {
  const safeRecipientUid = normalizeText(recipientUid, 120);
  const safeActorUid = normalizeText(actorUid, 120);
  if (!safeRecipientUid || !safeActorUid || safeRecipientUid === safeActorUid) {
    return;
  }

  const blocked = await isBlockedEitherDirection(safeActorUid, safeRecipientUid);
  if (blocked) {
    return;
  }

  await createNotificationsForRecipients({
    recipientUids: [safeRecipientUid],
    actorUid: safeActorUid,
    type,
    entityType: 'subject_post',
    entityId: String(postId || ''),
    targetUrl,
    meta: {
      postTitle: postTitle || 'Untitled post',
      subjectId: Number(subject && subject.id ? subject.id : 0) || null,
      subjectKind: normalizeSubjectKind(subject && (subject.kind || subject.subject_kind), SUBJECT_KIND_UNIT),
      subjectName: getSubjectNotificationName(subject),
      courseName: subject && (subject.course_name || subject.courseName) ? subject.course_name || subject.courseName : '',
    },
  });
}

async function canViewerCreateSubjectKind(kind, user, client = pool, courseAccess = null, courseName = '') {
  const role = getPlatformRole(user);
  const normalizedKind = normalizeSubjectKind(kind, SUBJECT_KIND_UNIT);
  const targetCourse = canonicalCourseNameForSubjects(courseName || resolveViewerMainCourseForSubjects(user, courseAccess));
  if (!targetCourse) return false;

  if (role === 'owner' || role === 'admin') return true;
  if (normalizedKind === SUBJECT_KIND_UNIT) {
    if (role !== 'depadmin') return false;
    return hasDepAdminAssignmentForCourse(user.uid, targetCourse, client);
  }
  if (role === 'depadmin') {
    return hasDepAdminAssignmentForCourse(user.uid, targetCourse, client);
  }
  return role === 'professor';
}

function isActiveSubjectSuspension(row) {
  if (!row) return false;
  if (normalizeSubjectMembershipState(row.membership_state || row.state, '') !== 'suspended') return false;
  if (!row.suspended_until) return false;
  const untilDate = new Date(row.suspended_until);
  return !Number.isNaN(untilDate.getTime()) && untilDate.getTime() > Date.now();
}

async function loadSubjectModerationAccess(subject, user, client = pool, courseAccess = null) {
  if (!subject || !user) return false;
  const role = getPlatformRole(user);
  if (role === 'owner' || role === 'admin') return true;
  const viewerCourse = resolveViewerMainCourseForSubjects(user, courseAccess);
  const subjectCourse = canonicalCourseNameForSubjects(subject.course_name);
  if (!viewerCourse || !subjectCourse || viewerCourse.toLowerCase() !== subjectCourse.toLowerCase()) {
    return false;
  }
  if (role === 'professor') return true;
  if (role === 'depadmin') {
    return hasDepAdminAssignmentForCourse(user.uid, subjectCourse, client);
  }
  return false;
}

async function listAdminRecipientUids(client = pool) {
  const result = await client.query(
    `SELECT uid
     FROM accounts
     WHERE COALESCE(is_banned, false) = false
       AND COALESCE(platform_role, 'member') IN ('owner', 'admin')`
  );
  return result.rows.map((row) => row.uid).filter(Boolean);
}

async function createSubjectBanRequest(
  subject,
  targetUid,
  requestedByUid,
  { reason = '', note = '' } = {},
  client = pool
) {
  if (!subject || !subject.id || !targetUid || !requestedByUid) return null;
  const subjectId = Number(subject.id);
  const requestReason = normalizeText(reason, 1000);
  const requestNote = normalizeText(note, 1000);
  const existingResult = await client.query(
    `SELECT id, status
     FROM subject_ban_requests
     WHERE subject_id = $1
       AND target_uid = $2
       AND status IN ('open', 'under_review')
     ORDER BY created_at DESC
     LIMIT 1`,
    [subjectId, targetUid]
  );
  if (existingResult.rows[0]) {
    return {
      id: Number(existingResult.rows[0].id),
      status: normalizeSubjectBanRequestStatus(existingResult.rows[0].status, 'open'),
      duplicate: true,
    };
  }

  const insertResult = await client.query(
    `INSERT INTO subject_ban_requests
       (subject_id, target_uid, requested_by_uid, status, reason, request_note, created_at, updated_at)
     VALUES
       ($1, $2, $3, 'open', $4, $5, NOW(), NOW())
     RETURNING id, status`,
    [subjectId, targetUid, requestedByUid, requestReason || null, requestNote || null]
  );
  const row = insertResult.rows[0] || null;

  const adminUids = await listAdminRecipientUids(client);
  if (row && adminUids.length) {
    createNotificationsForRecipients({
      recipientUids: adminUids,
      actorUid: requestedByUid,
      type: 'admin_custom',
      entityType: 'subject_ban_request',
      entityId: String(row.id),
      targetUrl: '/admin',
      meta: {
        customTitle: 'New unit moderation ban request',
        customMessage: `${formatSubjectLabel(subject.kind)} moderation requested an account-ban review for ${subject.subject_name || 'a unit member'}.`,
        subjectId,
        subjectKind: normalizeSubjectKind(subject.kind),
        subjectName: subject.subject_name || '',
        courseName: subject.course_name || '',
        targetUid,
      },
    }).catch((error) => {
      console.error('Subject ban request admin notification failed:', error);
    });
  }

  return row
    ? {
        id: Number(row.id),
        status: normalizeSubjectBanRequestStatus(row.status, 'open'),
        duplicate: false,
      }
    : null;
}

async function issueSubjectWarning(subjectId, targetUid, issuedByUid, reason, client = pool) {
  if (!subjectId || !targetUid || !issuedByUid) return null;
  const result = await client.query(
    `INSERT INTO subject_warnings (subject_id, target_uid, issued_by_uid, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [subjectId, targetUid, issuedByUid, normalizeText(reason, 1000) || null]
  );
  return result.rows[0] || null;
}

async function suspendSubjectMember(subjectId, targetUid, actorUid, reason, durationHours, client = pool) {
  if (!subjectId || !targetUid || !actorUid) return null;
  const duration = parseSubjectSuspensionDurationHours(durationHours, 72);
  const result = await client.query(
    `INSERT INTO subject_memberships
       (subject_id, user_uid, state, joined_at, suspended_until, suspended_reason, suspended_by_uid, created_at, updated_at)
     VALUES
       ($1, $2, 'suspended', NOW(), NOW() + ($4 || ' hours')::interval, $3, $5, NOW(), NOW())
     ON CONFLICT (subject_id, user_uid)
     DO UPDATE
       SET state = 'suspended',
           joined_at = COALESCE(subject_memberships.joined_at, NOW()),
           left_at = NULL,
           suspended_until = NOW() + ($4 || ' hours')::interval,
           suspended_reason = $3,
           suspended_by_uid = $5,
           updated_at = NOW()
     RETURNING state, suspended_until`,
    [subjectId, targetUid, normalizeText(reason, 1000) || null, String(duration), actorUid]
  );
  return result.rows[0] || null;
}

async function restoreSubjectMember(subjectId, targetUid, client = pool) {
  const result = await client.query(
    `UPDATE subject_memberships
     SET state = 'member',
         suspended_until = NULL,
         suspended_reason = NULL,
         suspended_by_uid = NULL,
         updated_at = NOW()
     WHERE subject_id = $1
       AND user_uid = $2
       AND state = 'suspended'
     RETURNING state`,
    [subjectId, targetUid]
  );
  return result.rows[0] || null;
}

async function loadSubjectTargetAccount(uid, client = pool) {
  if (!uid) return null;
  const result = await client.query(
    `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

async function ensureSubjectGovernanceTarget(subjectId, targetUid, actorUid, client = pool) {
  if (!subjectId || !targetUid) {
    return { ok: false, status: 400, message: 'Invalid target user.' };
  }
  if (targetUid === actorUid) {
    return { ok: false, status: 400, message: 'You cannot moderate your own account.' };
  }

  const account = await loadSubjectTargetAccount(targetUid, client);
  if (!account) {
    return { ok: false, status: 404, message: 'Target user not found.' };
  }
  if (normalizeText(account.platform_role, 40).toLowerCase() !== 'member') {
    return { ok: false, status: 403, message: 'Only student accounts can be moderated from units/threads.' };
  }

  const membershipResult = await client.query(
    `SELECT state, suspended_until
     FROM subject_memberships
     WHERE subject_id = $1
       AND user_uid = $2
     LIMIT 1`,
    [subjectId, targetUid]
  );

  return {
    ok: true,
    account,
    membership: membershipResult.rows[0] || null,
  };
}

async function refreshSubjectPostCommentCount(subjectId, postId, client = pool) {
  const result = await client.query(
    `UPDATE subject_posts sp
     SET comments_count = (
       SELECT COUNT(*)::int
       FROM subject_comments sc
       WHERE sc.subject_id = sp.subject_id
         AND sc.post_id = sp.id
         AND sc.status = 'active'
     ),
         updated_at = NOW()
     WHERE sp.subject_id = $1
       AND sp.id = $2
     RETURNING comments_count`,
    [subjectId, postId]
  );
  return Number(result.rows[0]?.comments_count || 0);
}

async function takeDownSubjectPost(postId, actorUid, reason, client = pool) {
  const result = await client.query(
    `UPDATE subject_posts sp
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     FROM subjects s
     WHERE sp.id = $1
       AND sp.status = 'active'
       AND s.id = sp.subject_id
     RETURNING sp.id, sp.subject_id, sp.author_uid, sp.title, s.kind, s.subject_name, s.course_name`,
    [postId, actorUid || null, normalizeText(reason, 1000) || null]
  );
  const row = result.rows[0] || null;
  if (row && row.author_uid && actorUid && row.author_uid !== actorUid) {
    createNotificationsForRecipients({
      recipientUids: [row.author_uid],
      actorUid,
      type: 'subject_post_deleted',
      entityType: 'subject_post',
      entityId: String(row.id),
      targetUrl: buildSubjectMyPostsTargetUrl(row.subject_id, { postId: row.id, status: 'removed' }),
      meta: {
        postTitle: row.title || 'Untitled post',
        subjectId: Number(row.subject_id || 0) || null,
        subjectKind: normalizeSubjectKind(row.kind, SUBJECT_KIND_UNIT),
        subjectName: row.subject_name || '',
        courseName: row.course_name || '',
        reason: normalizeText(reason, 1000) || 'Removed by moderation',
      },
    }).catch((error) => {
      console.error('Subject post removal notification failed:', error);
    });
  }
  return Boolean(row);
}

async function takeDownSubjectComment(commentId, actorUid, reason, client = pool) {
  const result = await client.query(
    `UPDATE subject_comments sc
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE sc.id = $1
       AND sc.status = 'active'
     RETURNING sc.id, sc.subject_id, sc.post_id, sc.author_uid, sc.content`,
    [commentId, actorUid || null, normalizeText(reason, 1000) || null]
  );
  const row = result.rows[0] || null;
  if (!row) return false;
  await refreshSubjectPostCommentCount(row.subject_id, row.post_id, client);
  return true;
}

function resolveViewerMainCourseForSubjects(user, courseAccess = null) {
  const profileMainCourse =
    courseAccess && typeof courseAccess === 'object' ? normalizeCourse(courseAccess.mainCourse) : '';
  const fallbackCourse = normalizeCourse(user && user.course);
  return canonicalCourseNameForSubjects(profileMainCourse || fallbackCourse);
}

function parsePositiveInt(value, fallback = 1, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function looksLikeUuid(value) {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function enforceRateLimit(req, res, action, maxPerWindow) {
  const uid = req.user && req.user.uid;
  if (!uid) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return false;
  }

  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [bucketKey, bucket] of rateBuckets.entries()) {
      if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS * 2) {
        rateBuckets.delete(bucketKey);
      }
    }
  }
  const key = `${uid}:${action}`;
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, startedAt: now });
    return true;
  }

  if (current.count >= maxPerWindow) {
    res.status(429).json({ ok: false, message: 'Too many requests. Please try again shortly.' });
    return false;
  }

  current.count += 1;
  return true;
}

function extractTextFromOpenAIResponse(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const contentItem of item.content) {
        const text = typeof contentItem?.text === 'string' ? contentItem.text.trim() : '';
        if (!text) continue;
        if (contentItem.type === 'output_text' || contentItem.type === 'text') {
          chunks.push(text);
        }
      }
    }
  }

  return chunks.join('\n\n').trim();
}

async function ensureSubjectAiIndexes() {
  if (!ensureSubjectAiIndexesPromise) {
    ensureSubjectAiIndexesPromise = (async () => {
      const db = await getMongoDb();
      await Promise.all([
        db.collection('subject_ai_conversations').createIndex({ subjectId: 1, userUid: 1 }, { unique: true }),
        db.collection('subject_ai_messages').createIndex({ conversationId: 1, userUid: 1, createdAt: 1 }),
        db.collection('subject_post_ai_conversations').createIndex({ subjectId: 1, postId: 1, userUid: 1 }, { unique: true }),
        db.collection('subject_post_ai_messages').createIndex({ conversationId: 1, userUid: 1, createdAt: 1 }),
      ]);
    })().catch((error) => {
      ensureSubjectAiIndexesPromise = null;
      throw error;
    });
  }
  await ensureSubjectAiIndexesPromise;
}

async function cleanupSubjectPostAiArtifacts(postId) {
  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId < 1) return;

  try {
    const db = await getMongoDb();
    const conversations = await db
      .collection('subject_post_ai_conversations')
      .find({ postId: numericPostId })
      .project({ _id: 1 })
      .toArray();
    const conversationIds = conversations.map((item) => item && item._id).filter(Boolean);

    const cleanupOps = [
      db.collection('subject_post_ai_conversations').deleteMany({ postId: numericPostId }),
    ];
    if (conversationIds.length) {
      cleanupOps.push(
        db.collection('subject_post_ai_messages').deleteMany({ conversationId: { $in: conversationIds } })
      );
    }
    await Promise.all(cleanupOps);
  } catch (error) {
    console.error('Subject post AI artifact cleanup failed:', error);
  }
}

async function signIfNeeded(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http')) return value;
  try {
    return await getSignedUrl(value, SIGNED_TTL);
  } catch (error) {
    return null;
  }
}

function canReadSubjectRow(subject, user, courseAccess = null) {
  if (!subject || !user) return false;
  if (hasAdminPrivileges(user)) return true;
  const viewerCourse = resolveViewerMainCourseForSubjects(user, courseAccess).toLowerCase();
  const subjectCourse = canonicalCourseNameForSubjects(subject.course_name).toLowerCase();
  if (!viewerCourse || !subjectCourse || viewerCourse !== subjectCourse) {
    return false;
  }
  if (normalizeSubjectMembershipState(subject.membership_state, '') === 'banned') {
    return false;
  }
  return true;
}

async function loadSubjectForViewer(subjectId, user, client = pool, courseAccess = null) {
  const result = await client.query(
    `SELECT
       s.id,
       s.course_code,
       s.course_name,
       s.kind,
       s.subject_code,
       s.subject_name,
       s.description,
       s.created_by_uid,
       s.is_active,
       s.created_at,
       s.updated_at,
       m.state AS membership_state,
       m.suspended_until,
       m.suspended_reason
     FROM subjects s
     LEFT JOIN subject_memberships m
       ON m.subject_id = s.id
      AND m.user_uid = $2
     WHERE s.id = $1
       AND s.is_active = true
     LIMIT 1`,
    [subjectId, user.uid]
  );
  const subject = result.rows[0];
  if (!subject) return { status: 'not_found', subject: null };
  if (!canReadSubjectRow(subject, user, courseAccess)) return { status: 'forbidden', subject };
  return { status: 'ok', subject };
}

async function ensureActiveMembership(subjectId, userUid, client = pool) {
  const existingResult = await client.query(
    `SELECT state, joined_at, left_at, suspended_until, suspended_reason
     FROM subject_memberships
     WHERE subject_id = $1
       AND user_uid = $2
     LIMIT 1`,
    [subjectId, userUid]
  );
  const row = existingResult.rows[0] || null;
  const now = new Date();
  if (!row) {
    const insertResult = await client.query(
      `INSERT INTO subject_memberships
         (subject_id, user_uid, state, joined_at, created_at, updated_at)
       VALUES
         ($1, $2, 'member', $3, $3, $3)
       RETURNING state, suspended_until, suspended_reason`,
      [subjectId, userUid, now]
    );
    return insertResult.rows[0] || { state: 'member', suspended_until: null, suspended_reason: null };
  }

  const membershipState = normalizeSubjectMembershipState(row.state, 'member');
  if (membershipState === 'banned') {
    return row;
  }
  if (membershipState === 'suspended' && isActiveSubjectSuspension(row)) {
    return row;
  }

  const updateResult = await client.query(
    `UPDATE subject_memberships
     SET state = 'member',
         joined_at = COALESCE(joined_at, $3),
         left_at = NULL,
         suspended_until = NULL,
         suspended_reason = NULL,
         suspended_by_uid = NULL,
         updated_at = $3
     WHERE subject_id = $1
       AND user_uid = $2
     RETURNING state, suspended_until, suspended_reason`,
    [subjectId, userUid, now]
  );
  return updateResult.rows[0] || { state: 'member', suspended_until: null, suspended_reason: null };
}

async function ensureSubjectInteractionAccess(subjectId, user, client = pool, courseAccess = null) {
  const subjectState = await loadSubjectForViewer(subjectId, user, client, courseAccess);
  if (subjectState.status !== 'ok') {
    return subjectState;
  }

  if (hasAdminPrivileges(user)) {
    return { status: 'ok', subject: subjectState.subject, membershipState: 'member', canModerate: true };
  }

  const membership = await ensureActiveMembership(subjectId, user.uid, client);
  const membershipState = normalizeSubjectMembershipState(membership && membership.state, 'member');
  if (membershipState === 'banned') {
    return { status: 'banned', subject: subjectState.subject };
  }
  if (membershipState === 'suspended' && isActiveSubjectSuspension(membership)) {
    return {
      status: 'suspended',
      subject: subjectState.subject,
      membershipState,
      suspendedUntil: membership.suspended_until || null,
      suspendedReason: membership.suspended_reason || null,
    };
  }

  const canModerate = await loadSubjectModerationAccess(subjectState.subject, user, client, courseAccess);
  return { status: 'ok', subject: subjectState.subject, membershipState, canModerate };
}

async function ensureSubjectModerationAccess(subjectId, user, client = pool, courseAccess = null) {
  const subjectState = await loadSubjectForViewer(subjectId, user, client, courseAccess);
  if (subjectState.status !== 'ok') {
    return subjectState;
  }
  const canModerate = await loadSubjectModerationAccess(subjectState.subject, user, client, courseAccess);
  if (!canModerate) {
    return { status: 'forbidden', subject: subjectState.subject };
  }
  return { status: 'ok', subject: subjectState.subject, canModerate: true };
}

async function ensureCourseSpaceManagementAccess(subjectId, user, client = pool, courseAccess = null) {
  const subjectState = await loadSubjectForViewer(subjectId, user, client, courseAccess);
  if (subjectState.status !== 'ok') {
    return subjectState;
  }

  if (hasAdminPrivileges(user)) {
    return { status: 'ok', subject: subjectState.subject };
  }

  if (getPlatformRole(user) !== 'depadmin') {
    return { status: 'forbidden', subject: subjectState.subject };
  }

  const subjectCourse = canonicalCourseNameForSubjects(subjectState.subject.course_name);
  if (!subjectCourse) {
    return { status: 'forbidden', subject: subjectState.subject };
  }

  const allowed = await hasDepAdminAssignmentForCourse(user.uid, subjectCourse, client);
  if (!allowed) {
    return { status: 'forbidden', subject: subjectState.subject };
  }

  return { status: 'ok', subject: subjectState.subject };
}

function canAccessDocumentRow(document, user) {
  return canUserAccessLibraryDocumentRow(document, user, null);
}

async function loadAccessibleLibraryDocument(uuid, user, client = pool) {
  if (!uuid) return null;
  if (!looksLikeUuid(uuid)) return null;
  const result = await client.query(
    `SELECT
       uuid,
       title,
       course,
       subject,
       visibility,
       source,
       is_restricted,
       upload_approval_status,
       link,
       uploader_uid
     FROM documents
     WHERE uuid = $1
     LIMIT 1`,
    [uuid]
  );
  const document = result.rows[0];
  const viewerCourseAccess = await loadUserCourseAccess(user.uid, client);
  if (!document || !canUserAccessLibraryDocumentRow(document, user, viewerCourseAccess)) return null;
  const link = await signIfNeeded(document.link);
  return {
    uuid: document.uuid,
    title: document.title || 'Untitled document',
    course: document.course || null,
    subject: document.subject || null,
    visibility: document.visibility || 'public',
    link,
  };
}

function canViewerSeeSubjectPostRow(row, viewerUid, canModerate = false) {
  if (!row) return false;
  if (normalizeText(row.status, 40).toLowerCase() !== 'active') return false;
  const approvalStatus = normalizeSubjectPostApprovalStatus(row.approval_status, 'approved');
  if (approvalStatus === 'approved') return true;
  if (canModerate) return true;
  return false;
}

async function loadSubjectPostForViewer(subjectId, postId, user, client = pool, courseAccess = null) {
  const subjectAccess = await ensureSubjectInteractionAccess(subjectId, user, client, courseAccess);
  if (subjectAccess.status !== 'ok') {
    return subjectAccess;
  }

  const postResult = await client.query(
    `SELECT
       sp.id,
       sp.subject_id,
       sp.author_uid,
       sp.title,
       sp.content,
       sp.attachment_library_document_uuid,
       sp.likes_count,
       sp.comments_count,
       sp.approval_status,
       sp.approval_required,
       sp.approval_requested_at,
       sp.approved_at,
       sp.approved_by_uid,
       sp.rejected_at,
       sp.rejected_by_uid,
       sp.rejection_note,
       sp.status,
       sp.created_at,
       sp.updated_at
     FROM subject_posts sp
     WHERE sp.subject_id = $1
       AND sp.id = $2
     LIMIT 1`,
    [subjectId, postId]
  );
  const post = postResult.rows[0] || null;
  if (!post || !canViewerSeeSubjectPostRow(post, user.uid, subjectAccess.canModerate === true)) {
    return { status: 'not_found', subject: subjectAccess.subject, membershipState: subjectAccess.membershipState };
  }

  return {
    status: 'ok',
    subject: subjectAccess.subject,
    membershipState: subjectAccess.membershipState,
    canModerate: subjectAccess.canModerate === true,
    post,
  };
}

async function loadSubjectCommentForViewer(subjectId, commentId, user, client = pool, courseAccess = null) {
  const subjectAccess = await ensureSubjectInteractionAccess(subjectId, user, client, courseAccess);
  if (subjectAccess.status !== 'ok') {
    return subjectAccess;
  }

  const commentResult = await client.query(
    `SELECT
       sc.id,
       sc.subject_id,
       sc.post_id,
       sc.author_uid,
       sc.content,
       sc.status,
       sc.taken_down_reason,
       sc.created_at,
       sc.updated_at,
       sp.author_uid AS post_author_uid,
       sp.title AS post_title,
       sp.status AS post_status,
       sp.approval_status AS post_approval_status
     FROM subject_comments sc
     JOIN subject_posts sp
       ON sp.id = sc.post_id
      AND sp.subject_id = sc.subject_id
     WHERE sc.subject_id = $1
       AND sc.id = $2
     LIMIT 1`,
    [subjectId, commentId]
  );
  const comment = commentResult.rows[0] || null;
  if (!comment) {
    return { status: 'not_found', subject: subjectAccess.subject, membershipState: subjectAccess.membershipState };
  }

  const postStatus = normalizeText(comment.post_status, 40).toLowerCase() || 'active';
  const postApprovalStatus = normalizeSubjectPostApprovalStatus(comment.post_approval_status, 'approved');
  if (postStatus !== 'active' || postApprovalStatus !== 'approved') {
    return { status: 'not_found', subject: subjectAccess.subject, membershipState: subjectAccess.membershipState };
  }

  if (normalizeText(comment.status, 40).toLowerCase() !== 'active'
    && comment.author_uid !== user.uid
    && subjectAccess.canModerate !== true) {
    return { status: 'not_found', subject: subjectAccess.subject, membershipState: subjectAccess.membershipState };
  }

  return {
    status: 'ok',
    subject: subjectAccess.subject,
    membershipState: subjectAccess.membershipState,
    canModerate: subjectAccess.canModerate === true,
    comment,
  };
}

async function loadSubjectAiContext(subjectId, user, client = pool, courseAccess = null) {
  const subjectAccess = await ensureSubjectInteractionAccess(subjectId, user, client, courseAccess);
  if (subjectAccess.status !== 'ok') {
    return subjectAccess;
  }

  const subject = subjectAccess.subject || {};
  const recentPostsResult = await client.query(
    `SELECT
       sp.id,
       sp.title,
       sp.content,
       sp.created_at,
       sp.comments_count,
       sp.likes_count,
       sp.attachment_library_document_uuid,
       COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name,
       CASE
         WHEN d.uuid IS NULL OR COALESCE(d.is_restricted, false) = true THEN NULL
         ELSE d.title
       END AS attachment_title
     FROM subject_posts sp
     JOIN accounts a ON a.uid = sp.author_uid
     LEFT JOIN profiles pr ON pr.uid = sp.author_uid
     LEFT JOIN documents d ON d.uuid = sp.attachment_library_document_uuid
     WHERE sp.subject_id = $1
       AND sp.status = 'active'
       AND sp.approval_status = 'approved'
     ORDER BY sp.created_at DESC, sp.id DESC
     LIMIT $2`,
    [subjectId, SUBJECT_AI_CONTEXT_POST_LIMIT]
  );

  const recentPosts = recentPostsResult.rows.map((row) => ({
    id: Number(row.id),
    title: row.title || 'Untitled post',
    content: truncateContextText(row.content || '', SUBJECT_AI_CONTEXT_BODY_CHARS),
    createdAt: row.created_at,
    commentsCount: Number(row.comments_count || 0),
    likesCount: Number(row.likes_count || 0),
    authorName: row.author_name || 'Member',
    attachmentTitle: row.attachment_title || null,
  }));

  const summaryParts = [
    `${subject.subject_name || `This ${formatSubjectLabel(subject.kind)}`} in ${subject.course_name || 'the course catalog'}.`,
    subject.description ? truncateContextText(subject.description, SUBJECT_AI_CONTEXT_SUMMARY_CHARS) : '',
    recentPosts.length
      ? `Recent topics: ${recentPosts.map((post) => post.title).filter(Boolean).slice(0, 4).join('; ')}.`
      : `No recent ${formatSubjectLabel(subject.kind)} posts yet.`,
  ].filter(Boolean);

  return {
    status: 'ok',
    membershipState: subjectAccess.membershipState || 'member',
    subject,
    recentPosts,
    contextSummary: summaryParts.join(' '),
  };
}

function buildSubjectAiContextBlock(subject, recentPosts = []) {
  const subjectLabel = formatSubjectLabel(subject.kind);
  const lines = [
    `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} name: ${subject.subject_name || `Untitled ${subjectLabel}`}`,
    `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} code: ${subject.subject_code || 'N/A'}`,
    `Course: ${subject.course_name || 'N/A'}`,
    `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} description:\n${truncateContextText(subject.description || `No ${subjectLabel} description provided.`, 1400)}`,
  ];

  if (recentPosts.length) {
    lines.push(
      `Recent ${subjectLabel} posts:\n${recentPosts
        .map((post, index) => {
          const segments = [
            `${index + 1}. ${post.title || 'Untitled post'}`,
            `Author: ${post.authorName || 'Member'}`,
            `Post body: ${truncateContextText(post.content || '', SUBJECT_AI_CONTEXT_BODY_CHARS) || 'No body.'}`,
            post.attachmentTitle ? `Attached reading: ${post.attachmentTitle}` : '',
            `Signals: ${post.likesCount || 0} likes, ${post.commentsCount || 0} comments`,
          ].filter(Boolean);
          return segments.join('\n');
        })
        .join('\n\n')}`
    );
  } else {
    lines.push(`Recent ${subjectLabel} posts: none yet.`);
  }

  return lines.join('\n\n');
}

async function loadSubjectPostAiContext(subjectId, postId, user, client = pool, courseAccess = null) {
  const subjectPostAccess = await loadSubjectPostForViewer(subjectId, postId, user, client, courseAccess);
  if (subjectPostAccess.status !== 'ok') {
    return subjectPostAccess;
  }

  const postResult = await client.query(
    `SELECT
       sp.id,
       sp.subject_id,
       sp.author_uid,
       sp.title,
       sp.content,
       sp.created_at,
       sp.likes_count,
       sp.comments_count,
       sp.attachment_library_document_uuid,
       COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
     FROM subject_posts sp
     JOIN accounts a ON a.uid = sp.author_uid
     LEFT JOIN profiles pr ON pr.uid = sp.author_uid
     WHERE sp.id = $1
       AND sp.subject_id = $2
     LIMIT 1`,
    [postId, subjectId]
  );
  const post = postResult.rows[0] || null;
  if (!post) {
    return { status: 'not_found', subject: subjectPostAccess.subject, post: null };
  }

  let attachment = null;
  if (post.attachment_library_document_uuid) {
    attachment = await loadAccessibleLibraryDocument(post.attachment_library_document_uuid, user, client);
  }

  return {
    status: 'ok',
    subject: subjectPostAccess.subject,
    post: {
      id: Number(post.id),
      subjectId: Number(post.subject_id),
      authorUid: post.author_uid,
      authorName: post.author_name || 'Member',
      title: post.title || 'Untitled post',
      content: post.content || '',
      createdAt: post.created_at,
      likesCount: Number(post.likes_count || 0),
      commentsCount: Number(post.comments_count || 0),
      attachment,
    },
  };
}

function buildSubjectPostAiContextBlock(subject, post) {
  const subjectLabel = formatSubjectLabel(subject.kind);
  const lines = [
    `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} name: ${subject.subject_name || `Untitled ${subjectLabel}`}`,
    `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} code: ${subject.subject_code || 'N/A'}`,
    `Course: ${subject.course_name || 'N/A'}`,
    `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} description:\n${truncateContextText(subject.description || `No ${subjectLabel} description provided.`, 1200)}`,
    `Post title: ${post.title || 'Untitled post'}`,
    `Post author: ${post.authorName || 'Member'}`,
    `Created: ${post.createdAt ? new Date(post.createdAt).toISOString() : 'N/A'}`,
    `Post body:\n${truncateContextText(post.content || '', 3500)}`,
    `Post signals: ${post.likesCount || 0} likes, ${post.commentsCount || 0} comments`,
    post.attachment
      ? `Attached document: ${post.attachment.title || 'Open Library document'}`
      : 'Attached document: none',
  ];
  return lines.join('\n\n');
}

router.get('/api/subjects/bootstrap', async (req, res) => {
  const viewerCourse = resolveViewerMainCourseForSubjects(req.user, req.subjectCourseAccess);
  const requestedCourse = normalizeCourse(req.query.course);
  const canViewAll = hasAdminPrivileges(req.user);
  const viewerRole = getPlatformRole(req.user);
  let effectiveViewerCourse = canonicalCourseNameForSubjects(viewerCourse);
  const effectiveRequestedCourse = canonicalCourseNameForSubjects(requestedCourse);

  try {
    const courseForCreation = effectiveRequestedCourse || effectiveViewerCourse;
    const canCreateUnit = await canViewerCreateSubjectKind(
      SUBJECT_KIND_UNIT,
      req.user,
      pool,
      req.subjectCourseAccess,
      courseForCreation
    );
    const canCreateThread = await canViewerCreateSubjectKind(
      SUBJECT_KIND_THREAD,
      req.user,
      pool,
      req.subjectCourseAccess,
      courseForCreation
    );
    if (!canViewAll && !effectiveViewerCourse) {
      return res.json({
        ok: true,
        subjects: [],
        canCreateUnit: false,
        canCreateThread: false,
        viewerUid: req.user.uid,
        viewerRole,
        threadTabLabel: 'Threads',
        policy: {
          accessModel: SUBJECTS_ACCESS_MODEL,
          viewerCourse: null,
        },
      });
    }

    const values = [req.user.uid];
    const filters = ['s.is_active = true'];
    if (canViewAll) {
      if (effectiveRequestedCourse) {
        values.push(effectiveRequestedCourse);
        filters.push(`lower(s.course_name) = lower($${values.length})`);
      }
    } else {
      values.push(effectiveViewerCourse);
      filters.push(`lower(s.course_name) = lower($${values.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT
         s.id,
         s.course_code,
         s.course_name,
         s.kind,
         s.subject_code,
         s.subject_name,
         s.description,
         s.created_by_uid,
         s.created_at,
         s.updated_at,
         m.state AS membership_state,
         m.suspended_until,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS creator_name,
         COALESCE((
           SELECT COUNT(*)::int
           FROM subject_posts sp
           WHERE sp.subject_id = s.id
             AND sp.status = 'active'
             AND sp.approval_status = 'approved'
         ), 0) AS posts_count
         ,
         COALESCE((
           SELECT COUNT(*)::int
           FROM subject_posts sp
           WHERE sp.subject_id = s.id
             AND sp.status = 'active'
             AND sp.approval_status = 'pending'
         ), 0) AS pending_posts_count
       FROM subjects s
       LEFT JOIN accounts a
         ON a.uid = s.created_by_uid
       LEFT JOIN profiles pr
         ON pr.uid = s.created_by_uid
       LEFT JOIN subject_memberships m
         ON m.subject_id = s.id
        AND m.user_uid = $1
       ${whereClause}
       ORDER BY
         CASE WHEN s.kind = 'unit' THEN 0 ELSE 1 END,
         lower(s.subject_name) ASC,
         s.id ASC`,
      values
    );

    const courseModerationAllowed =
      viewerRole === 'owner' ||
      viewerRole === 'admin' ||
      viewerRole === 'professor' ||
      (viewerRole === 'depadmin' &&
        Boolean(courseForCreation) &&
        (await hasDepAdminAssignmentForCourse(req.user.uid, courseForCreation, pool)));
    const subjects = result.rows
      .map((row) => ({
        id: Number(row.id),
        kind: normalizeSubjectKind(row.kind, SUBJECT_KIND_UNIT),
        courseCode: row.course_code || null,
        courseName: row.course_name || '',
        subjectCode: row.subject_code || null,
        subjectName: row.subject_name || `Untitled ${formatSubjectLabel(row.kind)}`,
        description: row.description || '',
        postsCount: Number(row.posts_count || 0),
        pendingPostsCount: Number(row.pending_posts_count || 0),
        membershipState: normalizeSubjectMembershipState(row.membership_state, 'member'),
        suspendedUntil: row.suspended_until || null,
        creatorName: row.creator_name || 'Staff',
        createdByUid: row.created_by_uid || null,
        canModerate: courseModerationAllowed,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

    return res.json({
      ok: true,
      subjects,
      canCreateUnit,
      canCreateThread,
      viewerUid: req.user.uid,
      viewerRole,
      threadTabLabel: 'Threads',
      policy: {
        accessModel: SUBJECTS_ACCESS_MODEL,
        viewerCourse: effectiveViewerCourse || null,
      },
    });
  } catch (error) {
    console.error('Subjects bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load subjects.' });
  }
});

router.post('/api/subjects', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:create', 12)) {
    return;
  }

  const role = getPlatformRole(req.user);
  const kind = normalizeSubjectKind(req.body && req.body.kind, SUBJECT_KIND_UNIT);
  const subjectName = normalizeText(req.body && req.body.subjectName, 180);
  const description = normalizeText(req.body && req.body.description, 2000);
  const subjectCode = normalizeText(req.body && req.body.subjectCode, 60);
  const viewerCourse = resolveViewerMainCourseForSubjects(req.user, req.subjectCourseAccess);
  const requestedCourse = canonicalCourseNameForSubjects(normalizeCourse(req.body && req.body.courseName));
  const courseName = hasAdminPrivileges(req.user) ? requestedCourse || viewerCourse : viewerCourse;
  const subjectLabel = formatSubjectLabel(kind);

  const canCreate = await canViewerCreateSubjectKind(kind, req.user, pool, req.subjectCourseAccess, courseName);
  if (!canCreate) {
    const permissionLabel = kind === SUBJECT_KIND_THREAD ? 'topic threads' : 'official units';
    return res.status(403).json({
      ok: false,
      message: `You are not allowed to create ${permissionLabel} for this course.`,
    });
  }

  if (!subjectName || !courseName) {
    return res.status(400).json({
      ok: false,
      message: `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} name and course are required.`,
    });
  }

  try {
    if (role === 'depadmin') {
      const canCreateForCourse = await hasDepAdminAssignmentForCourse(req.user.uid, courseName);
      if (!canCreateForCourse) {
        return res.status(403).json({
          ok: false,
          message: 'You are not assigned as DepAdmin for this course.',
        });
      }
    }

    const courseCodeResult = await pool.query(
      `SELECT course_code, course_name
       FROM courses
       WHERE lower(course_name) = lower($1)
       LIMIT 1`,
      [courseName]
    );
    if (!courseCodeResult.rows.length) {
      return res.status(400).json({
        ok: false,
        message: 'Course does not exist. Choose a valid course.',
      });
    }

    const canonicalCourseName = courseCodeResult.rows[0].course_name || courseName;
    const canonicalCourseCode = courseCodeResult.rows[0].course_code || null;

    const existingResult = await pool.query(
      `SELECT
         id,
         course_code,
         course_name,
         subject_code,
         subject_name,
         description,
         created_at,
         updated_at
       FROM subjects
       WHERE lower(course_name) = lower($1)
         AND lower(subject_name) = lower($2)
         AND kind = $3
       LIMIT 1`,
      [canonicalCourseName, subjectName, kind]
    );
    if (existingResult.rows[0]) {
      const existing = existingResult.rows[0];
      return res.status(409).json({
        ok: false,
        message: `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} already exists in this course.`,
        subject: {
          id: Number(existing.id),
          kind,
          courseCode: existing.course_code || null,
          courseName: existing.course_name || '',
          subjectCode: existing.subject_code || null,
          subjectName: existing.subject_name || '',
          description: existing.description || '',
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        },
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO subjects
         (course_code, course_name, kind, subject_code, subject_name, description, created_by_uid, is_active)
      VALUES
         ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT
       DO NOTHING
      RETURNING
         id,
         course_code,
         course_name,
         kind,
         subject_code,
         subject_name,
         description,
         created_at,
         updated_at`,
      [
        canonicalCourseCode || null,
        canonicalCourseName,
        kind,
        subjectCode || null,
        subjectName,
        description || null,
        req.user.uid,
      ]
    );
    let row = insertResult.rows[0] || null;
    if (!row) {
      return res.status(409).json({
        ok: false,
        message: `${subjectLabel[0].toUpperCase()}${subjectLabel.slice(1)} already exists in this course.`,
      });
    }

    return res.json({
      ok: true,
      subject: {
        id: Number(row.id),
        kind: normalizeSubjectKind(row.kind, SUBJECT_KIND_UNIT),
        courseCode: row.course_code || null,
        courseName: row.course_name || '',
        subjectCode: row.subject_code || null,
        subjectName: row.subject_name || '',
        description: row.description || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Subject create failed:', error);
    return res.status(500).json({ ok: false, message: `Unable to create ${subjectLabel}.` });
  }
});

router.get('/api/subjects/:id/feed', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const page = parsePositiveInt(req.query.page, 1, 2000);
  const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  try {
    const subjectState = await loadSubjectForViewer(subjectId, req.user, pool, req.subjectCourseAccess);
    if (subjectState.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Container not found.' });
    }
    if (subjectState.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this unit or thread.' });
    }
    const canModerate = await loadSubjectModerationAccess(subjectState.subject, req.user, pool, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(subjectState.subject.kind);

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM subject_posts
       WHERE subject_id = $1
         AND status = 'active'
         AND (
           approval_status = 'approved'
           OR $2::boolean = true
         )`,
      [subjectId, canModerate]
    );
    const total = Number(totalResult.rows[0]?.total || 0);

    const listResult = await pool.query(
      `SELECT
         sp.id,
         sp.subject_id,
         sp.author_uid,
         sp.title,
         sp.content,
         sp.attachment_library_document_uuid,
         sp.likes_count,
         sp.comments_count,
         sp.approval_status,
         sp.approval_required,
         sp.approval_requested_at,
         sp.approved_at,
         sp.rejected_at,
         sp.rejection_note,
         sp.created_at,
         sp.updated_at,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name,
         pr.photo_link AS author_photo_link,
         CASE WHEN spl.id IS NULL THEN false ELSE true END AS liked,
         CASE WHEN spb.id IS NULL THEN false ELSE true END AS bookmarked
       FROM subject_posts sp
       JOIN accounts a ON a.uid = sp.author_uid
       LEFT JOIN profiles pr ON pr.uid = sp.author_uid
       LEFT JOIN subject_post_likes spl
         ON spl.subject_id = sp.subject_id
        AND spl.post_id = sp.id
        AND spl.user_uid = $2
       LEFT JOIN subject_post_bookmarks spb
         ON spb.subject_id = sp.subject_id
        AND spb.post_id = sp.id
        AND spb.user_uid = $2
       WHERE sp.subject_id = $1
         AND sp.status = 'active'
         AND (
           sp.approval_status = 'approved'
           OR $5::boolean = true
         )
       ORDER BY sp.created_at DESC, sp.id DESC
       LIMIT $3 OFFSET $4`,
      [subjectId, req.user.uid, pageSize, (page - 1) * pageSize, canModerate]
    );

    const attachmentUuids = [
      ...new Set(
        listResult.rows
          .map((row) => row.attachment_library_document_uuid)
          .filter(Boolean)
      ),
    ];
    const documentByUuid = new Map();
    if (attachmentUuids.length) {
      const docsResult = await pool.query(
        `SELECT uuid, title, course, subject, visibility, is_restricted, link, uploader_uid
         FROM documents
         WHERE uuid = ANY($1::uuid[])`,
        [attachmentUuids]
      );
      const signedRows = await Promise.all(
        docsResult.rows.map(async (row) => {
          const visible = canAccessDocumentRow(row, req.user);
          if (!visible) return null;
          const link = await signIfNeeded(row.link);
          return {
            uuid: row.uuid,
            title: row.title || 'Untitled document',
            course: row.course || null,
            subject: row.subject || null,
            visibility: row.visibility || 'public',
            link,
          };
        })
      );
      signedRows.forEach((row) => {
        if (row && row.uuid) {
          documentByUuid.set(row.uuid, row);
        }
      });
    }

    const postIds = listResult.rows.map((row) => Number(row.id)).filter(Boolean);
    const commentsByPost = new Map();
    if (postIds.length) {
      const commentsResult = await pool.query(
        `SELECT
           sc.id,
           sc.post_id,
           sc.author_uid,
           sc.content,
           sc.created_at,
           sc.updated_at,
           COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
         FROM subject_comments sc
         JOIN accounts a ON a.uid = sc.author_uid
         LEFT JOIN profiles pr ON pr.uid = sc.author_uid
         WHERE sc.subject_id = $1
           AND sc.post_id = ANY($2::bigint[])
           AND sc.status = 'active'
         ORDER BY sc.created_at ASC, sc.id ASC`,
        [subjectId, postIds]
      );
      commentsResult.rows.forEach((row) => {
        const postId = Number(row.post_id);
        if (!commentsByPost.has(postId)) {
          commentsByPost.set(postId, []);
        }
        commentsByPost.get(postId).push({
          id: Number(row.id),
          postId,
          authorUid: row.author_uid,
          authorName: row.author_name || 'Member',
          content: row.content || '',
          createdAt: row.created_at,
          updatedAt: row.updated_at || row.created_at,
        });
      });
    }

    const posts = await Promise.all(
      listResult.rows.map(async (row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || 'Untitled post',
        content: row.content || '',
        approvalStatus: normalizeSubjectPostApprovalStatus(row.approval_status, 'approved'),
        approvalRequired: row.approval_required === true,
        approvalRequestedAt: row.approval_requested_at || null,
        approvedAt: row.approved_at || null,
        rejectedAt: row.rejected_at || null,
        rejectionNote: row.rejection_note || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        liked: Boolean(row.liked),
        bookmarked: Boolean(row.bookmarked),
        isOwner: row.author_uid === req.user.uid,
        canModerate,
        author: {
          uid: row.author_uid,
          displayName: row.author_name || 'Member',
          photoLink: await signIfNeeded(row.author_photo_link),
        },
        attachment: row.attachment_library_document_uuid
          ? documentByUuid.get(row.attachment_library_document_uuid) || null
          : null,
        comments: commentsByPost.get(Number(row.id)) || [],
      }))
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      subject: {
        id: Number(subjectState.subject.id),
        kind: normalizeSubjectKind(subjectState.subject.kind, SUBJECT_KIND_UNIT),
        courseName: subjectState.subject.course_name || '',
        subjectName: subjectState.subject.subject_name || '',
        description: subjectState.subject.description || '',
        canModerate,
        viewerCanPostWithoutApproval: canViewerAutoApproveSubjectPost(req.user),
      },
      posts,
    });
  } catch (error) {
    console.error('Subject feed fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load the unit/thread feed.' });
  }
});

router.get('/api/subjects/:id/my-posts', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  try {
    const subjectState = await loadSubjectForViewer(subjectId, req.user, pool, req.subjectCourseAccess);
    if (subjectState.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Container not found.' });
    }
    if (subjectState.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this unit or thread.' });
    }

    const listResult = await pool.query(
      `SELECT
         sp.id,
         sp.subject_id,
         sp.title,
         sp.content,
         sp.attachment_library_document_uuid,
         sp.likes_count,
         sp.comments_count,
         sp.approval_status,
         sp.approval_required,
         sp.approval_requested_at,
         sp.approved_at,
         sp.rejected_at,
         sp.rejection_note,
         sp.status,
         sp.taken_down_reason,
         sp.created_at,
         sp.updated_at
       FROM subject_posts sp
       WHERE sp.subject_id = $1
         AND sp.author_uid = $2
       ORDER BY sp.created_at DESC, sp.id DESC`,
      [subjectId, req.user.uid]
    );

    const attachmentUuids = [
      ...new Set(
        listResult.rows
          .map((row) => row.attachment_library_document_uuid)
          .filter(Boolean)
      ),
    ];
    const documentByUuid = new Map();
    if (attachmentUuids.length) {
      const docsResult = await pool.query(
        `SELECT uuid, title, course, subject, visibility, is_restricted, link, uploader_uid
         FROM documents
         WHERE uuid = ANY($1::uuid[])`,
        [attachmentUuids]
      );
      const signedRows = await Promise.all(
        docsResult.rows.map(async (row) => {
          const visible = canAccessDocumentRow(row, req.user);
          if (!visible) return null;
          const link = await signIfNeeded(row.link);
          return {
            uuid: row.uuid,
            title: row.title || 'Untitled document',
            course: row.course || null,
            subject: row.subject || null,
            visibility: row.visibility || 'public',
            link,
          };
        })
      );
      signedRows.forEach((row) => {
        if (row && row.uuid) {
          documentByUuid.set(row.uuid, row);
        }
      });
    }

    return res.json({
      ok: true,
      subject: {
        id: Number(subjectState.subject.id),
        kind: normalizeSubjectKind(subjectState.subject.kind, SUBJECT_KIND_UNIT),
        courseName: subjectState.subject.course_name || '',
        subjectName: subjectState.subject.subject_name || '',
      },
      posts: listResult.rows.map((row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || 'Untitled post',
        content: row.content || '',
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        approvalStatus: normalizeSubjectPostApprovalStatus(row.approval_status, 'approved'),
        approvalRequired: row.approval_required === true,
        approvalRequestedAt: row.approval_requested_at || null,
        approvedAt: row.approved_at || null,
        rejectedAt: row.rejected_at || null,
        rejectionNote: row.rejection_note || null,
        status: normalizeText(row.status, 40).toLowerCase() === 'taken_down' ? 'removed' : 'active',
        removedAt: normalizeText(row.status, 40).toLowerCase() === 'taken_down' ? row.updated_at : null,
        removalReason: row.taken_down_reason || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        attachment: row.attachment_library_document_uuid
          ? documentByUuid.get(row.attachment_library_document_uuid) || null
          : null,
      })),
    });
  } catch (error) {
    console.error('Subject my-posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load your posts for this unit/thread.' });
  }
});

router.post('/api/subjects/:id/posts', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:create_post', 30)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  const title = normalizeText(req.body && req.body.title, 220);
  const content = normalizeText(req.body && req.body.content, 8000);
  const attachmentLibraryDocumentUuid = normalizeText(
    req.body && req.body.attachmentLibraryDocumentUuid,
    100
  );
  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }
  if (attachmentLibraryDocumentUuid && !looksLikeUuid(attachmentLibraryDocumentUuid)) {
    return res.status(400).json({ ok: false, message: 'Invalid attachment document id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(subjectAccess.subject && subjectAccess.subject.kind);
    if (subjectAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: `Not allowed to post in this ${subjectLabel}.` });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (subjectAccess.status === 'suspended') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(subjectAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    let attachmentUuid = null;
    if (attachmentLibraryDocumentUuid) {
      const document = await loadAccessibleLibraryDocument(
        attachmentLibraryDocumentUuid,
        req.user,
        client
      );
      if (!document) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          ok: false,
          message: 'Selected Open Library document is not accessible.',
        });
      }
      attachmentUuid = document.uuid;
    }

    const autoApprove = canViewerAutoApproveSubjectPost(req.user);
    const approvalStatus = autoApprove ? 'approved' : 'pending';

    const insertResult = await client.query(
      `INSERT INTO subject_posts
         (
           subject_id,
           author_uid,
           title,
           content,
           attachment_library_document_uuid,
           approval_status,
           approval_required,
           approval_requested_at,
           approved_at,
           approved_by_uid,
           rejected_at,
           rejected_by_uid,
           rejection_note
         )
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NULL, NULL)
       RETURNING
         id,
         subject_id,
         author_uid,
         title,
         content,
         attachment_library_document_uuid,
         likes_count,
         comments_count,
         approval_status,
         approval_required,
         approval_requested_at,
         approved_at,
         created_at,
         updated_at`,
      [
        subjectId,
        req.user.uid,
        title,
        content,
        attachmentUuid,
        approvalStatus,
        !autoApprove,
        autoApprove ? null : new Date(),
        autoApprove ? new Date() : null,
        autoApprove ? req.user.uid : null,
      ]
    );
    await client.query('COMMIT');

    const row = insertResult.rows[0];

    setImmediate(() => {
      const subject = subjectAccess && subjectAccess.subject ? subjectAccess.subject : {};
      const contentScanText = [
        `Title: ${row.title || ''}`,
        `Content: ${row.content || ''}`,
        `Course: ${subject.course_name || ''}`,
        `Subject: ${subject.subject_name || ''}`,
        row.attachment_library_document_uuid
          ? `Attached Open Library document UUID: ${row.attachment_library_document_uuid}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      autoScanIncomingContent({
        targetType: 'subject_post',
        targetId: String(row.id),
        requestedByUid: req.user.uid,
        content: contentScanText,
        metadata: {
          subjectId: Number(row.subject_id),
          course: subject.course_name || '',
          subjectName: subject.subject_name || '',
          attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
          source: 'units_create_post',
        },
      }).catch((error) => {
        console.error('Subject post auto content scan failed:', error);
      });
    });

    return res.json({
      ok: true,
      message: autoApprove
        ? `Post published to the ${subjectLabel} feed.`
        : `Post submitted and hidden until ${subjectLabel} approval.`,
      post: {
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || '',
        content: row.content || '',
        attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        approvalStatus: normalizeSubjectPostApprovalStatus(row.approval_status, 'approved'),
        approvalRequired: row.approval_required === true,
        approvalRequestedAt: row.approval_requested_at || null,
        approvedAt: row.approved_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create subject post.' });
  } finally {
    client.release();
  }
});

router.patch('/api/subjects/:id/posts/:postId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:edit_post', 40)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const title = normalizeText(req.body && req.body.title, 220);
  const content = normalizeText(req.body && req.body.content, 8000);
  const attachmentLibraryDocumentUuid = normalizeText(
    req.body && req.body.attachmentLibraryDocumentUuid,
    100
  );
  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }
  if (attachmentLibraryDocumentUuid && !looksLikeUuid(attachmentLibraryDocumentUuid)) {
    return res.status(400).json({ ok: false, message: 'Invalid attachment document id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(subjectAccess.subject && subjectAccess.subject.kind);
    if (subjectAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (subjectAccess.status === 'suspended') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(subjectAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const postResult = await client.query(
      `SELECT id, author_uid, approval_status
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    const post = postResult.rows[0] || null;
    if (!post) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (post.author_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only the post owner can edit this unit post.' });
    }

    let attachmentUuid = null;
    if (attachmentLibraryDocumentUuid) {
      const document = await loadAccessibleLibraryDocument(
        attachmentLibraryDocumentUuid,
        req.user,
        client
      );
      if (!document) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          ok: false,
          message: 'Selected Open Library document is not accessible.',
        });
      }
      attachmentUuid = document.uuid;
    }

    const autoApprove = canViewerAutoApproveSubjectPost(req.user);
    const nextApprovalStatus = autoApprove ? 'approved' : 'pending';

    const updateResult = await client.query(
      `UPDATE subject_posts
       SET title = $4,
           content = $5,
           attachment_library_document_uuid = $6,
           approval_status = $7,
           approval_required = $8,
           approval_requested_at = $9,
           approved_at = $10,
           approved_by_uid = $11,
           rejected_at = NULL,
           rejected_by_uid = NULL,
           rejection_note = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND subject_id = $2
         AND author_uid = $3
       RETURNING
         id,
         subject_id,
         author_uid,
         title,
         content,
         attachment_library_document_uuid,
         likes_count,
         comments_count,
         approval_status,
         approval_required,
         approval_requested_at,
         approved_at,
         rejected_at,
         rejection_note,
         created_at,
         updated_at`,
      [
        postId,
        subjectId,
        req.user.uid,
        title,
        content,
        attachmentUuid,
        nextApprovalStatus,
        !autoApprove,
        autoApprove ? null : new Date(),
        autoApprove ? new Date() : null,
        autoApprove ? req.user.uid : null,
      ]
    );
    await client.query('COMMIT');

    const row = updateResult.rows[0];
    setImmediate(() => {
      const subject = subjectAccess && subjectAccess.subject ? subjectAccess.subject : {};
      const contentScanText = [
        `Title: ${row.title || ''}`,
        `Content: ${row.content || ''}`,
        `Course: ${subject.course_name || ''}`,
        `Subject: ${subject.subject_name || ''}`,
        row.attachment_library_document_uuid
          ? `Attached Open Library document UUID: ${row.attachment_library_document_uuid}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      autoScanIncomingContent({
        targetType: 'subject_post',
        targetId: String(row.id),
        requestedByUid: req.user.uid,
        content: contentScanText,
        metadata: {
          subjectId: Number(row.subject_id),
          course: subject.course_name || '',
          subjectName: subject.subject_name || '',
          attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
          source: 'units_edit_post',
        },
      }).catch((error) => {
        console.error('Subject post edit auto content scan failed:', error);
      });
    });

    return res.json({
      ok: true,
      message: autoApprove
        ? `Post updated in this ${subjectLabel}.`
        : `Post updated, hidden from the feed, and sent back for ${subjectLabel} approval.`,
      post: {
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || '',
        content: row.content || '',
        attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        approvalStatus: normalizeSubjectPostApprovalStatus(row.approval_status, 'approved'),
        approvalRequired: row.approval_required === true,
        approvalRequestedAt: row.approval_requested_at || null,
        approvedAt: row.approved_at || null,
        rejectedAt: row.rejected_at || null,
        rejectionNote: row.rejection_note || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update subject post.' });
  } finally {
    client.release();
  }
});

router.delete('/api/subjects/:id/posts/:postId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:delete_post', 20)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(subjectAccess.subject && subjectAccess.subject.kind);
    if (subjectAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (subjectAccess.status === 'suspended') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(subjectAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const postResult = await client.query(
      `SELECT id, author_uid
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    const post = postResult.rows[0] || null;
    if (!post) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (post.author_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only the post owner can delete this unit post.' });
    }

    const deleteResult = await client.query(
      `DELETE FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND author_uid = $3
       RETURNING id`,
      [postId, subjectId, req.user.uid]
    );
    await client.query('COMMIT');

    if (deleteResult.rows[0]) {
      setImmediate(() => {
        cleanupSubjectPostAiArtifacts(postId).catch((error) => {
          console.error('Subject post delete cleanup failed:', error);
        });
      });
    }

    return res.json({ ok: true, deleted: Boolean(deleteResult.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete subject post.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/like', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:like_post', 160)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const action = normalizeText(req.body && req.body.action, 20).toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const postAccess = await loadSubjectPostForViewer(subjectId, postId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(postAccess.subject && postAccess.subject.kind);
    if (postAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (postAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (postAccess.status === 'suspended') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(postAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const postApprovalStatus = normalizeSubjectPostApprovalStatus(postAccess.post.approval_status, 'approved');
    if (postApprovalStatus !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only approved posts can receive reactions.' });
    }

    let shouldNotifyLike = false;
    if (action === 'unlike') {
      await client.query(
        `DELETE FROM subject_post_likes
         WHERE subject_id = $1
           AND post_id = $2
           AND user_uid = $3`,
        [subjectId, postId, req.user.uid]
      );
    } else {
      const insertResult = await client.query(
        `INSERT INTO subject_post_likes (subject_id, post_id, user_uid)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, post_id, user_uid) DO NOTHING`,
        [subjectId, postId, req.user.uid]
      );
      shouldNotifyLike = insertResult.rowCount > 0;
    }

    const updateResult = await client.query(
      `UPDATE subject_posts sp
       SET likes_count = (
         SELECT COUNT(*)::int
         FROM subject_post_likes spl
         WHERE spl.subject_id = sp.subject_id
           AND spl.post_id = sp.id
       ),
           updated_at = NOW()
       WHERE sp.subject_id = $1
         AND sp.id = $2
       RETURNING sp.likes_count`,
      [subjectId, postId]
    );

    const likedResult = await client.query(
      `SELECT 1
       FROM subject_post_likes
       WHERE subject_id = $1
         AND post_id = $2
         AND user_uid = $3
       LIMIT 1`,
      [subjectId, postId, req.user.uid]
    );
    await client.query('COMMIT');

    if (shouldNotifyLike && postAccess.post.author_uid && postAccess.post.author_uid !== req.user.uid) {
      try {
        await createSubjectPostOwnerNotification({
          recipientUid: postAccess.post.author_uid,
          actorUid: req.user.uid,
          type: 'subject_post_liked',
          subject: postAccess.subject,
          postId,
          postTitle: postAccess.post.title || 'Untitled post',
          targetUrl: buildSubjectPostTargetUrl(subjectId, postId),
        });
      } catch (error) {
        console.error('Subject post like notification failed:', error);
      }
    }

    return res.json({
      ok: true,
      liked: likedResult.rowCount > 0,
      likesCount: Number(updateResult.rows[0]?.likes_count || 0),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post like failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update like.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/bookmark', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const action = normalizeText(req.body && req.body.action, 20).toLowerCase();
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const client = await pool.connect();
  try {
    const postAccess = await loadSubjectPostForViewer(subjectId, postId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(postAccess.subject && postAccess.subject.kind);
    if (postAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (postAccess.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (postAccess.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(postAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const postApprovalStatus = normalizeSubjectPostApprovalStatus(postAccess.post.approval_status, 'approved');
    if (postApprovalStatus !== 'approved') {
      return res.status(403).json({ ok: false, message: 'Only approved posts can be bookmarked.' });
    }

    if (action === 'remove') {
      await client.query(
        `DELETE FROM subject_post_bookmarks
         WHERE subject_id = $1
           AND post_id = $2
           AND user_uid = $3`,
        [subjectId, postId, req.user.uid]
      );
      return res.json({ ok: true, bookmarked: false });
    }

    await client.query(
      `INSERT INTO subject_post_bookmarks (subject_id, post_id, user_uid)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject_id, post_id, user_uid) DO NOTHING`,
      [subjectId, postId, req.user.uid]
    );
    return res.json({ ok: true, bookmarked: true });
  } catch (error) {
    console.error('Subject post bookmark failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update bookmark.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/report', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const client = await pool.connect();
  try {
    const postAccess = await loadSubjectPostForViewer(subjectId, postId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(postAccess.subject && postAccess.subject.kind);
    if (postAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (postAccess.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (postAccess.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(postAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const { category, customReason, details, reason } = parseReportPayload(req.body || {});
    const post = postAccess.post || null;
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (normalizeSubjectPostApprovalStatus(post.approval_status, 'approved') !== 'approved') {
      return res.status(403).json({ ok: false, message: 'Only approved posts can be reported.' });
    }
    if (post.author_uid && post.author_uid === req.user.uid) {
      return res.status(400).json({ ok: false, message: 'You cannot report your own post.' });
    }

    await client.query(
      `INSERT INTO subject_post_reports
         (subject_id, post_id, reporter_uid, target_uid, category, custom_reason, details, reason, status, moderation_action, resolution_note, resolved_at, resolved_by_uid, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, NULL, NULL, NULL, NOW(), NOW())
       ON CONFLICT (post_id, reporter_uid)
       DO UPDATE SET
         target_uid = EXCLUDED.target_uid,
         category = EXCLUDED.category,
         custom_reason = EXCLUDED.custom_reason,
         details = EXCLUDED.details,
         reason = EXCLUDED.reason,
         status = 'open',
         moderation_action = NULL,
         resolution_note = NULL,
         resolved_at = NULL,
         resolved_by_uid = NULL,
         updated_at = NOW()`,
      [subjectId, postId, req.user.uid, post.author_uid || null, category, customReason || null, details || null, reason]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Subject post report failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to report post.' });
  } finally {
    client.release();
  }
});

router.get('/api/subjects/:id/moderation', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid unit/thread id.' });
  }

  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, pool, req.subjectCourseAccess);
    if (moderationAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (moderationAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to moderate this unit/thread.' });
    }

    const subject = moderationAccess.subject;
    const [membersResult, pendingPostsResult, reportsResult, commentReportsResult, aiReportsResult] = await Promise.all([
      pool.query(
        `SELECT
           sm.user_uid,
           sm.state,
           sm.joined_at,
           sm.updated_at,
           sm.suspended_until,
           sm.suspended_reason,
           COALESCE(pr.display_name, a.display_name, a.username, a.email) AS display_name,
           pr.photo_link,
           COALESCE((
             SELECT COUNT(*)::int
             FROM subject_warnings sw
             WHERE sw.subject_id = sm.subject_id
               AND sw.target_uid = sm.user_uid
           ), 0) AS warning_count,
           COALESCE((
             SELECT COUNT(*)::int
             FROM subject_ban_requests sbr
             WHERE sbr.subject_id = sm.subject_id
               AND sbr.target_uid = sm.user_uid
               AND sbr.status IN ('open', 'under_review')
           ), 0) AS open_ban_requests
         FROM subject_memberships sm
         JOIN accounts a ON a.uid = sm.user_uid
         LEFT JOIN profiles pr ON pr.uid = sm.user_uid
         WHERE sm.subject_id = $1
           AND sm.state IN ('member', 'suspended', 'banned')
           AND COALESCE(a.platform_role, 'member') = 'member'
         ORDER BY lower(COALESCE(pr.display_name, a.display_name, a.username, a.email)) ASC`,
        [subjectId]
      ),
      pool.query(
        `SELECT
           sp.id,
           sp.title,
           sp.content,
           sp.created_at,
           sp.approval_requested_at,
           sp.attachment_library_document_uuid,
           sp.author_uid,
           COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
         FROM subject_posts sp
         JOIN accounts a ON a.uid = sp.author_uid
         LEFT JOIN profiles pr ON pr.uid = sp.author_uid
         WHERE sp.subject_id = $1
           AND sp.status = 'active'
           AND sp.approval_status = 'pending'
         ORDER BY COALESCE(sp.approval_requested_at, sp.created_at) ASC, sp.id ASC`,
        [subjectId]
      ),
      pool.query(
        `SELECT
           r.id,
           r.post_id,
           r.category,
           r.custom_reason,
           r.details,
           r.reason,
           r.status,
           r.moderation_action,
           r.resolution_note,
           r.created_at,
           r.target_uid,
           sp.title,
           sp.content,
           sp.author_uid,
           COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
           COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS author_name
         FROM subject_post_reports r
         JOIN subject_posts sp
           ON sp.id = r.post_id
         JOIN accounts ra
           ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp
           ON rp.uid = r.reporter_uid
         LEFT JOIN accounts aa
           ON aa.uid = sp.author_uid
         LEFT JOIN profiles ap
           ON ap.uid = sp.author_uid
        WHERE r.subject_id = $1
          AND sp.status = 'active'
          AND r.status IN ('open', 'under_review')
        ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC`,
        [subjectId]
      ),
      pool.query(
        `SELECT
           r.id,
           r.comment_id,
           r.category,
           r.custom_reason,
           r.details,
           r.reason,
           r.status,
           r.moderation_action,
           r.resolution_note,
           r.created_at,
           r.target_uid,
           sc.post_id,
           sc.content,
           sc.author_uid,
           sp.title AS post_title,
           COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
           COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS author_name
         FROM subject_comment_reports r
         JOIN subject_comments sc
           ON sc.id = r.comment_id
          AND sc.subject_id = r.subject_id
         JOIN subject_posts sp
           ON sp.id = sc.post_id
          AND sp.subject_id = sc.subject_id
         JOIN accounts ra
           ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp
           ON rp.uid = r.reporter_uid
         LEFT JOIN accounts aa
           ON aa.uid = sc.author_uid
         LEFT JOIN profiles ap
           ON ap.uid = sc.author_uid
         WHERE r.subject_id = $1
           AND sc.status = 'active'
           AND sp.status = 'active'
           AND r.status IN ('open', 'under_review')
         ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC`,
        [subjectId]
      ),
      pool.query(
        `SELECT
           scan.id,
           scan.risk_level,
           scan.risk_score,
           scan.result,
           scan.status,
           scan.created_at,
           sp.id AS post_id,
           sp.title,
           sp.content,
           sp.author_uid,
           COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS author_name
         FROM ai_content_scans scan
         JOIN subject_posts sp
           ON scan.target_id = sp.id::text
         LEFT JOIN accounts aa
           ON aa.uid = sp.author_uid
         LEFT JOIN profiles ap
           ON ap.uid = sp.author_uid
         WHERE scan.target_type = 'subject_post'
           AND sp.subject_id = $1
           AND sp.status = 'active'
         ORDER BY scan.created_at DESC`,
        [subjectId]
      ),
    ]);

    const pendingAttachmentUuids = [
      ...new Set(
        pendingPostsResult.rows
          .map((row) => row.attachment_library_document_uuid)
          .filter(Boolean)
      ),
    ];
    const pendingDocumentMap = new Map();
    if (pendingAttachmentUuids.length) {
      const docsResult = await pool.query(
        `SELECT uuid, title, course, subject, visibility, is_restricted, link, uploader_uid
         FROM documents
         WHERE uuid = ANY($1::uuid[])`,
        [pendingAttachmentUuids]
      );
      const signedDocs = await Promise.all(
        docsResult.rows.map(async (row) => {
          const link = await signIfNeeded(row.link);
          return {
            uuid: row.uuid,
            title: row.title || 'Open Library document',
            course: row.course || null,
            subject: row.subject || null,
            visibility: row.visibility || 'public',
            link,
          };
        })
      );
      signedDocs.forEach((row) => {
        if (row && row.uuid) pendingDocumentMap.set(row.uuid, row);
      });
    }

    const aiReports = aiReportsResult.rows
      .map((row) => {
        const resultPayload = row.result && typeof row.result === 'object' ? row.result : {};
        const flagged =
          isInappropriateScan({
            parsed: {
              riskLevel: row.risk_level,
              riskScore: row.risk_score,
              recommendedAction: resultPayload.recommendedAction,
            },
          }) || resultPayload.flagged === true;
        if (!flagged) return null;
        const moderation = resultPayload.subjectModeration && typeof resultPayload.subjectModeration === 'object'
          ? resultPayload.subjectModeration
          : null;
        const status = normalizeSubjectReportStatus(moderation && moderation.status, 'open');
        if (!['open', 'under_review'].includes(status)) {
          return null;
        }
        const flags = Array.isArray(resultPayload.flags)
          ? resultPayload.flags.map((item) => normalizeText(String(item), 160)).filter(Boolean)
          : [];
        return {
          sourceType: 'ai',
          id: Number(row.id),
          postId: Number(row.post_id),
          title: row.title || '',
          content: row.content || '',
          authorUid: row.author_uid || null,
          authorName: row.author_name || 'Member',
          riskLevel: row.risk_level || 'unknown',
          riskScore: row.risk_score === null || row.risk_score === undefined ? null : Number(row.risk_score),
          summary: normalizeText(resultPayload.summary, 2400) || '',
          flags,
          recommendedAction: normalizeText(resultPayload.recommendedAction, 80).toLowerCase() || 'none',
          status,
          moderationAction: normalizeSubjectReportAction(moderation && moderation.action, 'none'),
          resolutionNote: normalizeText(moderation && moderation.note, 1000) || '',
          createdAt: row.created_at || null,
        };
      })
      .filter(Boolean);

    const combinedReports = [
      ...reportsResult.rows.map((row) => ({
        sourceType: 'manual',
        targetType: 'post',
        id: Number(row.id),
        postId: Number(row.post_id),
        title: row.title || '',
        postTitle: row.title || '',
        content: row.content || '',
        authorUid: row.author_uid || row.target_uid || null,
        authorName: row.author_name || 'Member',
        reporterName: row.reporter_name || 'Member',
        category: row.category || null,
        customReason: row.custom_reason || null,
        details: row.details || null,
        reason: row.reason || '',
        status: normalizeSubjectReportStatus(row.status, 'open'),
        moderationAction: normalizeSubjectReportAction(row.moderation_action, 'none'),
        resolutionNote: row.resolution_note || '',
        createdAt: row.created_at || null,
      })),
      ...commentReportsResult.rows.map((row) => ({
        sourceType: 'comment',
        targetType: 'comment',
        id: Number(row.id),
        commentId: Number(row.comment_id),
        postId: Number(row.post_id),
        title: row.post_title ? `Comment on ${row.post_title}` : 'Comment report',
        postTitle: row.post_title || '',
        content: row.content || '',
        authorUid: row.author_uid || row.target_uid || null,
        authorName: row.author_name || 'Member',
        reporterName: row.reporter_name || 'Member',
        category: row.category || null,
        customReason: row.custom_reason || null,
        details: row.details || null,
        reason: row.reason || '',
        status: normalizeSubjectReportStatus(row.status, 'open'),
        moderationAction: normalizeSubjectReportAction(row.moderation_action, 'none'),
        resolutionNote: row.resolution_note || '',
        createdAt: row.created_at || null,
      })),
      ...aiReports,
    ].sort((left, right) => {
      const statusRank = (value) => (normalizeSubjectReportStatus(value, 'open') === 'open' ? 0 : 1);
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return statusRank(left.status) - statusRank(right.status) || rightTime - leftTime || right.id - left.id;
    });

    return res.json({
      ok: true,
      subject: {
        id: Number(subject.id),
        kind: normalizeSubjectKind(subject.kind, SUBJECT_KIND_UNIT),
        courseName: subject.course_name || '',
        subjectName: subject.subject_name || '',
        description: subject.description || '',
        canManageCourseSpaces: hasAdminPrivileges(req.user) || getPlatformRole(req.user) === 'depadmin',
      },
      members: await Promise.all(
        membersResult.rows.map(async (row) => ({
          uid: row.user_uid,
          displayName: row.display_name || 'Member',
          photoLink: await signIfNeeded(row.photo_link),
          state: normalizeSubjectMembershipState(row.state, 'member'),
          joinedAt: row.joined_at || null,
          updatedAt: row.updated_at || null,
          suspendedUntil: row.suspended_until || null,
          suspendedReason: row.suspended_reason || null,
          warningCount: Number(row.warning_count || 0),
          openBanRequests: Number(row.open_ban_requests || 0),
        }))
      ),
      pendingPosts: pendingPostsResult.rows.map((row) => ({
        id: Number(row.id),
        title: row.title || '',
        content: row.content || '',
        authorUid: row.author_uid || null,
        authorName: row.author_name || 'Member',
        createdAt: row.created_at || null,
        approvalRequestedAt: row.approval_requested_at || row.created_at || null,
        attachment: row.attachment_library_document_uuid
          ? pendingDocumentMap.get(row.attachment_library_document_uuid) || null
          : null,
      })),
      reports: combinedReports,
    });
  } catch (error) {
    console.error('Subject moderation payload failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load the moderation panel.' });
  }
});

router.get('/api/subjects/:id/course-spaces', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid unit/thread id.' });
  }

  try {
    const access = await ensureCourseSpaceManagementAccess(subjectId, req.user, pool, req.subjectCourseAccess);
    if (access.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (access.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Only the owner, admins, or assigned DepAdmin can manage course spaces here.' });
    }

    const courseName = canonicalCourseNameForSubjects(access.subject.course_name);
    const result = await pool.query(
      `SELECT
         s.id,
         s.kind,
         s.subject_name,
         s.created_at,
         s.created_by_uid,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS creator_name
       FROM subjects s
       LEFT JOIN accounts a
         ON a.uid = s.created_by_uid
       LEFT JOIN profiles pr
         ON pr.uid = s.created_by_uid
       WHERE lower(s.course_name) = lower($1)
         AND s.is_active = true
       ORDER BY
         CASE WHEN s.kind = 'unit' THEN 0 ELSE 1 END,
         s.created_at DESC,
         lower(s.subject_name) ASC`,
      [courseName]
    );

    return res.json({
      ok: true,
      courseName,
      spaces: result.rows.map((row) => ({
        id: Number(row.id),
        kind: normalizeSubjectKind(row.kind, SUBJECT_KIND_UNIT),
        subjectName: row.subject_name || '',
        createdAt: row.created_at || null,
        createdByUid: row.created_by_uid || null,
        creatorName: row.creator_name || 'System',
      })),
    });
  } catch (error) {
    console.error('Course spaces listing failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load course spaces.' });
  }
});

router.delete('/api/subjects/:id/course-spaces/:targetId', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const targetId = parsePositiveInt(req.params.targetId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !targetId) {
    return res.status(400).json({ ok: false, message: 'Invalid unit/thread target.' });
  }

  const client = await pool.connect();
  try {
    const access = await ensureCourseSpaceManagementAccess(subjectId, req.user, client, req.subjectCourseAccess);
    if (access.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (access.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Only the owner, admins, or assigned DepAdmin can delete course spaces here.' });
    }

    const courseName = canonicalCourseNameForSubjects(access.subject.course_name);
    const targetResult = await client.query(
      `SELECT id, kind, subject_name
       FROM subjects
       WHERE id = $1
         AND lower(course_name) = lower($2)
         AND is_active = true
       LIMIT 1`,
      [targetId, courseName]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found in this course.' });
    }

    await client.query(
      `UPDATE subjects
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1`,
      [targetId]
    );

    const target = targetResult.rows[0];
    return res.json({
      ok: true,
      deleted: {
        id: Number(target.id),
        kind: normalizeSubjectKind(target.kind, SUBJECT_KIND_UNIT),
        subjectName: target.subject_name || '',
      },
      message: `${formatSubjectLabel(target.kind)[0].toUpperCase()}${formatSubjectLabel(target.kind).slice(1)} deleted.`,
    });
  } catch (error) {
    console.error('Course space deletion failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete unit/thread.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/approve', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, pool, req.subjectCourseAccess);
    if (moderationAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (moderationAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const result = await pool.query(
      `UPDATE subject_posts
       SET approval_status = 'approved',
           approval_required = true,
           approved_at = NOW(),
           approved_by_uid = $3,
           approval_requested_at = COALESCE(approval_requested_at, created_at),
           rejected_at = NULL,
           rejected_by_uid = NULL,
           rejection_note = NULL,
           updated_at = NOW()
       WHERE id = $2
         AND subject_id = $1
         AND status = 'active'
         AND approval_status IN ('pending', 'rejected')
       RETURNING id, author_uid, title`,
      [subjectId, postId, req.user.uid]
    );
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, message: 'Pending post not found.' });
    }

    const row = result.rows[0];
    if (row && row.author_uid && row.author_uid !== req.user.uid) {
      try {
        await createSubjectPostOwnerNotification({
          recipientUid: row.author_uid,
          actorUid: req.user.uid,
          type: 'subject_post_approved',
          subject: moderationAccess.subject,
          postId,
          postTitle: row.title || 'Untitled post',
          targetUrl: buildSubjectPostTargetUrl(subjectId, postId),
        });
      } catch (error) {
        console.error('Subject post approval notification failed:', error);
      }
    }

    return res.json({ ok: true, message: 'Post approved.' });
  } catch (error) {
    console.error('Subject post approval failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to approve post.' });
  }
});

router.post('/api/subjects/:id/posts/:postId/reject', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const note = normalizeText(req.body && req.body.note, 1000);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, pool, req.subjectCourseAccess);
    if (moderationAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (moderationAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const result = await pool.query(
      `UPDATE subject_posts
       SET approval_status = 'rejected',
           approval_required = true,
           rejected_at = NOW(),
           rejected_by_uid = $3,
           rejection_note = $4,
           approved_at = NULL,
           approved_by_uid = NULL,
           updated_at = NOW()
       WHERE id = $2
         AND subject_id = $1
         AND status = 'active'
         AND approval_status = 'pending'
       RETURNING id, author_uid, title`,
      [subjectId, postId, req.user.uid, note || null]
    );
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, message: 'Pending post not found.' });
    }

    const row = result.rows[0];
    if (row && row.author_uid && row.author_uid !== req.user.uid) {
      try {
        await createSubjectPostOwnerNotification({
          recipientUid: row.author_uid,
          actorUid: req.user.uid,
          type: 'subject_post_rejected',
          subject: moderationAccess.subject,
          postId,
          postTitle: row.title || 'Untitled post',
          targetUrl: buildSubjectMyPostsTargetUrl(subjectId, { postId, status: 'rejected' }),
        });
      } catch (error) {
        console.error('Subject post rejection notification failed:', error);
      }
    }

    return res.json({ ok: true, message: 'Post rejected.' });
  } catch (error) {
    console.error('Subject post rejection failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reject post.' });
  }
});

router.post('/api/subjects/:id/members/:uid/warn', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const targetUid = normalizeText(req.params.uid, 120);
  const reason = normalizeText(req.body && req.body.reason, 1000);
  if (!subjectId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }

  const client = await pool.connect();
  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, client, req.subjectCourseAccess);
    if (moderationAccess.status !== 'ok') {
      return res.status(moderationAccess.status === 'not_found' ? 404 : 403).json({
        ok: false,
        message: moderationAccess.status === 'not_found' ? 'Unit or thread not found.' : 'Not allowed.',
      });
    }
    const target = await ensureSubjectGovernanceTarget(subjectId, targetUid, req.user.uid, client);
    if (!target.ok) {
      return res.status(target.status).json({ ok: false, message: target.message });
    }

    await issueSubjectWarning(subjectId, targetUid, req.user.uid, reason, client);
    return res.json({ ok: true, message: 'Warning recorded.' });
  } catch (error) {
    console.error('Subject member warning failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to issue warning.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/members/:uid/suspend', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const targetUid = normalizeText(req.params.uid, 120);
  const reason = normalizeText(req.body && req.body.reason, 1000);
  const durationHours = parseSubjectSuspensionDurationHours(req.body && req.body.durationHours, 72);
  if (!subjectId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }

  const client = await pool.connect();
  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, client, req.subjectCourseAccess);
    if (moderationAccess.status !== 'ok') {
      return res.status(moderationAccess.status === 'not_found' ? 404 : 403).json({
        ok: false,
        message: moderationAccess.status === 'not_found' ? 'Unit or thread not found.' : 'Not allowed.',
      });
    }
    const target = await ensureSubjectGovernanceTarget(subjectId, targetUid, req.user.uid, client);
    if (!target.ok) {
      return res.status(target.status).json({ ok: false, message: target.message });
    }

    const suspension = await suspendSubjectMember(subjectId, targetUid, req.user.uid, reason, durationHours, client);
    return res.json({
      ok: true,
      message: 'Member suspended from this unit/thread.',
      suspendedUntil: suspension && suspension.suspended_until ? suspension.suspended_until : null,
    });
  } catch (error) {
    console.error('Subject member suspension failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to suspend member.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/members/:uid/restore', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const targetUid = normalizeText(req.params.uid, 120);
  if (!subjectId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }

  const client = await pool.connect();
  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, client, req.subjectCourseAccess);
    if (moderationAccess.status !== 'ok') {
      return res.status(moderationAccess.status === 'not_found' ? 404 : 403).json({
        ok: false,
        message: moderationAccess.status === 'not_found' ? 'Unit or thread not found.' : 'Not allowed.',
      });
    }
    const target = await ensureSubjectGovernanceTarget(subjectId, targetUid, req.user.uid, client);
    if (!target.ok) {
      return res.status(target.status).json({ ok: false, message: target.message });
    }

    const restored = await restoreSubjectMember(subjectId, targetUid, client);
    if (!restored) {
      return res.status(404).json({ ok: false, message: 'No active suspension found for this member.' });
    }
    return res.json({ ok: true, message: 'Member restored.' });
  } catch (error) {
    console.error('Subject member restore failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to restore member.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/members/:uid/ban-request', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const targetUid = normalizeText(req.params.uid, 120);
  const reason = normalizeText(req.body && req.body.reason, 1000);
  const note = normalizeText(req.body && req.body.note, 1000);
  if (!subjectId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }

  const client = await pool.connect();
  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, client, req.subjectCourseAccess);
    if (moderationAccess.status !== 'ok') {
      return res.status(moderationAccess.status === 'not_found' ? 404 : 403).json({
        ok: false,
        message: moderationAccess.status === 'not_found' ? 'Unit or thread not found.' : 'Not allowed.',
      });
    }
    const target = await ensureSubjectGovernanceTarget(subjectId, targetUid, req.user.uid, client);
    if (!target.ok) {
      return res.status(target.status).json({ ok: false, message: target.message });
    }

    const requestResult = await createSubjectBanRequest(
      moderationAccess.subject,
      targetUid,
      req.user.uid,
      { reason, note },
      client
    );
    if (requestResult && requestResult.duplicate) {
      return res.json({ ok: true, message: 'An open ban request already exists for this member.' });
    }

    return res.json({ ok: true, message: 'Ban request sent to admin moderation.' });
  } catch (error) {
    console.error('Subject ban request failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to submit ban request.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/reports/:reportType/:reportId/action', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const reportId = parsePositiveInt(req.params.reportId, 0, Number.MAX_SAFE_INTEGER);
  const reportType = normalizeText(req.params.reportType, 40).toLowerCase();
  if (!subjectId || !reportId || !['manual', 'comment', 'ai'].includes(reportType)) {
    return res.status(400).json({ ok: false, message: 'Invalid moderation target.' });
  }

  const moderationAction = normalizeSubjectReportAction(req.body && req.body.moderationAction, 'none');
  if (!SUBJECT_REPORT_ACTIONS.has(moderationAction)) {
    return res.status(400).json({ ok: false, message: 'Invalid moderation action.' });
  }
  let status = normalizeSubjectReportStatus(req.body && req.body.status, 'open');
  if (moderationAction !== 'none') {
    status = 'resolved_action_taken';
  }
  const note = normalizeText(req.body && req.body.note, 1000);
  const durationHours = parseSubjectSuspensionDurationHours(req.body && req.body.durationHours, 72);

  const client = await pool.connect();
  try {
    const moderationAccess = await ensureSubjectModerationAccess(subjectId, req.user, client, req.subjectCourseAccess);
    if (moderationAccess.status !== 'ok') {
      return res.status(moderationAccess.status === 'not_found' ? 404 : 403).json({
        ok: false,
        message: moderationAccess.status === 'not_found' ? 'Unit or thread not found.' : 'Not allowed.',
      });
    }

    let targetUid = '';
    let postId = null;
    let commentId = null;
    let defaultReason = '';

    if (reportType === 'manual') {
      const reportResult = await client.query(
        `SELECT id, post_id, target_uid, reason, status
         FROM subject_post_reports
         WHERE id = $1
           AND subject_id = $2
         LIMIT 1`,
        [reportId, subjectId]
      );
      const report = reportResult.rows[0] || null;
      if (!report) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      targetUid = report.target_uid || '';
      postId = Number(report.post_id || 0) || null;
      defaultReason = report.reason || '';
    } else if (reportType === 'comment') {
      const reportResult = await client.query(
        `SELECT
           r.id,
           r.comment_id,
           r.target_uid,
           r.reason,
           r.status,
           sc.post_id
         FROM subject_comment_reports r
         JOIN subject_comments sc
           ON sc.id = r.comment_id
          AND sc.subject_id = r.subject_id
         WHERE r.id = $1
           AND r.subject_id = $2
         LIMIT 1`,
        [reportId, subjectId]
      );
      const report = reportResult.rows[0] || null;
      if (!report) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      targetUid = report.target_uid || '';
      postId = Number(report.post_id || 0) || null;
      commentId = Number(report.comment_id || 0) || null;
      defaultReason = report.reason || '';
    } else {
      const reportResult = await client.query(
        `SELECT
           scan.id,
           scan.risk_level,
           scan.risk_score,
           scan.result,
           sp.id AS post_id,
           sp.author_uid
         FROM ai_content_scans scan
         JOIN subject_posts sp
           ON scan.target_id = sp.id::text
         WHERE scan.id = $1
           AND scan.target_type = 'subject_post'
           AND sp.subject_id = $2
         LIMIT 1`,
        [reportId, subjectId]
      );
      const report = reportResult.rows[0] || null;
      if (!report) {
        return res.status(404).json({ ok: false, message: 'AI report not found.' });
      }
      const resultPayload = report.result && typeof report.result === 'object' ? report.result : {};
      const flagged =
        isInappropriateScan({
          parsed: {
            riskLevel: report.risk_level || resultPayload.riskLevel || null,
            riskScore: report.risk_score === null || report.risk_score === undefined ? resultPayload.riskScore || null : report.risk_score,
            recommendedAction: resultPayload.recommendedAction || null,
          },
        }) || resultPayload.flagged === true;
      if (!flagged) {
        return res.status(400).json({ ok: false, message: 'This AI report is not flagged for moderation.' });
      }
      targetUid = report.author_uid || '';
      postId = Number(report.post_id || 0) || null;
      defaultReason = normalizeText(resultPayload.summary, 1000);
    }

    if (moderationAction === 'take_down_subject_post' && reportType === 'comment') {
      return res.status(400).json({ ok: false, message: 'Comment reports must use the comment takedown action.' });
    }
    if (moderationAction === 'take_down_subject_comment' && reportType !== 'comment') {
      return res.status(400).json({ ok: false, message: 'Only comment reports can take down comments.' });
    }

    if (moderationAction === 'take_down_subject_post' && postId) {
      const removed = await takeDownSubjectPost(
        postId,
        req.user.uid,
        note || defaultReason || 'Taken down from unit/thread moderation',
        client
      );
      if (!removed) {
        return res.status(404).json({ ok: false, message: 'Target post no longer exists.' });
      }
    }
    if (moderationAction === 'take_down_subject_comment' && commentId) {
      const removed = await takeDownSubjectComment(
        commentId,
        req.user.uid,
        note || defaultReason || 'Taken down from unit/thread moderation',
        client
      );
      if (!removed) {
        return res.status(404).json({ ok: false, message: 'Target comment no longer exists.' });
      }
    }

    if (moderationAction === 'warn_target_user' || moderationAction === 'suspend_target_user' || moderationAction === 'request_ban_target_user') {
      const target = await ensureSubjectGovernanceTarget(subjectId, targetUid, req.user.uid, client);
      if (!target.ok) {
        return res.status(target.status).json({ ok: false, message: target.message });
      }
      if (moderationAction === 'warn_target_user') {
        await issueSubjectWarning(subjectId, targetUid, req.user.uid, note || defaultReason, client);
      } else if (moderationAction === 'suspend_target_user') {
        await suspendSubjectMember(subjectId, targetUid, req.user.uid, note || defaultReason, durationHours, client);
      } else if (moderationAction === 'request_ban_target_user') {
        await createSubjectBanRequest(
          moderationAccess.subject,
          targetUid,
          req.user.uid,
          { reason: defaultReason, note },
          client
        );
      }
    }

    if (reportType === 'manual') {
      await client.query(
        `UPDATE subject_post_reports
         SET status = $3,
             moderation_action = $4,
             resolution_note = $5,
             resolved_at = CASE WHEN $3 IN ('resolved_action_taken', 'resolved_no_action', 'rejected') THEN NOW() ELSE NULL END,
             resolved_by_uid = CASE WHEN $3 IN ('resolved_action_taken', 'resolved_no_action', 'rejected') THEN $6 ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1
           AND subject_id = $2`,
        [
          reportId,
          subjectId,
          status,
          moderationAction === 'none' ? null : moderationAction,
          note || null,
          req.user.uid,
        ]
      );
    } else if (reportType === 'comment') {
      await client.query(
        `UPDATE subject_comment_reports
         SET status = $3,
             moderation_action = $4,
             resolution_note = $5,
             resolved_at = CASE WHEN $3 IN ('resolved_action_taken', 'resolved_no_action', 'rejected') THEN NOW() ELSE NULL END,
             resolved_by_uid = CASE WHEN $3 IN ('resolved_action_taken', 'resolved_no_action', 'rejected') THEN $6 ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1
           AND subject_id = $2`,
        [
          reportId,
          subjectId,
          status,
          moderationAction === 'none' ? null : moderationAction,
          note || null,
          req.user.uid,
        ]
      );
    } else {
      const currentResult = await client.query(
        `SELECT result
         FROM ai_content_scans
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      const currentPayload = currentResult.rows[0] && currentResult.rows[0].result && typeof currentResult.rows[0].result === 'object'
        ? { ...currentResult.rows[0].result }
        : {};
      currentPayload.subjectModeration = {
        status,
        action: moderationAction,
        note: note || '',
        actorUid: req.user.uid,
        resolvedAt: ['resolved_action_taken', 'resolved_no_action', 'rejected'].includes(status)
          ? new Date().toISOString()
          : null,
      };
      await client.query(
        `UPDATE ai_content_scans
         SET result = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [reportId, JSON.stringify(currentPayload)]
      );
    }

    return res.json({ ok: true, message: 'Moderation action applied.' });
  } catch (error) {
    console.error('Subject moderation action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to apply moderation action.' });
  } finally {
    client.release();
  }
});

router.get('/api/subjects/:id/posts/:postId/ask-ai/bootstrap', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectPostAiContext(subjectId, postId, req.user, pool, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(context.subject && context.subject.kind);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject post not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (context.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(context.suspendedUntil).toLocaleString()}.`,
      });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_post_ai_conversations');
    const messagesCollection = db.collection('subject_post_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.post.title || 'Unit post'}`;

    await conversations.updateOne(
      { subjectId, postId, userUid: req.user.uid },
      {
        $set: {
          title,
          updatedAt: now,
        },
        $setOnInsert: {
          subjectId,
          postId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const conversation = await conversations.findOne({ subjectId, postId, userUid: req.user.uid });
    const messages = await messagesCollection
      .find({ conversationId: conversation._id, userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .limit(120)
      .toArray();

    return res.json({
      ok: true,
      conversation: {
        id: conversation._id.toString(),
        title,
        subjectId,
        postId,
      },
      context: {
        postTitle: context.post.title || 'Untitled post',
        subjectTitle: context.subject.subject_name || 'Untitled unit',
        summary: truncateContextText(context.post.content || '', 220) || 'Post context ready.',
      },
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content || '',
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error('Subject post AI bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load subject post AI conversation.' });
  }
});

router.post('/api/subjects/:id/posts/:postId/ask-ai/messages', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 3000);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectPostAiContext(subjectId, postId, req.user, pool, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(context.subject && context.subject.kind);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject post not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (context.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(context.suspendedUntil).toLocaleString()}.`,
      });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_post_ai_conversations');
    const messagesCollection = db.collection('subject_post_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.post.title || 'Unit post'}`;

    await conversations.updateOne(
      { subjectId, postId, userUid: req.user.uid },
      {
        $set: { title, updatedAt: now },
        $setOnInsert: {
          subjectId,
          postId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );
    const conversation = await conversations.findOne({ subjectId, postId, userUid: req.user.uid });

    const userMessage = {
      conversationId: conversation._id,
      subjectId,
      postId,
      userUid: req.user.uid,
      role: 'user',
      content,
      createdAt: now,
    };
    await messagesCollection.insertOne(userMessage);

    let assistantText = Boolean(getOpenAIKey())
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses.';

    const openai = await getOpenAIClient();
    if (openai) {
      const recentMessages = await messagesCollection
        .find({ conversationId: conversation._id, userUid: req.user.uid })
        .sort({ createdAt: -1 })
        .limit(SUBJECT_AI_HISTORY_LIMIT)
        .toArray();

      const history = [...recentMessages].reverse().map((message) => ({
        role: message.role,
        content: message.content || '',
      }));
      const contextBlock = buildSubjectPostAiContextBlock(context.subject, context.post);

      try {
        const response = await openai.responses.create({
          model: getOpenAIModel(),
          max_output_tokens: 900,
          input: [
            {
              role: 'system',
              content:
                'You are an academic assistant helping discuss a specific unit post. Stay grounded in the supplied unit and post context. If the user asks for something unrelated to the unit post, briefly say it is outside this post discussion and redirect them back to the post or unit topic.',
            },
            {
              role: 'system',
              content: contextBlock,
            },
            ...history,
          ],
        });
        const outputText = extractTextFromOpenAIResponse(response);
        if (outputText) {
          assistantText = outputText;
        }
      } catch (error) {
        console.error('Subject post AI response failed:', error);
        if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
          assistantText = 'Model access/config issue detected. Set OPENAI_MODEL to an available model and retry.';
        }
      }
    }

    const assistantMessage = {
      conversationId: conversation._id,
      subjectId,
      postId,
      userUid: req.user.uid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    const insertedAssistant = await messagesCollection.insertOne(assistantMessage);
    await conversations.updateOne({ _id: conversation._id }, { $set: { title, updatedAt: new Date() } });

    return res.json({
      ok: true,
      conversationId: conversation._id.toString(),
      message: {
        id: insertedAssistant.insertedId.toString(),
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    });
  } catch (error) {
    console.error('Subject post AI message failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to send subject post AI message.' });
  }
});

router.patch('/api/subjects/:id/comments/:commentId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:edit_comment', 60)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const commentId = parsePositiveInt(req.params.commentId, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 4000);
  if (!subjectId || !commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject comment id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Comment content required.' });
  }

  const client = await pool.connect();
  try {
    const commentAccess = await loadSubjectCommentForViewer(subjectId, commentId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(commentAccess.subject && commentAccess.subject.kind);
    if (commentAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }
    if (commentAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (commentAccess.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (commentAccess.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(commentAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const comment = commentAccess.comment || null;
    if (!comment) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }
    if (comment.author_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Only the comment owner can edit this comment.' });
    }
    if (normalizeText(comment.status, 40).toLowerCase() !== 'active') {
      return res.status(400).json({ ok: false, message: 'Removed comments cannot be edited.' });
    }

    const result = await client.query(
      `UPDATE subject_comments
       SET content = $3,
           updated_at = NOW()
       WHERE subject_id = $1
         AND id = $2
         AND author_uid = $4
         AND status = 'active'
       RETURNING id, subject_id, post_id, author_uid, content, created_at, updated_at`,
      [subjectId, commentId, content, req.user.uid]
    );
    const row = result.rows[0] || null;
    if (!row) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    return res.json({
      ok: true,
      comment: {
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        postId: Number(row.post_id),
        authorUid: row.author_uid,
        authorName: req.user.displayName || req.user.username || req.user.email || 'Member',
        content: row.content || '',
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || row.created_at || null,
      },
    });
  } catch (error) {
    console.error('Subject comment update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update comment.' });
  } finally {
    client.release();
  }
});

router.delete('/api/subjects/:id/comments/:commentId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:delete_comment', 40)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const commentId = parsePositiveInt(req.params.commentId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject comment id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const commentAccess = await loadSubjectCommentForViewer(subjectId, commentId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(commentAccess.subject && commentAccess.subject.kind);
    if (commentAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }
    if (commentAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (commentAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (commentAccess.status === 'suspended') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(commentAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const comment = commentAccess.comment || null;
    if (!comment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }
    if (comment.author_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only the comment owner can delete this comment.' });
    }
    if (normalizeText(comment.status, 40).toLowerCase() !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Comment already removed.' });
    }

    const deleteResult = await client.query(
      `UPDATE subject_comments
       SET status = 'taken_down',
           taken_down_by_uid = $3,
           taken_down_reason = 'Deleted by author',
           updated_at = NOW()
       WHERE subject_id = $1
         AND id = $2
         AND author_uid = $3
         AND status = 'active'
       RETURNING post_id`,
      [subjectId, commentId, req.user.uid]
    );
    const row = deleteResult.rows[0] || null;
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    const commentsCount = await refreshSubjectPostCommentCount(subjectId, row.post_id, client);
    await client.query('COMMIT');
    return res.json({ ok: true, commentsCount });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject comment delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete comment.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/comments/:commentId/report', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const commentId = parsePositiveInt(req.params.commentId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject comment id.' });
  }

  const client = await pool.connect();
  try {
    const commentAccess = await loadSubjectCommentForViewer(subjectId, commentId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(commentAccess.subject && commentAccess.subject.kind);
    if (commentAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }
    if (commentAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (commentAccess.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (commentAccess.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(commentAccess.suspendedUntil).toLocaleString()}.`,
      });
    }

    const comment = commentAccess.comment || null;
    if (!comment) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }
    if (normalizeText(comment.status, 40).toLowerCase() !== 'active') {
      return res.status(400).json({ ok: false, message: 'Only active comments can be reported.' });
    }
    if (comment.author_uid && comment.author_uid === req.user.uid) {
      return res.status(400).json({ ok: false, message: 'You cannot report your own comment.' });
    }

    const { category, customReason, details, reason } = parseReportPayload(req.body || {});
    await client.query(
      `INSERT INTO subject_comment_reports
         (subject_id, comment_id, reporter_uid, target_uid, category, custom_reason, details, reason, status, moderation_action, resolution_note, resolved_at, resolved_by_uid, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, NULL, NULL, NULL, NOW(), NOW())
       ON CONFLICT (comment_id, reporter_uid)
       DO UPDATE SET
         target_uid = EXCLUDED.target_uid,
         category = EXCLUDED.category,
         custom_reason = EXCLUDED.custom_reason,
         details = EXCLUDED.details,
         reason = EXCLUDED.reason,
         status = 'open',
         moderation_action = NULL,
         resolution_note = NULL,
         resolved_at = NULL,
         resolved_by_uid = NULL,
         updated_at = NOW()`,
      [subjectId, commentId, req.user.uid, comment.author_uid || null, category, customReason || null, details || null, reason]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Subject comment report failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to report comment.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/comments', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:create_comment', 80)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 4000);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Comment content required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const postAccess = await loadSubjectPostForViewer(subjectId, postId, req.user, client, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(postAccess.subject && postAccess.subject.kind);
    if (postAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (postAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (postAccess.status === 'suspended') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(postAccess.suspendedUntil).toLocaleString()}.`,
      });
    }
    if (normalizeSubjectPostApprovalStatus(postAccess.post.approval_status, 'approved') !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Comments are only available on approved posts.' });
    }

    const insertResult = await client.query(
      `INSERT INTO subject_comments (subject_id, post_id, author_uid, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, subject_id, post_id, author_uid, content, created_at`,
      [subjectId, postId, req.user.uid, content]
    );
    const commentsCount = await refreshSubjectPostCommentCount(subjectId, postId, client);
    await client.query('COMMIT');

    const row = insertResult.rows[0];
    if (postAccess.post.author_uid && postAccess.post.author_uid !== req.user.uid) {
      try {
        await createSubjectPostOwnerNotification({
          recipientUid: postAccess.post.author_uid,
          actorUid: req.user.uid,
          type: 'subject_post_commented',
          subject: postAccess.subject,
          postId,
          postTitle: postAccess.post.title || 'Untitled post',
          targetUrl: buildSubjectPostTargetUrl(subjectId, postId),
        });
      } catch (error) {
        console.error('Subject comment notification failed:', error);
      }
    }

    return res.json({
      ok: true,
      commentsCount,
      comment: {
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        postId: Number(row.post_id),
        authorUid: row.author_uid,
        authorName: req.user.displayName || req.user.username || req.user.email || 'Member',
        content: row.content || '',
        createdAt: row.created_at,
        updatedAt: row.created_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject comment create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create comment.' });
  } finally {
    client.release();
  }
});

router.get('/api/subjects/:id/posts/:postId/comments', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  try {
    const postAccess = await loadSubjectPostForViewer(subjectId, postId, req.user, pool, req.subjectCourseAccess);
    if (postAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (postAccess.status === 'banned' || postAccess.status === 'suspended') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const result = await pool.query(
      `SELECT
         sc.id,
         sc.subject_id,
         sc.post_id,
         sc.author_uid,
         sc.content,
         sc.created_at,
         sc.updated_at,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
       FROM subject_comments sc
       JOIN accounts a ON a.uid = sc.author_uid
       LEFT JOIN profiles pr ON pr.uid = sc.author_uid
       WHERE sc.subject_id = $1
         AND sc.post_id = $2
         AND sc.status = 'active'
       ORDER BY sc.created_at ASC, sc.id ASC
       LIMIT 300`,
      [subjectId, postId]
    );

    return res.json({
      ok: true,
      comments: result.rows.map((row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        postId: Number(row.post_id),
        authorUid: row.author_uid,
        authorName: row.author_name || 'Member',
        content: row.content || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
      })),
    });
  } catch (error) {
    console.error('Subject comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load comments.' });
  }
});

router.get('/api/subjects/:id/ask-ai/bootstrap', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectAiContext(subjectId, req.user, pool, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(context.subject && context.subject.kind);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this unit/thread.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (context.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(context.suspendedUntil).toLocaleString()}.`,
      });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_ai_conversations');
    const messagesCollection = db.collection('subject_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.subject.subject_name || 'Unit'}`;

    await conversations.updateOne(
      { subjectId, userUid: req.user.uid },
      {
        $set: {
          title,
          contextSummary: context.contextSummary || null,
          updatedAt: now,
        },
        $setOnInsert: {
          subjectId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const conversation = await conversations.findOne({ subjectId, userUid: req.user.uid });
    const messages = await messagesCollection
      .find({ conversationId: conversation._id, userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .limit(120)
      .toArray();

    return res.json({
      ok: true,
      conversation: {
        id: conversation._id.toString(),
        title,
        subjectId,
      },
      context: {
        subjectTitle: context.subject.subject_name || 'Untitled unit',
        subjectCode: context.subject.subject_code || null,
        courseName: context.subject.course_name || null,
        summary: context.contextSummary || 'Unit context ready.',
        policy:
          'This AI is limited to this unit. Unrelated prompts are declined and redirected back to unit topics.',
      },
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content || '',
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error('Subject AI bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load unit AI conversation.' });
  }
});

router.post('/api/subjects/:id/ask-ai/messages', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 3000);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectAiContext(subjectId, req.user, pool, req.subjectCourseAccess);
    const subjectLabel = formatSubjectLabel(context.subject && context.subject.kind);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unit or thread not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this unit/thread.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: `You are banned from interacting in this ${subjectLabel}.` });
    }
    if (context.status === 'suspended') {
      return res.status(403).json({
        ok: false,
        message: `You are suspended from this ${subjectLabel} until ${new Date(context.suspendedUntil).toLocaleString()}.`,
      });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_ai_conversations');
    const messagesCollection = db.collection('subject_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.subject.subject_name || 'Unit'}`;

    await conversations.updateOne(
      { subjectId, userUid: req.user.uid },
      {
        $set: {
          title,
          contextSummary: context.contextSummary || null,
          updatedAt: now,
        },
        $setOnInsert: {
          subjectId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const conversation = await conversations.findOne({ subjectId, userUid: req.user.uid });
    const userMessage = {
      conversationId: conversation._id,
      subjectId,
      userUid: req.user.uid,
      role: 'user',
      content,
      createdAt: now,
    };
    await messagesCollection.insertOne(userMessage);

    let assistantText = Boolean(getOpenAIKey())
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses.';

    const openai = await getOpenAIClient();
    if (openai) {
      const recentMessages = await messagesCollection
        .find({ conversationId: conversation._id, userUid: req.user.uid })
        .sort({ createdAt: -1 })
        .limit(SUBJECT_AI_HISTORY_LIMIT)
        .toArray();

      const history = [...recentMessages].reverse().map((message) => ({
        role: message.role,
        content: message.content || '',
      }));
      const contextBlock = buildSubjectAiContextBlock(context.subject, context.recentPosts);

      try {
        const response = await openai.responses.create({
          model: getOpenAIModel(),
          max_output_tokens: 900,
          input: [
            {
              role: 'system',
              content:
                'You are the dedicated academic assistant for exactly one university unit. Only answer requests that are directly related to this unit, its topics, concepts, readings, assignments, study tasks, or discussions. If a request is unrelated or meaningfully outside this unit, do not answer it directly. Briefly explain that it is outside this unit AI scope and redirect the user to ask about this unit instead. If a request is only partly related, answer only the unit-relevant portion and explicitly say what is out of scope. Do not invent syllabus details, policies, or facts not grounded in the provided unit context.',
            },
            {
              role: 'system',
              content: contextBlock,
            },
            ...history,
          ],
        });
        const outputText = extractTextFromOpenAIResponse(response);
        if (outputText) {
          assistantText = outputText;
        }
      } catch (error) {
        console.error('Subject AI response failed:', error);
        if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
          assistantText = 'Model access/config issue detected. Set OPENAI_MODEL to an available model and retry.';
        }
      }
    }

    const assistantMessage = {
      conversationId: conversation._id,
      subjectId,
      userUid: req.user.uid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    const insertedAssistant = await messagesCollection.insertOne(assistantMessage);
    await conversations.updateOne(
      { _id: conversation._id },
      {
        $set: {
          title,
          contextSummary: context.contextSummary || null,
          updatedAt: new Date(),
        },
      }
    );

    return res.json({
      ok: true,
      conversationId: conversation._id.toString(),
      message: {
        id: insertedAssistant.insertedId.toString(),
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    });
  } catch (error) {
    console.error('Subject AI message failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to send unit AI message.' });
  }
});

module.exports = router;
