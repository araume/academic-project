const express = require('express');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { deleteSessionsForUid } = require('../auth/sessionStore');
const { getMongoDb } = require('../db/mongo');
const { deleteFromStorage, getSignedUrl, normalizeStorageKey } = require('../services/storage');
const { ensureAuditReady } = require('../services/auditLog');
const { createNotificationsForRecipients } = require('../services/notificationService');
const {
  isRestrictedContentsEnabled,
  isAdminAppealsEnabled,
  isAdminCustomNotificationEnabled,
} = require('../services/featureFlags');

const router = express.Router();
const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const RESTRICTED_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.RESTRICTED_CONTENT_RETENTION_DAYS || 30)
);
const CUSTOM_NOTIFICATION_MAX_RECIPIENTS = 1000;
const DEFAULT_SUSPENSION_HOURS = 72;
const MAX_SUSPENSION_HOURS = 24 * 365;
const RESTRICTED_PURGE_INTERVAL_MS = Math.max(
  1,
  Number(process.env.RESTRICTED_PURGE_INTERVAL_MINUTES || 15)
) * 60 * 1000;

function sanitizeText(value, maxLen = 300) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePagination(req, defaultPageSize = 20, maxPageSize = 100) {
  const page = parsePositiveInt(req.query.page) || 1;
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize) || defaultPageSize, maxPageSize);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
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

function buildRemovedMainPostTargetUrl(postId) {
  const safePostId = sanitizeText(postId, 120);
  if (!safePostId) return '/home';
  return `/posts/${encodeURIComponent(safePostId)}?removed=1`;
}

function buildRemovedLibraryDocumentTargetUrl(uuid) {
  const safeUuid = sanitizeText(uuid, 120);
  if (!safeUuid) return '/open-library';
  return `/open-library?myUploads=1&uploadStatus=removed&removedDocumentUuid=${encodeURIComponent(safeUuid)}`;
}

async function notifySingleRecipient(input = {}) {
  const recipientUid = sanitizeText(input.recipientUid, 120);
  const actorUid = sanitizeText(input.actorUid, 120);
  if (!recipientUid || !actorUid || recipientUid === actorUid) {
    return;
  }
  await createNotificationsForRecipients({
    recipientUids: [recipientUid],
    actorUid,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    targetUrl: input.targetUrl,
    meta: input.meta || {},
  });
}

function normalizeSubjectBanRequestStatus(value, fallback = 'open') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (['open', 'under_review', 'approved_banned', 'rejected'].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function digestProfessorSignupCode(rawCode) {
  const normalized = String(rawCode || '').replace(/\s+/g, '').trim().toUpperCase();
  if (!normalized) return '';
  return sha256Hex(`${PROFESSOR_SIGNUP_CODE_HASH_PREFIX}${normalized}`);
}

function buildProfessorSignupCode(length) {
  const finalLength = clampInteger(
    length,
    PROFESSOR_SIGNUP_CODE_MIN_LENGTH,
    PROFESSOR_SIGNUP_CODE_MAX_LENGTH,
    PROFESSOR_SIGNUP_CODE_DEFAULT_LENGTH
  );
  let output = '';
  for (let i = 0; i < finalLength; i += 1) {
    const index = crypto.randomInt(0, PROFESSOR_SIGNUP_CODE_ALPHABET.length);
    output += PROFESSOR_SIGNUP_CODE_ALPHABET[index];
  }
  return output;
}

function getProfessorCodeStatus(row) {
  if (!row || typeof row !== 'object') return 'unknown';
  if (row.consumed_at) return 'consumed';
  const isExpired = row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
  if (isExpired) return 'expired';
  if (row.is_active === false) return 'revoked';
  return 'available';
}

const RESTRICTED_QUEUE_SOURCES = new Set([
  'main_post',
  'library_document',
  'community_post',
  'community_comment',
  'chat_message',
]);
const RESTRICTED_QUEUE_STATUSES = new Set(['restricted', 'restored', 'purged']);
let ensureGovernanceReadyPromise = null;
let ensureProfessorCodeManagerReadyPromise = null;
let ensureDepAdminManagerReadyPromise = null;
const PROFESSOR_SIGNUP_CODE_HASH_PREFIX = 'professor-signup-code:v1:';
const PROFESSOR_SIGNUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PROFESSOR_SIGNUP_CODE_MIN_LENGTH = 6;
const PROFESSOR_SIGNUP_CODE_MAX_LENGTH = 24;
const PROFESSOR_SIGNUP_CODE_DEFAULT_LENGTH = 10;
const PROFESSOR_SIGNUP_CODE_MAX_BATCH = 50;

function normalizeRestrictedSource(value) {
  const normalized = sanitizeText(value, 60).toLowerCase();
  return RESTRICTED_QUEUE_SOURCES.has(normalized) ? normalized : '';
}

function normalizeRestrictedStatus(value, fallback = 'restricted') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  return RESTRICTED_QUEUE_STATUSES.has(normalized) ? normalized : fallback;
}

function sanitizeRestrictedMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const safe = {};
  Object.entries(metadata).forEach(([key, rawValue]) => {
    const keyText = sanitizeText(key, 80);
    if (!keyText) return;
    if (typeof rawValue === 'string') {
      safe[keyText] = sanitizeText(rawValue, 1000);
      return;
    }
    if (
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean' ||
      rawValue === null
    ) {
      safe[keyText] = rawValue;
      return;
    }
    safe[keyText] = sanitizeText(String(rawValue), 1000);
  });
  return safe;
}

