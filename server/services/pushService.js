const admin = require('firebase-admin');
const pool = require('../db/pool');

let ensurePromise = null;
let firebaseInitAttempted = false;
let firebaseEnabled = false;

function normalizeUid(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 4096);
}

function normalizePlatform(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'ios' || normalized === 'web') return normalized;
  return 'android';
}

function parseServiceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (error) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', error);
      return null;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT_BASE64:', error);
      return null;
    }
  }

  return null;
}

function ensureFirebaseReady() {
  if (firebaseInitAttempted) return firebaseEnabled;
  firebaseInitAttempted = true;

  try {
    if (!admin.apps.length) {
      const credentials = parseServiceAccountFromEnv();
      const projectId = process.env.FIREBASE_PROJECT_ID || (credentials && credentials.project_id) || undefined;

      if (credentials) {
        admin.initializeApp({
          credential: admin.credential.cert(credentials),
          ...(projectId ? { projectId } : {}),
        });
      } else {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          ...(projectId ? { projectId } : {}),
        });
      }
    }

    firebaseEnabled = true;
  } catch (error) {
    firebaseEnabled = false;
    console.error('Push notifications disabled: Firebase init failed.', error);
  }

  return firebaseEnabled;
}

async function ensurePushTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS push_device_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'android'
        CHECK (platform IN ('android', 'ios', 'web')),
      device_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS push_device_tokens_user_active_idx
      ON push_device_tokens(user_uid, is_active, updated_at DESC);
    CREATE INDEX IF NOT EXISTS push_device_tokens_last_seen_idx
      ON push_device_tokens(last_seen_at DESC);
  `;

  await pool.query(sql);
}

async function ensurePushReady() {
  if (!ensurePromise) {
    ensurePromise = ensurePushTables().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

async function upsertPushToken({ userUid, token, platform = 'android', deviceId = null }) {
  await ensurePushReady();

  const safeUid = normalizeUid(userUid);
  const safeToken = normalizeToken(token);
  if (!safeUid || !safeToken) return false;

  await pool.query(
    `INSERT INTO push_device_tokens (
       user_uid,
       token,
       platform,
       device_id,
       is_active,
       created_at,
       updated_at,
       last_seen_at
     )
     VALUES ($1, $2, $3, $4, true, NOW(), NOW(), NOW())
     ON CONFLICT (token)
     DO UPDATE SET
       user_uid = EXCLUDED.user_uid,
       platform = EXCLUDED.platform,
       device_id = EXCLUDED.device_id,
       is_active = true,
       updated_at = NOW(),
       last_seen_at = NOW()`,
    [safeUid, safeToken, normalizePlatform(platform), deviceId ? String(deviceId).slice(0, 200) : null]
  );

  return true;
}

async function deactivatePushToken({ userUid, token }) {
  await ensurePushReady();

  const safeUid = normalizeUid(userUid);
  const safeToken = normalizeToken(token);
  if (!safeUid || !safeToken) return false;

  const result = await pool.query(
    `UPDATE push_device_tokens
     SET is_active = false, updated_at = NOW()
     WHERE user_uid = $1
       AND token = $2`,
    [safeUid, safeToken]
  );

  return result.rowCount > 0;
}

async function deactivateInvalidTokens(tokens) {
  await ensurePushReady();

  const safeTokens = Array.isArray(tokens)
    ? tokens.map(normalizeToken).filter(Boolean)
    : [];

  if (!safeTokens.length) return 0;

  const result = await pool.query(
    `UPDATE push_device_tokens
     SET is_active = false, updated_at = NOW()
     WHERE token = ANY($1::text[])`,
    [safeTokens]
  );

  return result.rowCount || 0;
}

function toFirebaseData(data) {
  if (!data || typeof data !== 'object') return undefined;
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    const safeKey = String(key || '').trim().slice(0, 60);
    if (!safeKey || value === undefined) return;
    if (value === null) {
      out[safeKey] = '';
      return;
    }
    out[safeKey] = String(value).slice(0, 300);
  });
  return Object.keys(out).length ? out : undefined;
}

async function loadActiveTokens(recipientUids) {
  await ensurePushReady();

  if (!Array.isArray(recipientUids) || !recipientUids.length) {
    return [];
  }

  const unique = [...new Set(recipientUids.map(normalizeUid).filter(Boolean))];
  if (!unique.length) return [];

  const result = await pool.query(
    `SELECT token
     FROM push_device_tokens
     WHERE user_uid = ANY($1::text[])
       AND is_active = true`,
    [unique]
  );

  return result.rows.map((row) => normalizeToken(row.token)).filter(Boolean);
}

async function sendPushToUsers({ recipientUids = [], title = '', body = '', data = null }) {
  const safeRecipients = [...new Set((recipientUids || []).map(normalizeUid).filter(Boolean))];
  if (!safeRecipients.length) {
    return { sentCount: 0, failureCount: 0, skipped: true };
  }

  const safeTitle = String(title || '').trim().slice(0, 120) || 'MyBuddy';
  const safeBody = String(body || '').trim().slice(0, 240) || 'You have a new update.';

  const tokens = await loadActiveTokens(safeRecipients);
  if (!tokens.length) {
    return { sentCount: 0, failureCount: 0, skipped: true };
  }

  if (!ensureFirebaseReady()) {
    return { sentCount: 0, failureCount: 0, skipped: true };
  }

  const chunkSize = 500;
  let sentCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: safeTitle,
          body: safeBody,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'mybuddy_default',
          },
        },
        data: toFirebaseData(data),
      });

      sentCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((item, index) => {
        if (item.success) return;
        const code = item.error && item.error.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          invalidTokens.push(chunk[index]);
        }
      });
    } catch (error) {
      failureCount += chunk.length;
      console.error('Push send chunk failed:', error);
    }
  }

  if (invalidTokens.length) {
    await deactivateInvalidTokens(invalidTokens);
  }

  return {
    sentCount,
    failureCount,
  };
}

module.exports = {
  ensurePushReady,
  upsertPushToken,
  deactivatePushToken,
  sendPushToUsers,
};
