const express = require('express');
const { ObjectId } = require('mongodb');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { deleteSessionsForUid } = require('../auth/sessionStore');
const { getMongoDb } = require('../db/mongo');
const { ensureAiGovernanceReady } = require('../services/aiGovernanceService');
const { isInappropriateScan } = require('../services/aiContentScanService');
const { getPlatformRole } = require('../services/roleAccess');
const { createNotification } = require('../services/notificationService');
const {
  ensureDepartmentWorkflowReady,
  loadAssignedDepartmentCourses,
  sameCourse,
  normalizeDocumentApprovalStatus,
} = require('../services/departmentAccess');

const router = express.Router();
const DEFAULT_SUSPENSION_HOURS = 72;
const MAX_SUSPENSION_HOURS = 24 * 365;
const DEPARTMENT_REPORT_STATUSES = new Set([
  'open',
  'under_review',
  'resolved_action_taken',
  'resolved_no_action',
  'rejected',
]);
const DEPARTMENT_REPORT_ACTIONS = new Set([
  'none',
  'take_down_subject_post',
  'take_down_target',
  'suspend_target_user',
]);
let ensureDepartmentModerationReadyPromise = null;

function sanitizeText(value, maxLen = 400) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseSuspensionDurationHours(value, fallback = DEFAULT_SUSPENSION_HOURS) {
  const parsed = parsePositiveInt(value);
  return clampInteger(parsed == null ? fallback : parsed, 1, MAX_SUSPENSION_HOURS, fallback);
}

function normalizeDepartmentReportStatus(value, fallback = 'open') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  return DEPARTMENT_REPORT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeDepartmentReportAction(value, fallback = 'none') {
  const normalized = sanitizeText(value, 80).toLowerCase();
  return DEPARTMENT_REPORT_ACTIONS.has(normalized) ? normalized : fallback;
}

function shouldMarkDepartmentReportResolved(status) {
  return ['resolved_action_taken', 'resolved_no_action', 'rejected'].includes(status);
}

function buildRemovedMainPostTargetUrl(postId) {
  const safePostId = sanitizeText(postId, 120);
  if (!safePostId) return '/home';
  return `/posts/${encodeURIComponent(safePostId)}?removed=1`;
}

function buildRemovedSubjectPostTargetUrl(subjectId, postId) {
  const safeSubjectId = parsePositiveInt(subjectId);
  const safePostId = parsePositiveInt(postId);
  if (!safeSubjectId) return '/subjects';
  const params = new URLSearchParams();
  params.set('subjectId', String(safeSubjectId));
  params.set('myPosts', '1');
  params.set('myPostStatus', 'removed');
  if (safePostId) {
    params.set('myPostId', String(safePostId));
  }
  return `/subjects?${params.toString()}`;
}

function buildAiScanParsePayload(row) {
  const resultPayload = row && row.result && typeof row.result === 'object' ? row.result : {};
  const flagged =
    isInappropriateScan({
      parsed: {
        riskLevel: row ? row.risk_level : null,
        riskScore: row ? row.risk_score : null,
        recommendedAction: resultPayload.recommendedAction,
      },
    }) || resultPayload.flagged === true;

  return {
    resultPayload,
    flagged,
  };
}

async function ensureDepartmentModerationReady(client = pool) {
  if (!ensureDepartmentModerationReadyPromise) {
    ensureDepartmentModerationReadyPromise = (async () => {
      await client.query(`
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

        CREATE INDEX IF NOT EXISTS subject_post_reports_subject_status_idx
          ON subject_post_reports(subject_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_post_reports_target_idx
          ON subject_post_reports(post_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS account_disciplinary_actions (
          id BIGSERIAL PRIMARY KEY,
          target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          issued_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          action_type TEXT NOT NULL CHECK (action_type IN ('warn', 'suspend', 'ban')),
          reason TEXT,
          starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ends_at TIMESTAMPTZ,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revoked_at TIMESTAMPTZ,
          revoked_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          revoked_reason TEXT
        );

        CREATE INDEX IF NOT EXISTS account_disciplinary_actions_target_active_idx
          ON account_disciplinary_actions(target_uid, active, created_at DESC);
        CREATE INDEX IF NOT EXISTS account_disciplinary_actions_target_type_idx
          ON account_disciplinary_actions(target_uid, action_type, created_at DESC);
      `);
    })().catch((error) => {
      ensureDepartmentModerationReadyPromise = null;
      throw error;
    });
  }

  await ensureDepartmentModerationReadyPromise;
}