function computeRestoreDeadlineDate() {
  return new Date(Date.now() + RESTRICTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function ensureGovernanceReady() {
  if (!ensureGovernanceReadyPromise) {
    ensureGovernanceReadyPromise = (async () => {
      await pool.query(`
        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMPTZ;
        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS restricted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;
        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS restricted_reason TEXT;

        CREATE TABLE IF NOT EXISTS restricted_content_queue (
          id BIGSERIAL PRIMARY KEY,
          source TEXT NOT NULL CHECK (source IN (
            'main_post',
            'library_document',
            'community_post',
            'community_comment',
            'chat_message'
          )),
          report_key TEXT,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          course TEXT,
          reason TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          hidden_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          restore_deadline_at TIMESTAMPTZ NOT NULL,
          restored_at TIMESTAMPTZ,
          restored_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          purged_at TIMESTAMPTZ,
          purged_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'restricted'
            CHECK (status IN ('restricted', 'restored', 'purged')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS restricted_content_queue_status_deadline_idx
          ON restricted_content_queue(status, restore_deadline_at);
        CREATE INDEX IF NOT EXISTS restricted_content_queue_target_idx
          ON restricted_content_queue(source, target_type, target_id);
        CREATE UNIQUE INDEX IF NOT EXISTS restricted_content_queue_active_target_idx
          ON restricted_content_queue(source, target_type, target_id)
          WHERE status = 'restricted';

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

        CREATE TABLE IF NOT EXISTS account_appeals (
          id BIGSERIAL PRIMARY KEY,
          appellant_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          disciplinary_action_id BIGINT REFERENCES account_disciplinary_actions(id) ON DELETE SET NULL,
          appeal_type TEXT NOT NULL CHECK (appeal_type IN ('warning', 'suspension', 'ban', 'verification_rejection', 'other')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'accepted', 'denied', 'withdrawn')),
          message TEXT NOT NULL,
          evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
          resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          resolution_note TEXT,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS account_disciplinary_actions_target_active_idx
          ON account_disciplinary_actions(target_uid, active, created_at DESC);
        CREATE INDEX IF NOT EXISTS account_disciplinary_actions_target_type_idx
          ON account_disciplinary_actions(target_uid, action_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS account_appeals_appellant_created_idx
          ON account_appeals(appellant_uid, created_at DESC);
        CREATE INDEX IF NOT EXISTS account_appeals_status_created_idx
          ON account_appeals(status, created_at DESC);

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
      ensureGovernanceReadyPromise = null;
      throw error;
    });
  }
  await ensureGovernanceReadyPromise;
}

async function ensureProfessorCodeManagerReady() {
  if (!ensureProfessorCodeManagerReadyPromise) {
    ensureProfessorCodeManagerReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS professor_registration_codes (
          id BIGSERIAL PRIMARY KEY,
          code_digest TEXT NOT NULL UNIQUE,
          source TEXT NOT NULL DEFAULT 'manual',
          created_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          consumed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          consumed_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS professor_registration_codes_active_idx
          ON professor_registration_codes(is_active, consumed_at, expires_at);
      `);
    })().catch((error) => {
      ensureProfessorCodeManagerReadyPromise = null;
      throw error;
    });
  }
  await ensureProfessorCodeManagerReadyPromise;
}

async function ensureDepAdminManagerReady() {
  if (!ensureDepAdminManagerReadyPromise) {
    ensureDepAdminManagerReadyPromise = (async () => {
      await pool.query(`
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
        CREATE INDEX IF NOT EXISTS course_dep_admin_assignments_course_code_idx
          ON course_dep_admin_assignments(course_code);
      `);
    })().catch((error) => {
      ensureDepAdminManagerReadyPromise = null;
      throw error;
    });
  }
  await ensureDepAdminManagerReadyPromise;
}

async function recordDisciplinaryAction({
  targetUid,
  issuedByUid,
  actionType,
  reason,
  startsAt = new Date(),
  endsAt = null,
  active = true,
}, client = pool) {
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

async function upsertRestrictedQueueEntry({
  source,
  reportKey = null,
  targetType,
  targetId,
  targetUid = null,
  course = null,
  reason = null,
  metadata = {},
  hiddenByUid = null,
}) {
  const normalizedSource = normalizeRestrictedSource(source);
  const normalizedTargetType = sanitizeText(targetType, 80).toLowerCase();
  const normalizedTargetId = sanitizeText(targetId, 240);
  if (!normalizedSource || !normalizedTargetType || !normalizedTargetId) {
    return null;
  }

  const now = new Date();
  const restoreDeadline = computeRestoreDeadlineDate();
  const metadataJson = JSON.stringify(sanitizeRestrictedMetadata(metadata));
  const normalizedReason = sanitizeText(reason, 1000) || null;
  const normalizedReportKey = sanitizeText(reportKey, 260) || null;
  const normalizedTargetUid = sanitizeText(targetUid, 120) || null;
  const normalizedCourse = sanitizeText(course, 160) || null;
  const normalizedHiddenByUid = sanitizeText(hiddenByUid, 120) || null;

  const updateResult = await pool.query(
    `UPDATE restricted_content_queue
     SET
       report_key = COALESCE($4, report_key),
       target_uid = COALESCE($5, target_uid),
       course = COALESCE($6, course),
       reason = $7,
       metadata = $8::jsonb,
       hidden_by_uid = COALESCE($9, hidden_by_uid),
       hidden_at = $10,
       restore_deadline_at = $11,
       restored_at = NULL,
       restored_by_uid = NULL,
       purged_at = NULL,
       purged_by_uid = NULL,
       status = 'restricted',
       updated_at = $10
     WHERE source = $1
       AND target_type = $2
       AND target_id = $3
       AND status = 'restricted'
     RETURNING *`,
    [
      normalizedSource,
      normalizedTargetType,
      normalizedTargetId,
      normalizedReportKey,
      normalizedTargetUid,
      normalizedCourse,
      normalizedReason,
      metadataJson,
      normalizedHiddenByUid,
      now,
      restoreDeadline,
    ]
  );
  if (updateResult.rows.length) {
    return updateResult.rows[0];
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO restricted_content_queue
        (source, report_key, target_type, target_id, target_uid, course, reason, metadata, hidden_by_uid, hidden_at, restore_deadline_at, status, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, 'restricted', $10, $10)
       RETURNING *`,
      [
        normalizedSource,
        normalizedReportKey,
        normalizedTargetType,
        normalizedTargetId,
        normalizedTargetUid,
        normalizedCourse,
        normalizedReason,
        metadataJson,
        normalizedHiddenByUid,
        now,
        restoreDeadline,
      ]
    );
    return insertResult.rows[0] || null;
  } catch (error) {
    if (error && error.code === '23505') {
      const retry = await pool.query(
        `SELECT *
         FROM restricted_content_queue
         WHERE source = $1
           AND target_type = $2
           AND target_id = $3
           AND status = 'restricted'
         ORDER BY id DESC
         LIMIT 1`,
        [normalizedSource, normalizedTargetType, normalizedTargetId]
      );
      return retry.rows[0] || null;
    }
    throw error;
  }
}

async function restrictMainPostById(postIdValue, actorUid, reason) {
  if (!postIdValue || !ObjectId.isValid(postIdValue)) return null;
  const postId = new ObjectId(postIdValue);
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const post = await postsCollection.findOne(
    { _id: postId },
    { projection: { _id: 1, title: 1, uploaderUid: 1, course: 1 } }
  );
  if (!post) return null;
  await postsCollection.updateOne(
    { _id: postId },
    {
      $set: {
        moderationStatus: 'restricted',
        restrictedAt: new Date(),
        restrictedByUid: sanitizeText(actorUid, 120) || null,
        restrictedReason: sanitizeText(reason, 1000) || null,
      },
    }
  );
  return {
    source: 'main_post',
    targetType: 'main_post',
    targetId: String(post._id),
    targetUid: post.uploaderUid || null,
    course: post.course || null,
    title: post.title || 'Untitled post',
  };
}

async function restoreMainPostById(postIdValue) {
  if (!postIdValue || !ObjectId.isValid(postIdValue)) return false;
  const postId = new ObjectId(postIdValue);
  const db = await getMongoDb();
  const result = await db.collection('posts').updateOne(
    { _id: postId },
    {
      $set: {
        moderationStatus: 'active',
      },
      $unset: {
        restrictedAt: '',
        restrictedByUid: '',
        restrictedReason: '',
      },
    }
  );
  return result.matchedCount > 0;
}

async function restrictLibraryDocumentByUuid(uuidValue, actorUid, reason) {
  const uuid = sanitizeText(uuidValue, 120);
  if (!uuid) return null;
  const result = await pool.query(
    `UPDATE documents
     SET
       is_restricted = true,
       restricted_at = NOW(),
       restricted_by_uid = $2,
       restricted_reason = $3
     WHERE uuid::text = $1
     RETURNING uuid::text AS uuid, title, uploader_uid, course`,
    [uuid, sanitizeText(actorUid, 120) || null, sanitizeText(reason, 1000) || null]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    source: 'library_document',
    targetType: 'library_document',
    targetId: row.uuid,
    targetUid: row.uploader_uid || null,
    course: row.course || null,
    title: row.title || 'Untitled document',
  };
}

async function restoreLibraryDocumentByUuid(uuidValue) {
  const uuid = sanitizeText(uuidValue, 120);
  if (!uuid) return false;
  const result = await pool.query(
    `UPDATE documents
     SET
       is_restricted = false,
       restricted_at = NULL,
       restricted_by_uid = NULL,
       restricted_reason = NULL
     WHERE uuid::text = $1
     RETURNING uuid`,
    [uuid]
  );
  return result.rows.length > 0;
}

async function restrictCommunityPostById(postIdValue, actorUid, reason) {
  const postId = parsePositiveInt(postIdValue);
  if (!postId) return null;
  const result = await pool.query(
    `UPDATE community_posts cp
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     FROM communities c
     WHERE cp.id = $1
       AND cp.community_id = c.id
     RETURNING cp.id, cp.author_uid, cp.title, c.course_name`,
    [postId, sanitizeText(actorUid, 120) || null, sanitizeText(reason, 1000) || 'Restricted by admin']
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    source: 'community_post',
    targetType: 'community_post',
    targetId: String(row.id),
    targetUid: row.author_uid || null,
    course: row.course_name || null,
    title: row.title || 'Community post',
  };
}

async function restoreCommunityPostById(postIdValue) {
  const postId = parsePositiveInt(postIdValue);
  if (!postId) return false;
  const result = await pool.query(
    `UPDATE community_posts
     SET
       status = 'active',
       taken_down_by_uid = NULL,
       taken_down_reason = NULL,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [postId]
  );
  return result.rows.length > 0;
}

async function restrictCommunityCommentById(commentIdValue, actorUid, reason) {
  const commentId = parsePositiveInt(commentIdValue);
  if (!commentId) return null;
  const result = await pool.query(
    `UPDATE community_comments cc
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     FROM communities c
     WHERE cc.id = $1
       AND cc.community_id = c.id
     RETURNING cc.id, cc.author_uid, c.course_name`,
    [commentId, sanitizeText(actorUid, 120) || null, sanitizeText(reason, 1000) || 'Restricted by admin']
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    source: 'community_comment',
    targetType: 'community_comment',
    targetId: String(row.id),
    targetUid: row.author_uid || null,
    course: row.course_name || null,
    title: 'Community comment',
  };
}

async function restoreCommunityCommentById(commentIdValue) {
  const commentId = parsePositiveInt(commentIdValue);
  if (!commentId) return false;
  const result = await pool.query(
    `UPDATE community_comments
     SET
       status = 'active',
       taken_down_by_uid = NULL,
       taken_down_reason = NULL,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [commentId]
  );
  return result.rows.length > 0;
}

function mapRestrictedQueueRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    source: row.source,
    reportKey: row.report_key || null,
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    targetUid: row.target_uid || null,
    course: row.course || null,
    reason: row.reason || null,
    metadata: row.metadata || {},
    hiddenByUid: row.hidden_by_uid || null,
    hiddenAt: row.hidden_at || null,
    restoreDeadlineAt: row.restore_deadline_at || null,
    restoredAt: row.restored_at || null,
    restoredByUid: row.restored_by_uid || null,
    purgedAt: row.purged_at || null,
    purgedByUid: row.purged_by_uid || null,
    status: normalizeRestrictedStatus(row.status, 'restricted'),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function updateRestrictedQueueStatus(id, status, actorUid) {
  const normalizedStatus = normalizeRestrictedStatus(status, 'restricted');
  const now = new Date();
  const actor = sanitizeText(actorUid, 120) || null;
  const result = await pool.query(
    `UPDATE restricted_content_queue
     SET
       status = $2,
       restored_at = CASE WHEN $2 = 'restored' THEN $3 ELSE restored_at END,
       restored_by_uid = CASE WHEN $2 = 'restored' THEN $4 ELSE restored_by_uid END,
       purged_at = CASE WHEN $2 = 'purged' THEN $3 ELSE purged_at END,
       purged_by_uid = CASE WHEN $2 = 'purged' THEN $4 ELSE purged_by_uid END,
       updated_at = $3
     WHERE id = $1
     RETURNING *`,
    [id, normalizedStatus, now, actor]
  );
  return result.rows[0] || null;
}

async function restoreRestrictedTarget(item) {
  if (!item) return false;
  if (item.source === 'main_post') {
    return restoreMainPostById(item.target_id);
  }
  if (item.source === 'library_document') {
    return restoreLibraryDocumentByUuid(item.target_id);
  }
  if (item.source === 'community_post') {
    return restoreCommunityPostById(item.target_id);
  }
  if (item.source === 'community_comment') {
    return restoreCommunityCommentById(item.target_id);
  }
  return false;
}

async function purgeRestrictedTarget(item, actorUid = null) {
  if (!item) return false;
  const actor = sanitizeText(actorUid, 120) || null;
  if (item.source === 'main_post') {
    return deleteMainPostById(item.target_id, actor, item.reason || '');
  }
  if (item.source === 'library_document') {
    return deleteLibraryDocumentByUuid(item.target_id, actor, item.reason || '');
  }
  if (item.source === 'community_post') {
    const postId = parsePositiveInt(item.target_id);
    if (!postId) return false;
    const result = await pool.query('DELETE FROM community_posts WHERE id = $1 RETURNING id', [postId]);
    return result.rows.length > 0;
  }
  if (item.source === 'community_comment') {
    const commentId = parsePositiveInt(item.target_id);
    if (!commentId) return false;
    const result = await pool.query('DELETE FROM community_comments WHERE id = $1 RETURNING id', [commentId]);
    return result.rows.length > 0;
  }
  if (item.source === 'chat_message') {
    const messageId = parsePositiveInt(item.target_id);
    if (!messageId) return false;
    return deleteChatMessageById(messageId, actor);
  }
  return false;
}

async function getRestrictedQueueItemById(id) {
  const numericId = parsePositiveInt(id);
  if (!numericId) return null;
  const result = await pool.query(
    `SELECT *
     FROM restricted_content_queue
     WHERE id = $1
     LIMIT 1`,
    [numericId]
  );
  return result.rows[0] || null;
}

async function loadRestrictedQueueDisplayNames(rows = []) {
  const uids = [];
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (row.target_uid) uids.push(row.target_uid);
    if (row.hidden_by_uid) uids.push(row.hidden_by_uid);
    if (row.restored_by_uid) uids.push(row.restored_by_uid);
    if (row.purged_by_uid) uids.push(row.purged_by_uid);
  });
  return loadDisplayNamesByUid(uids);
}

function mapRestrictedQueueRowWithNames(row, namesMap) {
  const base = mapRestrictedQueueRow(row);
  if (!base) return null;
  return {
    ...base,
    targetName: namesMap.get(base.targetUid) || null,
    hiddenByName: namesMap.get(base.hiddenByUid) || null,
    restoredByName: namesMap.get(base.restoredByUid) || null,
    purgedByName: namesMap.get(base.purgedByUid) || null,
    isExpired:
      base.status === 'restricted' &&
      base.restoreDeadlineAt &&
      new Date(base.restoreDeadlineAt).getTime() <= Date.now(),
  };
}

async function purgeRestrictedQueueItem(item, actorUid = null) {
  if (!item || normalizeRestrictedStatus(item.status, 'restricted') === 'purged') {
    return { ok: false, reason: 'already_purged' };
  }
  const purged = await purgeRestrictedTarget(item, actorUid);
  if (!purged) {
    const updatedMissingTarget = await updateRestrictedQueueStatus(item.id, 'purged', actorUid);
    return {
      ok: Boolean(updatedMissingTarget),
      reason: 'target_missing',
      row: updatedMissingTarget || null,
    };
  }
  const updated = await updateRestrictedQueueStatus(item.id, 'purged', actorUid);
  return { ok: Boolean(updated), row: updated || null };
}

async function purgeExpiredRestrictedContents({ actorUid = null, limit = 200 } = {}) {
  if (!isRestrictedContentsEnabled()) {
    return { processed: 0, purged: 0, skipped: 0, items: [] };
  }
  const cappedLimit = Math.min(Math.max(parsePositiveInt(limit) || 200, 1), 500);
  const expiredResult = await pool.query(
    `SELECT *
     FROM restricted_content_queue
     WHERE status = 'restricted'
       AND restore_deadline_at <= NOW()
     ORDER BY restore_deadline_at ASC, id ASC
     LIMIT $1`,
    [cappedLimit]
  );

  const outcomes = [];
  let purged = 0;
  let skipped = 0;
  for (const row of expiredResult.rows) {
    const outcome = await purgeRestrictedQueueItem(row, actorUid);
    if (outcome.ok) {
      purged += 1;
      outcomes.push({
        id: Number(row.id),
        status: 'purged',
      });
      continue;
    }
    skipped += 1;
    outcomes.push({
      id: Number(row.id),
      status: outcome.reason || 'skipped',
    });
  }

  return {
    processed: expiredResult.rows.length,
    purged,
    skipped,
    items: outcomes,
  };
}

async function getViewer(uid) {
  const result = await pool.query(
    `SELECT
      uid,
      email,
      username,
      display_name,
      course,
      COALESCE(platform_role, 'member') AS platform_role,
      COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

function isOwnerOrAdmin(viewer) {
  return viewer && (viewer.platform_role === 'owner' || viewer.platform_role === 'admin');
}

function normalizeReportStatus(row) {
  if (!row) return 'open';
  if (row.status) return row.status;
  return 'open';
}

const ADMIN_REPORT_STATUSES = new Set([
  'open',
  'under_review',
  'resolved_action_taken',
  'resolved_no_action',
  'rejected',
]);

const ADMIN_REPORT_ACTIONS = new Set([
  'none',
  'take_down_target',
  'delete_main_post',
  'delete_library_document',
  'delete_chat_message',
  'take_down_subject_post',
  'take_down_community_post',
  'take_down_community_comment',
  'suspend_target_user',
  'ban_target_user',
]);

const ADMIN_APPEAL_TYPES = new Set([
  'warning',
  'suspension',
  'ban',
  'verification_rejection',
  'other',
]);

const ADMIN_APPEAL_STATUSES = new Set([
  'open',
  'under_review',
  'accepted',
  'denied',
  'withdrawn',
]);

const ADMIN_APPEAL_RESOLUTION_STATUSES = new Set(['under_review', 'accepted', 'denied']);

function parseReportKey(value) {
  const text = sanitizeText(value, 220);
  if (!text || !text.includes(':')) return null;
  const separator = text.indexOf(':');
  const source = text.slice(0, separator);
  const rawId = text.slice(separator + 1);
  if (!source || !rawId) return null;
  return { source, rawId, key: `${source}:${rawId}` };
}

function normalizeAdminReportStatus(value, fallback = 'open') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (ADMIN_REPORT_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function normalizeAdminReportAction(value, fallback = 'none') {
  const normalized = sanitizeText(value, 80).toLowerCase();
  if (ADMIN_REPORT_ACTIONS.has(normalized)) return normalized;
  return fallback;
}

function normalizeAdminAppealType(value, fallback = '') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (ADMIN_APPEAL_TYPES.has(normalized)) return normalized;
  return fallback;
}

function normalizeAdminAppealStatus(value, fallback = 'open') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (ADMIN_APPEAL_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function mapAdminStatusToChatStatus(status) {
  if (status === 'open') return 'pending';
  if (status === 'under_review') return 'reviewed';
  return 'dismissed';
}

async function loadDisplayNamesByUid(uids) {
  const deduped = Array.from(new Set((uids || []).filter(Boolean)));
  if (!deduped.length) return new Map();
  const result = await pool.query(
    `SELECT
      a.uid,
      COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = ANY($1::text[])`,
    [deduped]
  );
  return new Map(result.rows.map((row) => [row.uid, row.display_name || 'Member']));
}

function normalizeUidList(values = [], maxCount = CUSTOM_NOTIFICATION_MAX_RECIPIENTS) {
  if (!Array.isArray(values)) return [];
  const deduped = [];
  const seen = new Set();
  values.forEach((value) => {
    const uid = sanitizeText(value, 120);
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    if (deduped.length < maxCount) {
      deduped.push(uid);
    }
  });
  return deduped;
}

function mapDepAdminAccountRow(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    email: row.email || '',
    username: row.username || '',
    displayName: row.display_name || '',
    course: row.course || '',
    role: row.platform_role || 'member',
    isBanned: row.is_banned === true,
  };
}

async function resolveCanonicalCourse(value, client = pool) {
  const courseQuery = sanitizeText(value, 160);
  if (!courseQuery) return null;
  const result = await client.query(
    `SELECT course_code, course_name
     FROM courses
     WHERE lower(course_name) = lower($1)
        OR lower(course_code) = lower($1)
     ORDER BY CASE WHEN lower(course_name) = lower($1) THEN 0 ELSE 1 END
     LIMIT 1`,
    [courseQuery]
  );
  if (!result.rows.length) return null;
  return {
    courseCode: result.rows[0].course_code || null,
    courseName: result.rows[0].course_name || '',
  };
}

async function resolveDepAdminAccount(accountQuery, client = pool) {
  const query = sanitizeText(accountQuery, 200);
  if (!query) {
    return { account: null, ambiguous: false, candidates: [] };
  }

  const exactResult = await client.query(
    `SELECT
       a.uid,
       a.email,
       a.username,
       COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name,
       a.course,
       COALESCE(a.platform_role, 'member') AS platform_role,
       COALESCE(a.is_banned, false) AS is_banned
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE lower(a.uid) = lower($1)
        OR lower(a.email) = lower($1)
        OR lower(COALESCE(a.username, '')) = lower($1)
     ORDER BY a.datecreated DESC
     LIMIT 6`,
    [query]
  );
  if (exactResult.rows.length === 1) {
    return { account: mapDepAdminAccountRow(exactResult.rows[0]), ambiguous: false, candidates: [] };
  }
  if (exactResult.rows.length > 1) {
    return {
      account: null,
      ambiguous: true,
      candidates: exactResult.rows.map(mapDepAdminAccountRow).filter(Boolean),
    };
  }

  const fuzzyResult = await client.query(
    `SELECT
       a.uid,
       a.email,
       a.username,
       COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name,
       a.course,
       COALESCE(a.platform_role, 'member') AS platform_role,
       COALESCE(a.is_banned, false) AS is_banned
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE (
       a.uid ILIKE $1
       OR a.email ILIKE $1
       OR COALESCE(a.username, '') ILIKE $1
       OR COALESCE(p.display_name, a.display_name, '') ILIKE $1
     )
     ORDER BY a.datecreated DESC
     LIMIT 6`,
    [`%${query}%`]
  );

  if (fuzzyResult.rows.length === 1) {
    return { account: mapDepAdminAccountRow(fuzzyResult.rows[0]), ambiguous: false, candidates: [] };
  }
  if (fuzzyResult.rows.length > 1) {
    return {
      account: null,
      ambiguous: true,
      candidates: fuzzyResult.rows.map(mapDepAdminAccountRow).filter(Boolean),
    };
  }

  return { account: null, ambiguous: false, candidates: [] };
}

async function maybeDowngradeDepAdminAfterUnassign(uid, client = pool) {
  const targetUid = sanitizeText(uid, 120);
  if (!targetUid) return;

  const assignmentCountResult = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM course_dep_admin_assignments
     WHERE depadmin_uid = $1`,
    [targetUid]
  );
  const total = Number(assignmentCountResult.rows[0] ? assignmentCountResult.rows[0].total : 0);
  if (total > 0) return;

  await client.query(
    `UPDATE accounts
     SET platform_role = 'professor'
     WHERE uid = $1
       AND COALESCE(platform_role, 'member') = 'depadmin'`,
    [targetUid]
  );
}

async function resolveCustomNotificationRecipients({
  mode,
  uids = [],
  course = '',
  includeBanned = false,
}) {
  if (mode === 'uids') {
    if (!uids.length) return [];
    const result = await pool.query(
      `SELECT uid
       FROM accounts
       WHERE uid = ANY($1::text[])
         AND ($2::boolean = true OR COALESCE(is_banned, false) = false)`,
      [uids, includeBanned]
    );
    return result.rows.map((row) => row.uid).filter(Boolean);
  }

  if (mode === 'course') {
    const normalizedCourse = sanitizeText(course, 160);
    if (!normalizedCourse) return [];
    const result = await pool.query(
      `SELECT uid
       FROM accounts
       WHERE course = $1
         AND ($2::boolean = true OR COALESCE(is_banned, false) = false)`,
      [normalizedCourse, includeBanned]
    );
    return result.rows.map((row) => row.uid).filter(Boolean);
  }

  const result = await pool.query(
    `SELECT uid
     FROM accounts
     WHERE ($1::boolean = true OR COALESCE(is_banned, false) = false)`,
    [includeBanned]
  );
  return result.rows.map((row) => row.uid).filter(Boolean);
}

async function loadAdminReportActionsMap(reportKeys) {
  const deduped = Array.from(new Set((reportKeys || []).filter(Boolean)));
  if (!deduped.length) return new Map();
  const db = await getMongoDb();
  const rows = await db
    .collection('admin_report_actions')
    .find({ reportKey: { $in: deduped } })
    .toArray();
  return new Map(rows.map((item) => [item.reportKey, item]));
}

async function deleteMainPostById(postIdValue, actorUid = null, reason = '') {
  if (!postIdValue) return false;
  const postId = ObjectId.isValid(postIdValue) ? new ObjectId(postIdValue) : null;
  if (!postId) return false;

  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const post = await postsCollection.findOne({ _id: postId });
  if (!post) return false;

  const attachmentKey =
    post.attachment &&
    (post.attachment.type === 'image' || post.attachment.type === 'video')
      ? post.attachment.key
      : null;
  if (attachmentKey && !String(attachmentKey).startsWith('http')) {
    try {
      await deleteFromStorage(attachmentKey);
    } catch (storageError) {
      console.error('Admin report action post attachment delete failed:', storageError);
    }
  }

  await postsCollection.deleteOne({ _id: postId });
  await db.collection('post_likes').deleteMany({ postId });
  await db.collection('post_comments').deleteMany({ postId });
  await db.collection('post_bookmarks').deleteMany({ postId });
  await db.collection('post_reports').deleteMany({ postId });
  if (post.uploaderUid && actorUid && post.uploaderUid !== actorUid) {
    notifySingleRecipient({
      recipientUid: post.uploaderUid,
      actorUid,
      type: 'post_deleted',
      entityType: 'post',
      entityId: String(post._id),
      targetUrl: buildRemovedMainPostTargetUrl(String(post._id)),
      meta: {
        postTitle: post.title || 'Untitled post',
        reason: sanitizeText(reason, 1000) || 'Removed by admin moderation',
      },
    }).catch((error) => {
      console.error('Admin post removal notification failed:', error);
    });
  }
  return {
    id: String(post._id),
    uploaderUid: post.uploaderUid || null,
    title: post.title || 'Untitled post',
  };
}

async function deleteLibraryDocumentByUuid(uuid, actorUid = null, reason = '') {
  const docUuid = sanitizeText(uuid, 120);
  if (!docUuid) return false;

  const docResult = await pool.query(
    `SELECT uuid, link, thumbnail_link, uploader_uid, title
     FROM documents
     WHERE uuid = $1
     LIMIT 1`,
    [docUuid]
  );
  if (!docResult.rows.length) return false;
  const doc = docResult.rows[0];

  await pool.query('DELETE FROM documents WHERE uuid = $1', [docUuid]);

  const keys = [doc.link, doc.thumbnail_link].filter(Boolean);
  for (const key of keys) {
    if (!String(key).startsWith('http')) {
      try {
        await deleteFromStorage(key);
      } catch (storageError) {
        console.error('Admin report action document storage delete failed:', storageError);
      }
    }
  }

  const db = await getMongoDb();
  await db.collection('document_reports').deleteMany({ documentUuid: docUuid });
  if (doc.uploader_uid && actorUid && doc.uploader_uid !== actorUid) {
    notifySingleRecipient({
      recipientUid: doc.uploader_uid,
      actorUid,
      type: 'document_deleted',
      entityType: 'document',
      entityId: docUuid,
      targetUrl: buildRemovedLibraryDocumentTargetUrl(docUuid),
      meta: {
        documentTitle: doc.title || 'Untitled document',
        reason: sanitizeText(reason, 1000) || 'Removed by admin moderation',
      },
    }).catch((error) => {
      console.error('Admin document removal notification failed:', error);
    });
  }
  return {
    uuid: docUuid,
    uploaderUid: doc.uploader_uid || null,
    title: doc.title || 'Untitled document',
  };
}

async function deleteChatMessageById(messageId, adminUid) {
  const numericMessageId = Number(messageId);
  if (!Number.isInteger(numericMessageId) || numericMessageId <= 0) return false;

  const result = await pool.query(
    `UPDATE chat_messages
     SET body = '',
         attachment_type = NULL,
         attachment_key = NULL,
         attachment_link = NULL,
         attachment_filename = NULL,
         attachment_mime_type = NULL,
         attachment_size_bytes = NULL,
         deleted_at = NOW(),
         deleted_by_uid = $2
     WHERE id = $1
     RETURNING id`,
    [numericMessageId, adminUid]
  );
  return Boolean(result.rows.length);
}

async function takeDownCommunityPostById(postId, adminUid, reason) {
  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId <= 0) return false;
  const result = await pool.query(
    `UPDATE community_posts
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [numericPostId, adminUid, reason || 'Taken down from report review']
  );
  return Boolean(result.rows.length);
}

async function takeDownCommunityCommentById(commentId, adminUid, reason) {
  const numericCommentId = Number(commentId);
  if (!Number.isInteger(numericCommentId) || numericCommentId <= 0) return false;
  const result = await pool.query(
    `UPDATE community_comments
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [numericCommentId, adminUid, reason || 'Taken down from report review']
  );
  return Boolean(result.rows.length);
}

async function takeDownSubjectPostById(postId, adminUid, reason) {
  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId <= 0) return false;
  const result = await pool.query(
    `UPDATE subject_posts
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [numericPostId, adminUid, reason || 'Taken down from AI report review']
  );
  return Boolean(result.rows.length);
}

async function banTargetUserFromReport(targetUid, adminViewer, note) {
  const normalizedTargetUid = sanitizeText(targetUid, 120);
  if (!normalizedTargetUid) {
    return { ok: false, message: 'Target account unavailable for ban action.' };
  }
  if (normalizedTargetUid === adminViewer.uid) {
    return { ok: false, message: 'You cannot ban your own account.' };
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
  if (target.platform_role === 'owner') {
    return { ok: false, message: 'Owner account cannot be banned.' };
  }
  if (adminViewer.platform_role !== 'owner' && (target.platform_role === 'owner' || target.platform_role === 'admin')) {
    return { ok: false, message: 'Admins cannot ban owner/admin accounts.' };
  }
  if (target.is_banned === true) {
    return { ok: true, alreadyBanned: true };
  }

  await pool.query(
    `UPDATE accounts
     SET is_banned = true,
         banned_at = NOW(),
         banned_reason = $1,
         banned_by_uid = $2
     WHERE uid = $3`,
    [note || 'Banned from report resolution', adminViewer.uid, normalizedTargetUid]
  );
  await recordDisciplinaryAction({
    targetUid: normalizedTargetUid,
    issuedByUid: adminViewer.uid,
    actionType: 'ban',
    reason: note || 'Banned from report resolution',
    active: true,
  });
  await deleteSessionsForUid(normalizedTargetUid);
  return { ok: true };
}

async function suspendTargetUserFromReport(targetUid, adminViewer, note, durationHours) {
  const normalizedTargetUid = sanitizeText(targetUid, 120);
  if (!normalizedTargetUid) {
    return { ok: false, message: 'Target account unavailable for suspension action.' };
  }
  if (normalizedTargetUid === adminViewer.uid) {
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
  if (target.platform_role === 'owner') {
    return { ok: false, message: 'Owner account cannot be suspended.' };
  }
  if (adminViewer.platform_role !== 'owner' && (target.platform_role === 'owner' || target.platform_role === 'admin')) {
    return { ok: false, message: 'Admins cannot suspend owner/admin accounts.' };
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
  const reason = note || `Suspended from report resolution for ${safeDurationHours} hour(s)`;
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
      [normalizedTargetUid, adminViewer.uid, 'Replaced by newer suspension']
    );
    await client.query(
      `UPDATE accounts
       SET is_banned = true,
           banned_at = NOW(),
           banned_reason = $1,
           banned_by_uid = $2
       WHERE uid = $3`,
      [reason, adminViewer.uid, normalizedTargetUid]
    );
    const disciplinaryActionId = await recordDisciplinaryAction(
      {
        targetUid: normalizedTargetUid,
        issuedByUid: adminViewer.uid,
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
      // no-op
    }
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupMongoDataForAccount(uid) {
  if (!uid) return;
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');

  const userPosts = await postsCollection
    .find({ uploaderUid: uid })
    .project({ _id: 1, attachment: 1 })
    .toArray();
  const userPostIds = userPosts.map((post) => post && post._id).filter(Boolean);
  let postLinkedAiConversationIds = [];

  if (userPosts.length) {
    await Promise.all(
      userPosts.map(async (post) => {
        const key =
          post &&
          post.attachment &&
          (post.attachment.type === 'image' || post.attachment.type === 'video')
            ? post.attachment.key
            : null;
        if (!key || String(key).startsWith('http')) return;
        try {
          await deleteFromStorage(key);
        } catch (storageError) {
          console.error('Admin account delete attachment cleanup failed:', storageError);
        }
      })
    );
  }

  if (userPostIds.length) {
    const postLinkedAiConversations = await db
      .collection('post_ai_conversations')
      .find({ postId: { $in: userPostIds } })
      .project({ _id: 1 })
      .toArray();
    postLinkedAiConversationIds = postLinkedAiConversations
      .map((item) => item && item._id)
      .filter(Boolean);
  }

  const subjectPostResult = await pool.query(
    `SELECT id
     FROM subject_posts
     WHERE author_uid = $1`,
    [uid]
  );
  const subjectPostIds = subjectPostResult.rows
    .map((row) => Number(row.id))
    .filter((value) => Number.isInteger(value) && value > 0);
  let subjectPostLinkedAiConversationIds = [];

  if (subjectPostIds.length) {
    const subjectPostLinkedAiConversations = await db
      .collection('subject_post_ai_conversations')
      .find({ postId: { $in: subjectPostIds } })
      .project({ _id: 1 })
      .toArray();
    subjectPostLinkedAiConversationIds = subjectPostLinkedAiConversations
      .map((item) => item && item._id)
      .filter(Boolean);
  }

  const [postAiConversations, libraryAiConversations, personalAiConversations, subjectAiConversations, subjectPostAiConversations] = await Promise.all([
    db.collection('post_ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
    db.collection('library_ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
    db.collection('ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
    db.collection('subject_ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
    db.collection('subject_post_ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
  ]);

  const postAiConversationIds = postAiConversations.map((item) => item && item._id).filter(Boolean);
  const libraryAiConversationIds = libraryAiConversations.map((item) => item && item._id).filter(Boolean);
  const personalAiConversationIds = personalAiConversations.map((item) => item && item._id).filter(Boolean);
  const subjectAiConversationIds = subjectAiConversations.map((item) => item && item._id).filter(Boolean);
  const subjectPostAiConversationIds = subjectPostAiConversations.map((item) => item && item._id).filter(Boolean);

  const cleanupOps = [
    db.collection('post_likes').deleteMany({ userUid: uid }),
    db.collection('post_comments').deleteMany({ userUid: uid }),
    db.collection('post_bookmarks').deleteMany({ userUid: uid }),
    db.collection('post_reports').deleteMany({ userUid: uid }),
    db.collection('document_reports').deleteMany({ userUid: uid }),
    db.collection('admin_report_actions').deleteMany({ $or: [{ resolvedByUid: uid }, { targetUid: uid }] }),
    db.collection('doccomment').deleteMany({ userUid: uid }),
    db.collection('personal_journal_folders').deleteMany({ userUid: uid }),
    db.collection('personal_journals').deleteMany({ userUid: uid }),
    db.collection('personal_tasks').deleteMany({ userUid: uid }),
    db.collection('ai_task_proposals').deleteMany({ userUid: uid }),
    db.collection('ai_messages').deleteMany({ userUid: uid }),
    db.collection('ai_conversations').deleteMany({ userUid: uid }),
    db.collection('post_ai_messages').deleteMany({ userUid: uid }),
    db.collection('post_ai_conversations').deleteMany({ userUid: uid }),
    db.collection('library_ai_messages').deleteMany({ userUid: uid }),
    db.collection('library_ai_conversations').deleteMany({ userUid: uid }),
    db.collection('subject_ai_messages').deleteMany({ userUid: uid }),
    db.collection('subject_ai_conversations').deleteMany({ userUid: uid }),
    db.collection('subject_post_ai_messages').deleteMany({ userUid: uid }),
    db.collection('subject_post_ai_conversations').deleteMany({ userUid: uid }),
  ];

  if (userPostIds.length) {
    cleanupOps.push(postsCollection.deleteMany({ _id: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_likes').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_comments').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_bookmarks').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_reports').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_ai_conversations').deleteMany({ postId: { $in: userPostIds } }));
  }
  if (subjectPostIds.length) {
    cleanupOps.push(db.collection('subject_post_ai_conversations').deleteMany({ postId: { $in: subjectPostIds } }));
  }
  cleanupOps.push(db.collection('document_reports').deleteMany({ targetUid: uid }));
  const postMessageConversationIds = Array.from(
    new Set([...postAiConversationIds, ...postLinkedAiConversationIds].map((value) => String(value)))
  ).map((value) => new ObjectId(value));
  if (postMessageConversationIds.length) {
    cleanupOps.push(
      db.collection('post_ai_messages').deleteMany({ conversationId: { $in: postMessageConversationIds } })
    );
  }
  if (libraryAiConversationIds.length) {
    cleanupOps.push(
      db.collection('library_ai_messages').deleteMany({ conversationId: { $in: libraryAiConversationIds } })
    );
  }
  if (subjectAiConversationIds.length) {
    cleanupOps.push(
      db.collection('subject_ai_messages').deleteMany({ conversationId: { $in: subjectAiConversationIds } })
    );
  }
  const subjectPostMessageConversationIds = Array.from(
    new Set([...subjectPostAiConversationIds, ...subjectPostLinkedAiConversationIds].map((value) => String(value)))
  ).map((value) => new ObjectId(value));
  if (subjectPostMessageConversationIds.length) {
    cleanupOps.push(
      db.collection('subject_post_ai_messages').deleteMany({ conversationId: { $in: subjectPostMessageConversationIds } })
    );
  }
  if (personalAiConversationIds.length) {
    cleanupOps.push(
      db.collection('ai_messages').deleteMany({ conversationId: { $in: personalAiConversationIds } })
    );
    cleanupOps.push(
      db.collection('ai_task_proposals').deleteMany({ conversationId: { $in: personalAiConversationIds } })
    );
  }

  await Promise.all(cleanupOps);
}

const ALLOWED_SITE_PAGE_SLUGS = new Set(['about', 'faq', 'rooms', 'mobile-app']);

const DEFAULT_SITE_PAGES = {
  about: {
    title: 'About Open Library',
    subtitle: 'Built to help students learn, collaborate, and ship work together.',
    body: {
      overview:
        'Open Library is an academic collaboration space where students can share knowledge, publish course resources, discuss ideas, and work in live rooms. The platform combines social interaction, document intelligence, and practical productivity tools in one place.',
      highlights: [
        'Home feed with discussions, attachments, and AI-assisted post exploration',
        'Open Library for course documents and reusable learning references',
        'Communities and Rooms for real-time group coordination',
      ],
      commitments: [
        'Student-first product decisions and practical workflows',
        'Privacy-aware moderation and reporting controls',
        'Continuous iteration based on course and community feedback',
      ],
      contactEmail: '',
    },
  },
  faq: {
    title: 'Frequently Asked Questions',
    subtitle: 'Quick answers to common questions about using the platform.',
    body: {
      items: [
        {
          question: 'Who can access private posts or private documents?',
          answer:
            'Private content is restricted to users in the same course as the uploader, plus the uploader themselves.',
        },
        {
          question: 'How does Ask AI use document context?',
          answer:
            'Ask AI uses document metadata and available extracted excerpts. If AI is disabled by the uploader, the feature is blocked.',
        },
        {
          question: 'Can I control what notifications I receive?',
          answer:
            'Yes. Notification preferences can be managed in the Preferences page.',
        },
      ],
    },
  },
  rooms: {
    title: 'Rooms settings',
    subtitle: 'Configurable labels for Rooms UI',
    body: {
      courseContextLabel: 'Course context',
    },
  },
  'mobile-app': {
    title: 'Open Library Lite',
    subtitle: 'Scan the QR code to download the Android lite app.',
    body: {
      description:
        'Use the lite mobile app to stay connected with your communities, view feed updates, and access core features on the go.',
      qrImageUrl: '',
      qrAltText: 'Open Library Lite QR code',
      downloadUrl: '',
      downloadLabel: 'Download APK',
    },
  },
};

let ensureSitePagesReadyPromise = null;

async function ensureSitePagesReady() {
  if (ensureSitePagesReadyPromise) return ensureSitePagesReadyPromise;
  ensureSitePagesReadyPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_page_content (
        slug TEXT PRIMARY KEY CHECK (slug IN ('about', 'faq', 'rooms', 'mobile-app')),
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        body JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE site_page_content
      DROP CONSTRAINT IF EXISTS site_page_content_slug_check;
    `);
    await pool.query(`
      ALTER TABLE site_page_content
      ADD CONSTRAINT site_page_content_slug_check
      CHECK (slug IN ('about', 'faq', 'rooms', 'mobile-app'));
    `);
  })().catch((error) => {
    ensureSitePagesReadyPromise = null;
    throw error;
  });
  return ensureSitePagesReadyPromise;
}

function normalizeSitePageSlug(value) {
  const slug = sanitizeText(value, 40).toLowerCase();
  return ALLOWED_SITE_PAGE_SLUGS.has(slug) ? slug : '';
}

function normalizeAboutBody(body = {}) {
  const highlights = Array.isArray(body.highlights)
    ? body.highlights.map((item) => sanitizeText(item, 240)).filter(Boolean).slice(0, 12)
    : [];
  const commitments = Array.isArray(body.commitments)
    ? body.commitments.map((item) => sanitizeText(item, 240)).filter(Boolean).slice(0, 12)
    : [];

  return {
    overview: sanitizeText(body.overview, 7000),
    highlights,
    commitments,
    contactEmail: sanitizeText(body.contactEmail, 320),
  };
}

function normalizeFaqBody(body = {}) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item) => ({
      question: sanitizeText(item && item.question, 300),
      answer: sanitizeText(item && item.answer, 3000),
    }))
    .filter((item) => item.question && item.answer)
    .slice(0, 40);

  return { items };
}

function normalizeRoomsBody(body = {}) {
  return {
    courseContextLabel: sanitizeText(body.courseContextLabel, 80) || 'Course context',
  };
}

function normalizeMobileAppBody(body = {}) {
  return {
    description: sanitizeText(body.description, 7000),
    qrImageUrl: sanitizeText(body.qrImageUrl, 2000),
    qrAltText: sanitizeText(body.qrAltText, 180) || 'Open Library Lite QR code',
    downloadUrl: sanitizeText(body.downloadUrl, 2000),
    downloadLabel: sanitizeText(body.downloadLabel, 80) || 'Download APK',
  };
}

function normalizeSitePageBody(slug, body = {}) {
  if (slug === 'about') {
    return normalizeAboutBody(body);
  }
  if (slug === 'faq') {
    return normalizeFaqBody(body);
  }
  if (slug === 'mobile-app') {
    return normalizeMobileAppBody(body);
  }
  return normalizeRoomsBody(body);
}

function getDefaultSitePage(slug) {
  const base = DEFAULT_SITE_PAGES[slug];
  if (!base) return null;
  return {
    slug,
    title: base.title,
    subtitle: base.subtitle,
    body: normalizeSitePageBody(slug, base.body || {}),
    updatedAt: null,
    updatedByUid: null,
    isDefault: true,
  };
}

function normalizeSitePageResult(slug, row) {
  if (!row) {
    return getDefaultSitePage(slug);
  }
  return {
    slug,
    title: sanitizeText(row.title, 180) || getDefaultSitePage(slug).title,
    subtitle: sanitizeText(row.subtitle, 500),
    body: normalizeSitePageBody(slug, row.body || {}),
    updatedAt: row.updated_at || null,
    updatedByUid: row.updated_by_uid || null,
    isDefault: false,
  };
}

async function resolveMobileAppBodyAssets(page) {
  if (!page || page.slug !== 'mobile-app') return page;
  const body = page.body && typeof page.body === 'object' ? { ...page.body } : {};

  async function resolveAssetUrl(rawValue, label) {
    const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!raw) return raw;
    try {
      const normalized = normalizeStorageKey(raw);
      const isHttp = /^https?:\/\//i.test(raw);
      const shouldSign = Boolean(normalized) && (!isHttp || normalized !== raw);
      if (!shouldSign) return raw;
      return await getSignedUrl(normalized, SIGNED_TTL);
    } catch (error) {
      console.warn(
        `Mobile app ${label} signing failed; returning raw URL:`,
        error && error.message ? error.message : error
      );
      return raw;
    }
  }

  body.qrImageUrl = await resolveAssetUrl(body.qrImageUrl, 'QR');
  body.downloadUrl = await resolveAssetUrl(body.downloadUrl, 'download');
  return { ...page, body };
}

router.get('/api/admin/me', requireAuthApi, async (req, res) => {
  try {
    await ensureAuditReady();
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    await ensureDepAdminManagerReady();
    const normalizedRole = sanitizeText(viewer.platform_role || 'member', 30).toLowerCase() || 'member';
    let departmentAssignmentsCount = 0;
    if (normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'depadmin') {
      const assignmentResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM course_dep_admin_assignments
         WHERE depadmin_uid = $1`,
        [viewer.uid]
      );
      departmentAssignmentsCount = Number(assignmentResult.rows[0] ? assignmentResult.rows[0].total : 0);
    }
    return res.json({
      ok: true,
      allowed: isOwnerOrAdmin(viewer) && viewer.is_banned !== true,
      role: normalizedRole,
      uid: viewer.uid,
      departmentAssignmentsCount,
      canManageDepartment: viewer.is_banned !== true && departmentAssignmentsCount > 0,
    });
  } catch (error) {
    console.error('Admin me failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load admin context.' });
  }
});

router.get('/api/site-pages/:slug', requireAuthApi, async (req, res) => {
  const slug = normalizeSitePageSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, message: 'Invalid page slug.' });
  }

  try {
    await ensureSitePagesReady();
    const result = await pool.query(
      `SELECT slug, title, subtitle, body, updated_by_uid, updated_at
       FROM site_page_content
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    const page = await resolveMobileAppBodyAssets(normalizeSitePageResult(slug, result.rows[0] || null));
    return res.json({ ok: true, page });
  } catch (error) {
    console.error('Site page fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load page content.' });
  }
});

router.use('/api/admin', requireAuthApi);

router.use('/api/admin', async (req, res, next) => {
  try {
    await ensureAuditReady();
    await ensureGovernanceReady();
    await ensureProfessorCodeManagerReady();
    await ensureDepAdminManagerReady();
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    if (viewer.is_banned === true) {
      return res.status(403).json({ ok: false, message: 'Account is banned.' });
    }
    if (!isOwnerOrAdmin(viewer)) {
      return res.status(403).json({ ok: false, message: 'Admin access required.' });
    }
    req.adminViewer = viewer;
    return next();
  } catch (error) {
    console.error('Admin guard failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to authorize admin request.' });
  }
});

router.get('/api/admin/logs', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 30, 120);
  const executorUid = sanitizeText(req.query.executorUid, 120);
  const course = sanitizeText(req.query.course, 120);
  const query = sanitizeText(req.query.q, 200);
  const sort = sanitizeText(req.query.sort, 30).toLowerCase();
  const order = sort === 'oldest' ? 'ASC' : 'DESC';

  try {
    const where = [];
    const params = [];
    if (executorUid) {
      params.push(executorUid);
      where.push(`l.executor_uid = $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`l.course = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(l.action_type ILIKE $${params.length}
          OR l.action_key ILIKE $${params.length}
          OR l.source_path ILIKE $${params.length}
          OR COALESCE(l.target_id, '') ILIKE $${params.length})`
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM admin_audit_logs l
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        l.id,
        l.action_key,
        l.action_type,
        l.target_type,
        l.target_id,
        l.course,
        l.source_path,
        l.metadata,
        l.created_at,
        l.executor_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS executor_name
       FROM admin_audit_logs l
       LEFT JOIN accounts a ON a.uid = l.executor_uid
       LEFT JOIN profiles p ON p.uid = l.executor_uid
       ${whereClause}
       ORDER BY l.created_at ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      logs: rowsResult.rows.map((row) => ({
        ...(row.metadata && typeof row.metadata === 'object'
          ? {
              targetUrl:
                typeof row.metadata.targetUrl === 'string' && row.metadata.targetUrl.trim()
                  ? row.metadata.targetUrl.trim().slice(0, 512)
                  : null,
            }
          : { targetUrl: null }),
        id: Number(row.id),
        actionKey: row.action_key,
        actionType: row.action_type,
        targetType: row.target_type || null,
        targetId: row.target_id || null,
        course: row.course || null,
        sourcePath: row.source_path || null,
        executorUid: row.executor_uid || null,
        executor: row.executor_name || 'Unknown',
        metadata: row.metadata || {},
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin logs fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load audit logs.' });
  }
});

router.get('/api/admin/reports', async (req, res) => {
  const { page, pageSize } = parsePagination(req, 25, 80);
  const source = sanitizeText(req.query.source, 40).toLowerCase();
  const status = sanitizeText(req.query.status, 40).toLowerCase();
  const course = sanitizeText(req.query.course, 120);
  const query = sanitizeText(req.query.q, 200).toLowerCase();
  const maxSourceRows = 600;

  try {
    const reports = [];

    if (!source || source === 'profile') {
      const profileResult = await pool.query(
        `SELECT
          r.id,
          r.created_at,
          r.reason,
          r.reporter_uid,
          r.target_uid,
          COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
          COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) AS target_name,
          ta.course AS target_course
         FROM user_profile_reports r
         JOIN accounts ra ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
         JOIN accounts ta ON ta.uid = r.target_uid
         LEFT JOIN profiles tp ON tp.uid = r.target_uid
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [maxSourceRows]
      );
      profileResult.rows.forEach((row) => {
        reports.push({
          id: `profile:${row.id}`,
          source: 'profile',
          status: 'open',
          targetType: 'user_profile',
          targetId: row.target_uid,
          targetUid: row.target_uid,
          targetName: row.target_name || 'User',
          reporterUid: row.reporter_uid,
          reporterName: row.reporter_name || 'Member',
          category: null,
          customReason: null,
          details: null,
          reason: row.reason || null,
          course: row.target_course || null,
          createdAt: row.created_at,
        });
      });
    }

    if (!source || source === 'community') {
      const where = [];
      const params = [];
      if (status && status !== 'all') {
        params.push(status);
        where.push(`r.status = $${params.length}`);
      }
      if (course) {
        params.push(course);
        where.push(`c.course_name = $${params.length}`);
      }
      params.push(maxSourceRows);
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const communityResult = await pool.query(
        `SELECT
          r.id,
          r.target_type,
          r.target_uid,
          r.target_post_id,
          r.target_comment_id,
          r.reason,
          r.status,
          r.created_at,
          c.course_name,
          COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
          COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) AS target_name,
          r.reporter_uid
         FROM community_reports r
         JOIN communities c ON c.id = r.community_id
         JOIN accounts ra ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
         LEFT JOIN accounts ta ON ta.uid = r.target_uid
         LEFT JOIN profiles tp ON tp.uid = r.target_uid
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $${params.length}`,
        params
      );
      communityResult.rows.forEach((row) => {
        reports.push({
          id: `community:${row.id}`,
          source: 'community',
          status: normalizeReportStatus(row),
          targetType: row.target_type || 'community',
          targetId: row.target_uid || row.target_post_id || row.target_comment_id || null,
          targetUid: row.target_uid || null,
          targetName: row.target_name || null,
          reporterUid: row.reporter_uid,
          reporterName: row.reporter_name || 'Member',
          category: null,
          customReason: null,
          details: null,
          reason: row.reason || null,
          course: row.course_name || null,
          createdAt: row.created_at,
        });
      });
    }

    if (!source || source === 'main_post') {
      const db = await getMongoDb();
      const mongoReports = await db
        .collection('post_reports')
        .find({})
        .sort({ createdAt: -1 })
        .limit(maxSourceRows)
        .toArray();

      if (mongoReports.length) {
        const postIds = Array.from(
          new Set(
            mongoReports
              .map((item) => (item.postId && ObjectId.isValid(item.postId) ? new ObjectId(item.postId) : item.postId))
              .filter(Boolean)
          )
        );
        const posts = await db
          .collection('posts')
          .find({ _id: { $in: postIds } })
          .project({ _id: 1, title: 1, course: 1, uploaderUid: 1 })
          .toArray();
        const postsMap = new Map(posts.map((post) => [String(post._id), post]));

        const reporterUids = mongoReports.map((item) => item.userUid).filter(Boolean);
        const uploaderUids = posts.map((post) => post.uploaderUid).filter(Boolean);
        const namesMap = await loadDisplayNamesByUid([...reporterUids, ...uploaderUids]);

        mongoReports.forEach((report) => {
          const post = postsMap.get(String(report.postId));
          reports.push({
            id: `main_post:${report._id}`,
            source: 'main_post',
            status: normalizeAdminReportStatus(report.status, 'open'),
            targetType: 'main_post',
            targetId: post ? String(post._id) : String(report.postId || ''),
            targetUid: post ? post.uploaderUid || null : report.targetUid || null,
            targetName: post ? post.title : 'Post',
            reporterUid: report.userUid || null,
            reporterName: namesMap.get(report.userUid) || report.userUid || 'Member',
            category: report.category || null,
            customReason: report.customReason || null,
            details: report.details || null,
            reason: report.reason || null,
            course: post ? post.course || null : null,
            moderationAction: report.moderationAction || 'none',
            resolutionNote: report.resolutionNote || null,
            resolvedAt: report.resolvedAt || null,
            resolvedByUid: report.resolvedByUid || null,
            createdAt: report.createdAt || new Date(),
          });
        });
      }
    }

    if (!source || source === 'subject_post') {
      const where = [];
      const params = [];
      if (status && status !== 'all') {
        params.push(status);
        where.push(`r.status = $${params.length}`);
      }
      if (course) {
        params.push(course);
        where.push(`s.course_name = $${params.length}`);
      }
      params.push(maxSourceRows);
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const subjectPostResult = await pool.query(
        `SELECT
           r.id,
           r.post_id,
           r.reporter_uid,
           r.target_uid,
           r.category,
           r.custom_reason,
           r.details,
           r.reason,
           r.status,
           r.moderation_action,
           r.resolution_note,
           r.resolved_at,
           r.resolved_by_uid,
           r.created_at,
           sp.title AS post_title,
           s.course_name,
           COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
           COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) AS target_name
         FROM subject_post_reports r
         JOIN subjects s ON s.id = r.subject_id
         LEFT JOIN subject_posts sp ON sp.id = r.post_id
         JOIN accounts ra ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
         LEFT JOIN accounts ta ON ta.uid = r.target_uid
         LEFT JOIN profiles tp ON tp.uid = r.target_uid
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $${params.length}`,
        params
      );

      subjectPostResult.rows.forEach((row) => {
        reports.push({
          id: `subject_post:${row.id}`,
          source: 'subject_post',
          status: normalizeAdminReportStatus(row.status, 'open'),
          targetType: 'subject_post',
          targetId: row.post_id ? String(row.post_id) : null,
          targetUid: row.target_uid || null,
          targetName: row.post_title || 'Unit post',
          reporterUid: row.reporter_uid || null,
          reporterName: row.reporter_name || 'Member',
          category: row.category || null,
          customReason: row.custom_reason || null,
          details: row.details || null,
          reason: row.reason || null,
          course: row.course_name || null,
          moderationAction: row.moderation_action || 'none',
          resolutionNote: row.resolution_note || null,
          resolvedAt: row.resolved_at || null,
          resolvedByUid: row.resolved_by_uid || null,
          createdAt: row.created_at,
          targetAuthorName: row.target_name || null,
        });
      });
    }

    if (!source || source === 'library_document') {
      const db = await getMongoDb();
      const mongoReports = await db
        .collection('document_reports')
        .find({})
        .sort({ createdAt: -1 })
        .limit(maxSourceRows)
        .toArray();

      if (mongoReports.length) {
        const documentUuids = Array.from(
          new Set(mongoReports.map((item) => sanitizeText(item.documentUuid, 120)).filter(Boolean))
        );
        let docsMap = new Map();
        if (documentUuids.length) {
          const docsResult = await pool.query(
            `SELECT uuid::text AS uuid, title, course, uploader_uid
             FROM documents
             WHERE uuid::text = ANY($1::text[])`,
            [documentUuids]
          );
          docsMap = new Map(docsResult.rows.map((row) => [row.uuid, row]));
        }

        const reporterUids = mongoReports.map((item) => item.userUid).filter(Boolean);
        const uploaderUids = mongoReports
          .map((item) => {
            const doc = docsMap.get(sanitizeText(item.documentUuid, 120));
            return doc ? doc.uploader_uid : item.targetUid;
          })
          .filter(Boolean);
        const namesMap = await loadDisplayNamesByUid([...reporterUids, ...uploaderUids]);

        mongoReports.forEach((report) => {
          const documentUuid = sanitizeText(report.documentUuid, 120);
          const doc = docsMap.get(documentUuid);
          reports.push({
            id: `library_document:${report._id}`,
            source: 'library_document',
            status: normalizeAdminReportStatus(report.status, 'open'),
            targetType: 'library_document',
            targetId: documentUuid || null,
            targetUid: (doc && doc.uploader_uid) || report.targetUid || null,
            targetName: (doc && doc.title) || report.documentTitle || 'Document',
            reporterUid: report.userUid || null,
            reporterName: namesMap.get(report.userUid) || report.userUid || 'Member',
            category: report.category || null,
            customReason: report.customReason || null,
            details: report.details || null,
            reason: report.reason || null,
            course: (doc && doc.course) || null,
            moderationAction: report.moderationAction || 'none',
            resolutionNote: report.resolutionNote || null,
            resolvedAt: report.resolvedAt || null,
            resolvedByUid: report.resolvedByUid || null,
            createdAt: report.createdAt || new Date(),
          });
        });
      }
    }

    if (!source || source === 'chat_message') {
      try {
        const params = [];
        params.push(maxSourceRows);

        const chatMessageResult = await pool.query(
          `SELECT
            r.id,
            r.message_id,
            r.thread_id,
            r.message_sender_uid,
            r.reason,
            r.status,
            r.created_at,
            r.reporter_uid,
            COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
            COALESCE(sp.display_name, sa.display_name, sa.username, sa.email) AS sender_name
           FROM chat_message_reports r
           JOIN accounts ra ON ra.uid = r.reporter_uid
           LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
           LEFT JOIN accounts sa ON sa.uid = r.message_sender_uid
           LEFT JOIN profiles sp ON sp.uid = r.message_sender_uid
           ORDER BY r.created_at DESC
           LIMIT $${params.length}`,
          params
        );

        chatMessageResult.rows.forEach((row) => {
          const normalizedStatus =
            row.status === 'pending'
              ? 'open'
              : row.status === 'reviewed'
                ? 'under_review'
                : 'resolved_no_action';
          reports.push({
            id: `chat_message:${row.id}`,
            source: 'chat_message',
            status: normalizedStatus,
            targetType: 'chat_message',
            targetId: row.message_id ? String(row.message_id) : null,
            targetUid: row.message_sender_uid || null,
            targetName: row.sender_name || 'Conversation message',
            reporterUid: row.reporter_uid || null,
            reporterName: row.reporter_name || 'Member',
            category: null,
            customReason: null,
            details: null,
            reason: row.reason || null,
            course: null,
            createdAt: row.created_at,
            threadId: row.thread_id ? String(row.thread_id) : null,
          });
        });
      } catch (chatReportError) {
        if (chatReportError && chatReportError.code !== '42P01') {
          throw chatReportError;
        }
      }
    }

    if (reports.length) {
      const actionsMap = await loadAdminReportActionsMap(reports.map((item) => item.id));
      reports.forEach((item) => {
        const action = actionsMap.get(item.id);
        if (!action) {
          if (!item.moderationAction) item.moderationAction = 'none';
          return;
        }
        item.status = normalizeAdminReportStatus(action.status, item.status || 'open');
        item.moderationAction = normalizeAdminReportAction(action.moderationAction, item.moderationAction || 'none');
        item.resolutionNote = action.resolutionNote || item.resolutionNote || null;
        item.resolvedByUid = action.resolvedByUid || item.resolvedByUid || null;
        item.resolvedAt = action.resolvedAt || action.updatedAt || item.resolvedAt || null;
      });
    }

    let filtered = reports;
    if (status && status !== 'all') {
      filtered = filtered.filter((item) => String(item.status || '').toLowerCase() === status);
    }
    if (course) {
      filtered = filtered.filter((item) => String(item.course || '') === course);
    }
    if (query) {
      filtered = filtered.filter((item) => {
        const haystack = [
          item.source,
          item.targetType,
          item.targetName,
          item.reporterName,
          item.category,
          item.customReason,
          item.details,
          item.reason,
          item.moderationAction,
          item.resolutionNote,
          item.course,
          item.targetId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const paged = filtered.slice(offset, offset + pageSize);

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      reports: paged,
    });
  } catch (error) {
    console.error('Admin reports fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load reports.' });
  }
});

router.post('/api/admin/reports/action', async (req, res) => {
  const parsed = parseReportKey(req.body && req.body.reportId);
  if (!parsed) {
    return res.status(400).json({ ok: false, message: 'Invalid report id.' });
  }

  let status = normalizeAdminReportStatus(req.body && req.body.status, 'open');
  const moderationAction = normalizeAdminReportAction(req.body && req.body.moderationAction, 'none');
  const resolutionNote = sanitizeText(req.body && req.body.note, 1000) || null;
  const suspendDurationHours = parseSuspensionDurationHours(
    req.body && req.body.suspendDurationHours,
    DEFAULT_SUSPENSION_HOURS
  );
  if (moderationAction !== 'none' && (status === 'open' || status === 'under_review')) {
    status = 'resolved_action_taken';
  }

  const allowedActionsBySource = {
    profile: new Set(['none', 'suspend_target_user', 'ban_target_user']),
    community: new Set(['none', 'take_down_community_post', 'take_down_community_comment', 'suspend_target_user', 'ban_target_user']),
    main_post: new Set(['none', 'delete_main_post', 'suspend_target_user', 'ban_target_user']),
    subject_post: new Set(['none', 'take_down_subject_post', 'suspend_target_user', 'ban_target_user']),
    library_document: new Set(['none', 'delete_library_document', 'suspend_target_user', 'ban_target_user']),
    chat_message: new Set(['none', 'delete_chat_message', 'suspend_target_user', 'ban_target_user']),
  };
  const sourceActions = allowedActionsBySource[parsed.source];
  if (!sourceActions) {
    return res.status(400).json({ ok: false, message: 'Unsupported report source.' });
  }
  if (!sourceActions.has(moderationAction)) {
    return res.status(400).json({ ok: false, message: 'Invalid moderation action for this report source.' });
  }

  const shouldMarkResolved = !['open', 'under_review'].includes(status);
  const resolvedAt = shouldMarkResolved ? new Date() : null;
  const adminUid = req.adminViewer.uid;
  const restrictedContentsEnabled = isRestrictedContentsEnabled();

  let targetType = null;
  let targetId = null;
  let targetUid = null;
  let targetCourse = null;
  let reportExists = false;
  let restrictedQueueEntry = null;
  let suspensionEndsAt = null;

  try {
    const db = await getMongoDb();

    if (parsed.source === 'main_post') {
      if (!ObjectId.isValid(parsed.rawId)) {
        return res.status(400).json({ ok: false, message: 'Invalid main post report id.' });
      }
      const reportObjectId = new ObjectId(parsed.rawId);
      const report = await db.collection('post_reports').findOne({ _id: reportObjectId });
      if (!report) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      reportExists = true;
      targetType = 'main_post';
      targetId = report.postId ? String(report.postId) : null;
      targetCourse = report.course || null;

      if (targetId && ObjectId.isValid(targetId)) {
        const post = await db.collection('posts').findOne(
          { _id: new ObjectId(targetId) },
          { projection: { uploaderUid: 1, course: 1 } }
        );
        targetUid = (post && post.uploaderUid) || report.targetUid || null;
        targetCourse = (post && post.course) || targetCourse;
      } else {
        targetUid = report.targetUid || null;
      }

      if (moderationAction === 'delete_main_post') {
        if (restrictedContentsEnabled) {
          const restricted = await restrictMainPostById(
            targetId,
            adminUid,
            resolutionNote || report.reason || 'Restricted from report review'
          );
          if (!restricted) {
            return res.status(404).json({ ok: false, message: 'Target post no longer exists.' });
          }
          targetType = restricted.targetType;
          targetId = restricted.targetId;
          targetUid = restricted.targetUid;
          targetCourse = restricted.course || targetCourse;
          restrictedQueueEntry = await upsertRestrictedQueueEntry({
            source: restricted.source,
            reportKey: parsed.key,
            targetType: restricted.targetType,
            targetId: restricted.targetId,
            targetUid: restricted.targetUid,
            course: restricted.course || null,
            reason: resolutionNote || report.reason || null,
            metadata: {
              title: restricted.title || null,
              sourceReportId: parsed.rawId,
              moderationAction,
            },
            hiddenByUid: adminUid,
          });
        } else {
          const removed = await deleteMainPostById(targetId, adminUid, resolutionNote || report.reason || '');
          if (!removed) {
            return res.status(404).json({ ok: false, message: 'Target post no longer exists.' });
          }
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
      if (moderationAction === 'suspend_target_user') {
        const suspendResult = await suspendTargetUserFromReport(
          targetUid,
          req.adminViewer,
          resolutionNote,
          suspendDurationHours
        );
        if (!suspendResult.ok) {
          return res.status(400).json({ ok: false, message: suspendResult.message });
        }
        suspensionEndsAt = suspendResult.endsAt || null;
      }

      await db.collection('post_reports').updateOne(
        { _id: reportObjectId },
        {
          $set: {
            status,
            moderationAction,
            resolutionNote,
            resolvedAt,
            resolvedByUid: shouldMarkResolved ? adminUid : null,
            updatedAt: new Date(),
          },
        }
      );
    } else if (parsed.source === 'subject_post') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid unit post report id.' });
      }
      const subjectPostReport = await pool.query(
        `SELECT r.id, r.post_id, r.target_uid, r.reason, s.course_name
         FROM subject_post_reports r
         JOIN subjects s ON s.id = r.subject_id
         WHERE r.id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!subjectPostReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      const reportRow = subjectPostReport.rows[0];
      reportExists = true;
      targetType = 'subject_post';
      targetId = reportRow.post_id ? String(reportRow.post_id) : null;
      targetUid = reportRow.target_uid || null;
      targetCourse = reportRow.course_name || null;

      if (moderationAction === 'take_down_subject_post') {
        const removed = await takeDownSubjectPostById(
          reportRow.post_id,
          adminUid,
          resolutionNote || reportRow.reason || 'Taken down from report review'
        );
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target unit post no longer exists.' });
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
      if (moderationAction === 'suspend_target_user') {
        const suspendResult = await suspendTargetUserFromReport(
          targetUid,
          req.adminViewer,
          resolutionNote,
          suspendDurationHours
        );
        if (!suspendResult.ok) {
          return res.status(400).json({ ok: false, message: suspendResult.message });
        }
        suspensionEndsAt = suspendResult.endsAt || null;
      }

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
          resolutionNote,
          resolvedAt,
          shouldMarkResolved ? adminUid : null,
        ]
      );
    } else if (parsed.source === 'library_document') {
      if (!ObjectId.isValid(parsed.rawId)) {
        return res.status(400).json({ ok: false, message: 'Invalid document report id.' });
      }
      const reportObjectId = new ObjectId(parsed.rawId);
      const report = await db.collection('document_reports').findOne({ _id: reportObjectId });
      if (!report) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      reportExists = true;
      targetType = 'library_document';
      targetId = sanitizeText(report.documentUuid, 120) || null;
      targetUid = report.targetUid || null;

      if (targetId) {
        const docResult = await pool.query(
          `SELECT uploader_uid, course
           FROM documents
           WHERE uuid::text = $1
           LIMIT 1`,
          [targetId]
        );
        targetUid = (docResult.rows[0] && docResult.rows[0].uploader_uid) || targetUid;
        targetCourse = (docResult.rows[0] && docResult.rows[0].course) || null;
      }

      if (moderationAction === 'delete_library_document') {
        if (restrictedContentsEnabled) {
          const restricted = await restrictLibraryDocumentByUuid(
            targetId,
            adminUid,
            resolutionNote || report.reason || 'Restricted from report review'
          );
          if (!restricted) {
            return res.status(404).json({ ok: false, message: 'Target document no longer exists.' });
          }
          targetType = restricted.targetType;
          targetId = restricted.targetId;
          targetUid = restricted.targetUid;
          targetCourse = restricted.course || targetCourse;
          restrictedQueueEntry = await upsertRestrictedQueueEntry({
            source: restricted.source,
            reportKey: parsed.key,
            targetType: restricted.targetType,
            targetId: restricted.targetId,
            targetUid: restricted.targetUid,
            course: restricted.course || null,
            reason: resolutionNote || report.reason || null,
            metadata: {
              title: restricted.title || null,
              sourceReportId: parsed.rawId,
              moderationAction,
            },
            hiddenByUid: adminUid,
          });
        } else {
          const removed = await deleteLibraryDocumentByUuid(targetId, adminUid, resolutionNote || report.reason || '');
          if (!removed) {
            return res.status(404).json({ ok: false, message: 'Target document no longer exists.' });
          }
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
      if (moderationAction === 'suspend_target_user') {
        const suspendResult = await suspendTargetUserFromReport(
          targetUid,
          req.adminViewer,
          resolutionNote,
          suspendDurationHours
        );
        if (!suspendResult.ok) {
          return res.status(400).json({ ok: false, message: suspendResult.message });
        }
        suspensionEndsAt = suspendResult.endsAt || null;
      }

      await db.collection('document_reports').updateOne(
        { _id: reportObjectId },
        {
          $set: {
            status,
            moderationAction,
            resolutionNote,
            resolvedAt,
            resolvedByUid: shouldMarkResolved ? adminUid : null,
            updatedAt: new Date(),
          },
        }
      );
    } else if (parsed.source === 'profile') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid profile report id.' });
      }
      const profileReport = await pool.query(
        `SELECT id, target_uid
         FROM user_profile_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!profileReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      reportExists = true;
      targetType = 'user_profile';
      targetId = profileReport.rows[0].target_uid || null;
      targetUid = profileReport.rows[0].target_uid || null;

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
      if (moderationAction === 'suspend_target_user') {
        const suspendResult = await suspendTargetUserFromReport(
          targetUid,
          req.adminViewer,
          resolutionNote,
          suspendDurationHours
        );
        if (!suspendResult.ok) {
          return res.status(400).json({ ok: false, message: suspendResult.message });
        }
        suspensionEndsAt = suspendResult.endsAt || null;
      }
    } else if (parsed.source === 'chat_message') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid chat message report id.' });
      }
      const chatReport = await pool.query(
        `SELECT id, message_id, message_sender_uid
         FROM chat_message_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!chatReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      const reportRow = chatReport.rows[0];
      reportExists = true;
      targetType = 'chat_message';
      targetId = reportRow.message_id ? String(reportRow.message_id) : null;
      targetUid = reportRow.message_sender_uid || null;

      if (moderationAction === 'delete_chat_message') {
        const removed = await deleteChatMessageById(reportRow.message_id, adminUid);
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target chat message no longer exists.' });
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
      if (moderationAction === 'suspend_target_user') {
        const suspendResult = await suspendTargetUserFromReport(
          targetUid,
          req.adminViewer,
          resolutionNote,
          suspendDurationHours
        );
        if (!suspendResult.ok) {
          return res.status(400).json({ ok: false, message: suspendResult.message });
        }
        suspensionEndsAt = suspendResult.endsAt || null;
      }

      await pool.query(
        `UPDATE chat_message_reports
         SET status = $2,
             resolution_note = $3,
             resolved_by_uid = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [reportId, mapAdminStatusToChatStatus(status), resolutionNote, shouldMarkResolved ? adminUid : null]
      );
    } else if (parsed.source === 'community') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid community report id.' });
      }
      const communityReport = await pool.query(
        `SELECT id, target_type, target_uid, target_post_id, target_comment_id, reason
         FROM community_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!communityReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      const reportRow = communityReport.rows[0];
      reportExists = true;
      targetType = reportRow.target_type || 'community';
      targetUid = reportRow.target_uid || null;
      targetId = reportRow.target_post_id
        ? String(reportRow.target_post_id)
        : (reportRow.target_comment_id ? String(reportRow.target_comment_id) : targetUid);
      const courseResult = await pool.query(
        `SELECT c.course_name
         FROM community_reports r
         JOIN communities c ON c.id = r.community_id
         WHERE r.id = $1
         LIMIT 1`,
        [reportId]
      );
      targetCourse = courseResult.rows[0] ? courseResult.rows[0].course_name || null : null;

      if (moderationAction === 'take_down_community_post') {
        if (targetType !== 'post') {
          return res.status(400).json({ ok: false, message: 'This report does not target a community post.' });
        }
        if (restrictedContentsEnabled) {
          const restricted = await restrictCommunityPostById(
            reportRow.target_post_id,
            adminUid,
            resolutionNote || 'Restricted from report review'
          );
          if (!restricted) {
            return res.status(404).json({ ok: false, message: 'Target community post no longer exists.' });
          }
          targetType = restricted.targetType;
          targetId = restricted.targetId;
          targetUid = restricted.targetUid;
          targetCourse = restricted.course || targetCourse;
          restrictedQueueEntry = await upsertRestrictedQueueEntry({
            source: restricted.source,
            reportKey: parsed.key,
            targetType: restricted.targetType,
            targetId: restricted.targetId,
            targetUid: restricted.targetUid,
            course: restricted.course || null,
            reason: resolutionNote || reportRow.reason || null,
            metadata: {
              title: restricted.title || null,
              sourceReportId: parsed.rawId,
              moderationAction,
            },
            hiddenByUid: adminUid,
          });
        } else {
          const removed = await takeDownCommunityPostById(reportRow.target_post_id, adminUid, resolutionNote);
          if (!removed) {
            return res.status(404).json({ ok: false, message: 'Target community post no longer exists.' });
          }
        }
      }

      if (moderationAction === 'take_down_community_comment') {
        if (targetType !== 'comment') {
          return res.status(400).json({ ok: false, message: 'This report does not target a community comment.' });
        }
        if (restrictedContentsEnabled) {
          const restricted = await restrictCommunityCommentById(
            reportRow.target_comment_id,
            adminUid,
            resolutionNote || 'Restricted from report review'
          );
          if (!restricted) {
            return res.status(404).json({ ok: false, message: 'Target community comment no longer exists.' });
          }
          targetType = restricted.targetType;
          targetId = restricted.targetId;
          targetUid = restricted.targetUid;
          targetCourse = restricted.course || targetCourse;
          restrictedQueueEntry = await upsertRestrictedQueueEntry({
            source: restricted.source,
            reportKey: parsed.key,
            targetType: restricted.targetType,
            targetId: restricted.targetId,
            targetUid: restricted.targetUid,
            course: restricted.course || null,
            reason: resolutionNote || reportRow.reason || null,
            metadata: {
              title: restricted.title || null,
              sourceReportId: parsed.rawId,
              moderationAction,
            },
            hiddenByUid: adminUid,
          });
        } else {
          const removed = await takeDownCommunityCommentById(reportRow.target_comment_id, adminUid, resolutionNote);
          if (!removed) {
            return res.status(404).json({ ok: false, message: 'Target community comment no longer exists.' });
          }
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
      if (moderationAction === 'suspend_target_user') {
        const suspendResult = await suspendTargetUserFromReport(
          targetUid,
          req.adminViewer,
          resolutionNote,
          suspendDurationHours
        );
        if (!suspendResult.ok) {
          return res.status(400).json({ ok: false, message: suspendResult.message });
        }
        suspensionEndsAt = suspendResult.endsAt || null;
      }

      await pool.query(
        `UPDATE community_reports
         SET status = $2,
             resolution_note = $3,
             resolved_by_uid = $4,
             resolved_at = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [reportId, status, resolutionNote, shouldMarkResolved ? adminUid : null, resolvedAt]
      );
    }

    if (!reportExists) {
      return res.status(404).json({ ok: false, message: 'Report not found.' });
    }

    await db.collection('admin_report_actions').updateOne(
      { reportKey: parsed.key },
      {
        $set: {
          source: parsed.source,
          sourceReportId: parsed.rawId,
          reportKey: parsed.key,
          status,
          moderationAction,
          resolutionNote,
          targetType,
          targetId,
          targetUid,
          targetCourse,
          restrictedQueueId: restrictedQueueEntry ? Number(restrictedQueueEntry.id) : null,
          suspensionDurationHours:
            moderationAction === 'suspend_target_user' ? suspendDurationHours : null,
          suspensionEndsAt:
            moderationAction === 'suspend_target_user' && suspensionEndsAt
              ? new Date(suspensionEndsAt).toISOString()
              : null,
          resolvedByUid: shouldMarkResolved ? adminUid : null,
          resolvedAt,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({
      ok: true,
      report: {
        reportId: parsed.key,
        status,
        moderationAction,
        resolutionNote,
        targetType,
        targetId,
        targetUid,
        restrictedQueueId: restrictedQueueEntry ? Number(restrictedQueueEntry.id) : null,
        resolvedAt,
      },
    });
  } catch (error) {
    console.error('Admin report action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to apply report action.' });
  }
});

router.post('/api/admin/ai-reports/:id/action', async (req, res) => {
  const reportId = parsePositiveInt(req.params.id);
  if (!reportId) {
    return res.status(400).json({ ok: false, message: 'Invalid AI report id.' });
  }

  const moderationAction = normalizeAdminReportAction(req.body && req.body.moderationAction, 'none');
  const allowedActions = new Set(['none', 'take_down_target', 'suspend_target_user', 'ban_target_user']);
  if (!allowedActions.has(moderationAction)) {
    return res.status(400).json({ ok: false, message: 'Invalid AI moderation action.' });
  }

  const resolutionNote = sanitizeText(req.body && req.body.note, 1000) || null;
  const suspendDurationHours = parseSuspensionDurationHours(
    req.body && req.body.suspendDurationHours,
    DEFAULT_SUSPENSION_HOURS
  );

  try {
    const reportResult = await pool.query(
      `SELECT id, target_type, target_id, risk_level, risk_score, result, status, created_at
       FROM ai_content_scans
       WHERE id = $1
       LIMIT 1`,
      [reportId]
    );
    if (!reportResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'AI report not found.' });
    }

    const row = reportResult.rows[0];
    const targetType = sanitizeText(row.target_type, 40).toLowerCase();
    const targetId = sanitizeText(row.target_id, 240);
    const resultPayload = row.result && typeof row.result === 'object' ? { ...row.result } : {};

    let targetUid = null;
    let targetCourse = null;
    let targetTitle = null;
    let targetState = null;

    if (targetType === 'post' && targetId && ObjectId.isValid(targetId)) {
      const db = await getMongoDb();
      const post = await db.collection('posts').findOne(
        { _id: new ObjectId(targetId) },
        { projection: { title: 1, course: 1, uploaderUid: 1, moderationStatus: 1 } }
      );
      if (post) {
        targetUid = post.uploaderUid || null;
        targetCourse = post.course || null;
        targetTitle = post.title || null;
        targetState = post.moderationStatus || 'active';
      }
    } else if (targetType === 'subject_post' && targetId) {
      const subjectPostResult = await pool.query(
        `SELECT
           sp.id,
           sp.title,
           sp.author_uid,
           sp.status,
           s.course_name
         FROM subject_posts sp
         JOIN subjects s ON s.id = sp.subject_id
         WHERE sp.id = $1
         LIMIT 1`,
        [targetId]
      );
      if (subjectPostResult.rows.length) {
        const subjectPost = subjectPostResult.rows[0];
        targetUid = subjectPost.author_uid || null;
        targetCourse = subjectPost.course_name || null;
        targetTitle = subjectPost.title || null;
        targetState = subjectPost.status || 'active';
      }
    } else if (targetType === 'document' && targetId) {
      const documentResult = await pool.query(
        `SELECT
           title,
           course,
           uploader_uid,
           COALESCE(is_restricted, false) AS is_restricted
         FROM documents
         WHERE uuid::text = $1
         LIMIT 1`,
        [targetId]
      );
      if (documentResult.rows.length) {
        const document = documentResult.rows[0];
        targetUid = document.uploader_uid || null;
        targetCourse = document.course || null;
        targetTitle = document.title || null;
        targetState = document.is_restricted === true ? 'restricted' : 'active';
      }
    }

    let suspensionEndsAt = null;

    if (moderationAction === 'take_down_target') {
      if (targetType === 'post') {
        const restricted = await restrictMainPostById(
          targetId,
          req.adminViewer.uid,
          resolutionNote || 'Taken down from AI content report'
        );
        if (!restricted) {
          return res.status(404).json({ ok: false, message: 'Target post no longer exists.' });
        }
        targetUid = restricted.targetUid || targetUid;
        targetCourse = restricted.course || targetCourse;
        targetTitle = restricted.title || targetTitle;
        targetState = 'restricted';
      } else if (targetType === 'document') {
        const restricted = await restrictLibraryDocumentByUuid(
          targetId,
          req.adminViewer.uid,
          resolutionNote || 'Taken down from AI content report'
        );
        if (!restricted) {
          return res.status(404).json({ ok: false, message: 'Target document no longer exists.' });
        }
        targetUid = restricted.targetUid || targetUid;
        targetCourse = restricted.course || targetCourse;
        targetTitle = restricted.title || targetTitle;
        targetState = 'restricted';
      } else if (targetType === 'subject_post') {
        const removed = await takeDownSubjectPostById(
          targetId,
          req.adminViewer.uid,
          resolutionNote || 'Taken down from AI content report'
        );
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target unit post no longer exists.' });
        }
        targetState = 'taken_down';
      } else {
        return res.status(400).json({ ok: false, message: 'Unsupported AI report target.' });
      }
    }

    if (moderationAction === 'suspend_target_user') {
      const suspendResult = await suspendTargetUserFromReport(
        targetUid,
        req.adminViewer,
        resolutionNote,
        suspendDurationHours
      );
      if (!suspendResult.ok) {
        return res.status(400).json({ ok: false, message: suspendResult.message });
      }
      suspensionEndsAt = suspendResult.endsAt || null;
    }

    if (moderationAction === 'ban_target_user') {
      const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
      if (!banResult.ok) {
        return res.status(400).json({ ok: false, message: banResult.message });
      }
    }

    resultPayload.adminModeration = {
      action: moderationAction,
      note: resolutionNote,
      actedByUid: req.adminViewer.uid,
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
      report: {
        id: reportId,
        moderationAction,
        targetType,
        targetId,
        targetUid,
        targetCourse,
        targetTitle,
        targetState,
        suspensionEndsAt:
          moderationAction === 'suspend_target_user' && suspensionEndsAt
            ? new Date(suspensionEndsAt).toISOString()
            : null,
      },
    });
  } catch (error) {
    console.error('Admin AI report action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to apply AI report action.' });
  }
});

router.get('/api/admin/restricted-contents', async (req, res) => {
  if (!isRestrictedContentsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Restricted contents feature is disabled.' });
  }

  const { page, pageSize, offset } = parsePagination(req, 25, 100);
  const statusFilter = sanitizeText(req.query.status, 30).toLowerCase();
  const sourceFilter = normalizeRestrictedSource(req.query.source);
  const query = sanitizeText(req.query.q, 220);
  const course = sanitizeText(req.query.course, 160);

  try {
    const where = [];
    const params = [];
    if (statusFilter && statusFilter !== 'all') {
      const normalized = normalizeRestrictedStatus(statusFilter, '');
      if (!normalized) {
        return res.status(400).json({ ok: false, message: 'Invalid restricted content status filter.' });
      }
      params.push(normalized);
      where.push(`status = $${params.length}`);
    }
    if (sourceFilter) {
      params.push(sourceFilter);
      where.push(`source = $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`course = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(COALESCE(report_key, '') ILIKE $${params.length}
          OR COALESCE(target_type, '') ILIKE $${params.length}
          OR COALESCE(target_id, '') ILIKE $${params.length}
          OR COALESCE(target_uid, '') ILIKE $${params.length}
          OR COALESCE(reason, '') ILIKE $${params.length}
          OR COALESCE(course, '') ILIKE $${params.length}
          OR COALESCE(metadata::text, '') ILIKE $${params.length})`
      );
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM restricted_content_queue
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT *
       FROM restricted_content_queue
       ${whereClause}
       ORDER BY hidden_at DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const namesMap = await loadRestrictedQueueDisplayNames(rowsResult.rows);
    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      items: rowsResult.rows
        .map((row) => mapRestrictedQueueRowWithNames(row, namesMap))
        .filter(Boolean),
    });
  } catch (error) {
    console.error('Admin restricted contents fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load restricted contents.' });
  }
});

router.post('/api/admin/restricted-contents/:id/restore', async (req, res) => {
  if (!isRestrictedContentsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Restricted contents feature is disabled.' });
  }

  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Invalid restricted content id.' });
  }

  try {
    const item = await getRestrictedQueueItemById(id);
    if (!item) {
      return res.status(404).json({ ok: false, message: 'Restricted item not found.' });
    }
    if (normalizeRestrictedStatus(item.status, 'restricted') === 'purged') {
      return res.status(409).json({ ok: false, message: 'Purged item cannot be restored.' });
    }
    if (normalizeRestrictedStatus(item.status, 'restricted') === 'restored') {
      const namesMap = await loadRestrictedQueueDisplayNames([item]);
      return res.json({
        ok: true,
        item: mapRestrictedQueueRowWithNames(item, namesMap),
        message: 'Item is already restored.',
      });
    }

    const restored = await restoreRestrictedTarget(item);
    if (!restored) {
      return res.status(404).json({ ok: false, message: 'Target content no longer exists for restore.' });
    }

    const updated = await updateRestrictedQueueStatus(id, 'restored', req.adminViewer.uid);
    if (!updated) {
      return res.status(500).json({ ok: false, message: 'Unable to update restricted queue status.' });
    }

    const namesMap = await loadRestrictedQueueDisplayNames([updated]);
    return res.json({
      ok: true,
      item: mapRestrictedQueueRowWithNames(updated, namesMap),
    });
  } catch (error) {
    console.error('Admin restricted content restore failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to restore restricted content.' });
  }
});

router.post('/api/admin/restricted-contents/:id/purge', async (req, res) => {
  if (!isRestrictedContentsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Restricted contents feature is disabled.' });
  }

  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Invalid restricted content id.' });
  }

  try {
    const item = await getRestrictedQueueItemById(id);
    if (!item) {
      return res.status(404).json({ ok: false, message: 'Restricted item not found.' });
    }

    const outcome = await purgeRestrictedQueueItem(item, req.adminViewer.uid);
    if (!outcome.ok) {
      if (outcome.reason === 'already_purged') {
        const namesMap = await loadRestrictedQueueDisplayNames([item]);
        return res.json({
          ok: true,
          item: mapRestrictedQueueRowWithNames(item, namesMap),
          message: 'Item is already purged.',
        });
      }
      return res.status(500).json({ ok: false, message: 'Unable to purge restricted content.' });
    }

    const updated = outcome.row || (await getRestrictedQueueItemById(id));
    const namesMap = await loadRestrictedQueueDisplayNames(updated ? [updated] : []);
    return res.json({
      ok: true,
      item: updated ? mapRestrictedQueueRowWithNames(updated, namesMap) : null,
      missingTarget: outcome.reason === 'target_missing',
    });
  } catch (error) {
    console.error('Admin restricted content purge failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to purge restricted content.' });
  }
});

router.post('/api/admin/restricted-contents/purge-expired', async (req, res) => {
  if (!isRestrictedContentsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Restricted contents feature is disabled.' });
  }

  const requestedLimit = parsePositiveInt(req.body && req.body.limit);
  const limit = Math.min(requestedLimit || 200, 500);

  try {
    const result = await purgeExpiredRestrictedContents({
      actorUid: req.adminViewer.uid,
      limit,
    });
    return res.json({
      ok: true,
      processed: result.processed,
      purged: result.purged,
      skipped: result.skipped,
      items: result.items,
    });
  } catch (error) {
    console.error('Admin restricted contents purge-expired failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to purge expired restricted contents.' });
  }
});

router.get('/api/admin/appeals', async (req, res) => {
  if (!isAdminAppealsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Admin appeals feature is disabled.' });
  }

  const { page, pageSize, offset } = parsePagination(req, 25, 100);
  const status = normalizeAdminAppealStatus(req.query.status, '');
  const appealType = normalizeAdminAppealType(req.query.type, '');
  const query = sanitizeText(req.query.q, 220);

  try {
    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`aa.status = $${params.length}`);
    }
    if (appealType) {
      params.push(appealType);
      where.push(`aa.appeal_type = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(COALESCE(aa.message, '') ILIKE $${params.length}
          OR COALESCE(aa.resolution_note, '') ILIKE $${params.length}
          OR COALESCE(aa.appeal_type, '') ILIKE $${params.length}
          OR COALESCE(aa.status, '') ILIKE $${params.length}
          OR COALESCE(a.email, '') ILIKE $${params.length}
          OR COALESCE(a.username, '') ILIKE $${params.length}
          OR COALESCE(ap.display_name, a.display_name, '') ILIKE $${params.length})`
      );
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM account_appeals aa
       JOIN accounts a ON a.uid = aa.appellant_uid
       LEFT JOIN profiles ap ON ap.uid = aa.appellant_uid
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        aa.id,
        aa.appellant_uid,
        aa.disciplinary_action_id,
        aa.appeal_type,
        aa.status,
        aa.message,
        aa.evidence,
        aa.resolution_note,
        aa.resolved_by_uid,
        aa.resolved_at,
        aa.created_at,
        aa.updated_at,
        COALESCE(ap.display_name, a.display_name, a.username, a.email) AS appellant_name,
        a.email AS appellant_email,
        da.action_type AS disciplinary_action_type,
        da.reason AS disciplinary_reason,
        da.active AS disciplinary_active,
        da.starts_at AS disciplinary_starts_at,
        da.ends_at AS disciplinary_ends_at,
        COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS resolved_by_name
       FROM account_appeals aa
       JOIN accounts a ON a.uid = aa.appellant_uid
       LEFT JOIN profiles ap ON ap.uid = aa.appellant_uid
       LEFT JOIN account_disciplinary_actions da ON da.id = aa.disciplinary_action_id
       LEFT JOIN accounts ra ON ra.uid = aa.resolved_by_uid
       LEFT JOIN profiles rp ON rp.uid = aa.resolved_by_uid
       ${whereClause}
       ORDER BY aa.created_at DESC, aa.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      appeals: rowsResult.rows.map((row) => ({
        id: Number(row.id),
        appellantUid: row.appellant_uid,
        appellantName: row.appellant_name || row.appellant_uid || 'Member',
        appellantEmail: row.appellant_email || '',
        actionId: row.disciplinary_action_id ? Number(row.disciplinary_action_id) : null,
        type: row.appeal_type,
        status: row.status,
        message: row.message || '',
        evidence: row.evidence || {},
        disciplinaryAction: row.disciplinary_action_type
          ? {
              type: row.disciplinary_action_type,
              reason: row.disciplinary_reason || '',
              active: row.disciplinary_active === true,
              startsAt: row.disciplinary_starts_at || null,
              endsAt: row.disciplinary_ends_at || null,
            }
          : null,
        resolutionNote: row.resolution_note || '',
        resolvedByUid: row.resolved_by_uid || null,
        resolvedByName: row.resolved_by_name || null,
        resolvedAt: row.resolved_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('Admin appeals fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load appeals.' });
  }
});

router.post('/api/admin/appeals/:id/resolve', async (req, res) => {
  if (!isAdminAppealsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Admin appeals feature is disabled.' });
  }

  const appealId = parsePositiveInt(req.params.id);
  const status = normalizeAdminAppealStatus(req.body && req.body.status, '');
  const resolutionNote = sanitizeText(req.body && req.body.note, 2000);
  if (!appealId) {
    return res.status(400).json({ ok: false, message: 'Invalid appeal id.' });
  }
  if (!ADMIN_APPEAL_RESOLUTION_STATUSES.has(status)) {
    return res.status(400).json({ ok: false, message: 'Invalid appeal resolution status.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appealResult = await client.query(
      `SELECT
        id,
        appellant_uid,
        disciplinary_action_id,
        appeal_type,
        status
       FROM account_appeals
       WHERE id = $1
       FOR UPDATE`,
      [appealId]
    );
    if (!appealResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Appeal not found.' });
    }

    const appeal = appealResult.rows[0];
    const currentStatus = normalizeAdminAppealStatus(appeal.status, 'open');
    if (currentStatus === 'withdrawn' || currentStatus === 'accepted' || currentStatus === 'denied') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Appeal is already closed.' });
    }

    const isFinal = status === 'accepted' || status === 'denied';
    const resolvedAt = isFinal ? new Date() : null;

    await client.query(
      `UPDATE account_appeals
       SET
         status = $2,
         resolution_note = $3,
         resolved_by_uid = $4,
         resolved_at = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [appealId, status, resolutionNote || null, isFinal ? req.adminViewer.uid : null, resolvedAt]
    );

    if (status === 'accepted') {
      if (appeal.disciplinary_action_id) {
        await client.query(
          `UPDATE account_disciplinary_actions
           SET
             active = false,
             revoked_at = NOW(),
             revoked_by_uid = $2,
             revoked_reason = $3
           WHERE id = $1`,
          [appeal.disciplinary_action_id, req.adminViewer.uid, resolutionNote || 'Appeal accepted']
        );
      }

      if (appeal.appeal_type === 'ban' || appeal.appeal_type === 'suspension') {
        await client.query(
          `UPDATE accounts
           SET is_banned = false,
               banned_at = NULL,
               banned_reason = NULL,
               banned_by_uid = NULL
           WHERE uid = $1`,
          [appeal.appellant_uid]
        );
      }

      if (appeal.appeal_type === 'verification_rejection') {
        await client.query(
          `UPDATE accounts
           SET
             id_verification_status = 'approved',
             id_verification_note = $2,
             id_verified_by_uid = $3,
             id_verified_at = NOW()
           WHERE uid = $1`,
          [appeal.appellant_uid, resolutionNote || 'Appeal accepted', req.adminViewer.uid]
        );
      }
    }

    await client.query('COMMIT');

    if (isAdminCustomNotificationEnabled() && appeal.appellant_uid) {
      try {
        const customTitle =
          status === 'accepted'
            ? 'Appeal accepted'
            : status === 'denied'
              ? 'Appeal denied'
              : 'Appeal under review';
        const customMessage =
          resolutionNote ||
          (status === 'accepted'
            ? 'Your appeal was accepted by an admin.'
            : status === 'denied'
              ? 'Your appeal was denied by an admin.'
              : 'Your appeal is now under review.');
        await createNotificationsForRecipients({
          recipientUids: [appeal.appellant_uid],
          actorUid: req.adminViewer.uid,
          type: 'admin_custom',
          entityType: 'appeal',
          entityId: String(appealId),
          targetUrl: '/account',
          meta: {
            title: customTitle,
            message: customMessage,
          },
        });
      } catch (notifyError) {
        console.error('Admin appeal resolution notification failed:', notifyError);
      }
    }

    return res.json({
      ok: true,
      appeal: {
        id: appealId,
        status,
        resolutionNote: resolutionNote || '',
        resolvedAt,
        resolvedByUid: isFinal ? req.adminViewer.uid : null,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback errors
    }
    console.error('Admin appeal resolve failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to resolve appeal.' });
  } finally {
    client.release();
  }
});

router.get('/api/admin/subject-ban-requests', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 30, 120);
  const status = normalizeSubjectBanRequestStatus(req.query.status, '');
  const course = sanitizeText(req.query.course, 160);
  const query = sanitizeText(req.query.q, 220);

  try {
    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`sbr.status = $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`s.course_name ILIKE $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(COALESCE(sbr.reason, '') ILIKE $${params.length}
          OR COALESCE(sbr.request_note, '') ILIKE $${params.length}
          OR COALESCE(sbr.admin_note, '') ILIKE $${params.length}
          OR COALESCE(s.subject_name, '') ILIKE $${params.length}
          OR COALESCE(s.course_name, '') ILIKE $${params.length}
          OR COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) ILIKE $${params.length}
          OR COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) ILIKE $${params.length})`
      );
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM subject_ban_requests sbr
       JOIN subjects s ON s.id = sbr.subject_id
       JOIN accounts ta ON ta.uid = sbr.target_uid
       LEFT JOIN profiles tp ON tp.uid = sbr.target_uid
       LEFT JOIN accounts ra ON ra.uid = sbr.requested_by_uid
       LEFT JOIN profiles rp ON rp.uid = sbr.requested_by_uid
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const result = await pool.query(
      `SELECT
         sbr.id,
         sbr.subject_id,
         sbr.target_uid,
         sbr.requested_by_uid,
         sbr.status,
         sbr.reason,
         sbr.request_note,
         sbr.admin_note,
         sbr.resolved_by_uid,
         sbr.resolved_at,
         sbr.created_at,
         sbr.updated_at,
         s.subject_name,
         s.course_name,
         s.kind,
         COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) AS target_name,
         COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS requested_by_name,
         COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS resolved_by_name,
         COALESCE(ta.is_banned, false) AS target_is_banned
       FROM subject_ban_requests sbr
       JOIN subjects s ON s.id = sbr.subject_id
       JOIN accounts ta ON ta.uid = sbr.target_uid
       LEFT JOIN profiles tp ON tp.uid = sbr.target_uid
       LEFT JOIN accounts ra ON ra.uid = sbr.requested_by_uid
       LEFT JOIN profiles rp ON rp.uid = sbr.requested_by_uid
       LEFT JOIN accounts aa ON aa.uid = sbr.resolved_by_uid
       LEFT JOIN profiles ap ON ap.uid = sbr.resolved_by_uid
       ${whereClause}
       ORDER BY sbr.created_at DESC, sbr.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      requests: result.rows.map((row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        subjectName: row.subject_name || '',
        courseName: row.course_name || '',
        subjectKind: row.kind || 'unit',
        targetUid: row.target_uid,
        targetName: row.target_name || row.target_uid || 'Member',
        requestedByUid: row.requested_by_uid || null,
        requestedByName: row.requested_by_name || row.requested_by_uid || 'Staff',
        status: normalizeSubjectBanRequestStatus(row.status, 'open'),
        reason: row.reason || '',
        requestNote: row.request_note || '',
        adminNote: row.admin_note || '',
        resolvedByUid: row.resolved_by_uid || null,
        resolvedByName: row.resolved_by_name || null,
        resolvedAt: row.resolved_at || null,
        targetIsBanned: row.target_is_banned === true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('Admin subject ban requests fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load subject ban requests.' });
  }
});

router.post('/api/admin/subject-ban-requests/:id/resolve', async (req, res) => {
  const requestId = parsePositiveInt(req.params.id);
  const status = normalizeSubjectBanRequestStatus(req.body && req.body.status, '');
  const note = sanitizeText(req.body && req.body.note, 2000);
  if (!requestId) {
    return res.status(400).json({ ok: false, message: 'Invalid ban request id.' });
  }
  if (!['under_review', 'approved_banned', 'rejected'].includes(status)) {
    return res.status(400).json({ ok: false, message: 'Invalid resolution status.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT id, target_uid, status
       FROM subject_ban_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );
    if (!requestResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Ban request not found.' });
    }

    const requestRow = requestResult.rows[0];
    const currentStatus = normalizeSubjectBanRequestStatus(requestRow.status, 'open');
    if (currentStatus === 'approved_banned' || currentStatus === 'rejected') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Ban request is already closed.' });
    }

    if (status === 'approved_banned') {
      const banResult = await banTargetUserFromReport(
        requestRow.target_uid,
        req.adminViewer,
        note || 'Approved from unit/thread ban request'
      );
      if (!banResult.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, message: banResult.message });
      }
    }

    await client.query(
      `UPDATE subject_ban_requests
       SET status = $2,
           admin_note = $3,
           resolved_by_uid = CASE WHEN $2 IN ('approved_banned', 'rejected') THEN $4 ELSE NULL END,
           resolved_at = CASE WHEN $2 IN ('approved_banned', 'rejected') THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1`,
      [requestId, status, note || null, req.adminViewer.uid]
    );

    await client.query('COMMIT');
    return res.json({
      ok: true,
      request: {
        id: requestId,
        status,
        adminNote: note || '',
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback errors
    }
    console.error('Admin subject ban request resolve failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to resolve subject ban request.' });
  } finally {
    client.release();
  }
});

router.post('/api/admin/notifications/custom', async (req, res) => {
  if (!isAdminCustomNotificationEnabled()) {
    return res.status(404).json({ ok: false, message: 'Admin custom notification feature is disabled.' });
  }

  const title = sanitizeText(req.body && req.body.title, 180);
  const message = sanitizeText(req.body && req.body.message, 3000);
  const mode = sanitizeText(req.body && req.body.mode, 30).toLowerCase();
  const course = sanitizeText(req.body && req.body.course, 160);
  const includeBanned = Boolean(req.body && req.body.includeBanned === true);
  const includeSelf = Boolean(req.body && req.body.includeSelf === true);

  if (!title) {
    return res.status(400).json({ ok: false, message: 'Notification title is required.' });
  }
  if (!message) {
    return res.status(400).json({ ok: false, message: 'Notification message is required.' });
  }
  if (!['uids', 'course', 'all'].includes(mode)) {
    return res.status(400).json({ ok: false, message: 'Notification mode must be uids, course, or all.' });
  }

  try {
    const uids = normalizeUidList((req.body && req.body.uids) || []);
    const recipients = await resolveCustomNotificationRecipients({
      mode,
      uids,
      course,
      includeBanned,
    });

    let finalRecipients = recipients;
    if (!includeSelf) {
      finalRecipients = finalRecipients.filter((uid) => uid !== req.adminViewer.uid);
    }
    if (!finalRecipients.length) {
      return res.status(400).json({ ok: false, message: 'No recipients match the current target filter.' });
    }
    if (finalRecipients.length > CUSTOM_NOTIFICATION_MAX_RECIPIENTS) {
      return res.status(400).json({
        ok: false,
        message: `Recipient set is too large. Limit is ${CUSTOM_NOTIFICATION_MAX_RECIPIENTS} users per send.`,
      });
    }

    const result = await createNotificationsForRecipients({
      recipientUids: finalRecipients,
      actorUid: req.adminViewer.uid,
      type: 'admin_custom',
      entityType: 'admin_notice',
      entityId: `${Date.now()}`,
      meta: {
        title,
        message,
        mode,
        course: mode === 'course' ? course : '',
      },
    });

    return res.json({
      ok: true,
      inserted: Number(result.inserted || 0),
      attemptedRecipients: finalRecipients.length,
    });
  } catch (error) {
    console.error('Admin custom notification failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to send custom notifications.' });
  }
});

router.get('/api/admin/professor-codes', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 30, 120);
  const status = sanitizeText(req.query.status, 20).toLowerCase();
  const query = sanitizeText(req.query.q, 200);

  try {
    const where = [];
    const params = [];

    if (status === 'available') {
      where.push(`c.consumed_at IS NULL AND c.is_active = true AND (c.expires_at IS NULL OR c.expires_at > NOW())`);
    } else if (status === 'consumed') {
      where.push(`c.consumed_at IS NOT NULL`);
    } else if (status === 'revoked') {
      where.push(`c.consumed_at IS NULL AND c.is_active = false AND (c.expires_at IS NULL OR c.expires_at > NOW())`);
    } else if (status === 'expired') {
      where.push(`c.consumed_at IS NULL AND c.expires_at IS NOT NULL AND c.expires_at <= NOW()`);
    }

    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(c.source ILIKE $${params.length}
          OR COALESCE(c.created_by_uid, '') ILIKE $${params.length}
          OR COALESCE(c.consumed_by_uid, '') ILIKE $${params.length}
          OR c.id::text ILIKE $${params.length})`
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM professor_registration_codes c
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    const pagedParams = params.slice();
    pagedParams.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
         c.id,
         c.source,
         c.created_by_uid,
         c.consumed_by_uid,
         c.created_at,
         c.expires_at,
         c.consumed_at,
         c.is_active,
         COALESCE(cbp.display_name, cba.display_name, cba.username, cba.email) AS created_by_name,
         COALESCE(cup.display_name, cua.display_name, cua.username, cua.email) AS consumed_by_name
       FROM professor_registration_codes c
       LEFT JOIN accounts cba ON cba.uid = c.created_by_uid
       LEFT JOIN profiles cbp ON cbp.uid = c.created_by_uid
       LEFT JOIN accounts cua ON cua.uid = c.consumed_by_uid
       LEFT JOIN profiles cup ON cup.uid = c.consumed_by_uid
       ${whereClause}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${pagedParams.length - 1} OFFSET $${pagedParams.length}`,
      pagedParams
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      codes: rowsResult.rows.map((row) => ({
        id: Number(row.id),
        source: row.source || 'manual',
        createdByUid: row.created_by_uid || null,
        createdByName: row.created_by_name || null,
        consumedByUid: row.consumed_by_uid || null,
        consumedByName: row.consumed_by_name || null,
        createdAt: row.created_at || null,
        expiresAt: row.expires_at || null,
        consumedAt: row.consumed_at || null,
        isActive: row.is_active === true,
        status: getProfessorCodeStatus(row),
      })),
    });
  } catch (error) {
    console.error('Professor code list fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load professor codes.' });
  }
});

router.post('/api/admin/professor-codes', async (req, res) => {
  const count = clampInteger(req.body && req.body.count, 1, PROFESSOR_SIGNUP_CODE_MAX_BATCH, 1);
  const length = clampInteger(
    req.body && req.body.length,
    PROFESSOR_SIGNUP_CODE_MIN_LENGTH,
    PROFESSOR_SIGNUP_CODE_MAX_LENGTH,
    PROFESSOR_SIGNUP_CODE_DEFAULT_LENGTH
  );
  const expiresInDays = clampInteger(req.body && req.body.expiresInDays, 1, 3650, null);
  const expiresAt = Number.isInteger(expiresInDays)
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    const created = [];
    for (let i = 0; i < count; i += 1) {
      let insertedRow = null;
      let generatedCode = '';

      for (let tries = 0; tries < 8; tries += 1) {
        generatedCode = buildProfessorSignupCode(length);
        const digest = digestProfessorSignupCode(generatedCode);
        const insertResult = await client.query(
          `INSERT INTO professor_registration_codes
            (code_digest, source, created_by_uid, expires_at, is_active, created_at)
           VALUES
            ($1, 'admin_generated', $2, $3, true, NOW())
           ON CONFLICT (code_digest) DO NOTHING
           RETURNING id, created_at, expires_at`,
          [digest, req.adminViewer.uid, expiresAt]
        );
        if (insertResult.rows.length) {
          insertedRow = insertResult.rows[0];
          break;
        }
      }

      if (!insertedRow) {
        throw new Error('Unable to allocate unique professor code. Please retry.');
      }

      created.push({
        id: Number(insertedRow.id),
        code: generatedCode,
        createdAt: insertedRow.created_at,
        expiresAt: insertedRow.expires_at || null,
      });
    }

    await client.query('COMMIT');
    inTransaction = false;

    return res.status(201).json({
      ok: true,
      message: `Generated ${created.length} professor code${created.length === 1 ? '' : 's'}.`,
      created,
    });
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    console.error('Professor code generation failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to generate professor codes.' });
  } finally {
    client.release();
  }
});

router.post('/api/admin/professor-codes/:id/revoke', async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Invalid code id.' });
  }

  try {
    const updateResult = await pool.query(
      `UPDATE professor_registration_codes
       SET is_active = false
       WHERE id = $1
         AND consumed_at IS NULL
         AND is_active = true
       RETURNING id`,
      [id]
    );
    if (updateResult.rows.length) {
      return res.json({ ok: true, message: 'Professor code revoked.' });
    }

    const existing = await pool.query(
      `SELECT id, consumed_at, is_active
       FROM professor_registration_codes
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ ok: false, message: 'Professor code not found.' });
    }
    if (existing.rows[0].consumed_at) {
      return res.status(400).json({ ok: false, message: 'Consumed code cannot be revoked.' });
    }
    return res.json({ ok: true, message: 'Professor code is already revoked.' });
  } catch (error) {
    console.error('Professor code revoke failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to revoke professor code.' });
  }
});

router.post('/api/admin/professor-codes/:id/reactivate', async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Invalid code id.' });
  }

  try {
    const updateResult = await pool.query(
      `UPDATE professor_registration_codes
       SET is_active = true
       WHERE id = $1
         AND consumed_at IS NULL
         AND is_active = false
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [id]
    );
    if (updateResult.rows.length) {
      return res.json({ ok: true, message: 'Professor code reactivated.' });
    }

    const existing = await pool.query(
      `SELECT id, consumed_at, is_active, expires_at
       FROM professor_registration_codes
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ ok: false, message: 'Professor code not found.' });
    }
    const row = existing.rows[0];
    if (row.consumed_at) {
      return res.status(400).json({ ok: false, message: 'Consumed code cannot be reactivated.' });
    }
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, message: 'Expired code cannot be reactivated.' });
    }
    return res.json({ ok: true, message: 'Professor code is already active.' });
  } catch (error) {
    console.error('Professor code reactivate failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reactivate professor code.' });
  }
});

