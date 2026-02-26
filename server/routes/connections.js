const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getSignedUrl, uploadToStorage } = require('../services/storage');
const { sendPushToUsers } = require('../services/pushService');

const router = express.Router();
const MESSAGE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MESSAGE_ATTACHMENT_MAX_BYTES },
});

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const ACTIVE_WINDOW_MINUTES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const rateBuckets = new Map();
let ensureTablesPromise = null;

function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePagination(req, { defaultPage = 1, defaultPageSize = 20, maxPageSize = 50 } = {}) {
  const page = Math.max(Number(req.query.page || defaultPage), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || defaultPageSize), 1), maxPageSize);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function canProceedRateLimit(uid, action, limitPerWindow) {
  const key = `${uid}:${action}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, startedAt: now });
    return true;
  }

  if (bucket.count >= limitPerWindow) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function enforceRateLimit(req, res, action, limitPerWindow) {
  const uid = req.user && req.user.uid;
  if (!uid) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return false;
  }

  if (!canProceedRateLimit(uid, action, limitPerWindow)) {
    res.status(429).json({ ok: false, message: 'Too many requests. Please try again shortly.' });
    return false;
  }

  return true;
}

async function signPhotoIfNeeded(photoLink) {
  if (!photoLink) return null;
  if (photoLink.startsWith('http')) return photoLink;
  try {
    return await getSignedUrl(photoLink, SIGNED_TTL);
  } catch (error) {
    console.error('Photo signing failed:', error);
    return null;
  }
}

async function signChatAttachmentIfNeeded(attachment) {
  if (!attachment || !attachment.type) return null;
  const normalizedType = attachment.type === 'video' ? 'video' : 'image';
  const key = attachment.key || null;
  let link = attachment.link || null;

  if (key && !String(key).startsWith('http')) {
    try {
      link = await getSignedUrl(key, SIGNED_TTL);
    } catch (error) {
      console.error('Chat attachment signing failed:', error);
      link = null;
    }
  } else if (key && String(key).startsWith('http')) {
    link = key;
  }

  return {
    type: normalizedType,
    key,
    link,
    filename: attachment.filename || null,
    mimeType: attachment.mimeType || null,
    sizeBytes: Number.isInteger(attachment.sizeBytes) ? attachment.sizeBytes : null,
  };
}

function formatReplySnippet(body) {
  if (!body) return '';
  const compact = String(body).replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

async function mapChatMessageRow(row) {
  const isDeleted = row.deleted_at != null;
  const attachment = isDeleted
    ? null
    : await signChatAttachmentIfNeeded({
        type: row.attachment_type || null,
        key: row.attachment_key || null,
        link: row.attachment_link || null,
        filename: row.attachment_filename || null,
        mimeType: row.attachment_mime_type || null,
        sizeBytes: row.attachment_size_bytes != null ? Number(row.attachment_size_bytes) : null,
      });

  const replyTo = row.parent_message_id
    ? {
        id: Number(row.parent_message_id),
        senderUid: row.parent_sender_uid || null,
        senderName: row.parent_sender_name || 'Member',
        bodySnippet: row.parent_deleted_at ? '[Message deleted]' : formatReplySnippet(row.parent_body),
      }
    : null;

  const senderName = row.sender_name || 'Member';
  return {
    id: Number(row.id),
    threadId: Number(row.thread_id),
    senderUid: row.sender_uid,
    senderName,
    senderPhotoLink: await signPhotoIfNeeded(row.sender_photo_link),
    body: isDeleted ? `${senderName} deleted a message` : (row.body || ''),
    attachment,
    replyTo,
    isDeleted,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
  };
}

function buildDisplayName(row) {
  return row.profile_display_name || row.account_display_name || row.username || row.email || 'Member';
}

async function ensureConnectionsTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS user_privacy_settings (
      uid TEXT PRIMARY KEY REFERENCES accounts(uid) ON DELETE CASCADE,
      searchable BOOLEAN NOT NULL DEFAULT true,
      follow_approval_required BOOLEAN NOT NULL DEFAULT true,
      non_follower_chat_policy TEXT NOT NULL DEFAULT 'request'
        CHECK (non_follower_chat_policy IN ('allow', 'request', 'deny')),
      active_visible BOOLEAN NOT NULL DEFAULT true,
      notify_new_posts_from_following BOOLEAN NOT NULL DEFAULT true,
      notify_post_activity BOOLEAN NOT NULL DEFAULT true,
      notify_document_activity BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS notify_new_posts_from_following BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS notify_post_activity BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS notify_document_activity BOOLEAN NOT NULL DEFAULT true;

    CREATE TABLE IF NOT EXISTS user_presence (
      uid TEXT PRIMARY KEY REFERENCES accounts(uid) ON DELETE CASCADE,
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS follow_requests (
      id BIGSERIAL PRIMARY KEY,
      requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      status TEXT NOT NULL
        CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (requester_uid, target_uid),
      CHECK (requester_uid <> target_uid)
    );

    CREATE TABLE IF NOT EXISTS follows (
      id BIGSERIAL PRIMARY KEY,
      follower_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (follower_uid, target_uid),
      CHECK (follower_uid <> target_uid)
    );

    CREATE TABLE IF NOT EXISTS chat_requests (
      id BIGSERIAL PRIMARY KEY,
      requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      status TEXT NOT NULL
        CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (requester_uid, target_uid),
      CHECK (requester_uid <> target_uid)
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id BIGSERIAL PRIMARY KEY,
      thread_type TEXT NOT NULL CHECK (thread_type IN ('direct', 'group')),
      created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      id BIGSERIAL PRIMARY KEY,
      thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'pending', 'declined')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      UNIQUE (thread_id, user_uid)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      sender_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      body TEXT NOT NULL,
      parent_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
      attachment_type TEXT CHECK (attachment_type IN ('image', 'video')),
      attachment_key TEXT,
      attachment_link TEXT,
      attachment_filename TEXT,
      attachment_mime_type TEXT,
      attachment_size_bytes INTEGER CHECK (attachment_size_bytes IS NULL OR attachment_size_bytes >= 0),
      deleted_at TIMESTAMPTZ,
      deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS parent_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachment_type TEXT;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachment_key TEXT;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachment_link TEXT;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachment_filename TEXT;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS attachment_size_bytes INTEGER;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

    ALTER TABLE chat_messages
      DROP CONSTRAINT IF EXISTS chat_messages_attachment_type_check;
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_attachment_type_check
      CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'video'));

    CREATE TABLE IF NOT EXISTS chat_message_reports (
      id BIGSERIAL PRIMARY KEY,
      message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      message_sender_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
      resolution_note TEXT,
      resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (message_id, reporter_uid)
    );

    CREATE TABLE IF NOT EXISTS chat_typing (
      thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (thread_id, user_uid)
    );

    CREATE TABLE IF NOT EXISTS chat_thread_user_state (
      thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      last_read_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
      manual_unread BOOLEAN NOT NULL DEFAULT false,
      is_archived BOOLEAN NOT NULL DEFAULT false,
      is_muted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (thread_id, user_uid)
    );
    ALTER TABLE chat_thread_user_state
      ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL;
    ALTER TABLE chat_thread_user_state
      ADD COLUMN IF NOT EXISTS manual_unread BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE chat_thread_user_state
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE chat_thread_user_state
      ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE chat_thread_user_state
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS blocked_users (
      id BIGSERIAL PRIMARY KEY,
      blocker_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      blocked_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (blocker_uid, blocked_uid),
      CHECK (blocker_uid <> blocked_uid)
    );

    CREATE TABLE IF NOT EXISTS hidden_post_authors (
      id BIGSERIAL PRIMARY KEY,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      hidden_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_uid, hidden_uid),
      CHECK (user_uid <> hidden_uid)
    );

    CREATE TABLE IF NOT EXISTS user_profile_reports (
      id BIGSERIAL PRIMARY KEY,
      reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (reporter_uid <> target_uid)
    );

    CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_uid);
    CREATE INDEX IF NOT EXISTS follows_target_idx ON follows(target_uid);
    CREATE INDEX IF NOT EXISTS follow_requests_target_status_idx ON follow_requests(target_uid, status);
    CREATE INDEX IF NOT EXISTS follow_requests_requester_status_idx ON follow_requests(requester_uid, status);

    CREATE INDEX IF NOT EXISTS chat_requests_target_status_idx ON chat_requests(target_uid, status);
    CREATE INDEX IF NOT EXISTS chat_requests_requester_status_idx ON chat_requests(requester_uid, status);

    CREATE INDEX IF NOT EXISTS chat_participants_user_status_idx ON chat_participants(user_uid, status);
    CREATE INDEX IF NOT EXISTS chat_participants_thread_status_idx ON chat_participants(thread_id, status);
    CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON chat_messages(thread_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS chat_messages_parent_idx ON chat_messages(parent_message_id);
    CREATE INDEX IF NOT EXISTS chat_messages_deleted_idx ON chat_messages(thread_id, deleted_at);
    CREATE INDEX IF NOT EXISTS chat_message_reports_status_created_idx ON chat_message_reports(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS chat_message_reports_thread_idx ON chat_message_reports(thread_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS chat_message_reports_reporter_idx ON chat_message_reports(reporter_uid, created_at DESC);
    CREATE INDEX IF NOT EXISTS chat_typing_thread_updated_idx ON chat_typing(thread_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS chat_thread_user_state_user_idx ON chat_thread_user_state(user_uid, is_archived, updated_at DESC);
    CREATE INDEX IF NOT EXISTS chat_thread_user_state_thread_idx ON chat_thread_user_state(thread_id, user_uid);
    CREATE INDEX IF NOT EXISTS blocked_users_blocker_idx ON blocked_users(blocker_uid);
    CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx ON blocked_users(blocked_uid);
    CREATE INDEX IF NOT EXISTS hidden_post_authors_user_idx ON hidden_post_authors(user_uid);
    CREATE INDEX IF NOT EXISTS hidden_post_authors_hidden_idx ON hidden_post_authors(hidden_uid);
    CREATE INDEX IF NOT EXISTS user_profile_reports_target_idx ON user_profile_reports(target_uid, created_at DESC);

    CREATE INDEX IF NOT EXISTS accounts_uid_text_idx ON accounts(uid);
    CREATE INDEX IF NOT EXISTS accounts_display_name_lower_idx ON accounts((lower(COALESCE(display_name, username, email))));
    CREATE INDEX IF NOT EXISTS profiles_display_name_lower_idx ON profiles((lower(COALESCE(display_name, ''))));
  `;

  await pool.query(sql);
}

