const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { hashPassword, verifyPassword } = require('../auth/password');
const { createSession, deleteSession } = require('../auth/sessionStore');
const { bootstrapCommunityForUser } = require('../services/communityService');

const router = express.Router();

function buildUid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

router.post('/api/signup', async (req, res) => {
  const {
    email,
    password,
    username,
    displayName,
    course,
    recoveryEmail,
  } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: 'Email and password are required.' });
  }

  try {
    const hashedPassword = hashPassword(password);
    const uid = buildUid();
    const now = new Date();

    const query = `
      INSERT INTO accounts
        (email, uid, password, username, display_name, course, recovery_email, datecreated)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, username, display_name, uid, course
    `;
    const values = [
      email,
      uid,
      hashedPassword,
      username || null,
      displayName || null,
      course || null,
      recoveryEmail || null,
      now,
    ];

    const result = await pool.query(query, values);
    const user = result.rows[0];
    try {
      await bootstrapCommunityForUser(user.uid);
    } catch (communityError) {
      // Keep signup non-blocking; community bootstrap also runs on community APIs.
      console.error('Community bootstrap during signup failed:', communityError);
    }

    const sessionId = createSession({
      id: user.id,
      uid: user.uid,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      course: user.course,
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    };
    res.cookie('session_id', sessionId, cookieOptions);

    return res.json({ ok: true, user, token: sessionId });
  } catch (error) {
    console.error('Signup failed:', error);
    if (error && error.code === '23505') {
      return res.status(409).json({ ok: false, message: 'Email already exists.' });
    }
    if (error && error.code === '42P01') {
      return res.status(500).json({ ok: false, message: 'Accounts table is missing.' });
    }
    return res.status(500).json({ ok: false, message: 'Unable to create account.' });
  }
});

router.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, message: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, uid, email, password, username, display_name, course FROM accounts WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials.' });
    }

    const sessionId = createSession({
      id: user.id,
      uid: user.uid,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      course: user.course,
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    };
    res.cookie('session_id', sessionId, cookieOptions);

    return res.json({ ok: true, user: { id: user.id, uid: user.uid, email: user.email, course: user.course }, token: sessionId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'Login failed.' });
  }
});

router.post('/api/logout', (req, res) => {
  const sessionId = req.cookies.session_id;
  if (sessionId) {
    deleteSession(sessionId);
  }
  res.clearCookie('session_id');
  return res.json({ ok: true });
});

module.exports = router;