router.get('/api/admin/dep-admin/assignments', async (req, res) => {
  const query = sanitizeText(req.query.q, 200);
  const courseFilter = sanitizeText(req.query.course, 160);

  try {
    const coursesResult = await pool.query(
      `SELECT course_code, course_name
       FROM courses
       ORDER BY lower(course_name) ASC, id ASC`
    );

    const where = [];
    const params = [];
    if (courseFilter) {
      params.push(courseFilter);
      where.push(
        `(lower(cda.course_name) = lower($${params.length})
          OR lower(COALESCE(cda.course_code, '')) = lower($${params.length}))`
      );
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(cda.course_name ILIKE $${params.length}
          OR COALESCE(cda.course_code, '') ILIKE $${params.length}
          OR cda.depadmin_uid ILIKE $${params.length}
          OR COALESCE(da.username, '') ILIKE $${params.length}
          OR da.email ILIKE $${params.length}
          OR COALESCE(dp.display_name, da.display_name, '') ILIKE $${params.length})`
      );
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const assignmentsResult = await pool.query(
      `SELECT
         cda.id,
         cda.course_code,
         cda.course_name,
         cda.depadmin_uid,
         cda.assigned_by_uid,
         cda.created_at,
         cda.updated_at,
         COALESCE(dp.display_name, da.display_name, da.username, da.email) AS depadmin_name,
         da.email AS depadmin_email,
         da.username AS depadmin_username,
         COALESCE(da.platform_role, 'member') AS depadmin_role,
         COALESCE(da.course, '') AS depadmin_course,
         COALESCE(da.is_banned, false) AS depadmin_is_banned,
         COALESCE(ap.display_name, aa.display_name, aa.username, aa.email) AS assigned_by_name
       FROM course_dep_admin_assignments cda
       JOIN accounts da ON da.uid = cda.depadmin_uid
       LEFT JOIN profiles dp ON dp.uid = da.uid
       LEFT JOIN accounts aa ON aa.uid = cda.assigned_by_uid
       LEFT JOIN profiles ap ON ap.uid = aa.uid
       ${whereClause}
       ORDER BY lower(cda.course_name) ASC, cda.id ASC`,
      params
    );

    return res.json({
      ok: true,
      courses: coursesResult.rows.map((row) => ({
        courseCode: row.course_code || null,
        courseName: row.course_name || '',
      })),
      assignments: assignmentsResult.rows.map((row) => ({
        id: Number(row.id),
        courseCode: row.course_code || null,
        courseName: row.course_name || '',
        depAdminUid: row.depadmin_uid || '',
        depAdminName: row.depadmin_name || row.depadmin_uid || '',
        depAdminEmail: row.depadmin_email || '',
        depAdminUsername: row.depadmin_username || '',
        depAdminRole: row.depadmin_role || 'member',
        depAdminCourse: row.depadmin_course || '',
        depAdminIsBanned: row.depadmin_is_banned === true,
        assignedByUid: row.assigned_by_uid || null,
        assignedByName: row.assigned_by_name || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      })),
    });
  } catch (error) {
    console.error('DepAdmin assignments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load DepAdmin assignments.' });
  }
});

router.get('/api/admin/dep-admin/candidates', async (req, res) => {
  const query = sanitizeText(req.query.q, 200);
  const courseFilter = sanitizeText(req.query.course, 160);

  if (!query || query.length < 2) {
    return res.json({ ok: true, candidates: [] });
  }

  try {
    let canonicalCourse = null;
    if (courseFilter) {
      canonicalCourse = await resolveCanonicalCourse(courseFilter);
      if (!canonicalCourse) {
        return res.status(400).json({ ok: false, message: 'Course filter does not match an existing course.' });
      }
    }

    const params = [`%${query}%`];
    const where = [
      `COALESCE(a.platform_role, 'member') <> 'owner'`,
      `COALESCE(a.platform_role, 'member') <> 'admin'`,
      `(
        a.uid ILIKE $1
        OR a.email ILIKE $1
        OR COALESCE(a.username, '') ILIKE $1
        OR COALESCE(p.display_name, a.display_name, '') ILIKE $1
      )`,
    ];
    if (canonicalCourse && canonicalCourse.courseName) {
      params.push(canonicalCourse.courseName);
      where.push(`lower(COALESCE(a.course, '')) = lower($${params.length})`);
    }

    const result = await pool.query(
      `SELECT
         a.uid,
         a.email,
         a.username,
         COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name,
         COALESCE(a.course, '') AS course,
         COALESCE(a.platform_role, 'member') AS platform_role,
         COALESCE(a.is_banned, false) AS is_banned,
         COALESCE((
           SELECT array_agg(cda.course_name ORDER BY cda.course_name)
           FROM course_dep_admin_assignments cda
           WHERE cda.depadmin_uid = a.uid
         ), ARRAY[]::text[]) AS assigned_courses
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN COALESCE(a.platform_role, 'member') = 'depadmin' THEN 0 ELSE 1 END,
         lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) ASC
       LIMIT 30`,
      params
    );

    return res.json({
      ok: true,
      candidates: result.rows.map((row) => ({
        uid: row.uid,
        email: row.email || '',
        username: row.username || '',
        displayName: row.display_name || '',
        course: row.course || '',
        role: row.platform_role || 'member',
        isBanned: row.is_banned === true,
        assignedCourses: Array.isArray(row.assigned_courses) ? row.assigned_courses : [],
      })),
    });
  } catch (error) {
    console.error('DepAdmin candidate search failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to search DepAdmin candidates.' });
  }
});

router.post('/api/admin/dep-admin/assignments', async (req, res) => {
  const courseInput = sanitizeText(req.body && req.body.courseName, 160);
  const accountQueryInput = sanitizeText(req.body && req.body.accountQuery, 200);
  const targetUidInput = sanitizeText(req.body && req.body.targetUid, 120);

  if (!courseInput) {
    return res.status(400).json({ ok: false, message: 'Course is required.' });
  }
  if (!accountQueryInput && !targetUidInput) {
    return res.status(400).json({ ok: false, message: 'Target account is required.' });
  }

  const client = await pool.connect();
  try {
    const course = await resolveCanonicalCourse(courseInput, client);
    if (!course) {
      return res.status(400).json({ ok: false, message: 'Course does not exist.' });
    }

    let targetAccount = null;
    if (targetUidInput) {
      const targetResult = await client.query(
        `SELECT
           a.uid,
           a.email,
           a.username,
           COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name,
           a.course,
           COALESCE(a.platform_role, 'member') AS platform_role,
           COALESCE(a.is_banned, false) AS is_banned
         FROM accounts a
         LEFT JOIN profiles p ON p.uid = a.uid
         WHERE a.uid = $1
         LIMIT 1`,
        [targetUidInput]
      );
      targetAccount = targetResult.rows[0] ? mapDepAdminAccountRow(targetResult.rows[0]) : null;
      if (!targetAccount) {
        return res.status(404).json({ ok: false, message: 'Target account not found.' });
      }
    } else {
      const resolved = await resolveDepAdminAccount(accountQueryInput, client);
      if (resolved.ambiguous) {
        return res.status(409).json({
          ok: false,
          message: 'Multiple accounts match this query. Use a more specific UID/username/email.',
          candidates: resolved.candidates || [],
        });
      }
      targetAccount = resolved.account;
      if (!targetAccount) {
        return res.status(404).json({ ok: false, message: 'Target account not found.' });
      }
    }

    if (targetAccount.isBanned) {
      return res.status(400).json({ ok: false, message: 'Cannot assign a banned account as DepAdmin.' });
    }
    if (targetAccount.role === 'owner' || targetAccount.role === 'admin') {
      return res.status(400).json({ ok: false, message: 'Owner/Admin accounts do not need DepAdmin assignment.' });
    }
    const targetAccountCourseRaw = sanitizeText(targetAccount.course, 160);
    const targetCanonicalCourse = targetAccountCourseRaw
      ? await resolveCanonicalCourse(targetAccountCourseRaw, client)
      : null;
    const courseMatches = targetCanonicalCourse
      ? targetCanonicalCourse.courseName.toLowerCase() === course.courseName.toLowerCase()
      : (
        targetAccountCourseRaw &&
        (
          targetAccountCourseRaw.toLowerCase() === course.courseName.toLowerCase() ||
          (course.courseCode && targetAccountCourseRaw.toLowerCase() === String(course.courseCode).toLowerCase())
        )
      );
    if (!courseMatches) {
      return res.status(400).json({
        ok: false,
        message: 'Target account must belong to the selected course.',
      });
    }

    await client.query('BEGIN');
    const previousAssignmentResult = await client.query(
      `SELECT id, depadmin_uid
       FROM course_dep_admin_assignments
       WHERE course_name = $1
       LIMIT 1
       FOR UPDATE`,
      [course.courseName]
    );
    const previousDepAdminUid = previousAssignmentResult.rows[0]
      ? previousAssignmentResult.rows[0].depadmin_uid
      : null;

    await client.query(
      `UPDATE accounts
       SET platform_role = 'depadmin'
       WHERE uid = $1
         AND COALESCE(platform_role, 'member') NOT IN ('owner', 'admin')`,
      [targetAccount.uid]
    );

    const upsertResult = await client.query(
      `INSERT INTO course_dep_admin_assignments
         (course_code, course_name, depadmin_uid, assigned_by_uid, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (course_name)
       DO UPDATE
         SET course_code = EXCLUDED.course_code,
             depadmin_uid = EXCLUDED.depadmin_uid,
             assigned_by_uid = EXCLUDED.assigned_by_uid,
             updated_at = NOW()
       RETURNING id, course_code, course_name, depadmin_uid, assigned_by_uid, created_at, updated_at`,
      [course.courseCode || null, course.courseName, targetAccount.uid, req.adminViewer.uid]
    );

    if (previousDepAdminUid && previousDepAdminUid !== targetAccount.uid) {
      await maybeDowngradeDepAdminAfterUnassign(previousDepAdminUid, client);
    }

    await client.query('COMMIT');

    const assignment = upsertResult.rows[0];
    return res.status(201).json({
      ok: true,
      message: `DepAdmin assigned for ${course.courseName}.`,
      assignment: {
        id: Number(assignment.id),
        courseCode: assignment.course_code || null,
        courseName: assignment.course_name || '',
        depAdminUid: assignment.depadmin_uid || '',
        depAdminName: targetAccount.displayName || targetAccount.uid,
        depAdminEmail: targetAccount.email || '',
        depAdminUsername: targetAccount.username || '',
        assignedByUid: assignment.assigned_by_uid || null,
        createdAt: assignment.created_at || null,
        updatedAt: assignment.updated_at || null,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // ignore rollback error, original error is more useful
    }
    console.error('DepAdmin assignment failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to assign DepAdmin.' });
  } finally {
    client.release();
  }
});

router.delete('/api/admin/dep-admin/assignments/:id', async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Invalid assignment id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT id, course_name, depadmin_uid
       FROM course_dep_admin_assignments
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    if (!existingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'DepAdmin assignment not found.' });
    }
    const existing = existingResult.rows[0];

    await client.query(
      `DELETE FROM course_dep_admin_assignments
       WHERE id = $1`,
      [id]
    );

    await maybeDowngradeDepAdminAfterUnassign(existing.depadmin_uid, client);
    await client.query('COMMIT');

    return res.json({
      ok: true,
      message: `DepAdmin assignment removed for ${existing.course_name || 'course'}.`,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // ignore rollback error
    }
    console.error('DepAdmin assignment delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to remove DepAdmin assignment.' });
  } finally {
    client.release();
  }
});

router.get('/api/admin/accounts', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 30, 120);
  const requestedRole = sanitizeText(req.query.role, 30).toLowerCase();
  const role = requestedRole === 'student' ? 'member' : requestedRole;
  const status = sanitizeText(req.query.status, 40).toLowerCase();
  const course = sanitizeText(req.query.course, 120);
  const query = sanitizeText(req.query.q, 200);

  try {
    const where = [];
    const params = [];

    if (role && ['owner', 'admin', 'depadmin', 'professor', 'member'].includes(role)) {
      params.push(role);
      where.push(`COALESCE(a.platform_role, 'member') = $${params.length}`);
    }

    if (status === 'banned') {
      where.push(`COALESCE(a.is_banned, false) = true`);
    } else if (status === 'verification-pending') {
      where.push(`COALESCE(a.id_verification_status, 'pending') = 'pending'`);
    } else if (status === 'verification-rejected') {
      where.push(`COALESCE(a.id_verification_status, 'pending') = 'rejected'`);
    } else if (status === 'verification-approved') {
      where.push(`COALESCE(a.id_verification_status, 'pending') = 'approved'`);
    } else if (status === 'verified') {
      where.push(
        `COALESCE(a.is_banned, false) = false
         AND COALESCE(a.email_verified, false) = true
         AND COALESCE(a.id_verification_status, 'pending') = 'approved'`
      );
    } else if (status === 'non-verified') {
      where.push(`COALESCE(a.is_banned, false) = false AND COALESCE(a.email_verified, false) = false`);
    }

    if (course) {
      params.push(course);
      where.push(`a.course = $${params.length}`);
    }

    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(a.uid ILIKE $${params.length}
          OR COALESCE(a.username, '') ILIKE $${params.length}
          OR COALESCE(a.display_name, '') ILIKE $${params.length}
          OR COALESCE(p.display_name, '') ILIKE $${params.length}
          OR a.email ILIKE $${params.length})`
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        a.uid,
        a.username,
        a.display_name,
        p.display_name AS profile_display_name,
        a.email,
        COALESCE(a.platform_role, 'member') AS platform_role,
        a.recovery_email,
        a.datecreated,
        COALESCE(a.email_verified, false) AS email_verified,
        COALESCE(a.is_banned, false) AS is_banned,
        COALESCE(a.id_verification_status, 'pending') AS id_verification_status,
        COALESCE(a.id_verification_note, '') AS id_verification_note,
        COALESCE(a.student_number, '') AS student_number,
        COALESCE(a.gender, '') AS gender,
        a.content_preference,
        a.course,
        a.id_verified_by_uid,
        a.id_verified_at,
        COALESCE(vp.display_name, va.display_name, va.username, va.email, '') AS id_verified_by_name
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       LEFT JOIN accounts va ON va.uid = a.id_verified_by_uid
       LEFT JOIN profiles vp ON vp.uid = a.id_verified_by_uid
       ${whereClause}
       ORDER BY a.datecreated DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      accounts: rowsResult.rows.map((row) => {
        let derivedStatus = 'non-verified';
        if (row.is_banned === true) {
          derivedStatus = 'banned';
        } else if (row.email_verified !== true) {
          derivedStatus = 'non-verified';
        } else if ((row.id_verification_status || 'pending') === 'approved') {
          derivedStatus = 'verified';
        } else if ((row.id_verification_status || 'pending') === 'rejected') {
          derivedStatus = 'verification-rejected';
        } else {
          derivedStatus = 'verification-pending';
        }
        return {
          uid: row.uid,
          username: row.username || '',
          displayName: row.profile_display_name || row.display_name || '',
          email: row.email,
          userType: row.platform_role || 'member',
          emailVerified: row.email_verified === true,
          recoveryEmail: row.recovery_email || '',
          status: derivedStatus,
          idVerificationStatus: row.id_verification_status || 'pending',
          idVerificationNote: row.id_verification_note || '',
          idVerifiedByUid: row.id_verified_by_uid || '',
          idVerifiedByName: row.id_verified_by_name || '',
          idVerifiedAt: row.id_verified_at || null,
          studentNumber: row.student_number || '',
          gender: row.gender || '',
          contentPreference: row.content_preference || {},
          course: row.course || '',
          dateRegistered: row.datecreated,
        };
      }),
    });
  } catch (error) {
    console.error('Admin accounts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load accounts.' });
  }
});

