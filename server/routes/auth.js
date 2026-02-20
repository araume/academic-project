const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { hashPassword, verifyPassword } = require('../auth/password');
const {
  createSession,
  deleteSession,
  deleteSessionsForUid,
  getRequestSessionId,
} = require('../auth/sessionStore');
const requireAuthApi = require('../middleware/requireAuthApi');
const { bootstrapCommunityForUser } = require('../services/communityService');
const { sendVerificationEmail, sendPasswordResetCodeEmail } = require('../services/emailService');

const router = express.Router();
const EMAIL_VERIFICATION_TTL_HOURS = Math.max(1, Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24));
const PASSWORD_RESET_CODE_LENGTH = 6;
const PASSWORD_RESET_CODE_TTL_MINUTES = Math.max(5, Number(process.env.PASSWORD_RESET_CODE_TTL_MINUTES || 15));
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Math.max(5, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 20));
const PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS = Math.max(30, Number(process.env.PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS || 60));
const PASSWORD_RESET_MAX_ATTEMPTS = Math.max(3, Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5));
let ensureAuthSchemaPromise = null;
const LEGACY_BACKFILL_KEY = 'email_verification_legacy_backfill_done';
const SKIP_SCHEMA_ENSURE = /^(1|true|yes)$/i.test(String(process.env.DB_SKIP_SCHEMA_ENSURE || '').trim());

function buildUid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function buildVerificationToken() {
  return crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeResetCode(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, '').trim().toUpperCase();
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildPasswordResetCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < PASSWORD_RESET_CODE_LENGTH; i += 1) {
    const index = crypto.randomInt(0, alphabet.length);
    code += alphabet[index];
  }
  return code;
}

function appBaseUrl(req) {
  const configured = (process.env.APP_BASE_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || null;
}

function sanitizeUserAgent(req) {
  const value = req.get('user-agent') || '';
  return String(value).slice(0, 300);
}

function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
}

function getTraceContext(req) {
  const raw = req.get('x-cloud-trace-context') || '';
  const [tracePart = '', spanPart = ''] = String(raw).split('/');
  const spanId = spanPart.split(';')[0] || null;
  return {
    trace: tracePart || null,
    spanId,
  };
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code || null,
    detail: error.detail || null,
    hint: error.hint || null,
    stack: error.stack ? String(error.stack).split('\n').slice(0, 8).join('\n') : null,
  };
}

function authLog(level, event, payload = {}) {
  const entry = {
    component: 'auth',
    event,
    at: new Date().toISOString(),
    ...payload,
  };
  if (level === 'error') {
    console.error('[AUTH]', JSON.stringify(entry));
    return;
  }
  if (level === 'warn') {
    console.warn('[AUTH]', JSON.stringify(entry));
    return;
  }
  console.log('[AUTH]', JSON.stringify(entry));
}

async function ensureAuthSchema() {
  const sql = `
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS banned_reason TEXT;

    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS banned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id BIGSERIAL PRIMARY KEY,
      uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      token_digest TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (uid)
    );

    CREATE INDEX IF NOT EXISTS email_verification_tokens_uid_idx
      ON email_verification_tokens(uid);

    CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx
      ON email_verification_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS auth_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id BIGSERIAL PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE REFERENCES accounts(uid) ON DELETE CASCADE,
      code_digest TEXT NOT NULL,
      code_expires_at TIMESTAMPTZ NOT NULL,
      code_verified_at TIMESTAMPTZ,
      code_attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reset_token_digest TEXT,
      reset_token_expires_at TIMESTAMPTZ,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS password_reset_codes_uid_idx
      ON password_reset_codes(uid);

    CREATE INDEX IF NOT EXISTS password_reset_codes_code_expires_idx
      ON password_reset_codes(code_expires_at);

    CREATE INDEX IF NOT EXISTS password_reset_codes_reset_token_expires_idx
      ON password_reset_codes(reset_token_expires_at);
  `;
  await pool.query(sql);
}

