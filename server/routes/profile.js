const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { uploadToStorage, deleteFromStorage, getSignedUrl } = require('../services/storage');
const { getMongoDb } = require('../db/mongo');
const { hasAdminPrivileges } = require('../services/roleAccess');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use('/api/profile', requireAuthApi);

function normalizeCourse(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function summarizeText(value, max = 260) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

async function isSuppressedByViewer(viewerUid, targetUid) {
  if (!viewerUid || !targetUid || viewerUid === targetUid) return false;

  try {
    const [blockedResult, hiddenResult] = await Promise.all([
      pool.query(
        `SELECT 1
         FROM blocked_users
         WHERE (blocker_uid = $1 AND blocked_uid = $2)
            OR (blocker_uid = $2 AND blocked_uid = $1)
         LIMIT 1`,
        [viewerUid, targetUid]
      ),
      pool.query(
        `SELECT 1
         FROM hidden_post_authors
         WHERE user_uid = $1 AND hidden_uid = $2
         LIMIT 1`,
        [viewerUid, targetUid]
      ),
    ]);
    return blockedResult.rows.length > 0 || hiddenResult.rows.length > 0;
  } catch (error) {
    if (error && error.code === '42P01') {
      return false;
    }
    throw error;
  }
}

async function signPostAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  if (attachment.type !== 'image' && attachment.type !== 'video') {
    return attachment;
  }

  const key = attachment.key;
  if (!key || typeof key !== 'string') return attachment;

  try {
    const signed = key.startsWith('http')
      ? key
      : await getSignedUrl(key, Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60));
    return { ...attachment, link: signed };
  } catch (error) {
    return attachment;
  }
}

async function loadMainFeedPostsForProfile({ viewer, targetUid }) {
  const viewerCourse = viewer && viewer.course ? String(viewer.course).trim() : '';
  const visibilityRules = [{ visibility: 'public' }];
  if (viewerCourse) {
    visibilityRules.push({ visibility: 'private', course: viewerCourse });
  }
  if (viewer && viewer.uid === targetUid) {
    visibilityRules.push({ uploaderUid: targetUid });
  }

  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const posts = await postsCollection
    .find({
      uploaderUid: targetUid,
      $or: visibilityRules,
    })
    .sort({ uploadDate: -1 })
    .limit(60)
    .toArray();

  return Promise.all(
    posts.map(async (post) => ({
      id: post && post._id ? String(post._id) : '',
      title: post && post.title ? String(post.title) : 'Untitled post',
      content: summarizeText(post && post.content ? post.content : '', 320),
      createdAt: post && post.uploadDate ? post.uploadDate : null,
      likesCount: Number(post && post.likesCount ? post.likesCount : 0),
      commentsCount: Number(post && post.commentsCount ? post.commentsCount : 0),
      visibility: post && post.visibility ? post.visibility : 'public',
      attachment: await signPostAttachment(post && post.attachment ? post.attachment : null),
      source: 'main_feed',
    }))
  );
}