async function ensureConnectionsReady() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = ensureConnectionsTables().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }
  await ensureTablesPromise;
}

async function ensurePrivacySettings(uid) {
  await pool.query(
    `INSERT INTO user_privacy_settings (uid)
     VALUES ($1)
     ON CONFLICT (uid) DO NOTHING`,
    [uid]
  );

  const result = await pool.query(
    `SELECT uid, searchable, follow_approval_required, non_follower_chat_policy, active_visible,
            notify_new_posts_from_following, notify_post_activity, notify_document_activity,
            created_at, updated_at
     FROM user_privacy_settings
     WHERE uid = $1`,
    [uid]
  );
  return result.rows[0] || null;
}

async function touchPresence(uid) {
  await pool.query(
    `INSERT INTO user_presence (uid, last_active_at, updated_at)
     VALUES ($1, NOW(), NOW())
     ON CONFLICT (uid)
     DO UPDATE SET last_active_at = NOW(), updated_at = NOW()`,
    [uid]
  );
}

function computePresence(row, includeHidden = false) {
  const activeVisible = row.active_visible !== false;
  const recentlyActive = row.recently_active === true;

  if (!activeVisible && !includeHidden) {
    return {
      status: 'hidden',
      isActive: false,
      activeVisible: false,
      lastActiveAt: row.last_active_at || null,
    };
  }

  return {
    status: recentlyActive ? 'active' : 'inactive',
    isActive: recentlyActive,
    activeVisible,
    lastActiveAt: row.last_active_at || null,
  };
}

async function lookupAccountByUid(uid) {
  const result = await pool.query(
    'SELECT uid, email, username, display_name, course FROM accounts WHERE uid = $1 LIMIT 1',
    [uid]
  );
  return result.rows[0] || null;
}

async function getModerationState(viewerUid, targetUid) {
  const result = await pool.query(
    `SELECT
      EXISTS (
        SELECT 1 FROM blocked_users
        WHERE blocker_uid = $1 AND blocked_uid = $2
      ) AS is_blocked,
      EXISTS (
        SELECT 1 FROM blocked_users
        WHERE blocker_uid = $2 AND blocked_uid = $1
      ) AS blocked_by_user,
      EXISTS (
        SELECT 1 FROM hidden_post_authors
        WHERE user_uid = $1 AND hidden_uid = $2
      ) AS hide_posts`,
    [viewerUid, targetUid]
  );
  const row = result.rows[0] || {};
  return {
    isBlocked: row.is_blocked === true,
    blockedByUser: row.blocked_by_user === true,
    hidePosts: row.hide_posts === true,
  };
}

async function isBlockedEitherDirection(uidA, uidB) {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM blocked_users
      WHERE (blocker_uid = $1 AND blocked_uid = $2)
         OR (blocker_uid = $2 AND blocked_uid = $1)
    ) AS blocked`,
    [uidA, uidB]
  );
  return result.rows[0] ? result.rows[0].blocked === true : false;
}

async function fetchUserCard(uid, viewerUid) {
  const result = await pool.query(
    `SELECT
      a.uid,
      a.email,
      a.username,
      a.display_name AS account_display_name,
      a.course,
      p.display_name AS profile_display_name,
      p.bio,
      p.photo_link,
      COALESCE(ups.active_visible, true) AS active_visible,
      up.last_active_at,
      CASE
        WHEN up.last_active_at IS NOT NULL
          AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
        THEN true
        ELSE false
      END AS recently_active,
      EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_uid = $3 AND f.target_uid = a.uid
      ) AS is_following,
      EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_uid = a.uid AND f.target_uid = $3
      ) AS follows_you,
      EXISTS (
        SELECT 1 FROM follow_requests fr
        WHERE fr.requester_uid = $3 AND fr.target_uid = a.uid AND fr.status = 'pending'
      ) AS follow_request_sent,
      EXISTS (
        SELECT 1 FROM follow_requests fr
        WHERE fr.requester_uid = a.uid AND fr.target_uid = $3 AND fr.status = 'pending'
      ) AS follow_request_received
    FROM accounts a
    LEFT JOIN profiles p ON p.uid = a.uid
    LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
    LEFT JOIN user_presence up ON up.uid = a.uid
    WHERE a.uid = $1
    LIMIT 1`,
    [uid, String(ACTIVE_WINDOW_MINUTES), viewerUid]
  );

  const row = result.rows[0];
  if (!row) return null;

  const photoLink = await signPhotoIfNeeded(row.photo_link);
  const presence = computePresence(row, viewerUid === uid);

  return {
    uid: row.uid,
    displayName: buildDisplayName(row),
    course: row.course || null,
    bio: row.bio || null,
    photoLink,
    presence,
    relation: {
      isFollowing: row.is_following === true,
      followsYou: row.follows_you === true,
      followRequestSent: row.follow_request_sent === true,
      followRequestReceived: row.follow_request_received === true,
    },
  };
}

async function findExistingDirectThread(uidA, uidB, client = pool) {
  const result = await client.query(
    `SELECT ct.id
     FROM chat_threads ct
     JOIN chat_participants cp1
       ON cp1.thread_id = ct.id
      AND cp1.user_uid = $1
      AND cp1.status = 'active'
     JOIN chat_participants cp2
       ON cp2.thread_id = ct.id
      AND cp2.user_uid = $2
      AND cp2.status = 'active'
     WHERE ct.thread_type = 'direct'
     LIMIT 1`,
    [uidA, uidB]
  );

  return result.rows[0] ? Number(result.rows[0].id) : null;
}

async function createDirectThread(creatorUid, otherUid) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingId = await findExistingDirectThread(creatorUid, otherUid, client);
    if (existingId) {
      await restoreConversationForUser(existingId, creatorUid, client);
      await restoreConversationForUser(existingId, otherUid, client);
      await client.query('COMMIT');
      return existingId;
    }

    const threadResult = await client.query(
      `INSERT INTO chat_threads (thread_type, created_by_uid, title)
       VALUES ('direct', $1, NULL)
       RETURNING id`,
      [creatorUid]
    );

    const threadId = Number(threadResult.rows[0].id);
    await client.query(
      `INSERT INTO chat_participants (thread_id, user_uid, role, status)
       VALUES
         ($1, $2, 'owner', 'active'),
         ($1, $3, 'member', 'active')
       ON CONFLICT (thread_id, user_uid)
       DO UPDATE SET status = 'active', left_at = NULL`,
      [threadId, creatorUid, otherUid]
    );
    await restoreConversationForUser(threadId, creatorUid, client);
    await restoreConversationForUser(threadId, otherUid, client);

    await client.query('COMMIT');
    return threadId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function loadConversationParticipants(threadIds) {
  if (!threadIds.length) {
    return new Map();
  }

  const result = await pool.query(
    `SELECT
      cp.thread_id,
      cp.user_uid,
      cp.role,
      COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name,
      p.photo_link,
      COALESCE(ups.active_visible, true) AS active_visible,
      up.last_active_at,
      CASE
        WHEN up.last_active_at IS NOT NULL
          AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
        THEN true
        ELSE false
      END AS recently_active
    FROM chat_participants cp
    JOIN accounts a ON a.uid = cp.user_uid
    LEFT JOIN profiles p ON p.uid = cp.user_uid
    LEFT JOIN user_privacy_settings ups ON ups.uid = cp.user_uid
    LEFT JOIN user_presence up ON up.uid = cp.user_uid
    WHERE cp.thread_id = ANY($1::bigint[])
      AND cp.status = 'active'
    ORDER BY cp.thread_id ASC, cp.joined_at ASC`,
    [threadIds, String(ACTIVE_WINDOW_MINUTES)]
  );

  const mapped = await Promise.all(
    result.rows.map(async (row) => ({
      threadId: Number(row.thread_id),
      participant: {
        uid: row.user_uid,
        role: row.role,
        displayName: row.display_name,
        photoLink: await signPhotoIfNeeded(row.photo_link),
        presence: computePresence(row),
      },
    }))
  );

  const grouped = new Map();
  mapped.forEach(({ threadId, participant }) => {
    if (!grouped.has(threadId)) {
      grouped.set(threadId, []);
    }
    grouped.get(threadId).push(participant);
  });

  return grouped;
}

async function ensureConversationUserState(threadId, userUid, client = pool) {
  await client.query(
    `INSERT INTO chat_thread_user_state (thread_id, user_uid)
     VALUES ($1, $2)
     ON CONFLICT (thread_id, user_uid) DO NOTHING`,
    [threadId, userUid]
  );
}

async function restoreConversationForUser(threadId, userUid, client = pool) {
  await ensureConversationUserState(threadId, userUid, client);
  await client.query(
    `UPDATE chat_thread_user_state
     SET
       deleted_at = NULL,
       is_archived = false,
       manual_unread = false,
       updated_at = NOW()
     WHERE thread_id = $1
       AND user_uid = $2`,
    [threadId, userUid]
  );
}

async function getActiveConversationMembership(threadId, userUid, client = pool) {
  const result = await client.query(
    `SELECT
       ct.id AS thread_id,
       ct.thread_type,
       cp.role
     FROM chat_threads ct
     JOIN chat_participants cp
       ON cp.thread_id = ct.id
      AND cp.user_uid = $2
      AND cp.status = 'active'
     WHERE ct.id = $1
     LIMIT 1`,
    [threadId, userUid]
  );
  return result.rows[0] || null;
}

async function markConversationRead(threadId, userUid, client = pool) {
  await ensureConversationUserState(threadId, userUid, client);
  await client.query(
    `UPDATE chat_thread_user_state
     SET
       last_read_message_id = (
         SELECT cm.id
         FROM chat_messages cm
         WHERE cm.thread_id = $1
           AND (chat_thread_user_state.deleted_at IS NULL OR cm.created_at > chat_thread_user_state.deleted_at)
         ORDER BY cm.id DESC
         LIMIT 1
       ),
       manual_unread = false,
       updated_at = NOW()
     WHERE thread_id = $1
       AND user_uid = $2`,
    [threadId, userUid]
  );
}

router.use('/api/connections', requireAuthApi);
router.use('/api/preferences', requireAuthApi);

router.use(async (req, res, next) => {
  const isConnectionsPath = req.path.startsWith('/api/connections');
  const isPreferencesPath = req.path.startsWith('/api/preferences');
  if (!isConnectionsPath && !isPreferencesPath) {
    return next();
  }

  try {
    await ensureConnectionsReady();
    if (req.user && req.user.uid) {
      await ensurePrivacySettings(req.user.uid);
      await touchPresence(req.user.uid);
    }
    return next();
  } catch (error) {
    console.error('Connections bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Connections service is unavailable.' });
  }
});

router.get('/api/preferences/privacy', async (req, res) => {
  try {
    const settings = await ensurePrivacySettings(req.user.uid);
    return res.json({ ok: true, settings });
  } catch (error) {
    console.error('Privacy settings fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load privacy settings.' });
  }
});

router.patch('/api/preferences/privacy', async (req, res) => {
  const allowedPolicies = new Set(['allow', 'request', 'deny']);
  const payload = req.body || {};

  const updates = [];
  const values = [];

  if (payload.searchable !== undefined) {
    if (typeof payload.searchable !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'searchable must be boolean.' });
    }
    values.push(payload.searchable);
    updates.push(`searchable = $${values.length}`);
  }

  if (payload.follow_approval_required !== undefined) {
    if (typeof payload.follow_approval_required !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'follow_approval_required must be boolean.' });
    }
    values.push(payload.follow_approval_required);
    updates.push(`follow_approval_required = $${values.length}`);
  }

  if (payload.non_follower_chat_policy !== undefined) {
    if (!allowedPolicies.has(payload.non_follower_chat_policy)) {
      return res.status(400).json({ ok: false, message: 'Invalid non_follower_chat_policy.' });
    }
    values.push(payload.non_follower_chat_policy);
    updates.push(`non_follower_chat_policy = $${values.length}`);
  }

  if (payload.active_visible !== undefined) {
    if (typeof payload.active_visible !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'active_visible must be boolean.' });
    }
    values.push(payload.active_visible);
    updates.push(`active_visible = $${values.length}`);
  }

  if (payload.notify_new_posts_from_following !== undefined) {
    if (typeof payload.notify_new_posts_from_following !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'notify_new_posts_from_following must be boolean.' });
    }
    values.push(payload.notify_new_posts_from_following);
    updates.push(`notify_new_posts_from_following = $${values.length}`);
  }

  if (payload.notify_post_activity !== undefined) {
    if (typeof payload.notify_post_activity !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'notify_post_activity must be boolean.' });
    }
    values.push(payload.notify_post_activity);
    updates.push(`notify_post_activity = $${values.length}`);
  }

  if (payload.notify_document_activity !== undefined) {
    if (typeof payload.notify_document_activity !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'notify_document_activity must be boolean.' });
    }
    values.push(payload.notify_document_activity);
    updates.push(`notify_document_activity = $${values.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No valid fields to update.' });
  }

  try {
    values.push(req.user.uid);
    const result = await pool.query(
      `UPDATE user_privacy_settings
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE uid = $${values.length}
       RETURNING uid, searchable, follow_approval_required, non_follower_chat_policy, active_visible,
                 notify_new_posts_from_following, notify_post_activity, notify_document_activity, updated_at`,
      values
    );

    return res.json({ ok: true, settings: result.rows[0] });
  } catch (error) {
    console.error('Privacy settings update failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to update privacy settings.' });
  }
});