async function loadDisplayNamesByUid(uids, client = pool) {
  const unique = Array.from(new Set((Array.isArray(uids) ? uids : []).filter(Boolean)));
  if (!unique.length) return new Map();
  const result = await client.query(
    `SELECT a.uid, COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = ANY($1::text[])`,
    [unique]
  );
  return new Map(result.rows.map((row) => [row.uid, row.display_name || row.uid]));
}

async function loadDepartmentViewer(uid, client = pool) {
  const result = await client.query(
    `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

async function recordDisciplinaryAction(
  {
    targetUid,
    issuedByUid,
    actionType,
    reason,
    startsAt = new Date(),
    endsAt = null,
    active = true,
  },
  client = pool
) {
  const target = sanitizeText(targetUid, 120);
  const issuer = sanitizeText(issuedByUid, 120) || null;
  const action = sanitizeText(actionType, 20).toLowerCase();
  if (!target || !['warn', 'suspend', 'ban'].includes(action)) return null;

  const result = await client.query(
    `INSERT INTO account_disciplinary_actions
      (target_uid, issued_by_uid, action_type, reason, starts_at, ends_at, active, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING id`,
    [target, issuer, action, reason || null, startsAt, endsAt, active]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

function getManagedCourseNames(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .map((item) => (item && item.courseName ? item.courseName : ''))
    .filter(Boolean);
}

function canManageDepartmentCourse(assignments, courseName) {
  return getManagedCourseNames(assignments).some((managedCourse) => sameCourse(managedCourse, courseName));
}

function resolveDepartmentCourseFilter(assignments, requestedCourse) {
  const managedCourses = getManagedCourseNames(assignments);
  const trimmedRequested = sanitizeText(requestedCourse, 160);
  if (!trimmedRequested) {
    return {
      selectedCourse: '',
      courses: managedCourses,
    };
  }
  const matched = managedCourses.find((courseName) => sameCourse(courseName, trimmedRequested)) || '';
  if (!matched) return null;
  return {
    selectedCourse: matched,
    courses: [matched],
  };
}

async function takeDownDepartmentHomePost(postIdValue, actorUid, reason) {
  if (!postIdValue || !ObjectId.isValid(postIdValue)) return null;
  const postId = new ObjectId(postIdValue);
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const post = await postsCollection.findOne(
    { _id: postId },
    { projection: { _id: 1, title: 1, uploaderUid: 1, course: 1, moderationStatus: 1 } }
  );
  if (!post) return null;
  if (String(post.moderationStatus || '').toLowerCase() === 'restricted') {
    return post;
  }
  await postsCollection.updateOne(
    { _id: postId },
    {
      $set: {
        moderationStatus: 'restricted',
        restrictedAt: new Date(),
        restrictedByUid: sanitizeText(actorUid, 120) || null,
        restrictedReason: sanitizeText(reason, 1000) || 'Taken down by department moderation',
      },
    }
  );
  if (post.uploaderUid && post.uploaderUid !== actorUid) {
    createNotification({
      recipientUid: post.uploaderUid,
      actorUid,
      type: 'post_deleted',
      entityType: 'post',
      entityId: String(post._id),
      targetUrl: buildRemovedMainPostTargetUrl(String(post._id)),
      meta: {
        postTitle: post.title || 'Untitled post',
        reason: sanitizeText(reason, 1000) || 'Removed by department moderation',
      },
    }).catch((error) => {
      console.error('Department home post removal notification failed:', error);
    });
  }
  return post;
}

async function takeDownDepartmentUnitPost(postId, actorUid, reason, client = pool) {
  const numericPostId = parsePositiveInt(postId);
  if (!numericPostId) return null;
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
    [
      numericPostId,
      sanitizeText(actorUid, 120) || null,
      sanitizeText(reason, 1000) || 'Taken down by department moderation',
    ]
  );
  const row = result.rows[0] || null;
  if (row && row.author_uid && row.author_uid !== actorUid) {
    createNotification({
      recipientUid: row.author_uid,
      actorUid,
      type: 'subject_post_deleted',
      entityType: 'subject_post',
      entityId: String(row.id),
      targetUrl: buildRemovedSubjectPostTargetUrl(row.subject_id, row.id),
      meta: {
        postTitle: row.title || 'Untitled post',
        subjectId: Number(row.subject_id || 0) || null,
        subjectKind: row.kind || 'unit',
        subjectName: row.subject_name || '',
        courseName: row.course_name || '',
        reason: sanitizeText(reason, 1000) || 'Removed by department moderation',
      },
    }).catch((error) => {
      console.error('Department unit post removal notification failed:', error);
    });
  }
  return row;
}

async function suspendTargetUserForDepartmentAction(targetUid, actorViewer, note, durationHours) {
  const normalizedTargetUid = sanitizeText(targetUid, 120);
  if (!normalizedTargetUid) {
    return { ok: false, message: 'Target account unavailable for suspension action.' };
  }
  if (!actorViewer || !actorViewer.uid) {
    return { ok: false, message: 'Acting account unavailable.' };
  }
  if (normalizedTargetUid === actorViewer.uid) {
    return { ok: false, message: 'You cannot suspend your own account.' };
  }

  const targetResult = await pool.query(
    `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [normalizedTargetUid]
  );
  const target = targetResult.rows[0];
  if (!target) {
    return { ok: false, message: 'Target account not found.' };
  }

  const actorRole = getPlatformRole(actorViewer);
  const targetRole = getPlatformRole(target);
  if (targetRole === 'owner') {
    return { ok: false, message: 'Owner account cannot be suspended.' };
  }
  if (actorRole === 'admin' && (targetRole === 'owner' || targetRole === 'admin')) {
    return { ok: false, message: 'Admins cannot suspend owner/admin accounts.' };
  }
  if (actorRole === 'depadmin' && (targetRole === 'owner' || targetRole === 'admin' || targetRole === 'depadmin')) {
    return { ok: false, message: 'DepAdmins cannot suspend owner/admin/DepAdmin accounts.' };
  }

  const activeRestrictionResult = await pool.query(
    `SELECT id, action_type
     FROM account_disciplinary_actions
     WHERE target_uid = $1
       AND active = true
       AND action_type IN ('ban', 'suspend')
       AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY CASE WHEN action_type = 'ban' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [normalizedTargetUid]
  );
  if (activeRestrictionResult.rows[0] && activeRestrictionResult.rows[0].action_type === 'ban') {
    return { ok: false, message: 'Target account is already banned.' };
  }

  const safeDurationHours = parseSuspensionDurationHours(durationHours);
  const endsAt = new Date(Date.now() + safeDurationHours * 60 * 60 * 1000);
  const reason = note || `Suspended from department moderation for ${safeDurationHours} hour(s)`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE account_disciplinary_actions
       SET
         active = false,
         revoked_at = NOW(),
         revoked_by_uid = $2,
         revoked_reason = $3
       WHERE target_uid = $1
         AND action_type = 'suspend'
         AND active = true`,
      [normalizedTargetUid, actorViewer.uid, 'Replaced by newer department suspension']
    );
    await client.query(
      `UPDATE accounts
       SET is_banned = true,
           banned_at = NOW(),
           banned_reason = $1,
           banned_by_uid = $2
       WHERE uid = $3`,
      [reason, actorViewer.uid, normalizedTargetUid]
    );
    const disciplinaryActionId = await recordDisciplinaryAction(
      {
        targetUid: normalizedTargetUid,
        issuedByUid: actorViewer.uid,
        actionType: 'suspend',
        reason,
        startsAt: new Date(),
        endsAt,
        active: true,
      },
      client
    );
    await client.query('COMMIT');
    await deleteSessionsForUid(normalizedTargetUid);
    return {
      ok: true,
      endsAt,
      durationHours: safeDurationHours,
      disciplinaryActionId,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback failure
    }
    console.error('Department suspension failed:', error);
    return { ok: false, message: 'Unable to suspend target account.' };
  } finally {
    client.release();
  }
}