async function backfillLegacyVerifiedAccounts() {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    const markerResult = await client.query(
      `SELECT 1
       FROM auth_schema_meta
       WHERE key = $1
       LIMIT 1`,
      [LEGACY_BACKFILL_KEY]
    );
    if (markerResult.rows.length) {
      await client.query('COMMIT');
      inTransaction = false;
      return;
    }

    // One-time rollout safety:
    // Accounts that existed before email verification feature have no token row.
    // Mark them verified once so only newly created accounts require verification.
    await client.query(
      `UPDATE accounts a
       SET email_verified = true,
           email_verified_at = COALESCE(a.email_verified_at, NOW())
       WHERE a.email_verified = false
         AND NOT EXISTS (
           SELECT 1
           FROM email_verification_tokens evt
           WHERE evt.uid = a.uid
         )`
    );

    await client.query(
      `INSERT INTO auth_schema_meta (key, value)
       VALUES ($1, 'true')`,
      [LEGACY_BACKFILL_KEY]
    );

    await client.query('COMMIT');
    inTransaction = false;
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function ensureAuthReady() {
  if (SKIP_SCHEMA_ENSURE) {
    return;
  }
  if (!ensureAuthSchemaPromise) {
    ensureAuthSchemaPromise = (async () => {
      await ensureAuthSchema();
      await backfillLegacyVerifiedAccounts();
    })().catch((error) => {
      ensureAuthSchemaPromise = null;
      throw error;
    });
  }
  await ensureAuthSchemaPromise;
}

async function issueVerificationToken(client, uid) {
  const token = buildVerificationToken();
  const tokenDigest = sha256Hex(token);
  await client.query(
    `INSERT INTO email_verification_tokens (uid, token_digest, expires_at, created_at)
     VALUES ($1, $2, NOW() + ($3::text || ' hours')::interval, NOW())
     ON CONFLICT (uid)
     DO UPDATE SET
       token_digest = EXCLUDED.token_digest,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()`,
    [uid, tokenDigest, String(EMAIL_VERIFICATION_TTL_HOURS)]
  );
  return token;
}

async function sendVerificationEmailForRequest(req, email, token) {
  const verifyUrl = `${appBaseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`;
  const result = await sendVerificationEmail({ to: email, verifyUrl });
  return { verifyUrl, ...result };
}

async function sendPasswordResetCodeForRequest(email, code) {
  const result = await sendPasswordResetCodeEmail({ to: email, code });
  return result;
}

router.use('/api/account', requireAuthApi);

router.get('/api/auth/session', requireAuthApi, (req, res) => {
  return res.json({
    ok: true,
    user: req.user || null,
  });
});

router.post('/api/signup', async (req, res) => {
  const {
    email,
    password,
    username,
    displayName,
    course,
    recoveryEmail,
  } = req.body || {};

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return res.status(400).json({ ok: false, message: 'Email and password are required.' });
  }

  let createdUser = null;
  let verificationToken = '';
  let inTransaction = false;

  const client = await pool.connect();
  try {
    await ensureAuthReady();
    await client.query('BEGIN');
    inTransaction = true;

    const existingEmail = await client.query(
      'SELECT 1 FROM accounts WHERE lower(email) = lower($1) LIMIT 1',
      [normalizedEmail]
    );
    if (existingEmail.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ ok: false, message: 'Email already exists.' });
    }

    const hashedPassword = hashPassword(password);
    const uid = buildUid();
    const now = new Date();

    const query = `
      INSERT INTO accounts
        (email, uid, password, username, display_name, course, recovery_email, datecreated, email_verified, email_verified_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, false, NULL)
      RETURNING id, email, username, display_name, uid, course, email_verified
    `;
    const values = [
      normalizedEmail,
      uid,
      hashedPassword,
      username || null,
      displayName || null,
      course || null,
      recoveryEmail || null,
      now,
    ];

    const result = await client.query(query, values);
    createdUser = result.rows[0];
    verificationToken = await issueVerificationToken(client, createdUser.uid);
    await client.query('COMMIT');
    inTransaction = false;
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    console.error('Signup failed:', error);
    if (error && error.code === '23505') {
      return res.status(409).json({ ok: false, message: 'Email already exists.' });
    }
    if (error && error.code === '42P01') {
      return res.status(500).json({ ok: false, message: 'Accounts table is missing.' });
    }
    return res.status(500).json({ ok: false, message: 'Unable to create account.' });
  } finally {
    client.release();
  }

  try {
    await bootstrapCommunityForUser(createdUser.uid);
  } catch (communityError) {
    // Keep signup non-blocking; community bootstrap also runs on community APIs.
    console.error('Community bootstrap during signup failed:', communityError);
  }

  try {
    const emailResult = await sendVerificationEmailForRequest(req, createdUser.email, verificationToken);
    return res.status(201).json({
      ok: true,
      requiresVerification: true,
      emailSent: true,
      message: 'Account created. Check your email and verify your account before logging in.',
      deliveryMode: emailResult.mode,
      user: {
        id: createdUser.id,
        uid: createdUser.uid,
        email: createdUser.email,
        course: createdUser.course,
      },
      devVerificationLink: emailResult.previewUrl || null,
    });
  } catch (mailError) {
    console.error('Verification email send failed:', mailError);
    return res.status(201).json({
      ok: true,
      requiresVerification: true,
      emailSent: false,
      message:
        'Account created, but verification email could not be sent. Use resend verification from the login form.',
      user: {
        id: createdUser.id,
        uid: createdUser.uid,
        email: createdUser.email,
        course: createdUser.course,
      },
    });
  }
});

