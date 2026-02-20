const pool = require('../db/pool');
const { ObjectId } = require('mongodb');
const { getMongoDb } = require('../db/mongo');

let ensureAuditSchemaPromise = null;

const TRACKED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const PRIVATE_PATH_PATTERNS = [
  /^\/api\/personal(?:\/|$)/i,
  /^\/api\/connections\/chat(?:\/|$)/i,
  /^\/api\/connections\/conversations\/[^/]+\/messages(?:\/|$)/i,
  /^\/api\/connections\/groups(?:\/|$)/i,
];
const EXCLUDED_PATH_PATTERNS = [
  /^\/api\/login$/i,
  /^\/api\/signup$/i,
  /^\/api\/logout$/i,
  /^\/api\/verification\/resend$/i,
  /^\/verify-email(?:\/|$)/i,
];

function normalizePath(pathname) {
  if (!pathname) return '';
  return pathname
    .replace(/[0-9a-f]{24}/gi, ':id')
    .replace(/[0-9]+/g, ':n')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ':uuid'
    );
}

function extractTarget(req) {
  const params = req.params || {};
  const targetId =
    params.uid ||
    params.id ||
    params.uuid ||
    params.postId ||
    params.commentId ||
    params.reportId ||
    null;

  if (!targetId) {
    return { targetType: null, targetId: null };
  }

  if (params.uid) return { targetType: 'user', targetId: String(targetId) };
  if (params.uuid) return { targetType: 'document', targetId: String(targetId) };
  if (params.postId) return { targetType: 'post', targetId: String(targetId) };
  if (params.commentId) return { targetType: 'comment', targetId: String(targetId) };
  if (params.reportId) return { targetType: 'report', targetId: String(targetId) };
  return { targetType: 'resource', targetId: String(targetId) };
}

function isSuccessStatus(statusCode) {
  const code = Number(statusCode);
  return Number.isInteger(code) && code >= 200 && code < 400;
}

function toPossessive(name) {
  const text = String(name || '').trim();
  if (!text) return "someone's";
  if (text.endsWith('s') || text.endsWith('S')) return `${text}'`;
  return `${text}'s`;
}

async function lookupAccountDisplayName(uid) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) return null;
  try {
    const result = await pool.query(
      `SELECT COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       WHERE a.uid = $1
       LIMIT 1`,
      [safeUid]
    );
    return result.rows[0] ? result.rows[0].display_name || null : null;
  } catch (error) {
    return null;
  }
}

async function lookupMainFeedPostSummary(postId) {
  const safeId = String(postId || '').trim();
  if (!safeId || !ObjectId.isValid(safeId)) return null;
  try {
    const db = await getMongoDb();
    const row = await db.collection('posts').findOne(
      { _id: new ObjectId(safeId) },
      { projection: { title: 1, uploaderUid: 1 } }
    );
    if (!row) return null;
    return {
      id: safeId,
      title: row.title || 'Untitled post',
      uploaderUid: row.uploaderUid || null,
    };
  } catch (error) {
    return null;
  }
}