router.use('/api/department', requireAuthApi);

router.use('/api/department', async (req, res, next) => {
  try {
    await Promise.all([
      ensureDepartmentWorkflowReady(),
      ensureDepartmentModerationReady(),
      ensureAiGovernanceReady(),
    ]);
    const viewer = await loadDepartmentViewer(req.user && req.user.uid ? req.user.uid : '');
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    if (viewer.is_banned === true) {
      return res.status(403).json({ ok: false, message: 'Account is banned.' });
    }
    const role = getPlatformRole(viewer);
    if (!(role === 'depadmin' || role === 'admin' || role === 'owner')) {
      return res.status(403).json({ ok: false, message: 'Department management access required.' });
    }
    const assignments = await loadAssignedDepartmentCourses(viewer.uid);
    if (!assignments.length) {
      return res.status(403).json({ ok: false, message: 'No department assignments found for this account.' });
    }
    req.departmentViewer = viewer;
    req.departmentAssignments = assignments;
    return next();
  } catch (error) {
    console.error('Department guard failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to authorize department access.' });
  }
});

router.get('/api/department/dashboard', async (req, res) => {
  const resolvedFilter = resolveDepartmentCourseFilter(req.departmentAssignments, req.query.course);
  if (!resolvedFilter) {
    return res.status(400).json({ ok: false, message: 'Requested course is not assigned to this DepAdmin.' });
  }

  const { courses, selectedCourse } = resolvedFilter;
  const courseFilters = courses.map((courseName) => courseName.toLowerCase());
  const db = await getMongoDb();

  try {
    const [documentsResult, unitPostsResult, reportsResult, aiReportsResult, homePosts] = await Promise.all([
      pool.query(
        `SELECT
           d.uuid,
           d.title,
           d.filename,
           d.course,
           d.subject,
           d.visibility,
           d.source,
           d.uploaddate,
           d.upload_approval_status,
           d.upload_approval_requested_at,
           d.upload_rejection_note,
           d.uploader_uid,
           COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
         FROM documents d
         JOIN accounts a ON a.uid = d.uploader_uid
         LEFT JOIN profiles p ON p.uid = a.uid
         WHERE lower(d.course) = ANY($1::text[])
           AND COALESCE(d.upload_approval_status, 'approved') = 'pending'
         ORDER BY COALESCE(d.upload_approval_requested_at, d.uploaddate) ASC
         LIMIT 200`,
        [courseFilters]
      ),
      pool.query(
        `SELECT
           sp.id,
           sp.subject_id,
           sp.title,
           sp.content,
           sp.comments_count,
           sp.likes_count,
           sp.created_at,
           sp.author_uid,
           COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS author_name,
           s.subject_name,
           s.course_name
         FROM subject_posts sp
         JOIN subjects s ON s.id = sp.subject_id
         LEFT JOIN accounts aa ON aa.uid = sp.author_uid
         LEFT JOIN profiles ap ON ap.uid = sp.author_uid
         WHERE sp.status = 'active'
           AND s.is_active = true
           AND lower(s.course_name) = ANY($1::text[])
         ORDER BY sp.created_at DESC
         LIMIT 200`,
        [courseFilters]
      ),
      pool.query(
        `SELECT
           r.id,
           r.post_id,
           r.subject_id,
           r.category,
           r.custom_reason,
           r.details,
           r.reason,
           r.status,
           r.moderation_action,
           r.resolution_note,
           r.created_at,
           sp.title,
           sp.content,
           sp.author_uid,
           s.subject_name,
           s.course_name,
           COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
           COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS author_name
         FROM subject_post_reports r
         JOIN subject_posts sp ON sp.id = r.post_id
         JOIN subjects s ON s.id = r.subject_id
         JOIN accounts ra ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
         LEFT JOIN accounts aa ON aa.uid = sp.author_uid
         LEFT JOIN profiles ap ON ap.uid = sp.author_uid
         WHERE lower(s.course_name) = ANY($1::text[])
           AND sp.status = 'active'
           AND r.status IN ('open', 'under_review')
         ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 200`,
        [courseFilters]
      ),
      pool.query(
        `SELECT
           scan.id,
           scan.target_id,
           scan.risk_level,
           scan.risk_score,
           scan.result,
           scan.status,
           scan.created_at,
           sp.id AS post_id,
           sp.title,
           sp.content,
           sp.author_uid,
           sp.status AS post_status,
           s.subject_name,
           s.course_name,
           COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS author_name
         FROM ai_content_scans scan
         JOIN subject_posts sp ON scan.target_id = sp.id::text
         JOIN subjects s ON s.id = sp.subject_id
         LEFT JOIN accounts aa ON aa.uid = sp.author_uid
         LEFT JOIN profiles ap ON ap.uid = sp.author_uid
         WHERE scan.target_type = 'subject_post'
           AND lower(s.course_name) = ANY($1::text[])
           AND sp.status = 'active'
         ORDER BY scan.created_at DESC
         LIMIT 200`,
        [courseFilters]
      ),
      db
        .collection('posts')
        .find({
          course: { $in: courses },
          visibility: { $in: ['private', 'course_exclusive'] },
          moderationStatus: { $ne: 'restricted' },
        })
        .sort({ uploadDate: -1 })
        .limit(200)
        .toArray(),
    ]);

    const homeNames = await loadDisplayNamesByUid(homePosts.map((post) => post.uploaderUid).filter(Boolean));

    const manualReportRows = reportsResult.rows.map((row) => ({
      sourceType: 'manual',
      reportSourceLabel: 'Member report',
      id: Number(row.id),
      postId: Number(row.post_id),
      subjectId: Number(row.subject_id),
      title: row.title || '',
      content: row.content || '',
      authorUid: row.author_uid || null,
      authorName: row.author_name || 'Member',
      course: row.course_name || '',
      subjectName: row.subject_name || '',
      reporterName: row.reporter_name || 'Member',
      category: row.category || null,
      customReason: row.custom_reason || null,
      details: row.details || null,
      reason: row.reason || '',
      status: normalizeDepartmentReportStatus(row.status, 'open'),
      moderationAction: normalizeDepartmentReportAction(row.moderation_action, 'none'),
      resolutionNote: row.resolution_note || null,
      createdAt: row.created_at || null,
    }));

    const aiReportRows = aiReportsResult.rows
      .map((row) => {
        const { resultPayload, flagged } = buildAiScanParsePayload(row);
        if (!flagged) return null;

        const adminModeration =
          resultPayload.adminModeration && typeof resultPayload.adminModeration === 'object'
            ? resultPayload.adminModeration
            : null;
        if (adminModeration && sanitizeText(adminModeration.action, 80).toLowerCase() !== 'none') {
          return null;
        }

        const departmentModeration =
          resultPayload.departmentModeration && typeof resultPayload.departmentModeration === 'object'
            ? resultPayload.departmentModeration
            : null;
        const departmentStatus = normalizeDepartmentReportStatus(
          departmentModeration && departmentModeration.status,
          'open'
        );
        if (!['open', 'under_review'].includes(departmentStatus)) {
          return null;
        }

        const flags = Array.isArray(resultPayload.flags)
          ? resultPayload.flags.map((item) => sanitizeText(String(item), 120)).filter(Boolean)
          : [];
        return {
          sourceType: 'ai',
          reportSourceLabel: 'AI report',
          id: Number(row.id),
          postId: Number(row.post_id),
          title: row.title || '',
          content: row.content || '',
          authorUid: row.author_uid || null,
          authorName: row.author_name || 'Member',
          course: row.course_name || '',
          subjectName: row.subject_name || '',
          riskLevel: row.risk_level || 'unknown',
          riskScore: row.risk_score === null || row.risk_score === undefined ? null : Number(row.risk_score),
          recommendedAction: sanitizeText(resultPayload.recommendedAction, 60).toLowerCase() || null,
          summary: sanitizeText(resultPayload.summary, 2400) || '',
          flags,
          status: departmentStatus,
          moderationAction: normalizeDepartmentReportAction(
            departmentModeration && departmentModeration.action,
            'none'
          ),
          resolutionNote: sanitizeText(departmentModeration && departmentModeration.note, 1000) || null,
          createdAt: row.created_at || null,
        };
      })
      .filter(Boolean);

    const reportedUnitPosts = [...manualReportRows, ...aiReportRows].sort((left, right) => {
      const statusPriority = {
        open: 0,
        under_review: 1,
        resolved_action_taken: 2,
        resolved_no_action: 3,
        rejected: 4,
      };
      const leftPriority = statusPriority[left.status] ?? 99;
      const rightPriority = statusPriority[right.status] ?? 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });

    return res.json({
      ok: true,
      assignments: req.departmentAssignments.map((assignment) => ({
        id: assignment.id,
        courseCode: assignment.courseCode || null,
        courseName: assignment.courseName || '',
      })),
      selectedCourse,
      documents: documentsResult.rows.map((row) => ({
        uuid: row.uuid,
        title: row.title || '',
        filename: row.filename || '',
        course: row.course || '',
        subject: row.subject || '',
        visibility: row.visibility || 'public',
        source: row.source || 'library',
        approvalStatus: normalizeDocumentApprovalStatus(row.upload_approval_status, 'approved'),
        approvalRequestedAt: row.upload_approval_requested_at || row.uploaddate || null,
        rejectionNote: row.upload_rejection_note || null,
        uploaderUid: row.uploader_uid || null,
        uploaderName: row.uploader_name || 'Member',
        uploadedAt: row.uploaddate || null,
      })),
      unitPosts: unitPostsResult.rows.map((row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || '',
        content: row.content || '',
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        authorUid: row.author_uid || null,
        authorName: row.author_name || row.author_uid || 'Member',
        course: row.course_name || '',
        subjectName: row.subject_name || '',
        createdAt: row.created_at || null,
      })),
      homePosts: homePosts.map((post) => ({
        id: String(post._id),
        title: post.title || '',
        content: post.content || '',
        course: post.course || '',
        visibility: post.visibility || 'public',
        uploaderUid: post.uploaderUid || null,
        uploaderName: homeNames.get(post.uploaderUid) || post.uploader?.displayName || 'Member',
        likesCount: Number(post.likesCount || 0),
        commentsCount: Number(post.commentsCount || 0),
        createdAt: post.uploadDate || null,
      })),
      reportedUnitPosts,
    });
  } catch (error) {
    console.error('Department dashboard fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load department dashboard.' });
  }
});