router.get('/api/login', (req, res) => {
  return res.status(405).json({
    ok: false,
    message: 'Method not allowed. Use POST /api/login.',
  });
});

router.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const attemptId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex');
  const trace = getTraceContext(req);
  const baseLog = {
    attemptId,
    route: '/api/login',
    method: req.method,
    ip: getClientIp(req),
    userAgent: sanitizeUserAgent(req),
    emailMasked: maskEmail(normalizedEmail),
    emailHash: normalizedEmail ? sha256Hex(normalizedEmail) : null,
    trace: trace.trace,
    spanId: trace.spanId,
  };
  res.set('x-auth-attempt-id', attemptId);
  authLog('info', 'login_attempt_received', baseLog);

  if (!normalizedEmail || !password) {
    authLog('warn', 'login_rejected_missing_credentials', {
      ...baseLog,
      statusCode: 400,
      reason: 'email_or_password_missing',
    });
    return res.status(400).json({ ok: false, message: 'Email and password are required.' });
  }

  try {
    try {
      await ensureAuthReady();
    } catch (schemaError) {
      authLog('error', 'login_schema_prepare_failed', {
        ...baseLog,
        statusCode: 500,
        skipSchemaEnsure: SKIP_SCHEMA_ENSURE,
        error: serializeError(schemaError),
      });
      throw schemaError;
    }

    const result = await pool.query(
      `SELECT
        id,
        uid,
        email,
        password,
        username,
        display_name,
        course,
        email_verified,
        COALESCE(platform_role, 'member') AS platform_role,
        COALESCE(is_banned, false) AS is_banned
       FROM accounts
       WHERE lower(email) = lower($1)`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      authLog('warn', 'login_rejected_user_not_found', {
        ...baseLog,
        statusCode: 401,
        reason: 'user_not_found',
      });
      return res.status(401).json({ ok: false, message: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    if (!verifyPassword(password, user.password)) {
      authLog('warn', 'login_rejected_invalid_password', {
        ...baseLog,
        statusCode: 401,
        reason: 'invalid_password',
        uid: user.uid,
      });
      return res.status(401).json({ ok: false, message: 'Invalid credentials.' });
    }
    if (user.is_banned) {
      authLog('warn', 'login_rejected_banned', {
        ...baseLog,
        statusCode: 403,
        reason: 'account_banned',
        uid: user.uid,
      });
      return res.status(403).json({ ok: false, message: 'This account is banned.' });
    }
    if (!user.email_verified) {
      authLog('warn', 'login_rejected_unverified_email', {
        ...baseLog,
        statusCode: 403,
        reason: 'email_not_verified',
        uid: user.uid,
      });
      return res.status(403).json({
        ok: false,
        requiresVerification: true,
        message: 'Please verify your email before logging in.',
      });
    }

    const sessionId = await createSession({
      id: user.id,
      uid: user.uid,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      course: user.course,
      platformRole: user.platform_role || 'member',
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    };
    res.cookie('session_id', sessionId, cookieOptions);

    authLog('info', 'login_succeeded', {
      ...baseLog,
      statusCode: 200,
      uid: user.uid,
      course: user.course || null,
      role: user.platform_role || 'member',
    });

    return res.json({ ok: true, user: { id: user.id, uid: user.uid, email: user.email, course: user.course }, token: sessionId });
  } catch (error) {
    authLog('error', 'login_failed_exception', {
      ...baseLog,
      statusCode: 500,
      skipSchemaEnsure: SKIP_SCHEMA_ENSURE,
      error: serializeError(error),
    });
    return res.status(500).json({ ok: false, message: 'Login failed.', debugId: attemptId });
  }
});

router.post('/api/verification/resend', async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  if (!email) {
    return res.status(400).json({ ok: false, message: 'Email is required.' });
  }

  try {
    await ensureAuthReady();
    const lookup = await pool.query(
      'SELECT uid, email, email_verified FROM accounts WHERE lower(email) = lower($1) LIMIT 1',
      [email]
    );
    if (!lookup.rows.length) {
      return res.json({
        ok: true,
        message: 'If an account exists for this email, a verification link has been sent.',
      });
    }

    const account = lookup.rows[0];
    if (account.email_verified) {
      return res.json({ ok: true, message: 'This email is already verified.' });
    }

    const client = await pool.connect();
    let token = '';
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;
      token = await issueVerificationToken(client, account.uid);
      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    const emailResult = await sendVerificationEmailForRequest(req, account.email, token);
    return res.json({
      ok: true,
      message: 'Verification email sent.',
      deliveryMode: emailResult.mode,
      devVerificationLink: emailResult.previewUrl || null,
    });
  } catch (error) {
    console.error('Resend verification failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to resend verification email.' });
  }
});

