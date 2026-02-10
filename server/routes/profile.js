const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { uploadToDrive } = require('../services/gdrive');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use('/api/profile', requireAuthApi);

async function ensureProfile(uid) {
  const existing = await pool.query('SELECT * FROM profiles WHERE uid = $1', [uid]);
  if (existing.rows.length) {
    return existing.rows[0];
  }

  const accountResult = await pool.query(
    'SELECT display_name, username, email, course FROM accounts WHERE uid = $1',
    [uid]
  );
  const account = accountResult.rows[0] || {};
  const displayName = account.display_name || account.username || account.email || '';
  const mainCourse = account.course || null;

  const insert = await pool.query(
    `INSERT INTO profiles (uid, display_name, main_course)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [uid, displayName, mainCourse]
  );
  return insert.rows[0];
}

router.get('/api/profile', async (req, res) => {
  try {
    const profile = await ensureProfile(req.user.uid);
    return res.json({ ok: true, profile });
  } catch (error) {
    console.error('Profile fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load profile.' });
  }
});

router.patch('/api/profile', async (req, res) => {
  const {
    display_name,
    bio,
    main_course,
    sub_courses,
    facebook,
    linkedin,
    instagram,
    github,
    portfolio,
  } = req.body || {};

  const updates = [];
  const values = [];

  if (display_name !== undefined) {
    values.push(display_name.trim());
    updates.push(`display_name = $${values.length}`);
  }
  if (bio !== undefined) {
    values.push(bio.trim());
    updates.push(`bio = $${values.length}`);
  }
  if (main_course !== undefined) {
    values.push(main_course ? main_course.trim() : null);
    updates.push(`main_course = $${values.length}`);
  }
  if (sub_courses !== undefined) {
    values.push(Array.isArray(sub_courses) ? sub_courses : []);
    updates.push(`sub_courses = $${values.length}`);
  }
  if (facebook !== undefined) {
    values.push(facebook.trim());
    updates.push(`facebook = $${values.length}`);
  }
  if (linkedin !== undefined) {
    values.push(linkedin.trim());
    updates.push(`linkedin = $${values.length}`);
  }
  if (instagram !== undefined) {
    values.push(instagram.trim());
    updates.push(`instagram = $${values.length}`);
  }
  if (github !== undefined) {
    values.push(github.trim());
    updates.push(`github = $${values.length}`);
  }
  if (portfolio !== undefined) {
    values.push(portfolio.trim());
    updates.push(`portfolio = $${values.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No fields to update.' });
  }

  try {
    await ensureProfile(req.user.uid);
    values.push(req.user.uid);
    const query = `
      UPDATE profiles
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE uid = $${values.length}
      RETURNING *
    `;
    const result = await pool.query(query, values);
    return res.json({ ok: true, profile: result.rows[0] });
  } catch (error) {
    console.error('Profile update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update profile.' });
  }
});

router.post('/api/profile/photo', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'Photo is required.' });
  }
  try {
    await ensureProfile(req.user.uid);
    const folderId = process.env.GDRIVE_PROFILE_FOLDER_ID || process.env.GDRIVE_FOLDER_ID || null;
    const uploaded = await uploadToDrive({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      folderId,
      makePublic: true,
    });
    const link = uploaded.webViewLink || uploaded.webContentLink;
    const result = await pool.query(
      'UPDATE profiles SET photo_link = $1, updated_at = NOW() WHERE uid = $2 RETURNING photo_link',
      [link, req.user.uid]
    );
    return res.json({ ok: true, photo_link: result.rows[0]?.photo_link || link });
  } catch (error) {
    console.error('Profile photo upload failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to upload photo.' });
  }
});

router.use('/api/profile', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'Photo exceeds 5MB limit.' });
  }
  return next(err);
});

module.exports = router;