router.post('/api/department/documents/:uuid/approve', async (req, res) => {
  const uuid = sanitizeText(req.params.uuid, 120);
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Invalid document id.' });
  }

  try {
    const allowedCourses = getManagedCourseNames(req.departmentAssignments).map((courseName) => courseName.toLowerCase());
    const result = await pool.query(
      `UPDATE documents
       SET upload_approval_status = 'approved',
           upload_approval_required = true,
           upload_approved_at = NOW(),
           upload_approved_by_uid = $2,
           upload_rejected_at = NULL,
           upload_rejected_by_uid = NULL,
           upload_rejection_note = NULL
       WHERE uuid::text = $1
         AND lower(course) = ANY($3::text[])
         AND COALESCE(upload_approval_status, 'approved') = 'pending'
       RETURNING uuid::text AS uuid, title, uploader_uid, course`,
      [uuid, req.departmentViewer.uid, allowedCourses]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Pending document approval request not found.' });
    }
    const row = result.rows[0];
    if (row.uploader_uid && row.uploader_uid !== req.departmentViewer.uid) {
      createNotification({
        recipientUid: row.uploader_uid,
        actorUid: req.departmentViewer.uid,
        type: 'document_upload_approved',
        entityType: 'document',
        entityId: row.uuid,
        targetUrl: `/open-library?documentUuid=${encodeURIComponent(row.uuid)}`,
        meta: {
          documentUuid: row.uuid,
          documentTitle: row.title || 'Untitled document',
          course: row.course || '',
        },
      }).catch((error) => {
        console.error('Department approval notification failed:', error);
      });
    }
    return res.json({ ok: true, message: 'Document approved.' });
  } catch (error) {
    console.error('Department document approval failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to approve document.' });
  }
});