router.get('/api/connections/presence', async (req, res) => {
  const uid = sanitizeText(req.query.uid || req.user.uid, 120);

  if (!uid) {
    return res.status(400).json({ ok: false, message: 'uid is required.' });
  }

  try {
    const account = await lookupAccountByUid(uid);
    if (!account) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    await ensurePrivacySettings(uid);

    const result = await pool.query(
      `SELECT
        ups.uid,
        ups.active_visible,
        up.last_active_at,
        CASE
          WHEN up.last_active_at IS NOT NULL
            AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
          THEN true
          ELSE false
        END AS recently_active
      FROM user_privacy_settings ups
      LEFT JOIN user_presence up ON up.uid = ups.uid
      WHERE ups.uid = $1
      LIMIT 1`,
      [uid, String(ACTIVE_WINDOW_MINUTES)]
    );

    const row = result.rows[0] || { uid, active_visible: true, recently_active: false, last_active_at: null };
    const presence = computePresence(row, req.user.uid === uid);

    return res.json({
      ok: true,
      uid,
      presence,
    });
  } catch (error) {
    console.error('Presence fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load presence.' });
  }
});

router.get('/api/connections/search', async (req, res) => {
  if (!enforceRateLimit(req, res, 'connections_search', 120)) return;

  const query = sanitizeText(req.query.q || '', 120);
  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 18, maxPageSize: 40 });

  try {
    const values = [req.user.uid];
    const where = [
      'a.uid <> $1',
      'COALESCE(ups.searchable, true) = true',
      `NOT EXISTS (
        SELECT 1 FROM blocked_users bu
        WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = a.uid)
           OR (bu.blocker_uid = a.uid AND bu.blocked_uid = $1)
      )`,
    ];

    if (query) {
      values.push(`%${query.toLowerCase()}%`);
      where.push(`(
        lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) LIKE $${values.length}
        OR lower(COALESCE(a.username, '')) LIKE $${values.length}
        OR lower(COALESCE(a.course, '')) LIKE $${values.length}
      )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
       ${whereClause}`,
      values
    );

    const total = countResult.rows[0] ? Number(countResult.rows[0].total) : 0;

    const listValues = [...values, pageSize, offset];
    const limitParam = listValues.length - 1;
    const offsetParam = listValues.length;

    const listResult = await pool.query(
      `SELECT
        a.uid,
        a.email,
        a.username,
        a.display_name AS account_display_name,
        a.course,
        p.display_name AS profile_display_name,
        p.bio,
        p.photo_link,
        COALESCE(ups.active_visible, true) AS active_visible,
        up.last_active_at,
        CASE
          WHEN up.last_active_at IS NOT NULL
            AND up.last_active_at >= NOW() - INTERVAL '${ACTIVE_WINDOW_MINUTES} minutes'
          THEN true
          ELSE false
        END AS recently_active,
        EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_uid = $1 AND f.target_uid = a.uid
        ) AS is_following,
        EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_uid = a.uid AND f.target_uid = $1
        ) AS follows_you,
        EXISTS (
          SELECT 1 FROM follow_requests fr
          WHERE fr.requester_uid = $1 AND fr.target_uid = a.uid AND fr.status = 'pending'
        ) AS follow_request_sent,
        EXISTS (
          SELECT 1 FROM follow_requests fr
          WHERE fr.requester_uid = a.uid AND fr.target_uid = $1 AND fr.status = 'pending'
        ) AS follow_request_received
      FROM accounts a
      LEFT JOIN profiles p ON p.uid = a.uid
      LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
      LEFT JOIN user_presence up ON up.uid = a.uid
      ${whereClause}
      ORDER BY lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
      listValues
    );

    const users = await Promise.all(
      listResult.rows.map(async (row) => ({
        uid: row.uid,
        displayName: buildDisplayName(row),
        username: row.username || '',
        course: row.course || null,
        bio: row.bio || null,
        photoLink: await signPhotoIfNeeded(row.photo_link),
        presence: computePresence(row),
        relation: {
          isFollowing: row.is_following === true,
          followsYou: row.follows_you === true,
          followRequestSent: row.follow_request_sent === true,
          followRequestReceived: row.follow_request_received === true,
        },
      }))
    );

    return res.json({ ok: true, page, pageSize, total, users });
  } catch (error) {
    console.error('Connections search failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to search users.' });
  }
});

router.get('/api/connections/follow-requests', async (req, res) => {
  const type = req.query.type === 'sent' ? 'sent' : 'incoming';
  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 20, maxPageSize: 50 });

  try {
    let query;
    let params;

    if (type === 'sent') {
      query = `
        SELECT fr.id, fr.created_at, fr.updated_at, fr.status,
               a.uid, a.email, a.username, a.display_name AS account_display_name, a.course,
               p.display_name AS profile_display_name, p.bio, p.photo_link,
               COALESCE(ups.active_visible, true) AS active_visible,
               up.last_active_at,
               CASE
                 WHEN up.last_active_at IS NOT NULL
                   AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
                 THEN true
                 ELSE false
               END AS recently_active
        FROM follow_requests fr
        JOIN accounts a ON a.uid = fr.target_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE fr.requester_uid = $1
          AND fr.status = 'pending'
        ORDER BY fr.created_at DESC
        LIMIT $3 OFFSET $4
      `;
      params = [req.user.uid, String(ACTIVE_WINDOW_MINUTES), pageSize, offset];
    } else {
      query = `
        SELECT fr.id, fr.created_at, fr.updated_at, fr.status,
               a.uid, a.email, a.username, a.display_name AS account_display_name, a.course,
               p.display_name AS profile_display_name, p.bio, p.photo_link,
               COALESCE(ups.active_visible, true) AS active_visible,
               up.last_active_at,
               CASE
                 WHEN up.last_active_at IS NOT NULL
                   AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
                 THEN true
                 ELSE false
               END AS recently_active
        FROM follow_requests fr
        JOIN accounts a ON a.uid = fr.requester_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE fr.target_uid = $1
          AND fr.status = 'pending'
        ORDER BY fr.created_at DESC
        LIMIT $3 OFFSET $4
      `;
      params = [req.user.uid, String(ACTIVE_WINDOW_MINUTES), pageSize, offset];
    }

    const result = await pool.query(query, params);
    const requests = await Promise.all(
      result.rows.map(async (row) => ({
        id: Number(row.id),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        user: {
          uid: row.uid,
          displayName: buildDisplayName(row),
          username: row.username || '',
          course: row.course || null,
          bio: row.bio || null,
          photoLink: await signPhotoIfNeeded(row.photo_link),
          presence: computePresence(row),
        },
      }))
    );

    return res.json({ ok: true, type, page, pageSize, requests });
  } catch (error) {
    console.error('Follow requests fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load follow requests.' });
  }
});

router.post('/api/connections/follow/request', async (req, res) => {
  if (!enforceRateLimit(req, res, 'follow_request', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }

  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'You cannot follow yourself.' });
  }

  try {
    const target = await lookupAccountByUid(targetUid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    const blocked = await isBlockedEitherDirection(req.user.uid, targetUid);
    if (blocked) {
      return res.status(403).json({ ok: false, message: 'Follow is not allowed for this user.' });
    }

    const existingFollow = await pool.query(
      `SELECT id FROM follows
       WHERE follower_uid = $1 AND target_uid = $2
       LIMIT 1`,
      [req.user.uid, targetUid]
    );
    if (existingFollow.rows.length) {
      return res.json({ ok: true, state: 'following', requiresApproval: false });
    }

    const targetSettings = await ensurePrivacySettings(targetUid);

    if (targetSettings && targetSettings.follow_approval_required === false) {
      await pool.query(
        `INSERT INTO follows (follower_uid, target_uid)
         VALUES ($1, $2)
         ON CONFLICT (follower_uid, target_uid) DO NOTHING`,
        [req.user.uid, targetUid]
      );

      await pool.query(
        `INSERT INTO follow_requests (requester_uid, target_uid, status, created_at, updated_at)
         VALUES ($1, $2, 'accepted', NOW(), NOW())
         ON CONFLICT (requester_uid, target_uid)
         DO UPDATE SET status = 'accepted', updated_at = NOW()`,
        [req.user.uid, targetUid]
      );

      return res.json({ ok: true, state: 'following', requiresApproval: false });
    }

    const upsert = await pool.query(
      `INSERT INTO follow_requests (requester_uid, target_uid, status, created_at, updated_at)
       VALUES ($1, $2, 'pending', NOW(), NOW())
       ON CONFLICT (requester_uid, target_uid)
       DO UPDATE SET status = 'pending', updated_at = NOW()
       RETURNING id`,
      [req.user.uid, targetUid]
    );

    return res.json({
      ok: true,
      state: 'pending',
      requiresApproval: true,
      requestId: Number(upsert.rows[0].id),
    });
  } catch (error) {
    console.error('Follow request failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to process follow request.' });
  }
});

router.post('/api/connections/follow/respond', async (req, res) => {
  if (!enforceRateLimit(req, res, 'follow_respond', 40)) return;

  const requestId = Number(req.body && req.body.requestId);
  const action = sanitizeText(req.body && req.body.action, 12).toLowerCase();

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ ok: false, message: 'Valid requestId is required.' });
  }
  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Action must be accept or decline.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT id, requester_uid, target_uid, status
       FROM follow_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );

    const request = requestResult.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Follow request not found.' });
    }

    if (request.target_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed to respond to this request.' });
    }

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'This request is no longer pending.' });
    }

    if (action === 'accept') {
      const blocked = await isBlockedEitherDirection(request.requester_uid, request.target_uid);
      if (blocked) {
        await client.query(
          `UPDATE follow_requests
           SET status = 'declined', updated_at = NOW()
           WHERE id = $1`,
          [requestId]
        );
        await client.query('COMMIT');
        return res.status(403).json({ ok: false, message: 'Follow is not allowed for this user.' });
      }

      await client.query(
        `UPDATE follow_requests
         SET status = 'accepted', updated_at = NOW()
         WHERE id = $1`,
        [requestId]
      );

      await client.query(
        `INSERT INTO follows (follower_uid, target_uid)
         VALUES ($1, $2)
         ON CONFLICT (follower_uid, target_uid) DO NOTHING`,
        [request.requester_uid, request.target_uid]
      );

      await client.query('COMMIT');
      return res.json({ ok: true, state: 'accepted' });
    }

    await client.query(
      `UPDATE follow_requests
       SET status = 'declined', updated_at = NOW()
       WHERE id = $1`,
      [requestId]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, state: 'declined' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Follow response failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to respond to follow request.' });
  } finally {
    client.release();
  }
});

router.post('/api/connections/follow/cancel', async (req, res) => {
  if (!enforceRateLimit(req, res, 'follow_cancel', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }

  try {
    await pool.query(
      `UPDATE follow_requests
       SET status = 'canceled', updated_at = NOW()
       WHERE requester_uid = $1 AND target_uid = $2 AND status = 'pending'`,
      [req.user.uid, targetUid]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Follow request cancel failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to cancel follow request.' });
  }
});

router.post('/api/connections/unfollow', async (req, res) => {
  if (!enforceRateLimit(req, res, 'unfollow', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }

  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'Invalid target.' });
  }

  try {
    await pool.query(
      `DELETE FROM follows
       WHERE follower_uid = $1 AND target_uid = $2`,
      [req.user.uid, targetUid]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Unfollow failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to unfollow user.' });
  }
});

router.get('/api/connections/user-state', async (req, res) => {
  const targetUid = sanitizeText(req.query.uid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'uid is required.' });
  }

  try {
    const target = await fetchUserCard(targetUid, req.user.uid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    const moderation = await getModerationState(req.user.uid, targetUid);
    return res.json({
      ok: true,
      user: target,
      moderation,
    });
  } catch (error) {
    console.error('User state fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load user state.' });
  }
});

router.post('/api/connections/block', async (req, res) => {
  if (!enforceRateLimit(req, res, 'block_user', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }
  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'You cannot block yourself.' });
  }

  try {
    const target = await lookupAccountByUid(targetUid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO blocked_users (blocker_uid, blocked_uid)
         VALUES ($1, $2)
         ON CONFLICT (blocker_uid, blocked_uid) DO NOTHING`,
        [req.user.uid, targetUid]
      );
      await client.query(
        `INSERT INTO hidden_post_authors (user_uid, hidden_uid)
         VALUES ($1, $2)
         ON CONFLICT (user_uid, hidden_uid) DO NOTHING`,
        [req.user.uid, targetUid]
      );
      await client.query(
        `DELETE FROM follows
         WHERE (follower_uid = $1 AND target_uid = $2)
            OR (follower_uid = $2 AND target_uid = $1)`,
        [req.user.uid, targetUid]
      );
      await client.query(
        `UPDATE follow_requests
         SET status = 'canceled', updated_at = NOW()
         WHERE ((requester_uid = $1 AND target_uid = $2)
             OR (requester_uid = $2 AND target_uid = $1))
           AND status = 'pending'`,
        [req.user.uid, targetUid]
      );
      await client.query(
        `UPDATE chat_requests
         SET status = 'canceled', updated_at = NOW()
         WHERE ((requester_uid = $1 AND target_uid = $2)
             OR (requester_uid = $2 AND target_uid = $1))
           AND status = 'pending'`,
        [req.user.uid, targetUid]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Block user failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to block user.' });
  }
});