router.post('/api/password-reset/request', async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const genericMessage = 'If an account exists for this email, a reset code has been sent.';

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: 'A valid email is required.' });
  }

  try {
    await ensureAuthReady();

    const lookup = await pool.query(
      `SELECT uid, email
       FROM accounts
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );
    if (!lookup.rows.length) {
      return res.json({ ok: true, message: genericMessage });
    }

    const account = lookup.rows[0];
    const client = await pool.connect();
    let inTransaction = false;
    let onCooldown = false;
    let resetCode = '';
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const existingResult = await client.query(
        `SELECT last_sent_at
         FROM password_reset_codes
         WHERE uid = $1
         FOR UPDATE`,
        [account.uid]
      );

      if (existingResult.rows.length) {
        const lastSentAt = new Date(existingResult.rows[0].last_sent_at).getTime();
        const cooldownMs = PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS * 1000;
        if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < cooldownMs) {
          onCooldown = true;
        }
      }

      if (!onCooldown) {
        resetCode = buildPasswordResetCode();
        const codeDigest = sha256Hex(`${account.uid}:${resetCode}`);
        await client.query(
          `INSERT INTO password_reset_codes
            (uid, code_digest, code_expires_at, code_verified_at, code_attempts, last_sent_at, reset_token_digest, reset_token_expires_at, consumed_at, created_at, updated_at)
           VALUES
            ($1, $2, NOW() + ($3::text || ' minutes')::interval, NULL, 0, NOW(), NULL, NULL, NULL, NOW(), NOW())
           ON CONFLICT (uid)
           DO UPDATE SET
             code_digest = EXCLUDED.code_digest,
             code_expires_at = EXCLUDED.code_expires_at,
             code_verified_at = NULL,
             code_attempts = 0,
             last_sent_at = NOW(),
             reset_token_digest = NULL,
             reset_token_expires_at = NULL,
             consumed_at = NULL,
             updated_at = NOW()`,
          [account.uid, codeDigest, String(PASSWORD_RESET_CODE_TTL_MINUTES)]
        );
      }

      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    if (!onCooldown && resetCode) {
      try {
        const emailResult = await sendPasswordResetCodeForRequest(account.email, resetCode);
        return res.json({
          ok: true,
          message: genericMessage,
          deliveryMode: emailResult.mode,
          devResetCode: emailResult.previewCode || null,
        });
      } catch (mailError) {
        console.error('Password reset code send failed:', mailError);
      }
    }

    return res.json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error('Password reset request failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to process password reset request.' });
  }
});

router.post('/api/password-reset/verify', async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const code = normalizeResetCode(req.body && req.body.code);

  if (!email || !isValidEmail(email) || !code) {
    return res.status(400).json({ ok: false, message: 'Email and code are required.' });
  }
  if (code.length !== PASSWORD_RESET_CODE_LENGTH) {
    return res.status(400).json({ ok: false, message: 'Code must be 6 characters.' });
  }

  try {
    await ensureAuthReady();
    const accountResult = await pool.query(
      `SELECT uid
       FROM accounts
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );
    if (!accountResult.rows.length) {
      return res.status(400).json({ ok: false, message: 'Invalid or expired reset code.' });
    }
    const uid = accountResult.rows[0].uid;

    const client = await pool.connect();
    let inTransaction = false;
    let resetToken = '';
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const resetResult = await client.query(
        `SELECT id, code_digest, code_expires_at, code_attempts, consumed_at
         FROM password_reset_codes
         WHERE uid = $1
         LIMIT 1
         FOR UPDATE`,
        [uid]
      );
      if (!resetResult.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Invalid or expired reset code.' });
      }

      const reset = resetResult.rows[0];
      const isExpired = new Date(reset.code_expires_at).getTime() <= Date.now();
      if (reset.consumed_at || isExpired) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Invalid or expired reset code.' });
      }
      if (Number(reset.code_attempts) >= PASSWORD_RESET_MAX_ATTEMPTS) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Too many attempts. Request a new reset code.' });
      }

      const expectedDigest = sha256Hex(`${uid}:${code}`);
      if (expectedDigest !== reset.code_digest) {
        const nextAttempts = Number(reset.code_attempts) + 1;
        await client.query(
          `UPDATE password_reset_codes
           SET code_attempts = $1,
               code_expires_at = CASE WHEN $1 >= $2 THEN NOW() ELSE code_expires_at END,
               updated_at = NOW()
           WHERE id = $3`,
          [nextAttempts, PASSWORD_RESET_MAX_ATTEMPTS, reset.id]
        );
        await client.query('COMMIT');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Invalid or expired reset code.' });
      }

      resetToken = buildVerificationToken();
      const resetTokenDigest = sha256Hex(`${uid}:${resetToken}`);
      await client.query(
        `UPDATE password_reset_codes
         SET code_verified_at = NOW(),
             code_attempts = 0,
             reset_token_digest = $1,
             reset_token_expires_at = NOW() + ($2::text || ' minutes')::interval,
             updated_at = NOW()
         WHERE id = $3`,
        [resetTokenDigest, String(PASSWORD_RESET_TOKEN_TTL_MINUTES), reset.id]
      );

      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    return res.json({
      ok: true,
      message: 'Code verified. You can now set a new password.',
      resetToken,
    });
  } catch (error) {
    console.error('Password reset verify failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to verify reset code.' });
  }
});