router.post('/api/department/documents/:uuid/reject', async (req, res) => {
  const uuid = sanitizeText(req.params.uuid, 120);
  const note = sanitizeText(req.body && req.body.note, 1000);
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Invalid document id.' });
  }

  try {
    const allowedCourses = getManagedCourseNames(req.departmentAssignments).map((courseName) => courseName.toLowerCase());
    const result = await pool.query(
      `UPDATE documents
       SET upload_approval_status = 'rejected',
           upload_approval_required = true,
           upload_rejected_at = NOW(),
           upload_rejected_by_uid = $2,
           upload_rejection_note = $3,
           upload_approved_at = NULL,
           upload_approved_by_uid = NULL
       WHERE uuid::text = $1
         AND lower(course) = ANY($4::text[])
         AND COALESCE(upload_approval_status, 'approved') = 'pending'
       RETURNING uuid::text AS uuid, title, uploader_uid, course`,
      [uuid, req.departmentViewer.uid, note || null, allowedCourses]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Pending document approval request not found.' });
    }
    const row = result.rows[0];
    if (row.uploader_uid && row.uploader_uid !== req.departmentViewer.uid) {
      createNotification({
        recipientUid: row.uploader_uid,
        actorUid: req.departmentViewer.uid,
        type: 'document_upload_rejected',
        entityType: 'document',
        entityId: row.uuid,
        targetUrl: `/open-library?myUploads=1&uploadStatus=rejected&uploadUuid=${encodeURIComponent(row.uuid)}`,
        meta: {
          documentUuid: row.uuid,
          documentTitle: row.title || 'Untitled document',
          course: row.course || '',
          note: note || '',
        },
      }).catch((error) => {
        console.error('Department rejection notification failed:', error);
      });
    }
    return res.json({ ok: true, message: 'Document rejected.' });
  } catch (error) {
    console.error('Department document rejection failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reject document.' });
  }
});