router.patch('/api/admin/accounts/:uid/role', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);
  const role = sanitizeText(req.body && req.body.role, 30).toLowerCase();

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (!['member', 'admin', 'depadmin', 'professor'].includes(role)) {
    return res.status(400).json({ ok: false, message: 'Role must be member, professor, depadmin, or admin.' });
  }
  if (req.adminViewer.platform_role !== 'owner') {
    return res.status(403).json({ ok: false, message: 'Only owner can change platform roles.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'Cannot change your own role.' });
  }

  try {
    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    if (targetResult.rows[0].platform_role === 'owner') {
      return res.status(403).json({ ok: false, message: 'Owner role cannot be modified.' });
    }

    await pool.query(
      `UPDATE accounts
       SET platform_role = $1
       WHERE uid = $2`,
      [role, targetUid]
    );
    if (role !== 'depadmin') {
      await pool.query(
        `DELETE FROM course_dep_admin_assignments
         WHERE depadmin_uid = $1`,
        [targetUid]
      );
    }

    return res.json({ ok: true, message: `Role updated to ${role}.` });
  } catch (error) {
    console.error('Admin role update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update role.' });
  }
});

router.post('/api/admin/accounts/:uid/transfer-ownership', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);
  const transferToken = sanitizeText(req.body && req.body.transferToken, 40).toUpperCase();

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (req.adminViewer.platform_role !== 'owner') {
    return res.status(403).json({ ok: false, message: 'Only owner can transfer ownership.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'You already own this account.' });
  }
  if (transferToken !== 'TRANSFER') {
    return res.status(400).json({ ok: false, message: 'Transfer confirmation token is invalid.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentOwnerResult = await client.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [req.adminViewer.uid]
    );
    if (!currentOwnerResult.rows.length || currentOwnerResult.rows[0].platform_role !== 'owner') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Current account is no longer owner.' });
    }

    const targetResult = await client.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    const target = targetResult.rows[0];
    if (target.is_banned === true) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Cannot transfer ownership to a banned account.' });
    }
    if (target.platform_role === 'owner') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Target account is already owner.' });
    }

    await client.query(
      `UPDATE accounts
       SET platform_role = CASE
         WHEN uid = $1 THEN 'owner'
         WHEN uid = $2 THEN 'admin'
         ELSE platform_role
       END
       WHERE uid IN ($1, $2)`,
      [targetUid, req.adminViewer.uid]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Ownership transferred successfully.' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // ignore rollback errors
    }
    console.error('Admin ownership transfer failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to transfer ownership.' });
  } finally {
    client.release();
  }
});

