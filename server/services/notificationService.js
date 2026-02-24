const pool = require('../db/pool');
const { sendPushToUsers } = require('./pushService');

const NOTIFICATION_TYPES = new Set([
  'following_new_post',
  'post_liked',
  'post_commented',
  'document_liked',
  'document_commented',
  'community_rules_required',
]);

const TYPE_SETTING_COLUMN = {
  following_new_post: 'notify_new_posts_from_following',
  post_liked: 'notify_post_activity',
  post_commented: 'notify_post_activity',
  document_liked: 'notify_document_activity',
  document_commented: 'notify_document_activity',
};

let ensurePromise = null;

function normalizeUid(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeEntityId(value) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, 200);
}

function normalizeUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 512);
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return {};
  }
  const safe = {};
  Object.entries(meta).forEach(([key, value]) => {
    const safeKey = String(key || '').trim().slice(0, 80);
    if (!safeKey) return;
    if (typeof value === 'string') {
      safe[safeKey] = value.trim().slice(0, 500);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safe[safeKey] = value;
      return;
    }
    if (Array.isArray(value)) {
      safe[safeKey] = value.slice(0, 12).map((item) => String(item).slice(0, 120));
      return;
    }
    safe[safeKey] = String(value).slice(0, 500);
  });
  return safe;
}

function uniqueUidList(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const uid = normalizeUid(value);
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    out.push(uid);
  });
  return out;
}