router.post('/api/connections/unblock', async (req, res) => {
  if (!enforceRateLimit(req, res, 'unblock_user', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }
  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'Invalid target.' });
  }

  try {
    await pool.query(
      `DELETE FROM blocked_users
       WHERE blocker_uid = $1 AND blocked_uid = $2`,
      [req.user.uid, targetUid]
    );
    await pool.query(
      `DELETE FROM hidden_post_authors
       WHERE user_uid = $1 AND hidden_uid = $2`,
      [req.user.uid, targetUid]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Unblock user failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to unblock user.' });
  }
});

router.post('/api/connections/report-user', async (req, res) => {
  if (!enforceRateLimit(req, res, 'report_user', 20)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  const reason = sanitizeText(req.body && req.body.reason, 400);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }
  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'Invalid target.' });
  }

  try {
    const target = await lookupAccountByUid(targetUid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    await pool.query(
      `INSERT INTO user_profile_reports (reporter_uid, target_uid, reason)
       VALUES ($1, $2, $3)`,
      [req.user.uid, targetUid, reason || null]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Report user failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to report user.' });
  }
});

router.post('/api/connections/hide-posts', async (req, res) => {
  if (!enforceRateLimit(req, res, 'hide_posts', 40)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }
  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'Invalid target.' });
  }

  try {
    const target = await lookupAccountByUid(targetUid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }
    await pool.query(
      `INSERT INTO hidden_post_authors (user_uid, hidden_uid)
       VALUES ($1, $2)
       ON CONFLICT (user_uid, hidden_uid) DO NOTHING`,
      [req.user.uid, targetUid]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Hide posts failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to hide posts from this user.' });
  }
});

router.post('/api/connections/unhide-posts', async (req, res) => {
  if (!enforceRateLimit(req, res, 'unhide_posts', 40)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }
  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'Invalid target.' });
  }

  try {
    await pool.query(
      `DELETE FROM hidden_post_authors
       WHERE user_uid = $1 AND hidden_uid = $2`,
      [req.user.uid, targetUid]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Unhide posts failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to restore posts from this user.' });
  }
});

