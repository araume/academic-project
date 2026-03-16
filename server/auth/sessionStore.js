const crypto = require('crypto');
const pool = require('../db/pool');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let ensureSessionsSchemaPromise = null;
let lastCleanupAt = 0;

function normalizeSessionId(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 200);
}

function extractBearerToken(req) {
  const authHeader = req && req.headers ? req.headers.authorization : '';
  if (typeof authHeader !== 'string') return '';
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return '';
  return normalizeSessionId(trimmed.slice(7));
}

function getRequestSessionId(req, { preferBearer = true } = {}) {
  const cookieSessionId = normalizeSessionId(req?.cookies?.session_id || '');
  const bearerSessionId = extractBearerToken(req);
  if (preferBearer) {
    return bearerSessionId || cookieSessionId;
  }
  return cookieSessionId || bearerSessionId;
}

async function ensureSessionsSchema() {
  if (!ensureSessionsSchemaPromise) {
    ensureSessionsSchemaPromise = pool
      .query(
        `CREATE TABLE IF NOT EXISTS auth_sessions (
          session_id TEXT PRIMARY KEY,
          uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS auth_sessions_uid_idx
          ON auth_sessions(uid);

        CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx
          ON auth_sessions(expires_at);`
      )
      .catch((error) => {
        ensureSessionsSchemaPromise = null;
        throw error;
      });
  }
  await ensureSessionsSchemaPromise;
}

async function cleanupExpiredSessionsIfNeeded() {
  const now = Date.now();
  if (now - lastCleanupAt < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupAt = now;
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
}

async function createSession(user) {
  const uid = typeof user?.uid === 'string' ? user.uid.trim() : '';
  if (!uid) {
    throw new Error('Cannot create session without user uid.');
  }
  await ensureSessionsSchema();
  await cleanupExpiredSessionsIfNeeded();

  const sessionId = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO auth_sessions (session_id, uid, payload, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3::jsonb, NOW(), NOW(), $4)`,
    [sessionId, uid, JSON.stringify(user), expiresAt]
  );

  return sessionId;
}

async function getSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  if (!normalized) return null;

  await ensureSessionsSchema();
  await cleanupExpiredSessionsIfNeeded();

  const result = await pool.query(
    `SELECT uid, payload, created_at, expires_at
     FROM auth_sessions
     WHERE session_id = $1
     LIMIT 1`,
    [normalized]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  const expiresAtMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await pool.query('DELETE FROM auth_sessions WHERE session_id = $1', [normalized]);
    return null;
  }

  const user = row.payload && typeof row.payload === 'object' ? { ...row.payload } : {};
  if (!user.uid) {
    user.uid = row.uid;
  }

  pool.query('UPDATE auth_sessions SET last_seen_at = NOW() WHERE session_id = $1', [normalized]).catch(
    () => {}
  );

  return {
    user,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: expiresAtMs,
  };
}

async function deleteSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  if (!normalized) return;
  await ensureSessionsSchema();
  await pool.query('DELETE FROM auth_sessions WHERE session_id = $1', [normalized]);
}

async function deleteSessionsForUid(uid) {
  const safeUid = typeof uid === 'string' ? uid.trim() : '';
  if (!safeUid) return;
  await ensureSessionsSchema();
  await pool.query('DELETE FROM auth_sessions WHERE uid = $1', [safeUid]);
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  deleteSessionsForUid,
  getRequestSessionId,
};