async function loadCommunityPostsForProfile({ targetUid, targetCourse }) {
  if (!targetCourse) return [];
  try {
    const result = await pool.query(
      `SELECT
         p.id,
         p.community_id,
         c.course_name,
         p.title,
         p.content,
         p.visibility,
         p.likes_count,
         p.created_at,
         COALESCE((
           SELECT COUNT(*)::int
           FROM community_comments cc
           WHERE cc.post_id = p.id AND cc.status = 'active'
         ), 0) AS comments_count
       FROM community_posts p
       JOIN communities c ON c.id = p.community_id
       WHERE p.author_uid = $1
         AND p.status = 'active'
         AND c.course_name = $2
       ORDER BY p.created_at DESC
       LIMIT 60`,
      [targetUid, targetCourse]
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      communityId: Number(row.community_id),
      communityName: row.course_name || targetCourse,
      title: row.title || 'Untitled community post',
      content: summarizeText(row.content || '', 320),
      createdAt: row.created_at,
      likesCount: Number(row.likes_count || 0),
      commentsCount: Number(row.comments_count || 0),
      visibility: row.visibility || 'community',
      source: 'community',
    }));
  } catch (error) {
    if (error && error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

async function buildProfileFeedPayload(viewer, targetUid) {
  const accountResult = await pool.query(
    `SELECT uid, email, username, display_name, course
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [targetUid]
  );
  const target = accountResult.rows[0] || null;
  if (!target) return null;

  const suppressed = await isSuppressedByViewer(viewer.uid, targetUid);
  const targetCourse = target.course ? String(target.course).trim() : '';
  const sameCourse = normalizeCourse(viewer.course) !== '' &&
    normalizeCourse(viewer.course) === normalizeCourse(targetCourse);
  const canViewCommunityPosts = viewer.uid === targetUid || sameCourse || hasAdminPrivileges(viewer);

  if (suppressed && viewer.uid !== targetUid) {
    return {
      owner: {
        uid: target.uid,
        displayName: target.display_name || target.username || target.email || 'Member',
        username: target.username || '',
        course: targetCourse || null,
      },
      canViewCommunityPosts: false,
      sameCourse,
      mainFeedPosts: [],
      communityPosts: [],
    };
  }

  const [mainFeedPosts, communityPosts] = await Promise.all([
    loadMainFeedPostsForProfile({ viewer, targetUid }),
    canViewCommunityPosts
      ? loadCommunityPostsForProfile({ targetUid, targetCourse })
      : Promise.resolve([]),
  ]);

  return {
    owner: {
      uid: target.uid,
      displayName: target.display_name || target.username || target.email || 'Member',
      username: target.username || '',
      course: targetCourse || null,
    },
    canViewCommunityPosts,
    sameCourse,
    mainFeedPosts,
    communityPosts,
  };
}

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

async function getProfileWithSignedPhoto(uid) {
  const [profile, accountResult] = await Promise.all([
    ensureProfile(uid),
    pool.query('SELECT username FROM accounts WHERE uid = $1 LIMIT 1', [uid]),
  ]);
  const username = accountResult.rows[0] ? accountResult.rows[0].username || '' : '';
  let photoLink = profile.photo_link;
  if (photoLink && !photoLink.startsWith('http')) {
    photoLink = await getSignedUrl(photoLink, Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60));
  }
  return { ...profile, username, photo_link: photoLink };
}

router.get('/api/profile', async (req, res) => {
  try {
    const profile = await getProfileWithSignedPhoto(req.user.uid);
    return res.json({ ok: true, profile, is_self: true });
  } catch (error) {
    console.error('Profile fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load profile.' });
  }
});

router.get('/api/profile/posts/feed', async (req, res) => {
  try {
    const payload = await buildProfileFeedPayload(req.user, req.user.uid);
    if (!payload) {
      return res.status(404).json({ ok: false, message: 'Profile not found.' });
    }
    return res.json({ ok: true, ...payload });
  } catch (error) {
    console.error('Profile feed fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load profile posts.' });
  }
});

router.get('/api/profile/:uid/posts/feed', async (req, res) => {
  const targetUid = (req.params.uid || '').trim();
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Missing user id.' });
  }
  try {
    const payload = await buildProfileFeedPayload(req.user, targetUid);
    if (!payload) {
      return res.status(404).json({ ok: false, message: 'Profile not found.' });
    }
    return res.json({ ok: true, ...payload });
  } catch (error) {
    console.error('Profile feed fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load profile posts.' });
  }
});

router.get('/api/profile/:uid', async (req, res) => {
  const targetUid = (req.params.uid || '').trim();
  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Missing user id.' });
  }

  try {
    const accountResult = await pool.query(
      'SELECT uid FROM accounts WHERE uid = $1 LIMIT 1',
      [targetUid]
    );
    if (!accountResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Profile not found.' });
    }

    const profile = await getProfileWithSignedPhoto(targetUid);
    return res.json({ ok: true, profile, is_self: targetUid === req.user.uid });
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
    const uploaded = await uploadToStorage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      prefix: 'profiles',
    });
    const link = uploaded.key;
    const previous = await pool.query('SELECT photo_link FROM profiles WHERE uid = $1', [req.user.uid]);
    const result = await pool.query(
      'UPDATE profiles SET photo_link = $1, updated_at = NOW() WHERE uid = $2 RETURNING photo_link',
      [link, req.user.uid]
    );
    if (previous.rows[0]?.photo_link && !previous.rows[0].photo_link.startsWith('http')) {
      try {
        await deleteFromStorage(previous.rows[0].photo_link);
      } catch (error) {
        console.error('Storage delete failed:', error);
      }
    }
    const signed = await getSignedUrl(link, Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60));
    return res.json({ ok: true, photo_link: signed });
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