router.get('/api/preferences/blocked-users', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 30, maxPageSize: 80 });
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM blocked_users bu
       WHERE bu.blocker_uid = $1`,
      [req.user.uid]
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    const result = await pool.query(
      `SELECT
        bu.blocked_uid AS uid,
        bu.created_at AS blocked_at,
        a.email,
        a.username,
        a.display_name AS account_display_name,
        a.course,
        p.display_name AS profile_display_name,
        p.bio,
        p.photo_link,
        EXISTS (
          SELECT 1 FROM hidden_post_authors h
          WHERE h.user_uid = $1 AND h.hidden_uid = bu.blocked_uid
        ) AS hide_posts
       FROM blocked_users bu
       JOIN accounts a ON a.uid = bu.blocked_uid
       LEFT JOIN profiles p ON p.uid = bu.blocked_uid
       WHERE bu.blocker_uid = $1
       ORDER BY bu.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.uid, pageSize, offset]
    );

    const users = await Promise.all(
      result.rows.map(async (row) => ({
        uid: row.uid,
        displayName: buildDisplayName(row),
        course: row.course || null,
        bio: row.bio || null,
        photoLink: await signPhotoIfNeeded(row.photo_link),
        blockedAt: row.blocked_at,
        hidePosts: row.hide_posts === true,
      }))
    );

    return res.json({ ok: true, page, pageSize, total, users });
  } catch (error) {
    console.error('Blocked users fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load blocked users.' });
  }
});

router.get('/api/connections/list', async (req, res) => {
  const type = sanitizeText(req.query.type || 'following', 20).toLowerCase();
  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 24, maxPageSize: 60 });

  if (!['following', 'followers', 'mutual'].includes(type)) {
    return res.status(400).json({ ok: false, message: 'type must be following, followers, or mutual.' });
  }

  try {
    let fromClause = '';
    let params = [req.user.uid, String(ACTIVE_WINDOW_MINUTES), pageSize, offset];

    if (type === 'following') {
      fromClause = `
        FROM follows base
        JOIN accounts a ON a.uid = base.target_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE base.follower_uid = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocked_users bu
            WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = a.uid)
               OR (bu.blocker_uid = a.uid AND bu.blocked_uid = $1)
          )
      `;
    } else if (type === 'followers') {
      fromClause = `
        FROM follows base
        JOIN accounts a ON a.uid = base.follower_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE base.target_uid = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocked_users bu
            WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = a.uid)
               OR (bu.blocker_uid = a.uid AND bu.blocked_uid = $1)
          )
      `;
    } else {
      fromClause = `
        FROM follows base
        JOIN follows reverse
          ON reverse.follower_uid = base.target_uid
         AND reverse.target_uid = base.follower_uid
        JOIN accounts a ON a.uid = base.target_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE base.follower_uid = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocked_users bu
            WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = a.uid)
               OR (bu.blocker_uid = a.uid AND bu.blocked_uid = $1)
          )
      `;
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${fromClause}`, [req.user.uid]);
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    const listResult = await pool.query(
      `SELECT
        a.uid,
        a.email,
        a.username,
        a.display_name AS account_display_name,
        a.course,
        p.display_name AS profile_display_name,
        p.bio,
        p.photo_link,
        COALESCE(ups.active_visible, true) AS active_visible,
        up.last_active_at,
        CASE
          WHEN up.last_active_at IS NOT NULL
            AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
          THEN true
          ELSE false
        END AS recently_active,
        EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_uid = $1 AND f.target_uid = a.uid
        ) AS is_following,
        EXISTS (
          SELECT 1 FROM follows f
          WHERE f.follower_uid = a.uid AND f.target_uid = $1
        ) AS follows_you,
        EXISTS (
          SELECT 1 FROM follow_requests fr
          WHERE fr.requester_uid = $1 AND fr.target_uid = a.uid AND fr.status = 'pending'
        ) AS follow_request_sent,
        EXISTS (
          SELECT 1 FROM follow_requests fr
          WHERE fr.requester_uid = a.uid AND fr.target_uid = $1 AND fr.status = 'pending'
        ) AS follow_request_received
      ${fromClause}
      ORDER BY lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) ASC
      LIMIT $3 OFFSET $4`,
      params
    );

    const users = await Promise.all(
      listResult.rows.map(async (row) => ({
        uid: row.uid,
        displayName: buildDisplayName(row),
        username: row.username || '',
        course: row.course || null,
        bio: row.bio || null,
        photoLink: await signPhotoIfNeeded(row.photo_link),
        presence: computePresence(row),
        relation: {
          isFollowing: row.is_following === true,
          followsYou: row.follows_you === true,
          followRequestSent: row.follow_request_sent === true,
          followRequestReceived: row.follow_request_received === true,
        },
      }))
    );

    return res.json({ ok: true, type, page, pageSize, total, users });
  } catch (error) {
    console.error('Connections list fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load connections list.' });
  }
});

router.get('/api/connections/chat-requests', async (req, res) => {
  const type = req.query.type === 'sent' ? 'sent' : 'incoming';
  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 20, maxPageSize: 50 });

  try {
    let query;
    let params;

    if (type === 'sent') {
      query = `
        SELECT cr.id, cr.created_at, cr.updated_at, cr.status,
               a.uid, a.email, a.username, a.display_name AS account_display_name, a.course,
               p.display_name AS profile_display_name, p.bio, p.photo_link,
               COALESCE(ups.active_visible, true) AS active_visible,
               up.last_active_at,
               CASE
                 WHEN up.last_active_at IS NOT NULL
                   AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
                 THEN true
                 ELSE false
               END AS recently_active
        FROM chat_requests cr
        JOIN accounts a ON a.uid = cr.target_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE cr.requester_uid = $1
          AND cr.status = 'pending'
        ORDER BY cr.created_at DESC
        LIMIT $3 OFFSET $4
      `;
      params = [req.user.uid, String(ACTIVE_WINDOW_MINUTES), pageSize, offset];
    } else {
      query = `
        SELECT cr.id, cr.created_at, cr.updated_at, cr.status,
               a.uid, a.email, a.username, a.display_name AS account_display_name, a.course,
               p.display_name AS profile_display_name, p.bio, p.photo_link,
               COALESCE(ups.active_visible, true) AS active_visible,
               up.last_active_at,
               CASE
                 WHEN up.last_active_at IS NOT NULL
                   AND up.last_active_at >= NOW() - ($2::text || ' minutes')::interval
                 THEN true
                 ELSE false
               END AS recently_active
        FROM chat_requests cr
        JOIN accounts a ON a.uid = cr.requester_uid
        LEFT JOIN profiles p ON p.uid = a.uid
        LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
        LEFT JOIN user_presence up ON up.uid = a.uid
        WHERE cr.target_uid = $1
          AND cr.status = 'pending'
        ORDER BY cr.created_at DESC
        LIMIT $3 OFFSET $4
      `;
      params = [req.user.uid, String(ACTIVE_WINDOW_MINUTES), pageSize, offset];
    }

    const result = await pool.query(query, params);
    const requests = await Promise.all(
      result.rows.map(async (row) => ({
        id: Number(row.id),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        user: {
          uid: row.uid,
          displayName: buildDisplayName(row),
          username: row.username || '',
          course: row.course || null,
          bio: row.bio || null,
          photoLink: await signPhotoIfNeeded(row.photo_link),
          presence: computePresence(row),
        },
      }))
    );

    return res.json({ ok: true, type, page, pageSize, requests });
  } catch (error) {
    console.error('Chat requests fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load chat requests.' });
  }
});

router.post('/api/connections/chat/start', async (req, res) => {
  if (!enforceRateLimit(req, res, 'chat_start', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }

  if (targetUid === req.user.uid) {
    return res.status(400).json({ ok: false, message: 'You cannot chat with yourself.' });
  }

  try {
    const target = await lookupAccountByUid(targetUid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    const blocked = await isBlockedEitherDirection(req.user.uid, targetUid);
    if (blocked) {
      return res.status(403).json({ ok: false, message: 'Chat is not allowed for this user.' });
    }

    const existingThreadId = await findExistingDirectThread(req.user.uid, targetUid);
    if (existingThreadId) {
      await restoreConversationForUser(existingThreadId, req.user.uid);
      return res.json({ ok: true, state: 'existing', requiresApproval: false, threadId: existingThreadId });
    }

    const followResult = await pool.query(
      `SELECT id FROM follows
       WHERE follower_uid = $1 AND target_uid = $2
       LIMIT 1`,
      [req.user.uid, targetUid]
    );

    const isFollower = followResult.rows.length > 0;
    const targetSettings = await ensurePrivacySettings(targetUid);
    const policy = targetSettings ? targetSettings.non_follower_chat_policy : 'request';

    if (!isFollower && policy === 'deny') {
      return res.status(403).json({ ok: false, message: 'This user does not accept chats from non-followers.' });
    }

    if (!isFollower && policy === 'request') {
      const requestResult = await pool.query(
        `INSERT INTO chat_requests (requester_uid, target_uid, status, created_at, updated_at)
         VALUES ($1, $2, 'pending', NOW(), NOW())
         ON CONFLICT (requester_uid, target_uid)
         DO UPDATE SET status = 'pending', updated_at = NOW()
         RETURNING id`,
        [req.user.uid, targetUid]
      );

      return res.json({
        ok: true,
        state: 'pending',
        requiresApproval: true,
        requestId: Number(requestResult.rows[0].id),
      });
    }

    const threadId = await createDirectThread(req.user.uid, targetUid);

    await pool.query(
      `INSERT INTO chat_requests (requester_uid, target_uid, status, created_at, updated_at)
       VALUES ($1, $2, 'accepted', NOW(), NOW())
       ON CONFLICT (requester_uid, target_uid)
       DO UPDATE SET status = 'accepted', updated_at = NOW()`,
      [req.user.uid, targetUid]
    );

    return res.json({ ok: true, state: 'active', requiresApproval: false, threadId });
  } catch (error) {
    console.error('Start chat failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to start chat.' });
  }
});

router.post('/api/connections/chat/respond', async (req, res) => {
  if (!enforceRateLimit(req, res, 'chat_respond', 40)) return;

  const requestId = Number(req.body && req.body.requestId);
  const action = sanitizeText(req.body && req.body.action, 12).toLowerCase();

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ ok: false, message: 'Valid requestId is required.' });
  }
  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Action must be accept or decline.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT id, requester_uid, target_uid, status
       FROM chat_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );

    const request = requestResult.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Chat request not found.' });
    }

    if (request.target_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed to respond to this request.' });
    }

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'This chat request is no longer pending.' });
    }

    if (action === 'decline') {
      await client.query(
        `UPDATE chat_requests
         SET status = 'declined', updated_at = NOW()
         WHERE id = $1`,
        [requestId]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, state: 'declined' });
    }

    const blocked = await isBlockedEitherDirection(request.target_uid, request.requester_uid);
    if (blocked) {
      await client.query(
        `UPDATE chat_requests
         SET status = 'declined', updated_at = NOW()
         WHERE id = $1`,
        [requestId]
      );
      await client.query('COMMIT');
      return res.status(403).json({ ok: false, message: 'Chat is not allowed for this user.' });
    }

    await client.query(
      `UPDATE chat_requests
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1`,
      [requestId]
    );

    const threadId = await createDirectThread(request.target_uid, request.requester_uid);

    await client.query('COMMIT');
    return res.json({ ok: true, state: 'active', threadId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Chat request response failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to respond to chat request.' });
  } finally {
    client.release();
  }
});

router.post('/api/connections/chat/cancel', async (req, res) => {
  if (!enforceRateLimit(req, res, 'chat_cancel', 30)) return;

  const targetUid = sanitizeText(req.body && req.body.targetUid, 120);
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'targetUid is required.' });
  }

  try {
    await pool.query(
      `UPDATE chat_requests
       SET status = 'canceled', updated_at = NOW()
       WHERE requester_uid = $1 AND target_uid = $2 AND status = 'pending'`,
      [req.user.uid, targetUid]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Chat request cancel failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to cancel chat request.' });
  }
});

router.post('/api/connections/groups', async (req, res) => {
  if (!enforceRateLimit(req, res, 'group_create', 10)) return;

  const title = sanitizeText(req.body && req.body.title, 80);
  const membersRaw = Array.isArray(req.body && req.body.memberUids) ? req.body.memberUids : [];

  if (!title || title.length < 3) {
    return res.status(400).json({ ok: false, message: 'Group title must be at least 3 characters.' });
  }

  const dedupedMembers = [...new Set(
    membersRaw
      .map((uid) => sanitizeText(uid, 120))
      .filter((uid) => uid && uid !== req.user.uid)
  )].slice(0, 20);

  if (!dedupedMembers.length) {
    return res.status(400).json({ ok: false, message: 'Select at least one member.' });
  }

  try {
    const existingUsers = await pool.query(
      `SELECT uid FROM accounts WHERE uid = ANY($1::text[])`,
      [dedupedMembers]
    );

    if (existingUsers.rows.length !== dedupedMembers.length) {
      return res.status(400).json({ ok: false, message: 'One or more selected users do not exist.' });
    }

    const allowedMembers = await pool.query(
      `SELECT target_uid
       FROM follows
       WHERE follower_uid = $1
         AND target_uid = ANY($2::text[])`,
      [req.user.uid, dedupedMembers]
    );

    if (allowedMembers.rows.length !== dedupedMembers.length) {
      return res.status(403).json({
        ok: false,
        message: 'For safety, you can only create groups with users you currently follow.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const threadResult = await client.query(
        `INSERT INTO chat_threads (thread_type, created_by_uid, title)
         VALUES ('group', $1, $2)
         RETURNING id`,
        [req.user.uid, title]
      );

      const threadId = Number(threadResult.rows[0].id);
      await client.query(
        `INSERT INTO chat_participants (thread_id, user_uid, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [threadId, req.user.uid]
      );

      for (const memberUid of dedupedMembers) {
        await client.query(
          `INSERT INTO chat_participants (thread_id, user_uid, role, status)
           VALUES ($1, $2, 'member', 'active')
           ON CONFLICT (thread_id, user_uid)
           DO UPDATE SET status = 'active', left_at = NULL`,
          [threadId, memberUid]
        );
      }
      await client.query(
        `INSERT INTO chat_thread_user_state (thread_id, user_uid)
         SELECT $1, cp.user_uid
         FROM chat_participants cp
         WHERE cp.thread_id = $1
         ON CONFLICT (thread_id, user_uid) DO NOTHING`,
        [threadId]
      );

      await client.query('COMMIT');
      return res.json({ ok: true, threadId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Group creation failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create group chat.' });
  }
});

