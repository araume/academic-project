const pool = require('../db/pool');

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

function deriveAction(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = req.path || req.originalUrl || '';
  const normalizedPath = normalizePath(path);
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  let actionType = `${method} ${normalizedPath}`;
  if (/^\/api\/posts\/[^/]+\/like$/i.test(path)) {
    actionType = body.action === 'unlike' ? 'Unlike post' : 'Like post';
  } else if (/^\/api\/posts\/[^/]+\/comments$/i.test(path) && method === 'POST') {
    actionType = 'Comment on post';
  } else if (/^\/api\/posts\/[^/]+\/report$/i.test(path) && method === 'POST') {
    actionType = 'Report post';
  } else if (/^\/api\/community\/[^/]+\/reports$/i.test(path) && method === 'POST') {
    actionType = 'Submit community report';
  } else if (/^\/api\/community\/[^/]+\/reports\/[^/]+\/resolve$/i.test(path) && method === 'POST') {
    actionType = 'Resolve community report';
  } else if (/^\/api\/connections\/report-user$/i.test(path) && method === 'POST') {
    actionType = 'Report user profile';
  } else if (/^\/api\/admin\//i.test(path)) {
    actionType = `Admin action: ${method} ${normalizedPath.replace('/api/admin/', '')}`;
  }

  const target = extractTarget(req);
  return {
    actionKey: `${method}:${normalizedPath}`,
    actionType,
    targetType: target.targetType,
    targetId: target.targetId,
    sourcePath: normalizedPath,
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