router.post('/api/password-reset/complete', async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const resetToken = typeof (req.body && req.body.resetToken) === 'string' ? req.body.resetToken.trim() : '';
  const newPassword = typeof (req.body && req.body.newPassword) === 'string' ? req.body.newPassword : '';

  if (!email || !isValidEmail(email) || !resetToken || !newPassword) {
    return res.status(400).json({ ok: false, message: 'Email, reset token, and new password are required.' });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ ok: false, message: 'New password must be 8 to 128 characters.' });
  }

  try {
    await ensureAuthReady();

    const accountResult = await pool.query(
      `SELECT uid
       FROM accounts
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );
    if (!accountResult.rows.length) {
      return res.status(400).json({ ok: false, message: 'Invalid or expired reset session.' });
    }
    const uid = accountResult.rows[0].uid;

    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const resetResult = await client.query(
        `SELECT id, reset_token_digest, reset_token_expires_at, consumed_at
         FROM password_reset_codes
         WHERE uid = $1
         LIMIT 1
         FOR UPDATE`,
        [uid]
      );
      if (!resetResult.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Invalid or expired reset session.' });
      }
      const reset = resetResult.rows[0];

      const isExpired =
        !reset.reset_token_expires_at || new Date(reset.reset_token_expires_at).getTime() <= Date.now();
      if (reset.consumed_at || !reset.reset_token_digest || isExpired) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Invalid or expired reset session.' });
      }

      const expectedDigest = sha256Hex(`${uid}:${resetToken}`);
      if (expectedDigest !== reset.reset_token_digest) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ ok: false, message: 'Invalid or expired reset session.' });
      }

      const nextHash = hashPassword(newPassword);
      await client.query(
        `UPDATE accounts
         SET password = $1
         WHERE uid = $2`,
        [nextHash, uid]
      );
      await client.query(
        `UPDATE password_reset_codes
         SET consumed_at = NOW(),
             reset_token_digest = NULL,
             reset_token_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [reset.id]
      );

      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    await deleteSessionsForUid(uid);
    return res.json({ ok: true, message: 'Password updated. You can now log in with your new password.' });
  } catch (error) {
    console.error('Password reset complete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reset password.' });
  }
});