async function deriveAction(req, context = {}) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = req.path || req.originalUrl || '';
  const normalizedPath = normalizePath(path);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const statusCode = Number(context.statusCode || 0);
  const responseBody =
    context.responseBody && typeof context.responseBody === 'object' ? context.responseBody : {};
  const executorName =
    String(
      context.executorName ||
      (req.user && (req.user.displayName || req.user.username || req.user.email)) ||
      'User'
    ).trim() || 'User';

  let actionType = `${method} ${normalizedPath}`;
  let targetUrl = null;
  let recipientUid = null;
  let recipientName = null;
  let postTitle = null;

  const isSuccess = isSuccessStatus(statusCode);

  if (/^\/api\/posts\/[^/]+\/like$/i.test(path) && isSuccess) {
    const postId = req.params && req.params.id ? String(req.params.id) : null;
    const postSummary = await lookupMainFeedPostSummary(postId);
    recipientUid = postSummary ? postSummary.uploaderUid : null;
    recipientName = (await lookupAccountDisplayName(recipientUid)) || 'a user';
    postTitle = postSummary ? postSummary.title : null;
    actionType = `${executorName} ${body.action === 'unlike' ? 'unliked' : 'liked'} ${toPossessive(recipientName)} post`;
    targetUrl = postId ? `/home?post=${encodeURIComponent(postId)}` : null;
  } else if (/^\/api\/posts\/[^/]+\/comments$/i.test(path) && method === 'POST' && isSuccess) {
    const postId = req.params && req.params.id ? String(req.params.id) : null;
    const postSummary = await lookupMainFeedPostSummary(postId);
    recipientUid = postSummary ? postSummary.uploaderUid : null;
    recipientName = (await lookupAccountDisplayName(recipientUid)) || 'a user';
    postTitle = postSummary ? postSummary.title : null;
    actionType = `${executorName} commented on ${toPossessive(recipientName)} post`;
    targetUrl = postId ? `/home?post=${encodeURIComponent(postId)}` : null;
  } else if (/^\/api\/posts$/i.test(path) && method === 'POST' && isSuccess) {
    const createdPost =
      responseBody && responseBody.post && typeof responseBody.post === 'object' ? responseBody.post : null;
    const postId = createdPost && createdPost.id ? String(createdPost.id) : null;
    postTitle = createdPost && createdPost.title ? String(createdPost.title) : null;
    actionType = `${executorName} published a post`;
    targetUrl = postId ? `/home?post=${encodeURIComponent(postId)}` : null;
  } else if (/^\/api\/connections\/follow\/request$/i.test(path) && method === 'POST' && isSuccess) {
    recipientUid = String(body.targetUid || '').trim() || null;
    recipientName = (await lookupAccountDisplayName(recipientUid)) || 'a user';
    actionType = `${executorName} requested to follow ${recipientName}`;
    targetUrl = recipientUid ? `/profile?uid=${encodeURIComponent(recipientUid)}` : null;
  } else if (/^\/api\/posts\/[^/]+\/report$/i.test(path) && method === 'POST') {
    actionType = `${executorName} reported a post`;
  } else if (/^\/api\/community\/[^/]+\/reports$/i.test(path) && method === 'POST') {
    actionType = `${executorName} submitted a community report`;
  } else if (/^\/api\/community\/[^/]+\/reports\/[^/]+\/resolve$/i.test(path) && method === 'POST') {
    actionType = `${executorName} resolved a community report`;
  } else if (/^\/api\/connections\/report-user$/i.test(path) && method === 'POST') {
    actionType = `${executorName} reported a user profile`;
  } else if (/^\/api\/admin\//i.test(path)) {
    actionType = `Admin action: ${method} ${normalizedPath.replace('/api/admin/', '')}`;
  }

  if (/^\/api\/posts\/[^/]+\/like$/i.test(path)) {
    const postId = req.params && req.params.id ? String(req.params.id) : null;
    if (postId) {
      targetUrl = `/home?post=${encodeURIComponent(postId)}`;
    }
  }
  if (/^\/api\/posts\/[^/]+\/comments$/i.test(path) && method === 'POST') {
    const postId = req.params && req.params.id ? String(req.params.id) : null;
    if (postId) {
      targetUrl = `/home?post=${encodeURIComponent(postId)}`;
    }
  }
  if (/^\/api\/posts$/i.test(path) && method === 'POST' && !targetUrl) {
    const createdPostId =
      responseBody && responseBody.post && responseBody.post.id ? String(responseBody.post.id) : null;
    if (createdPostId) {
      targetUrl = `/home?post=${encodeURIComponent(createdPostId)}`;
    }
  }
  if (/^\/api\/connections\/follow\/request$/i.test(path) && method === 'POST' && !targetUrl) {
    const targetUid = String(body.targetUid || '').trim();
    if (targetUid) {
      targetUrl = `/profile?uid=${encodeURIComponent(targetUid)}`;
    }
  }

  if (/^\/api\/posts\/[^/]+\/like$/i.test(path)) {
    actionType = actionType || (body.action === 'unlike' ? `${executorName} unliked a post` : `${executorName} liked a post`);
  }

  const target = extractTarget(req);
  return {
    actionKey: `${method}:${normalizedPath}`,
    actionType,
    targetType: target.targetType,
    targetId: target.targetId,
    sourcePath: normalizedPath,
    targetUrl,
    recipientUid,
    recipientName,
    postTitle,
  };
}

function isPrivatePath(pathname) {
  return PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function shouldSkipAudit(req) {
  const path = req.path || req.originalUrl || '';
  if (!TRACKED_METHODS.has(String(req.method || '').toUpperCase())) {
    return true;
  }
  if (!path.startsWith('/api/')) {
    return true;
  }
  if (EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
    return true;
  }
  if (isPrivatePath(path)) {
    return true;
  }
  return false;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const blocked = ['password', 'token', 'cookie', 'authorization', 'secret'];
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowered = key.toLowerCase();
    if (blocked.some((part) => lowered.includes(part))) {
      continue;
    }
    if (typeof value === 'string') {
      safe[key] = value.slice(0, 500);
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[key] = value;
    }
  }
  return safe;
}

function safeBodySnapshot(body) {
  if (!body || typeof body !== 'object') {
    return {};
  }
  return sanitizeMetadata(body);
}

async function ensureAuditSchema() {
  const sql = `
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banned_reason TEXT;
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      executor_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      executor_role TEXT,
      action_key TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      course TEXT,
      source_path TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_executor_idx ON admin_audit_logs(executor_uid, created_at DESC);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_course_idx ON admin_audit_logs(course, created_at DESC);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action_key, created_at DESC);
  `;
  await pool.query(sql);
}

async function ensureAuditReady() {
  if (!ensureAuditSchemaPromise) {
    ensureAuditSchemaPromise = ensureAuditSchema().catch((error) => {
      ensureAuditSchemaPromise = null;
      throw error;
    });
  }
  await ensureAuditSchemaPromise;
}

async function logAuditEvent({
  executorUid,
  executorRole,
  course,
  actionKey,
  actionType,
  targetType,
  targetId,
  sourcePath,
  metadata,
}) {
  await ensureAuditReady();
  await pool.query(
    `INSERT INTO admin_audit_logs
      (executor_uid, executor_role, action_key, action_type, target_type, target_id, course, source_path, metadata, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())`,
    [
      executorUid || null,
      executorRole || null,
      actionKey || 'unknown',
      actionType || 'Unknown action',
      targetType || null,
      targetId || null,
      course || null,
      sourcePath || null,
      JSON.stringify(sanitizeMetadata(metadata || {})),
    ]
  );
}

module.exports = {
  deriveAction,
  ensureAuditReady,
  logAuditEvent,
  safeBodySnapshot,
  shouldSkipAudit,
};