async function ensureNotificationsTables() {
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

    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      actor_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'following_new_post',
          'post_liked',
          'post_commented',
          'document_liked',
          'document_commented',
          'community_rules_required'
        )
      ),
      entity_type TEXT,
      entity_id TEXT,
      target_url TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_read BOOLEAN NOT NULL DEFAULT false,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
      ON notifications(recipient_uid, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
      ON notifications(recipient_uid, is_read, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS notifications_actor_idx
      ON notifications(actor_uid);

    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS notify_new_posts_from_following BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS notify_post_activity BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE user_privacy_settings
      ADD COLUMN IF NOT EXISTS notify_document_activity BOOLEAN NOT NULL DEFAULT true;

    ALTER TABLE notifications
      DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_type_check CHECK (
        type IN (
          'following_new_post',
          'post_liked',
          'post_commented',
          'document_liked',
          'document_commented',
          'community_rules_required'
        )
      );
  `;
  await pool.query(sql);
}

async function ensureNotificationsReady() {
  if (!ensurePromise) {
    ensurePromise = ensureNotificationsTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

async function filterRecipientsByPreference(recipientUids, notificationType) {
  const settingColumn = TYPE_SETTING_COLUMN[notificationType];
  if (!settingColumn || !recipientUids.length) {
    return recipientUids;
  }

  try {
    const result = await pool.query(
      `SELECT uid, ${settingColumn} AS enabled
       FROM user_privacy_settings
       WHERE uid = ANY($1::text[])`,
      [recipientUids]
    );
    const enabledByUid = new Map(result.rows.map((row) => [row.uid, row.enabled !== false]));
    return recipientUids.filter((uid) => {
      if (!enabledByUid.has(uid)) return true;
      return enabledByUid.get(uid) === true;
    });
  } catch (error) {
    if (error && error.code === '42P01') {
      return recipientUids;
    }
    throw error;
  }
}

async function createNotificationsForRecipients(input = {}) {
  const type = typeof input.type === 'string' ? input.type.trim() : '';
  if (!NOTIFICATION_TYPES.has(type)) {
    throw new Error('Invalid notification type.');
  }

  await ensureNotificationsReady();

  const actorUid = normalizeUid(input.actorUid);
  const entityType = typeof input.entityType === 'string' ? input.entityType.trim().slice(0, 40) : null;
  const entityId = normalizeEntityId(input.entityId);
  const targetUrl = normalizeUrl(input.targetUrl);
  const meta = sanitizeMeta(input.meta);

  let recipientUids = uniqueUidList(Array.isArray(input.recipientUids) ? input.recipientUids : []);
  if (actorUid) {
    recipientUids = recipientUids.filter((uid) => uid !== actorUid);
  }
  if (!recipientUids.length) {
    return { inserted: 0 };
  }

  const allowedRecipients = await filterRecipientsByPreference(recipientUids, type);
  if (!allowedRecipients.length) {
    return { inserted: 0 };
  }

  const values = [];
  const rows = [];
  let param = 1;

  allowedRecipients.forEach((recipientUid) => {
    values.push(recipientUid);
    values.push(actorUid || null);
    values.push(type);
    values.push(entityType);
    values.push(entityId);
    values.push(targetUrl);
    values.push(JSON.stringify(meta));
    rows.push(
      `($${param++}, $${param++}, $${param++}, $${param++}, $${param++}, $${param++}, $${param++}::jsonb, false, NULL, NOW())`
    );
  });

  await pool.query(
    `INSERT INTO notifications
      (recipient_uid, actor_uid, type, entity_type, entity_id, target_url, meta, is_read, read_at, created_at)
     VALUES ${rows.join(', ')}`,
    values
  );

  try {
    const actorDisplayName = actorUid
      ? await resolveActorDisplayName(actorUid)
      : (type === 'community_rules_required' ? 'Community' : 'Someone');
    const pushPayload = buildPushPayload({
      type,
      actorDisplayName,
      entityType,
      entityId,
      targetUrl,
      meta,
    });
    if (pushPayload) {
      await sendPushToUsers({
        recipientUids: allowedRecipients,
        title: pushPayload.title,
        body: pushPayload.body,
        data: pushPayload.data,
      });
    }
  } catch (error) {
    console.error('Notification push dispatch failed:', error);
  }

  return { inserted: allowedRecipients.length };
}

async function createNotification(input = {}) {
  const recipientUid = normalizeUid(input.recipientUid);
  if (!recipientUid) {
    return { inserted: 0 };
  }
  return createNotificationsForRecipients({
    ...input,
    recipientUids: [recipientUid],
  });
}

async function listNotifications(uid, { page = 1, pageSize = 20 } = {}) {
  await ensureNotificationsReady();

  const safeUid = normalizeUid(uid);
  const resolvedPage = Math.max(Number(page) || 1, 1);
  const resolvedPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const offset = (resolvedPage - 1) * resolvedPageSize;

  const [totalResult, unreadResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM notifications
       WHERE recipient_uid = $1`,
      [safeUid]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS unread
       FROM notifications
       WHERE recipient_uid = $1 AND is_read = false`,
      [safeUid]
    ),
    pool.query(
      `SELECT
        n.id,
        n.type,
        n.entity_type,
        n.entity_id,
        n.target_url,
        n.meta,
        n.is_read,
        n.read_at,
        n.created_at,
        n.actor_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS actor_display_name,
        p.photo_link AS actor_photo_link
       FROM notifications n
       LEFT JOIN accounts a ON a.uid = n.actor_uid
       LEFT JOIN profiles p ON p.uid = n.actor_uid
       WHERE n.recipient_uid = $1
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $2 OFFSET $3`,
      [safeUid, resolvedPageSize, offset]
    ),
  ]);

  return {
    notifications: rowsResult.rows,
    page: resolvedPage,
    pageSize: resolvedPageSize,
    total: Number(totalResult.rows[0] && totalResult.rows[0].total) || 0,
    unreadCount: Number(unreadResult.rows[0] && unreadResult.rows[0].unread) || 0,
  };
}

async function countUnreadNotifications(uid) {
  await ensureNotificationsReady();
  const safeUid = normalizeUid(uid);
  const result = await pool.query(
    `SELECT COUNT(*)::int AS unread
     FROM notifications
     WHERE recipient_uid = $1 AND is_read = false`,
    [safeUid]
  );
  return Number(result.rows[0] && result.rows[0].unread) || 0;
}

async function markNotificationRead(uid, notificationId) {
  await ensureNotificationsReady();
  const safeUid = normalizeUid(uid);
  const parsedId = Number(notificationId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) return false;

  const result = await pool.query(
    `UPDATE notifications
     SET is_read = true,
         read_at = COALESCE(read_at, NOW())
     WHERE id = $1
       AND recipient_uid = $2
     RETURNING id`,
    [parsedId, safeUid]
  );
  return result.rowCount > 0;
}

async function markAllNotificationsRead(uid) {
  await ensureNotificationsReady();
  const safeUid = normalizeUid(uid);
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = true,
         read_at = COALESCE(read_at, NOW())
     WHERE recipient_uid = $1
       AND is_read = false`,
    [safeUid]
  );
  return Number(result.rowCount || 0);
}