router.patch('/api/admin/accounts/:uid/ban', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);
  const reason = sanitizeText(req.body && req.body.reason, 600);
  const banned = Boolean(req.body && req.body.banned);

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'Cannot change your own ban status.' });
  }

  try {
    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    const target = targetResult.rows[0];

    if (target.platform_role === 'owner') {
      return res.status(403).json({ ok: false, message: 'Owner account cannot be banned.' });
    }
    if (req.adminViewer.platform_role === 'admin' && target.platform_role !== 'member') {
      return res.status(403).json({ ok: false, message: 'Admins cannot ban owner/admin accounts.' });
    }

    if (banned) {
      if (target.is_banned === true) {
        return res.json({ ok: true, message: 'Account is already banned.' });
      }
      await pool.query(
        `UPDATE accounts
         SET is_banned = true,
             banned_at = NOW(),
             banned_reason = $1,
             banned_by_uid = $2
         WHERE uid = $3`,
        [reason || null, req.adminViewer.uid, targetUid]
      );
      await recordDisciplinaryAction({
        targetUid,
        issuedByUid: req.adminViewer.uid,
        actionType: 'ban',
        reason: reason || 'Banned by admin action',
        active: true,
      });
      await deleteSessionsForUid(targetUid);
      return res.json({ ok: true, message: 'Account banned.' });
    }

    await pool.query(
      `UPDATE accounts
       SET is_banned = false,
           banned_at = NULL,
           banned_reason = NULL,
           banned_by_uid = NULL
       WHERE uid = $1`,
      [targetUid]
    );
    await pool.query(
      `UPDATE account_disciplinary_actions
       SET
         active = false,
         revoked_at = NOW(),
         revoked_by_uid = $2,
         revoked_reason = $3
       WHERE target_uid = $1
         AND action_type IN ('ban', 'suspend')
         AND active = true`,
      [targetUid, req.adminViewer.uid, 'Account unbanned by admin']
    );
    return res.json({ ok: true, message: 'Account unbanned.' });
  } catch (error) {
    console.error('Admin ban update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update ban status.' });
  }
});