router.post('/api/department/home-posts/:id/takedown', async (req, res) => {
  const postId = sanitizeText(req.params.id, 80);
  const reason = sanitizeText(req.body && req.body.reason, 1000);
  if (!ObjectId.isValid(postId)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');
    const existing = await postsCollection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { course: 1 } }
    );
    if (!existing) {
      return res.status(404).json({ ok: false, message: 'Home post not found.' });
    }
    const allowed = canManageDepartmentCourse(req.departmentAssignments, existing.course);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'This home post is outside your assigned department.' });
    }
    const post = await takeDownDepartmentHomePost(postId, req.departmentViewer.uid, reason);
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Home post not found.' });
    }
    return res.json({ ok: true, message: 'Home post taken down.' });
  } catch (error) {
    console.error('Department home post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down home post.' });
  }
});

router.post('/api/department/unit-posts/:id/takedown', async (req, res) => {
  const postId = parsePositiveInt(req.params.id);
  const reason = sanitizeText(req.body && req.body.reason, 1000);
  if (!postId) {
    return res.status(400).json({ ok: false, message: 'Invalid unit post id.' });
  }

  try {
    const courseCheck = await pool.query(
      `SELECT s.course_name
       FROM subject_posts sp
       JOIN subjects s ON s.id = sp.subject_id
       WHERE sp.id = $1
       LIMIT 1`,
      [postId]
    );
    if (!courseCheck.rows.length) {
      return res.status(404).json({ ok: false, message: 'Unit post not found.' });
    }
    const allowed = canManageDepartmentCourse(req.departmentAssignments, courseCheck.rows[0].course_name);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'This unit post is outside your assigned department.' });
    }
    const takenDown = await takeDownDepartmentUnitPost(postId, req.departmentViewer.uid, reason);
    if (!takenDown) {
      return res.status(404).json({ ok: false, message: 'Unit post not found.' });
    }
    return res.json({ ok: true, message: 'Unit post taken down.' });
  } catch (error) {
    console.error('Department unit post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down unit post.' });
  }
});