async function isBlockedEitherDirection(uidA, uidB) {
  const left = normalizeUid(uidA);
  const right = normalizeUid(uidB);
  if (!left || !right || left === right) return false;

  try {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM blocked_users
         WHERE (blocker_uid = $1 AND blocked_uid = $2)
            OR (blocker_uid = $2 AND blocked_uid = $1)
       ) AS blocked`,
      [left, right]
    );
    return result.rows[0] ? result.rows[0].blocked === true : false;
  } catch (error) {
    if (error && error.code === '42P01') {
      return false;
    }
    throw error;
  }
}

async function resolveActorDisplayName(uid) {
  if (!uid) return 'Someone';
  try {
    const result = await pool.query(
      `SELECT COALESCE(p.display_name, a.display_name, a.username, a.email) AS name
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       WHERE a.uid = $1
       LIMIT 1`,
      [uid]
    );
    const row = result.rows[0];
    return row && row.name ? String(row.name).trim() : 'Someone';
  } catch (error) {
    console.error('Notification actor lookup failed:', error);
    return 'Someone';
  }
}

function buildPushPayload({ type, actorDisplayName, entityType, entityId, targetUrl, meta }) {
  const safeActor = actorDisplayName || 'Someone';
  const postTitle = typeof meta.postTitle === 'string' ? meta.postTitle.trim() : 'your post';
  const documentTitle = typeof meta.documentTitle === 'string' ? meta.documentTitle.trim() : 'your upload';
  const communityName = typeof meta.communityName === 'string' ? meta.communityName.trim() : 'your community';

  if (type === 'following_new_post') {
    return {
      title: 'New post from someone you follow',
      body: `${safeActor} shared: ${postTitle || 'a new post'}`,
      data: { type, entityType, entityId, targetUrl },
    };
  }
  if (type === 'post_liked') {
    return {
      title: 'Your post got a like',
      body: `${safeActor} liked ${postTitle || 'your post'}.`,
      data: { type, entityType, entityId, targetUrl },
    };
  }
  if (type === 'post_commented') {
    return {
      title: 'New comment on your post',
      body: `${safeActor} commented on ${postTitle || 'your post'}.`,
      data: { type, entityType, entityId, targetUrl },
    };
  }
  if (type === 'document_liked') {
    return {
      title: 'Your document got a like',
      body: `${safeActor} liked ${documentTitle || 'your upload'}.`,
      data: { type, entityType, entityId, targetUrl },
    };
  }
  if (type === 'document_commented') {
    return {
      title: 'New comment on your document',
      body: `${safeActor} commented on ${documentTitle || 'your upload'}.`,
      data: { type, entityType, entityId, targetUrl },
    };
  }
  if (type === 'community_rules_required') {
    return {
      title: 'Community update',
      body: `Please review the latest rules in ${communityName}.`,
      data: { type, entityType, entityId, targetUrl },
    };
  }
  return null;
}

module.exports = {
  ensureNotificationsReady,
  createNotification,
  createNotificationsForRecipients,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  isBlockedEitherDirection,
};