router.delete('/api/admin/accounts/:uid', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'Cannot delete your own account.' });
  }

  try {
    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    const target = targetResult.rows[0];

    if (target.platform_role === 'owner') {
      return res.status(403).json({ ok: false, message: 'Owner account cannot be deleted.' });
    }
    if (req.adminViewer.platform_role === 'admin' && target.platform_role !== 'member') {
      return res.status(403).json({ ok: false, message: 'Admins can only delete member accounts.' });
    }

    await cleanupMongoDataForAccount(targetUid);
    await pool.query('DELETE FROM accounts WHERE uid = $1', [targetUid]);
    await deleteSessionsForUid(targetUid);

    return res.json({ ok: true, message: 'Account deleted.' });
  } catch (error) {
    console.error('Admin account delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete account.' });
  }
});

router.get('/api/admin/communities', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, course_name, description
       FROM communities
       ORDER BY lower(course_name) ASC`
    );
    return res.json({
      ok: true,
      communities: result.rows.map((row) => ({
        id: Number(row.id),
        courseName: row.course_name,
        description: row.description || '',
      })),
    });
  } catch (error) {
    console.error('Admin communities fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load communities.' });
  }
});

router.patch('/api/admin/communities/:id/details', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  const description = sanitizeText(req.body && req.body.description, 4000);

  try {
    const result = await pool.query(
      `UPDATE communities
       SET description = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, course_name, description`,
      [communityId, description || null]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }
    const community = result.rows[0];
    return res.json({
      ok: true,
      community: {
        id: Number(community.id),
        courseName: community.course_name,
        description: community.description || '',
      },
    });
  } catch (error) {
    console.error('Admin community details update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update community details.' });
  }
});

router.post('/api/admin/communities/:id/moderators/:uid', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  const action = sanitizeText(req.body && req.body.action, 20).toLowerCase();

  if (!communityId || !targetUid || !['assign', 'remove'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Invalid moderator action payload.' });
  }

  try {
    const communityResult = await pool.query('SELECT id FROM communities WHERE id = $1 LIMIT 1', [communityId]);
    if (!communityResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }

    const target = targetResult.rows[0];
    if (target.platform_role === 'owner' || target.platform_role === 'admin') {
      return res.status(400).json({ ok: false, message: 'Owner/admin accounts cannot be assigned as moderators.' });
    }

    if (action === 'assign') {
      await pool.query(
        `INSERT INTO community_roles (community_id, user_uid, role, assigned_by_uid)
         VALUES ($1, $2, 'moderator', $3)
         ON CONFLICT (community_id, user_uid, role) DO NOTHING`,
        [communityId, targetUid, req.adminViewer.uid]
      );
      await pool.query(
        `INSERT INTO community_memberships
          (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
         VALUES
          ($1, $2, 'member', NOW(), NULL, NULL, NOW())
         ON CONFLICT (community_id, user_uid)
         DO UPDATE SET state = 'member', joined_at = COALESCE(community_memberships.joined_at, NOW()), left_at = NULL, banned_at = NULL, updated_at = NOW()`,
        [communityId, targetUid]
      );
      return res.json({ ok: true, message: 'Moderator assigned.' });
    }

    await pool.query(
      `DELETE FROM community_roles
       WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'`,
      [communityId, targetUid]
    );
    return res.json({ ok: true, message: 'Moderator removed.' });
  } catch (error) {
    console.error('Admin moderator action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update moderator role.' });
  }
});