router.get('/api/account', async (req, res) => {
  try {
    await ensureAuthReady();
    const result = await pool.query(
      `SELECT uid, email, username, recovery_email, email_verified
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [req.user.uid]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Account not found.' });
    }
    const row = result.rows[0];
    return res.json({
      ok: true,
      account: {
        uid: row.uid,
        email: row.email,
        username: row.username || '',
        recoveryEmail: row.recovery_email || '',
        emailVerified: Boolean(row.email_verified),
      },
    });
  } catch (error) {
    console.error('Account fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load account settings.' });
  }
});

router.patch('/api/account/username', async (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  if (!username) {
    return res.status(400).json({ ok: false, message: 'Username is required.' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ ok: false, message: 'Username must be 3 to 32 characters.' });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return res.status(400).json({
      ok: false,
      message: 'Username may only contain letters, numbers, dot, underscore, and hyphen.',
    });
  }

  try {
    await ensureAuthReady();
    const result = await pool.query(
      `UPDATE accounts
       SET username = $1
       WHERE uid = $2
       RETURNING username`,
      [username, req.user.uid]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Account not found.' });
    }
    return res.json({
      ok: true,
      message: 'Username updated.',
      username: result.rows[0].username || '',
    });
  } catch (error) {
    console.error('Username update failed:', error);
    if (error && error.code === '23505') {
      return res.status(409).json({ ok: false, message: 'Username is already in use.' });
    }
    return res.status(500).json({ ok: false, message: 'Unable to update username.' });
  }
});

router.patch('/api/account/password', async (req, res) => {
  const currentPassword = typeof (req.body && req.body.currentPassword) === 'string'
    ? req.body.currentPassword
    : '';
  const newPassword = typeof (req.body && req.body.newPassword) === 'string'
    ? req.body.newPassword
    : '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, message: 'Current password and new password are required.' });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ ok: false, message: 'New password must be 8 to 128 characters.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ ok: false, message: 'New password must be different from the current password.' });
  }

  try {
    await ensureAuthReady();
    const accountResult = await pool.query(
      'SELECT password FROM accounts WHERE uid = $1 LIMIT 1',
      [req.user.uid]
    );
    if (!accountResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Account not found.' });
    }

    const account = accountResult.rows[0];
    if (!verifyPassword(currentPassword, account.password)) {
      return res.status(401).json({ ok: false, message: 'Current password is incorrect.' });
    }

    const nextHash = hashPassword(newPassword);
    await pool.query(
      `UPDATE accounts
       SET password = $1
       WHERE uid = $2`,
      [nextHash, req.user.uid]
    );
    return res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update password.' });
  }
});

router.patch('/api/account/recovery-email', async (req, res) => {
  const currentPassword = typeof (req.body && req.body.currentPassword) === 'string'
    ? req.body.currentPassword
    : '';
  const recoveryEmailRaw = typeof (req.body && req.body.recoveryEmail) === 'string'
    ? req.body.recoveryEmail
    : '';
  const recoveryEmail = normalizeEmail(recoveryEmailRaw);

  if (!currentPassword) {
    return res.status(400).json({ ok: false, message: 'Current password is required.' });
  }
  if (recoveryEmail && !isValidEmail(recoveryEmail)) {
    return res.status(400).json({ ok: false, message: 'Recovery email format is invalid.' });
  }

  try {
    await ensureAuthReady();
    const accountResult = await pool.query(
      'SELECT password FROM accounts WHERE uid = $1 LIMIT 1',
      [req.user.uid]
    );
    if (!accountResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Account not found.' });
    }

    const account = accountResult.rows[0];
    if (!verifyPassword(currentPassword, account.password)) {
      return res.status(401).json({ ok: false, message: 'Current password is incorrect.' });
    }

    await pool.query(
      `UPDATE accounts
       SET recovery_email = $1
       WHERE uid = $2`,
      [recoveryEmail || null, req.user.uid]
    );
    return res.json({
      ok: true,
      message: recoveryEmail ? 'Recovery email updated.' : 'Recovery email removed.',
      recoveryEmail: recoveryEmail || '',
    });
  } catch (error) {
    console.error('Recovery email update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update recovery email.' });
  }
});

router.patch('/api/account/email', async (req, res) => {
  const currentPassword = typeof (req.body && req.body.currentPassword) === 'string'
    ? req.body.currentPassword
    : '';
  const newEmail = normalizeEmail(req.body && req.body.newEmail);

  if (!newEmail) {
    return res.status(400).json({ ok: false, message: 'New email is required.' });
  }
  if (!isValidEmail(newEmail)) {
    return res.status(400).json({ ok: false, message: 'Email format is invalid.' });
  }
  if (!currentPassword) {
    return res.status(400).json({ ok: false, message: 'Current password is required.' });
  }

  const client = await pool.connect();
  let inTransaction = false;
  let token = '';
  try {
    await ensureAuthReady();
    await client.query('BEGIN');
    inTransaction = true;

    const accountResult = await client.query(
      `SELECT uid, email, password
       FROM accounts
       WHERE uid = $1
       LIMIT 1
       FOR UPDATE`,
      [req.user.uid]
    );
    if (!accountResult.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(404).json({ ok: false, message: 'Account not found.' });
    }

    const account = accountResult.rows[0];
    if (!verifyPassword(currentPassword, account.password)) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(401).json({ ok: false, message: 'Current password is incorrect.' });
    }

    if (normalizeEmail(account.email) === newEmail) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(400).json({ ok: false, message: 'New email must be different from current email.' });
    }

    const duplicateResult = await client.query(
      'SELECT 1 FROM accounts WHERE lower(email) = lower($1) AND uid <> $2 LIMIT 1',
      [newEmail, req.user.uid]
    );
    if (duplicateResult.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ ok: false, message: 'Email already exists.' });
    }

    await client.query(
      `UPDATE accounts
       SET email = $1,
           email_verified = false,
           email_verified_at = NULL
       WHERE uid = $2`,
      [newEmail, req.user.uid]
    );

    token = await issueVerificationToken(client, req.user.uid);
    await client.query('COMMIT');
    inTransaction = false;
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    console.error('Email update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update email.' });
  } finally {
    client.release();
  }

  try {
    const emailResult = await sendVerificationEmailForRequest(req, newEmail, token);
    return res.json({
      ok: true,
      requiresVerification: true,
      emailSent: true,
      message: 'Email updated. Verify your new email to keep login access.',
      email: newEmail,
      deliveryMode: emailResult.mode,
      devVerificationLink: emailResult.previewUrl || null,
    });
  } catch (mailError) {
    console.error('Verification email send failed after email change:', mailError);
    return res.json({
      ok: true,
      requiresVerification: true,
      emailSent: false,
      message: 'Email updated, but verification email could not be sent. Please resend verification later.',
      email: newEmail,
    });
  }
});

router.get('/verify-email', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token) {
    return res.redirect('/login?verified=invalid');
  }

  const tokenDigest = sha256Hex(token);
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await ensureAuthReady();
    await client.query('BEGIN');
    inTransaction = true;

    const result = await client.query(
      `SELECT evt.uid, evt.expires_at, a.email_verified
       FROM email_verification_tokens evt
       JOIN accounts a ON a.uid = evt.uid
       WHERE evt.token_digest = $1
       LIMIT 1
       FOR UPDATE`,
      [tokenDigest]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.redirect('/login?verified=invalid');
    }

    const record = result.rows[0];
    const isExpired = new Date(record.expires_at).getTime() <= Date.now();
    if (isExpired) {
      await client.query('DELETE FROM email_verification_tokens WHERE uid = $1', [record.uid]);
      await client.query('COMMIT');
      inTransaction = false;
      return res.redirect('/login?verified=expired');
    }

    if (record.email_verified) {
      await client.query('DELETE FROM email_verification_tokens WHERE uid = $1', [record.uid]);
      await client.query('COMMIT');
      inTransaction = false;
      return res.redirect('/login?verified=already');
    }

    await client.query(
      `UPDATE accounts
       SET email_verified = true,
           email_verified_at = NOW()
       WHERE uid = $1`,
      [record.uid]
    );
    await client.query('DELETE FROM email_verification_tokens WHERE uid = $1', [record.uid]);
    await client.query('COMMIT');
    inTransaction = false;
    return res.redirect('/login?verified=success');
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK');
    }
    console.error('Email verification failed:', error);
    return res.redirect('/login?verified=error');
  } finally {
    client.release();
  }
});

router.post('/api/logout', async (req, res) => {
  try {
    const sessionId = getRequestSessionId(req, { preferBearer: true });
    if (sessionId) {
      await deleteSession(sessionId);
    }
    res.clearCookie('session_id');
    return res.json({ ok: true });
  } catch (error) {
    console.error('Logout failed:', error);
    return res.status(500).json({ ok: false, message: 'Logout failed.' });
  }
});

module.exports = router;