router.get('/api/connections/conversations', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 30, maxPageSize: 60 });
  const scopeRaw = sanitizeText(req.query.scope || 'active', 16).toLowerCase();
  const scope = ['active', 'archived', 'all'].includes(scopeRaw) ? scopeRaw : 'active';

  try {
    const convoResult = await pool.query(
      `SELECT
         ct.id,
         ct.thread_type,
         ct.title,
         ct.created_at,
         COALESCE(cts.is_archived, false) AS is_archived,
         COALESCE(cts.is_muted, false) AS is_muted,
         COALESCE(cts.manual_unread, false) AS manual_unread,
         COALESCE(unread.unread_count, 0)::int AS unread_count,
         lm.body AS last_message_body,
         lm.attachment_type AS last_message_attachment_type,
         lm.created_at AS last_message_at,
         lm.sender_uid AS last_message_sender_uid,
         lm.id AS last_message_id,
         lm.deleted_at AS last_message_deleted_at
       FROM chat_threads ct
       JOIN chat_participants cp
         ON cp.thread_id = ct.id
        AND cp.user_uid = $1
        AND cp.status = 'active'
       LEFT JOIN chat_thread_user_state cts
         ON cts.thread_id = ct.id
        AND cts.user_uid = $1
       LEFT JOIN LATERAL (
         SELECT cm.id, cm.body, cm.attachment_type, cm.created_at, cm.sender_uid, cm.deleted_at
         FROM chat_messages cm
         WHERE cm.thread_id = ct.id
           AND (cts.deleted_at IS NULL OR cm.created_at > cts.deleted_at)
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT 1
       ) lm ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS unread_count
         FROM chat_messages cmu
         WHERE cmu.thread_id = ct.id
           AND cmu.sender_uid <> $1
           AND (cts.deleted_at IS NULL OR cmu.created_at > cts.deleted_at)
           AND (cts.last_read_message_id IS NULL OR cmu.id > cts.last_read_message_id)
       ) unread ON true
       WHERE (
         $4::text = 'all'
         OR ($4::text = 'archived' AND COALESCE(cts.is_archived, false) = true)
         OR ($4::text = 'active' AND COALESCE(cts.is_archived, false) = false)
       )
         AND (cts.deleted_at IS NULL OR lm.id IS NOT NULL)
       ORDER BY COALESCE(lm.created_at, ct.created_at) DESC
       LIMIT $2 OFFSET $3`,
      [req.user.uid, pageSize, offset, scope]
    );

    const threadIds = convoResult.rows.map((row) => Number(row.id));
    const participantMap = await loadConversationParticipants(threadIds);

    const conversations = convoResult.rows.map((row) => {
      const threadId = Number(row.id);
      const participants = participantMap.get(threadId) || [];

      let title = row.title;
      if (row.thread_type === 'direct') {
        const other = participants.find((item) => item.uid !== req.user.uid);
        title = other ? other.displayName : title || 'Direct chat';
      }

      if (row.thread_type === 'group' && !title) {
        title = 'Group chat';
      }

      const baseUnreadCount = Number(row.unread_count || 0);
      const unreadCount = row.manual_unread === true ? Math.max(1, baseUnreadCount) : baseUnreadCount;
      const isRead = unreadCount === 0;
      let lastMessage = null;
      if (row.last_message_id != null) {
        if (row.last_message_deleted_at) {
          lastMessage = {
            body: 'Message deleted',
            createdAt: row.last_message_at,
            senderUid: row.last_message_sender_uid,
          };
        } else if (row.last_message_body) {
          lastMessage = {
            body: row.last_message_body,
            createdAt: row.last_message_at,
            senderUid: row.last_message_sender_uid,
          };
        } else if (row.last_message_attachment_type) {
          lastMessage = {
            body: `[${row.last_message_attachment_type === 'video' ? 'Video' : 'Image'}]`,
            createdAt: row.last_message_at,
            senderUid: row.last_message_sender_uid,
          };
        }
      }

      return {
        id: threadId,
        threadType: row.thread_type,
        title,
        participants,
        lastMessage,
        unreadCount,
        isRead,
        isArchived: row.is_archived === true,
        isMuted: row.is_muted === true,
        canLeave: row.thread_type === 'group',
      };
    });

    return res.json({ ok: true, page, pageSize, scope, conversations });
  } catch (error) {
    console.error('Conversations fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load conversations.' });
  }
});