router.get('/api/admin/content/main-posts', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);

  try {
    const db = await getMongoDb();
    const filter = {};
    if (course) {
      filter.course = course;
    }
    if (query) {
      filter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
      ];
    }

    const postsCollection = db.collection('posts');
    const total = await postsCollection.countDocuments(filter);
    const posts = await postsCollection
      .find(filter)
      .sort({ uploadDate: -1 })
      .skip(offset)
      .limit(pageSize)
      .toArray();

    const uploaderUids = posts.map((post) => post.uploaderUid).filter(Boolean);
    const namesMap = await loadDisplayNamesByUid(uploaderUids);

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      posts: posts.map((post) => ({
        id: String(post._id),
        title: post.title || '',
        content: post.content || '',
        course: post.course || null,
        visibility: post.visibility || 'public',
        likesCount: Number(post.likesCount || 0),
        commentsCount: Number(post.commentsCount || 0),
        uploaderUid: post.uploaderUid || null,
        uploaderName: namesMap.get(post.uploaderUid) || post.uploader?.displayName || 'Member',
        createdAt: post.uploadDate || null,
      })),
    });
  } catch (error) {
    console.error('Admin main posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load main feed posts.' });
  }
});

router.delete('/api/admin/content/main-posts/:id', async (req, res) => {
  const id = sanitizeText(req.params.id, 80);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const removed = await deleteMainPostById(id, req.adminViewer && req.adminViewer.uid ? req.adminViewer.uid : req.user.uid, 'Removed by admin moderation');
    if (!removed) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    const db = await getMongoDb();
    await db.collection('admin_report_actions').deleteMany({ source: 'main_post', targetId: id });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete main post failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete post.' });
  }
});