router.post('/api/department/unit-post-reports/:id/action', async (req, res) => {
  const reportId = parsePositiveInt(req.params.id);
  if (!reportId) {
    return res.status(400).json({ ok: false, message: 'Invalid unit post report id.' });
  }

  const moderationAction = normalizeDepartmentReportAction(req.body && req.body.moderationAction, 'none');
  const allowedActions = new Set(['none', 'take_down_subject_post', 'suspend_target_user']);
  if (!allowedActions.has(moderationAction)) {
    return res.status(400).json({ ok: false, message: 'Invalid department moderation action.' });
  }

  let status = normalizeDepartmentReportStatus(req.body && req.body.status, 'open');
  if (moderationAction !== 'none') {
    status = 'resolved_action_taken';
  }

  const note = sanitizeText(req.body && req.body.note, 1000) || null;
  const suspendDurationHours = parseSuspensionDurationHours(req.body && req.body.suspendDurationHours, DEFAULT_SUSPENSION_HOURS);

  try {
    const reportResult = await pool.query(
      `SELECT r.id, r.post_id, r.target_uid, r.reason, r.status, s.course_name
       FROM subject_post_reports r
       JOIN subjects s ON s.id = r.subject_id
       WHERE r.id = $1
       LIMIT 1`,
      [reportId]
    );
    if (!reportResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Unit post report not found.' });
    }

    const reportRow = reportResult.rows[0];
    if (!canManageDepartmentCourse(req.departmentAssignments, reportRow.course_name)) {
      return res.status(403).json({ ok: false, message: 'This unit post report is outside your assigned department.' });
    }

    let suspensionEndsAt = null;
    if (moderationAction === 'take_down_subject_post') {
      const removed = await takeDownDepartmentUnitPost(
        reportRow.post_id,
        req.departmentViewer.uid,
        note || reportRow.reason || 'Taken down from department report review'
      );
      if (!removed) {
        return res.status(404).json({ ok: false, message: 'Target unit post no longer exists.' });
      }
    }

    if (moderationAction === 'suspend_target_user') {
      const suspendResult = await suspendTargetUserForDepartmentAction(
        reportRow.target_uid,
        req.departmentViewer,
        note,
        suspendDurationHours
      );
      if (!suspendResult.ok) {
        return res.status(400).json({ ok: false, message: suspendResult.message });
      }
      suspensionEndsAt = suspendResult.endsAt || null;
    }

    const resolvedAt = shouldMarkDepartmentReportResolved(status) ? new Date() : null;
    const resolvedByUid = shouldMarkDepartmentReportResolved(status) ? req.departmentViewer.uid : null;
    await pool.query(
      `UPDATE subject_post_reports
       SET status = $2,
           moderation_action = $3,
           resolution_note = $4,
           resolved_at = $5,
           resolved_by_uid = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        reportId,
        status,
        moderationAction === 'none' ? null : moderationAction,
        note,
        resolvedAt,
        resolvedByUid,
      ]
    );

    return res.json({
      ok: true,
      message: 'Unit post report updated.',
      report: {
        id: reportId,
        status,
        moderationAction,
        suspensionEndsAt: suspensionEndsAt ? new Date(suspensionEndsAt).toISOString() : null,
      },
    });
  } catch (error) {
    console.error('Department unit post report action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update unit post report.' });
  }
});

router.post('/api/department/unit-post-ai-reports/:id/action', async (req, res) => {
  const reportId = parsePositiveInt(req.params.id);
  if (!reportId) {
    return res.status(400).json({ ok: false, message: 'Invalid AI report id.' });
  }

  const moderationAction = normalizeDepartmentReportAction(req.body && req.body.moderationAction, 'none');
  const allowedActions = new Set(['none', 'take_down_target', 'suspend_target_user']);
  if (!allowedActions.has(moderationAction)) {
    return res.status(400).json({ ok: false, message: 'Invalid AI moderation action.' });
  }

  let status = normalizeDepartmentReportStatus(req.body && req.body.status, 'open');
  if (moderationAction !== 'none') {
    status = 'resolved_action_taken';
  }

  const note = sanitizeText(req.body && req.body.note, 1000) || null;
  const suspendDurationHours = parseSuspensionDurationHours(req.body && req.body.suspendDurationHours, DEFAULT_SUSPENSION_HOURS);

  try {
    const reportResult = await pool.query(
      `SELECT
         scan.id,
         scan.target_type,
         scan.target_id,
         scan.risk_level,
         scan.risk_score,
         scan.result,
         sp.id AS post_id,
         sp.author_uid,
         s.course_name
       FROM ai_content_scans scan
       JOIN subject_posts sp ON scan.target_id = sp.id::text
       JOIN subjects s ON s.id = sp.subject_id
       WHERE scan.id = $1
       LIMIT 1`,
      [reportId]
    );
    if (!reportResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'AI report not found.' });
    }

    const row = reportResult.rows[0];
    if (sanitizeText(row.target_type, 40).toLowerCase() !== 'subject_post') {
      return res.status(400).json({ ok: false, message: 'This AI report is not for a unit post.' });
    }
    if (!canManageDepartmentCourse(req.departmentAssignments, row.course_name)) {
      return res.status(403).json({ ok: false, message: 'This AI report is outside your assigned department.' });
    }

    const { resultPayload, flagged } = buildAiScanParsePayload(row);
    if (!flagged) {
      return res.status(400).json({ ok: false, message: 'This AI report is not flagged for department review.' });
    }

    const adminModeration =
      resultPayload.adminModeration && typeof resultPayload.adminModeration === 'object'
        ? resultPayload.adminModeration
        : null;
    if (adminModeration && sanitizeText(adminModeration.action, 80).toLowerCase() !== 'none') {
      return res.status(409).json({ ok: false, message: 'This AI report was already handled by admin moderation.' });
    }

    let suspensionEndsAt = null;
    if (moderationAction === 'take_down_target') {
      const removed = await takeDownDepartmentUnitPost(
        row.post_id,
        req.departmentViewer.uid,
        note || 'Taken down from department AI report review'
      );
      if (!removed) {
        return res.status(404).json({ ok: false, message: 'Target unit post no longer exists.' });
      }
    }

    if (moderationAction === 'suspend_target_user') {
      const suspendResult = await suspendTargetUserForDepartmentAction(
        row.author_uid,
        req.departmentViewer,
        note,
        suspendDurationHours
      );
      if (!suspendResult.ok) {
        return res.status(400).json({ ok: false, message: suspendResult.message });
      }
      suspensionEndsAt = suspendResult.endsAt || null;
    }

    resultPayload.departmentModeration = {
      status,
      action: moderationAction,
      note,
      actedByUid: req.departmentViewer.uid,
      actedAt: new Date().toISOString(),
      suspensionDurationHours:
        moderationAction === 'suspend_target_user' ? suspendDurationHours : null,
      suspensionEndsAt:
        moderationAction === 'suspend_target_user' && suspensionEndsAt
          ? new Date(suspensionEndsAt).toISOString()
          : null,
    };

    await pool.query(
      `UPDATE ai_content_scans
       SET result = $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [reportId, JSON.stringify(resultPayload)]
    );

    return res.json({
      ok: true,
      message: 'AI report updated.',
      report: {
        id: reportId,
        status,
        moderationAction,
        suspensionEndsAt: suspensionEndsAt ? new Date(suspensionEndsAt).toISOString() : null,
      },
    });
  } catch (error) {
    console.error('Department AI report action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update AI report.' });
  }
});

module.exports = router;