router.get('/api/connections/conversations/:id/messages', async (req, res) => {
  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  const { page, pageSize, offset } = parsePagination(req, { defaultPageSize: 40, maxPageSize: 80 });

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }

    await ensureConversationUserState(threadId, req.user.uid);
    const stateResult = await pool.query(
      `SELECT deleted_at
       FROM chat_thread_user_state
       WHERE thread_id = $1 AND user_uid = $2
       LIMIT 1`,
      [threadId, req.user.uid]
    );
    const deletedAt = stateResult.rows[0] ? stateResult.rows[0].deleted_at : null;

    const result = await pool.query(
      `SELECT
         cm.id,
         cm.thread_id,
         cm.sender_uid,
         cm.body,
         cm.deleted_at,
         cm.parent_message_id,
         cm.attachment_type,
         cm.attachment_key,
         cm.attachment_link,
         cm.attachment_filename,
         cm.attachment_mime_type,
         cm.attachment_size_bytes,
         cm.created_at,
         COALESCE(p.display_name, a.display_name, a.username, a.email) AS sender_name,
         p.photo_link AS sender_photo_link,
         pm.body AS parent_body,
         pm.deleted_at AS parent_deleted_at,
         pm.sender_uid AS parent_sender_uid,
         COALESCE(pp.display_name, pa.display_name, pa.username, pa.email) AS parent_sender_name
       FROM chat_messages cm
       JOIN accounts a ON a.uid = cm.sender_uid
       LEFT JOIN profiles p ON p.uid = cm.sender_uid
       LEFT JOIN chat_messages pm ON pm.id = cm.parent_message_id
       LEFT JOIN accounts pa ON pa.uid = pm.sender_uid
       LEFT JOIN profiles pp ON pp.uid = pm.sender_uid
       WHERE cm.thread_id = $1
         AND ($4::timestamptz IS NULL OR cm.created_at > $4::timestamptz)
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT $2 OFFSET $3`,
      [threadId, pageSize, offset, deletedAt]
    );

    const messages = await Promise.all(result.rows.map((row) => mapChatMessageRow(row)));

    messages.reverse();

    await markConversationRead(threadId, req.user.uid);

    return res.json({ ok: true, page, pageSize, messages });
  } catch (error) {
    console.error('Messages fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load messages.' });
  }
});

router.post('/api/connections/conversations/:id/messages', upload.single('attachment'), async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_message_send', 90)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  const body = sanitizeText(req.body && req.body.body, 2000);
  const parentMessageIdRaw = Number(req.body && req.body.parentMessageId);
  const parentMessageId = Number.isInteger(parentMessageIdRaw) && parentMessageIdRaw > 0
    ? parentMessageIdRaw
    : null;
  const attachmentFile = req.file || null;

  if (!body && !attachmentFile) {
    return res.status(400).json({ ok: false, message: 'Write a message or attach a file.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }

    let attachment = null;
    if (attachmentFile) {
      const mime = String(attachmentFile.mimetype || '').toLowerCase();
      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');
      if (!isImage && !isVideo) {
        return res.status(400).json({ ok: false, message: 'Only image and video attachments are allowed.' });
      }

      const uploaded = await uploadToStorage({
        buffer: attachmentFile.buffer,
        filename: attachmentFile.originalname || `chat-upload-${Date.now()}`,
        mimeType: mime || 'application/octet-stream',
        prefix: 'connections/messages',
      });

      attachment = {
        type: isVideo ? 'video' : 'image',
        key: uploaded.key,
        link: null,
        filename: attachmentFile.originalname || null,
        mimeType: mime || null,
        sizeBytes: Number.isInteger(attachmentFile.size) ? attachmentFile.size : null,
      };
    }

    let validParentMessageId = null;
    if (parentMessageId) {
      const parentResult = await pool.query(
        `SELECT id
         FROM chat_messages
         WHERE id = $1
           AND thread_id = $2
         LIMIT 1`,
        [parentMessageId, threadId]
      );
      if (!parentResult.rows.length) {
        return res.status(400).json({ ok: false, message: 'Reply target message was not found.' });
      }
      validParentMessageId = parentMessageId;
    }

    const insertResult = await pool.query(
      `INSERT INTO chat_messages (
         thread_id,
         sender_uid,
         body,
         parent_message_id,
         attachment_type,
         attachment_key,
         attachment_link,
         attachment_filename,
         attachment_mime_type,
         attachment_size_bytes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        threadId,
        req.user.uid,
        body || '',
        validParentMessageId,
        attachment ? attachment.type : null,
        attachment ? attachment.key : null,
        attachment ? attachment.link : null,
        attachment ? attachment.filename : null,
        attachment ? attachment.mimeType : null,
        attachment ? attachment.sizeBytes : null,
      ]
    );

    const messageId = Number(insertResult.rows[0].id);
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET
         deleted_at = NULL,
         last_read_message_id = $3,
         manual_unread = false,
         updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid, messageId]
    );
    await pool.query(
      `DELETE FROM chat_typing
       WHERE thread_id = $1 AND user_uid = $2`,
      [threadId, req.user.uid]
    );

    const messageRowResult = await pool.query(
      `SELECT
         cm.id,
         cm.thread_id,
         cm.sender_uid,
         cm.body,
         cm.deleted_at,
         cm.parent_message_id,
         cm.attachment_type,
         cm.attachment_key,
         cm.attachment_link,
         cm.attachment_filename,
         cm.attachment_mime_type,
         cm.attachment_size_bytes,
         cm.created_at,
         COALESCE(p.display_name, a.display_name, a.username, a.email) AS sender_name,
         p.photo_link AS sender_photo_link,
         pm.body AS parent_body,
         pm.deleted_at AS parent_deleted_at,
         pm.sender_uid AS parent_sender_uid,
         COALESCE(pp.display_name, pa.display_name, pa.username, pa.email) AS parent_sender_name
       FROM chat_messages cm
       JOIN accounts a ON a.uid = cm.sender_uid
       LEFT JOIN profiles p ON p.uid = cm.sender_uid
       LEFT JOIN chat_messages pm ON pm.id = cm.parent_message_id
       LEFT JOIN accounts pa ON pa.uid = pm.sender_uid
       LEFT JOIN profiles pp ON pp.uid = pm.sender_uid
       WHERE cm.id = $1
       LIMIT 1`,
      [messageId]
    );

    const row = messageRowResult.rows[0];
    if (!row) {
      return res.status(500).json({ ok: false, message: 'Message created but could not be loaded.' });
    }
    const message = await mapChatMessageRow(row);

    try {
      const pushRecipientsResult = await pool.query(
        `SELECT cp.user_uid
         FROM chat_participants cp
         LEFT JOIN chat_thread_user_state cts
           ON cts.thread_id = cp.thread_id
          AND cts.user_uid = cp.user_uid
         WHERE cp.thread_id = $1
           AND cp.status = 'active'
           AND cp.user_uid <> $2
           AND COALESCE(cts.is_muted, false) = false
           AND NOT EXISTS (
             SELECT 1
             FROM blocked_users bu
             WHERE (bu.blocker_uid = cp.user_uid AND bu.blocked_uid = $2)
                OR (bu.blocker_uid = $2 AND bu.blocked_uid = cp.user_uid)
           )`,
        [threadId, req.user.uid]
      );
      const recipientUids = pushRecipientsResult.rows.map((entry) => entry.user_uid).filter(Boolean);
      if (recipientUids.length) {
        const senderName = req.user.displayName || req.user.username || req.user.email || 'Someone';
        let preview = String(body || '').trim();
        if (!preview && attachment) {
          preview = attachment.type === 'video' ? '[Video]' : '[Image]';
        }
        if (!preview) preview = 'New message';
        if (preview.length > 140) preview = `${preview.slice(0, 140).trim()}...`;

        await sendPushToUsers({
          recipientUids,
          title: senderName,
          body: preview,
          data: {
            type: 'chat_message',
            threadId: String(threadId),
            messageId: String(message.id || messageId),
          },
        });
      }
    } catch (pushError) {
      console.error('Chat push dispatch failed:', pushError);
    }

    return res.json({
      ok: true,
      message,
    });
  } catch (error) {
    console.error('Message send failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to send message.' });
  }
});

router.post('/api/connections/conversations/:id/mark-read', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_mark_read', 200)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await markConversationRead(threadId, req.user.uid);
    return res.json({ ok: true, isRead: true });
  } catch (error) {
    console.error('Conversation mark-read failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to mark conversation as read.' });
  }
});

router.post('/api/connections/conversations/:id/mark-unread', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_mark_unread', 200)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET manual_unread = true, updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    return res.json({ ok: true, isRead: false });
  } catch (error) {
    console.error('Conversation mark-unread failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to mark conversation as unread.' });
  }
});

router.post('/api/connections/conversations/:id/archive', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_archive', 120)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET is_archived = true, updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    return res.json({ ok: true, archived: true });
  } catch (error) {
    console.error('Conversation archive failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to archive conversation.' });
  }
});

router.post('/api/connections/conversations/:id/unarchive', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_unarchive', 120)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET is_archived = false, updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    return res.json({ ok: true, archived: false });
  } catch (error) {
    console.error('Conversation unarchive failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to unarchive conversation.' });
  }
});

router.post('/api/connections/conversations/:id/mute', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_mute', 120)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET is_muted = true, updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    return res.json({ ok: true, muted: true });
  } catch (error) {
    console.error('Conversation mute failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to mute conversation notifications.' });
  }
});

router.post('/api/connections/conversations/:id/unmute', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_unmute', 120)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET is_muted = false, updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    return res.json({ ok: true, muted: false });
  } catch (error) {
    console.error('Conversation unmute failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to unmute conversation notifications.' });
  }
});

router.delete('/api/connections/conversations/:id', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_delete_for_user', 100)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const membership = await getActiveConversationMembership(threadId, req.user.uid);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }
    await ensureConversationUserState(threadId, req.user.uid);
    await pool.query(
      `UPDATE chat_thread_user_state
       SET
         deleted_at = NOW(),
         manual_unread = false,
         is_archived = false,
         last_read_message_id = NULL,
         updated_at = NOW()
       WHERE thread_id = $1
         AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    await pool.query(
      `DELETE FROM chat_typing
       WHERE thread_id = $1 AND user_uid = $2`,
      [threadId, req.user.uid]
    );
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    console.error('Conversation delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to delete conversation.' });
  }
});

router.post('/api/connections/conversations/:id/leave', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_leave', 80)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const membershipResult = await client.query(
      `SELECT ct.id AS thread_id, ct.thread_type, cp.id AS participant_id, cp.role
       FROM chat_threads ct
       JOIN chat_participants cp
         ON cp.thread_id = ct.id
        AND cp.user_uid = $2
        AND cp.status = 'active'
       WHERE ct.id = $1
       FOR UPDATE`,
      [threadId, req.user.uid]
    );
    const membership = membershipResult.rows[0];
    if (!membership) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }

    if (membership.thread_type !== 'group') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Only group conversations can be left.' });
    }

    if (membership.role === 'owner') {
      const nextOwnerResult = await client.query(
        `SELECT id
         FROM chat_participants
         WHERE thread_id = $1
           AND user_uid <> $2
           AND status = 'active'
         ORDER BY joined_at ASC, id ASC
         LIMIT 1
         FOR UPDATE`,
        [threadId, req.user.uid]
      );
      if (nextOwnerResult.rows[0]) {
        await client.query(
          `UPDATE chat_participants
           SET role = 'owner'
           WHERE id = $1`,
          [nextOwnerResult.rows[0].id]
        );
      }
    }

    await client.query(
      `UPDATE chat_participants
       SET status = 'left', left_at = NOW(), role = 'member'
       WHERE thread_id = $1
         AND user_uid = $2
         AND status = 'active'`,
      [threadId, req.user.uid]
    );
    await client.query(
      `DELETE FROM chat_typing
       WHERE thread_id = $1 AND user_uid = $2`,
      [threadId, req.user.uid]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, left: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Conversation leave failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to leave conversation.' });
  } finally {
    client.release();
  }
});