router.get('/api/admin/content/main-comments', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);

  try {
    const db = await getMongoDb();
    const filter = {};
    if (query) {
      filter.content = { $regex: query, $options: 'i' };
    }

    const commentsCollection = db.collection('post_comments');
    const total = await commentsCollection.countDocuments(filter);
    const comments = await commentsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(pageSize)
      .toArray();

    const postIds = Array.from(new Set(comments.map((item) => String(item.postId)).filter(Boolean))).map(
      (value) => new ObjectId(value)
    );
    const posts = await db
      .collection('posts')
      .find({ _id: { $in: postIds } })
      .project({ _id: 1, title: 1, course: 1 })
      .toArray();
    const postMap = new Map(posts.map((post) => [String(post._id), post]));

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      comments: comments.map((comment) => {
        const post = postMap.get(String(comment.postId));
        return {
          id: String(comment._id),
          postId: String(comment.postId),
          postTitle: post ? post.title || 'Untitled post' : 'Unknown post',
          postCourse: post ? post.course || null : null,
          content: comment.content || '',
          authorUid: comment.userUid || null,
          authorName: comment.displayName || 'Member',
          createdAt: comment.createdAt || null,
        };
      }),
    });
  } catch (error) {
    console.error('Admin main comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load post comments.' });
  }
});

router.delete('/api/admin/content/main-comments/:id', async (req, res) => {
  const id = sanitizeText(req.params.id, 80);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid comment id.' });
  }

  try {
    const db = await getMongoDb();
    const commentsCollection = db.collection('post_comments');
    const postsCollection = db.collection('posts');
    const commentId = new ObjectId(id);
    const comment = await commentsCollection.findOne({ _id: commentId });
    if (!comment) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    await commentsCollection.deleteOne({ _id: commentId });
    if (comment.postId) {
      const postId = comment.postId instanceof ObjectId ? comment.postId : new ObjectId(String(comment.postId));
      const nextCount = await commentsCollection.countDocuments({ postId });
      await postsCollection.updateOne({ _id: postId }, { $set: { commentsCount: nextCount } });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete main comment failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete comment.' });
  }
});

router.get('/api/admin/content/community-posts', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);
  const status = sanitizeText(req.query.status, 20).toLowerCase();

  try {
    const where = [];
    const params = [];
    if (query) {
      params.push(`%${query}%`);
      where.push(`(cp.title ILIKE $${params.length} OR cp.content ILIKE $${params.length})`);
    }
    if (course) {
      params.push(course);
      where.push(`c.course_name = $${params.length}`);
    }
    if (status && ['active', 'taken_down'].includes(status)) {
      params.push(status);
      where.push(`cp.status = $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM community_posts cp
       JOIN communities c ON c.id = cp.community_id
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        cp.id,
        cp.community_id,
        cp.title,
        cp.content,
        cp.status,
        cp.likes_count,
        cp.created_at,
        cp.taken_down_reason,
        c.course_name,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS author_name,
        cp.author_uid
       FROM community_posts cp
       JOIN communities c ON c.id = cp.community_id
       JOIN accounts a ON a.uid = cp.author_uid
       LEFT JOIN profiles p ON p.uid = cp.author_uid
       ${whereClause}
       ORDER BY cp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      posts: rowsResult.rows.map((row) => ({
        id: Number(row.id),
        communityId: Number(row.community_id),
        title: row.title || '',
        content: row.content || '',
        status: row.status,
        likesCount: Number(row.likes_count || 0),
        course: row.course_name || null,
        authorUid: row.author_uid,
        authorName: row.author_name || 'Member',
        takenDownReason: row.taken_down_reason || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin community posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load community posts.' });
  }
});

router.post('/api/admin/content/community-posts/:id/takedown', async (req, res) => {
  const postId = parsePositiveInt(req.params.id);
  const reason = sanitizeText(req.body && req.body.reason, 600);
  if (!postId) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    if (isRestrictedContentsEnabled()) {
      const restricted = await restrictCommunityPostById(
        postId,
        req.adminViewer.uid,
        reason || 'Taken down by admin'
      );
      if (!restricted) {
        return res.status(404).json({ ok: false, message: 'Community post not found.' });
      }
      const queueEntry = await upsertRestrictedQueueEntry({
        source: restricted.source,
        reportKey: null,
        targetType: restricted.targetType,
        targetId: restricted.targetId,
        targetUid: restricted.targetUid,
        course: restricted.course || null,
        reason: reason || 'Taken down by admin',
        metadata: {
          title: restricted.title || null,
          moderationSource: 'content_manager',
        },
        hiddenByUid: req.adminViewer.uid,
      });
      return res.json({
        ok: true,
        restrictedQueueId: queueEntry ? Number(queueEntry.id) : null,
      });
    }

    const result = await pool.query(
      `UPDATE community_posts
       SET status = 'taken_down',
           taken_down_by_uid = $2,
           taken_down_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [postId, req.adminViewer.uid, reason || 'Taken down by admin']
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community post not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin community post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down community post.' });
  }
});

router.get('/api/admin/content/community-comments', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);
  const status = sanitizeText(req.query.status, 20).toLowerCase();

  try {
    const where = [];
    const params = [];
    if (query) {
      params.push(`%${query}%`);
      where.push(`cc.content ILIKE $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`c.course_name = $${params.length}`);
    }
    if (status && ['active', 'taken_down'].includes(status)) {
      params.push(status);
      where.push(`cc.status = $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM community_comments cc
       JOIN community_posts cp ON cp.id = cc.post_id
       JOIN communities c ON c.id = cc.community_id
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        cc.id,
        cc.post_id,
        cc.community_id,
        cc.content,
        cc.status,
        cc.created_at,
        cc.taken_down_reason,
        cp.title AS post_title,
        c.course_name,
        cc.author_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS author_name
       FROM community_comments cc
       JOIN community_posts cp ON cp.id = cc.post_id
       JOIN communities c ON c.id = cc.community_id
       JOIN accounts a ON a.uid = cc.author_uid
       LEFT JOIN profiles p ON p.uid = cc.author_uid
       ${whereClause}
       ORDER BY cc.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      comments: rowsResult.rows.map((row) => ({
        id: Number(row.id),
        postId: Number(row.post_id),
        communityId: Number(row.community_id),
        content: row.content || '',
        status: row.status,
        postTitle: row.post_title || 'Untitled post',
        course: row.course_name || null,
        authorUid: row.author_uid,
        authorName: row.author_name || 'Member',
        takenDownReason: row.taken_down_reason || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin community comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load community comments.' });
  }
});

router.post('/api/admin/content/community-comments/:id/takedown', async (req, res) => {
  const commentId = parsePositiveInt(req.params.id);
  const reason = sanitizeText(req.body && req.body.reason, 600);
  if (!commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid comment id.' });
  }

  try {
    if (isRestrictedContentsEnabled()) {
      const restricted = await restrictCommunityCommentById(
        commentId,
        req.adminViewer.uid,
        reason || 'Taken down by admin'
      );
      if (!restricted) {
        return res.status(404).json({ ok: false, message: 'Community comment not found.' });
      }
      const queueEntry = await upsertRestrictedQueueEntry({
        source: restricted.source,
        reportKey: null,
        targetType: restricted.targetType,
        targetId: restricted.targetId,
        targetUid: restricted.targetUid,
        course: restricted.course || null,
        reason: reason || 'Taken down by admin',
        metadata: {
          title: restricted.title || null,
          moderationSource: 'content_manager',
        },
        hiddenByUid: req.adminViewer.uid,
      });
      return res.json({
        ok: true,
        restrictedQueueId: queueEntry ? Number(queueEntry.id) : null,
      });
    }

    const result = await pool.query(
      `UPDATE community_comments
       SET status = 'taken_down',
           taken_down_by_uid = $2,
           taken_down_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [commentId, req.adminViewer.uid, reason || 'Taken down by admin']
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community comment not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin community comment takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down community comment.' });
  }
});

router.get('/api/admin/content/library-documents', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);

  try {
    const where = [];
    const params = [];
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(d.title ILIKE $${params.length}
          OR d.filename ILIKE $${params.length}
          OR d.subject ILIKE $${params.length}
          OR COALESCE(d.description, '') ILIKE $${params.length})`
      );
    }
    if (course) {
      params.push(course);
      where.push(`d.course = $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM documents d
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        d.uuid,
        d.title,
        d.filename,
        d.course,
        d.subject,
        d.visibility,
        d.views,
        d.popularity,
        d.uploaddate,
        d.link,
        d.thumbnail_link,
        d.uploader_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
       FROM documents d
       JOIN accounts a ON a.uid = d.uploader_uid
       LEFT JOIN profiles p ON p.uid = d.uploader_uid
       ${whereClause}
       ORDER BY d.uploaddate DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      documents: rowsResult.rows.map((row) => ({
        uuid: row.uuid,
        title: row.title || '',
        filename: row.filename || '',
        course: row.course || '',
        subject: row.subject || '',
        visibility: row.visibility || 'public',
        views: Number(row.views || 0),
        popularity: Number(row.popularity || 0),
        uploaderUid: row.uploader_uid,
        uploaderName: row.uploader_name || 'Member',
        uploadedAt: row.uploaddate,
      })),
    });
  } catch (error) {
    console.error('Admin library documents fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load library documents.' });
  }
});

router.delete('/api/admin/content/library-documents/:uuid', async (req, res) => {
  const uuid = sanitizeText(req.params.uuid, 120);
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Invalid document id.' });
  }

  try {
    const removed = await deleteLibraryDocumentByUuid(
      uuid,
      req.adminViewer && req.adminViewer.uid ? req.adminViewer.uid : req.user.uid,
      'Removed by admin moderation'
    );
    if (!removed) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    const db = await getMongoDb();
    await db.collection('document_reports').deleteMany({ documentUuid: uuid });
    await db.collection('admin_report_actions').deleteMany({ source: 'library_document', targetId: uuid });

    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete library document failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete document.' });
  }
});

router.get('/api/admin/site-pages/:slug', async (req, res) => {
  const slug = normalizeSitePageSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, message: 'Invalid page slug.' });
  }

  try {
    await ensureSitePagesReady();
    const result = await pool.query(
      `SELECT slug, title, subtitle, body, updated_by_uid, updated_at
       FROM site_page_content
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    const page = await resolveMobileAppBodyAssets(normalizeSitePageResult(slug, result.rows[0] || null));
    return res.json({ ok: true, page });
  } catch (error) {
    console.error('Admin site page fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load site page content.' });
  }
});

router.patch('/api/admin/site-pages/:slug', async (req, res) => {
  const slug = normalizeSitePageSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, message: 'Invalid page slug.' });
  }

  const defaultPage = getDefaultSitePage(slug);
  const title = sanitizeText(req.body && req.body.title, 180) || defaultPage.title;
  const subtitle = sanitizeText(req.body && req.body.subtitle, 500);
  const body = normalizeSitePageBody(slug, (req.body && req.body.body) || {});

  if (slug === 'faq' && (!Array.isArray(body.items) || !body.items.length)) {
    return res.status(400).json({ ok: false, message: 'FAQ requires at least one item.' });
  }

  try {
    await ensureSitePagesReady();
    const result = await pool.query(
      `INSERT INTO site_page_content (slug, title, subtitle, body, updated_by_uid, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (slug)
       DO UPDATE SET
         title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle,
         body = EXCLUDED.body,
         updated_by_uid = EXCLUDED.updated_by_uid,
         updated_at = NOW()
       RETURNING slug, title, subtitle, body, updated_by_uid, updated_at`,
      [slug, title, subtitle, JSON.stringify(body), req.adminViewer.uid]
    );
    const page = await resolveMobileAppBodyAssets(normalizeSitePageResult(slug, result.rows[0] || null));
    return res.json({ ok: true, page });
  } catch (error) {
    console.error('Admin site page update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update site page content.' });
  }
});

function isRestrictedPurgeWorkerEnabled() {
  const raw = String(process.env.RESTRICTED_PURGE_JOB_ENABLED || 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off', 'disabled'].includes(raw);
}

let restrictedPurgeWorkerStarted = false;

function startRestrictedPurgeWorker() {
  if (restrictedPurgeWorkerStarted) return;
  restrictedPurgeWorkerStarted = true;
  if (!isRestrictedContentsEnabled() || !isRestrictedPurgeWorkerEnabled()) return;

  const run = async () => {
    try {
      const outcome = await purgeExpiredRestrictedContents({ actorUid: null, limit: 300 });
      if (outcome.purged > 0) {
        console.log(`[admin] Purged ${outcome.purged} expired restricted content item(s).`);
      }
    } catch (error) {
      console.error('Restricted purge worker iteration failed:', error);
    }
  };

  setTimeout(run, 20 * 1000);
  const timer = setInterval(run, RESTRICTED_PURGE_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

startRestrictedPurgeWorker();

module.exports = router;