router.delete('/api/connections/messages/:id', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_message_delete', 120)) return;

  const messageId = Number(req.params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid message id.' });
  }

  try {
    const messageCheck = await pool.query(
      `SELECT cm.id, cm.thread_id, cm.sender_uid, cm.deleted_at
       FROM chat_messages cm
       JOIN chat_participants cp
         ON cp.thread_id = cm.thread_id
        AND cp.user_uid = $2
        AND cp.status = 'active'
       WHERE cm.id = $1
       LIMIT 1`,
      [messageId, req.user.uid]
    );
    const messageRow = messageCheck.rows[0];
    if (!messageRow) {
      return res.status(404).json({ ok: false, message: 'Message not found in your conversations.' });
    }
    if (messageRow.sender_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'You can only delete messages you sent.' });
    }

    await pool.query(
      `UPDATE chat_messages
       SET
         body = '',
         attachment_type = NULL,
         attachment_key = NULL,
         attachment_link = NULL,
         attachment_filename = NULL,
         attachment_mime_type = NULL,
         attachment_size_bytes = NULL,
         deleted_at = COALESCE(deleted_at, NOW()),
         deleted_by_uid = $2
       WHERE id = $1`,
      [messageId, req.user.uid]
    );

    const deletedMessageResult = await pool.query(
      `SELECT
         cm.id,
         cm.thread_id,
         cm.sender_uid,
         cm.body,
         cm.deleted_at,
         cm.parent_message_id,
         cm.attachment_type,
         cm.attachment_key,
         cm.attachment_link,
         cm.attachment_filename,
         cm.attachment_mime_type,
         cm.attachment_size_bytes,
         cm.created_at,
         COALESCE(p.display_name, a.display_name, a.username, a.email) AS sender_name,
         p.photo_link AS sender_photo_link,
         pm.body AS parent_body,
         pm.deleted_at AS parent_deleted_at,
         pm.sender_uid AS parent_sender_uid,
         COALESCE(pp.display_name, pa.display_name, pa.username, pa.email) AS parent_sender_name
       FROM chat_messages cm
       JOIN accounts a ON a.uid = cm.sender_uid
       LEFT JOIN profiles p ON p.uid = cm.sender_uid
       LEFT JOIN chat_messages pm ON pm.id = cm.parent_message_id
       LEFT JOIN accounts pa ON pa.uid = pm.sender_uid
       LEFT JOIN profiles pp ON pp.uid = pm.sender_uid
       WHERE cm.id = $1
       LIMIT 1`,
      [messageId]
    );
    const deletedMessage = deletedMessageResult.rows[0]
      ? await mapChatMessageRow(deletedMessageResult.rows[0])
      : null;

    return res.json({ ok: true, message: deletedMessage });
  } catch (error) {
    console.error('Message delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to delete message.' });
  }
});

router.post('/api/connections/messages/:id/report', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_message_report', 30)) return;

  const messageId = Number(req.params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid message id.' });
  }

  const reason = sanitizeText(req.body && req.body.reason, 500) || null;

  try {
    const messageResult = await pool.query(
      `SELECT cm.id, cm.thread_id, cm.sender_uid, cm.deleted_at
       FROM chat_messages cm
       JOIN chat_participants cp
         ON cp.thread_id = cm.thread_id
        AND cp.user_uid = $2
        AND cp.status = 'active'
       WHERE cm.id = $1
       LIMIT 1`,
      [messageId, req.user.uid]
    );

    const messageRow = messageResult.rows[0];
    if (!messageRow) {
      return res.status(404).json({ ok: false, message: 'Message not found in your conversations.' });
    }
    if (messageRow.sender_uid === req.user.uid) {
      return res.status(400).json({ ok: false, message: 'You cannot report your own message.' });
    }
    if (messageRow.deleted_at) {
      return res.status(400).json({ ok: false, message: 'Deleted messages cannot be reported.' });
    }

    await pool.query(
      `INSERT INTO chat_message_reports
         (message_id, thread_id, reporter_uid, message_sender_uid, reason, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
       ON CONFLICT (message_id, reporter_uid)
       DO UPDATE SET reason = EXCLUDED.reason, status = 'pending', updated_at = NOW()`,
      [messageId, Number(messageRow.thread_id), req.user.uid, messageRow.sender_uid, reason]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Message report failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to report message.' });
  }
});

router.post('/api/connections/conversations/:id/typing', async (req, res) => {
  if (!enforceRateLimit(req, res, 'conversation_typing', 240)) return;

  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  const isTyping = req.body && req.body.isTyping === false ? false : true;

  try {
    const participantCheck = await pool.query(
      `SELECT id
       FROM chat_participants
       WHERE thread_id = $1
         AND user_uid = $2
         AND status = 'active'
       LIMIT 1`,
      [threadId, req.user.uid]
    );
    if (!participantCheck.rows.length) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }

    if (!isTyping) {
      await pool.query(
        `DELETE FROM chat_typing
         WHERE thread_id = $1 AND user_uid = $2`,
        [threadId, req.user.uid]
      );
      return res.json({ ok: true, typing: false });
    }

    await pool.query(
      `INSERT INTO chat_typing (thread_id, user_uid, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (thread_id, user_uid)
       DO UPDATE SET updated_at = NOW()`,
      [threadId, req.user.uid]
    );

    return res.json({ ok: true, typing: true });
  } catch (error) {
    console.error('Typing update failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to update typing state.' });
  }
});

router.get('/api/connections/conversations/:id/typing', async (req, res) => {
  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }

  try {
    const participantCheck = await pool.query(
      `SELECT id
       FROM chat_participants
       WHERE thread_id = $1
         AND user_uid = $2
         AND status = 'active'
       LIMIT 1`,
      [threadId, req.user.uid]
    );
    if (!participantCheck.rows.length) {
      return res.status(403).json({ ok: false, message: 'You are not a participant in this conversation.' });
    }

    const typingResult = await pool.query(
      `SELECT
         ct.user_uid,
         ct.updated_at,
         COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name
       FROM chat_typing ct
       JOIN accounts a ON a.uid = ct.user_uid
       LEFT JOIN profiles p ON p.uid = ct.user_uid
       JOIN chat_participants cp
         ON cp.thread_id = ct.thread_id
        AND cp.user_uid = ct.user_uid
        AND cp.status = 'active'
       WHERE ct.thread_id = $1
         AND ct.user_uid <> $2
         AND ct.updated_at >= NOW() - INTERVAL '8 seconds'
       ORDER BY ct.updated_at DESC`,
      [threadId, req.user.uid]
    );

    const typingUsers = typingResult.rows.map((row) => ({
      uid: row.user_uid,
      displayName: row.display_name || 'Member',
      updatedAt: row.updated_at,
    }));
    return res.json({ ok: true, typingUsers });
  } catch (error) {
    console.error('Typing fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load typing users.' });
  }
});

router.get('/api/connections/bootstrap', async (req, res) => {
  try {
    const profile = await fetchUserCard(req.user.uid, req.user.uid);
    const settings = await ensurePrivacySettings(req.user.uid);

    const countsResult = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM follows WHERE follower_uid = $1) AS following_count,
         (SELECT COUNT(*)::int FROM follows WHERE target_uid = $1) AS followers_count,
         (SELECT COUNT(*)::int FROM follow_requests WHERE target_uid = $1 AND status = 'pending') AS incoming_follow_requests,
         (SELECT COUNT(*)::int FROM chat_requests WHERE target_uid = $1 AND status = 'pending') AS incoming_chat_requests`,
      [req.user.uid]
    );

    const counts = countsResult.rows[0] || {
      following_count: 0,
      followers_count: 0,
      incoming_follow_requests: 0,
      incoming_chat_requests: 0,
    };

    return res.json({
      ok: true,
      me: profile,
      settings,
      counts: {
        following: Number(counts.following_count || 0),
        followers: Number(counts.followers_count || 0),
        incomingFollowRequests: Number(counts.incoming_follow_requests || 0),
        incomingChatRequests: Number(counts.incoming_chat_requests || 0),
      },
    });
  } catch (error) {
    console.error('Connections bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load connections dashboard.' });
  }
});

router.use('/api/connections', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'Attachment exceeds 25MB limit.' });
  }
  return next(err);
});

module.exports = router;
