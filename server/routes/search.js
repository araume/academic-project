const express = require('express');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const { getSignedUrl } = require('../services/storage');

const router = express.Router();

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const RATE_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();
let ensureSearchTablesPromise = null;

function sanitizeText(value, maxLen = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parseLimit(value, fallback = 8, max = 20) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureSearchTables() {
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

    CREATE TABLE IF NOT EXISTS follows (
      id BIGSERIAL PRIMARY KEY,
      follower_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (follower_uid, target_uid),
      CHECK (follower_uid <> target_uid)
    );

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
  `;
  await pool.query(sql);
}

async function ensureSearchReady() {
  if (!ensureSearchTablesPromise) {
    ensureSearchTablesPromise = ensureSearchTables().catch((error) => {
      ensureSearchTablesPromise = null;
      throw error;
    });
  }
  await ensureSearchTablesPromise;
}

function enforceRateLimit(req, res, action, limitPerWindow) {
  const uid = req.user && req.user.uid;
  if (!uid) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return false;
  }

  const key = `${uid}:${action}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, startedAt: now });
    return true;
  }
  if (bucket.count >= limitPerWindow) {
    res.status(429).json({ ok: false, message: 'Too many requests. Please try again shortly.' });
    return false;
  }
  bucket.count += 1;
  return true;
}

function buildVisibilityFilter(user) {
  const userCourse = user && user.course;
  const userUid = user && user.uid;
  const filter = {
    $or: [{ visibility: 'public' }],
  };
  if (userCourse) {
    filter.$or.push({ visibility: 'private', course: userCourse });
  }
  if (userUid) {
    filter.$or.push({ uploaderUid: userUid });
  }
  return filter;
}

function summarizeContent(value, max = 140) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

async function signIfNeeded(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http')) return value;
  try {
    return await getSignedUrl(value, SIGNED_TTL);
  } catch (error) {
    return null;
  }
}

async function loadExcludedAuthorUids(viewerUid) {
  if (!viewerUid) return [];
  try {
    const blockedResult = await pool.query(
      `SELECT blocked_uid AS uid
       FROM blocked_users
       WHERE blocker_uid = $1
       UNION
       SELECT blocker_uid AS uid
       FROM blocked_users
       WHERE blocked_uid = $1`,
      [viewerUid]
    );
    const hiddenResult = await pool.query(
      `SELECT hidden_uid AS uid
       FROM hidden_post_authors
       WHERE user_uid = $1`,
      [viewerUid]
    );

    const excluded = new Set();
    blockedResult.rows.forEach((row) => row && row.uid && excluded.add(row.uid));
    hiddenResult.rows.forEach((row) => row && row.uid && excluded.add(row.uid));
    excluded.delete(viewerUid);
    return [...excluded];
  } catch (error) {
    if (error && error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

async function loadUploaderProfiles(uids) {
  if (!uids.length) return new Map();
  try {
    const result = await pool.query(
      `SELECT uid, display_name, photo_link
       FROM profiles
       WHERE uid = ANY($1::text[])`,
      [uids]
    );
    const entries = await Promise.all(
      result.rows.map(async (row) => [
        row.uid,
        {
          displayName: row.display_name || null,
          photoLink: await signIfNeeded(row.photo_link),
        },
      ])
    );
    return new Map(entries);
  } catch (error) {
    return new Map();
  }
}

async function searchPosts({ viewer, query, limit }) {
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const filter = buildVisibilityFilter(viewer);
  const excludedAuthors = await loadExcludedAuthorUids(viewer.uid);
  if (excludedAuthors.length) {
    filter.uploaderUid = { $nin: excludedAuthors };
  }

  if (query) {
    const regex = new RegExp(escapeRegex(query), 'i');
    filter.$and = [
      {
        $or: [
          { title: regex },
          { content: regex },
          { course: regex },
          { 'uploader.displayName': regex },
        ],
      },
    ];
  }

  const posts = await postsCollection
    .find(filter)
    .sort({ uploadDate: -1 })
    .limit(limit)
    .toArray();

  const uploaderUids = [...new Set(posts.map((post) => post.uploaderUid).filter(Boolean))];
  const uploaderProfiles = await loadUploaderProfiles(uploaderUids);

  return posts.map((post) => {
    const profile = uploaderProfiles.get(post.uploaderUid);
    return {
      id: post._id.toString(),
      title: post.title || 'Untitled post',
      excerpt: summarizeContent(post.content, 140),
      course: post.course || null,
      uploadDate: post.uploadDate || null,
      likesCount: Number(post.likesCount || 0),
      commentsCount: Number(post.commentsCount || 0),
      uploader: {
        uid: post.uploaderUid || null,
        displayName: profile?.displayName || post.uploader?.displayName || 'Member',
        photoLink: profile?.photoLink || post.uploader?.photoLink || null,
      },
      targetUrl: `/home?post=${encodeURIComponent(post._id.toString())}`,
    };
  });
}

async function searchUsers({ viewer, query, limit }) {
  const where = [
    'a.uid <> $1',
    'COALESCE(ups.searchable, true) = true',
    `NOT EXISTS (
      SELECT 1 FROM blocked_users bu
      WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = a.uid)
         OR (bu.blocker_uid = a.uid AND bu.blocked_uid = $1)
    )`,
  ];
  const values = [viewer.uid];

  if (query) {
    values.push(`%${query.toLowerCase()}%`);
    where.push(`(
      lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) LIKE $${values.length}
      OR lower(COALESCE(a.course, '')) LIKE $${values.length}
      OR lower(COALESCE(p.bio, '')) LIKE $${values.length}
    )`);
  }

  values.push(limit);
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
      EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_uid = $1 AND f.target_uid = a.uid
      ) AS is_following,
      EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_uid = a.uid AND f.target_uid = $1
      ) AS follows_you
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     LEFT JOIN user_privacy_settings ups ON ups.uid = a.uid
     WHERE ${where.join(' AND ')}
     ORDER BY lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) ASC
     LIMIT $${values.length}`,
    values
  );

  return Promise.all(
    result.rows.map(async (row) => ({
      uid: row.uid,
      displayName: row.profile_display_name || row.account_display_name || row.username || row.email || 'Member',
      bio: row.bio || null,
      course: row.course || null,
      photoLink: await signIfNeeded(row.photo_link),
      relation: {
        isFollowing: row.is_following === true,
        followsYou: row.follows_you === true,
      },
      targetUrl: `/profile?uid=${encodeURIComponent(row.uid)}`,
    }))
  );
}

async function searchDocuments({ viewer, query, limit }) {
  const values = [];
  const where = [];
  const userCourse = viewer && viewer.course ? String(viewer.course).trim() : '';
  const userUid = viewer && viewer.uid ? viewer.uid : '';

  if (userCourse && userUid) {
    values.push(userCourse);
    const courseParam = values.length;
    values.push(userUid);
    const uidParam = values.length;
    where.push(
      `(d.visibility = 'public' OR (d.visibility = 'private' AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
    );
  } else if (userUid) {
    values.push(userUid);
    where.push(`(d.visibility = 'public' OR d.uploader_uid = $${values.length})`);
  } else {
    where.push(`d.visibility = 'public'`);
  }

  if (userUid) {
    values.push(userUid);
    where.push(
      `NOT EXISTS (
        SELECT 1 FROM blocked_users bu
        WHERE (bu.blocker_uid = d.uploader_uid AND bu.blocked_uid = $${values.length})
           OR (bu.blocker_uid = $${values.length} AND bu.blocked_uid = d.uploader_uid)
      )`
    );
  }

  if (query) {
    values.push(`%${query.toLowerCase()}%`);
    where.push(`(
      lower(COALESCE(d.title, '')) LIKE $${values.length}
      OR lower(COALESCE(d.description, '')) LIKE $${values.length}
      OR lower(COALESCE(d.filename, '')) LIKE $${values.length}
      OR lower(COALESCE(d.subject, '')) LIKE $${values.length}
      OR lower(COALESCE(d.course, '')) LIKE $${values.length}
      OR lower(COALESCE(p.display_name, a.display_name, a.username, a.email, '')) LIKE $${values.length}
    )`);
  }

  values.push(limit);
  const result = await pool.query(
    `SELECT
      d.uuid,
      d.title,
      d.description,
      d.course,
      d.subject,
      d.uploaddate,
      d.link,
      d.thumbnail_link,
      COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
     FROM documents d
     JOIN accounts a ON a.uid = d.uploader_uid
     LEFT JOIN profiles p ON p.uid = d.uploader_uid
     WHERE ${where.join(' AND ')}
     ORDER BY d.uploaddate DESC
     LIMIT $${values.length}`,
    values
  );

  return Promise.all(
    result.rows.map(async (row) => ({
      uuid: row.uuid,
      title: row.title || 'Untitled document',
      description: summarizeContent(row.description, 140),
      course: row.course || null,
      subject: row.subject || null,
      uploadDate: row.uploaddate || null,
      link: await signIfNeeded(row.link),
      thumbnailLink: await signIfNeeded(row.thumbnail_link),
      uploaderName: row.uploader_name || 'Member',
      targetUrl: '/open-library',
    }))
  );
}

router.use('/api/search', requireAuthApi);
router.use('/api/search', async (req, res, next) => {
  try {
    await ensureSearchReady();
    return next();
  } catch (error) {
    console.error('Search bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Search service is unavailable.' });
  }
});

router.get('/api/search', async (req, res) => {
  if (!enforceRateLimit(req, res, 'global_search', 180)) return;

  const query = sanitizeText(req.query.q || '', 120);
  const limit = parseLimit(req.query.limit, 8, 20);
  const scopeRaw = sanitizeText(req.query.scope || 'all', 30).toLowerCase();
  const scopeSet = new Set(scopeRaw.split(',').map((item) => item.trim()).filter(Boolean));
  const runPosts = scopeSet.has('all') || scopeSet.has('posts');
  const runUsers = scopeSet.has('all') || scopeSet.has('users');
  const runDocuments = scopeSet.has('all') || scopeSet.has('documents');

  if (!query || query.length < 2) {
    return res.status(400).json({ ok: false, message: 'Search query must be at least 2 characters.' });
  }
  if (!runPosts && !runUsers && !runDocuments) {
    return res.status(400).json({ ok: false, message: 'Invalid search scope.' });
  }

  try {
    const [posts, users, documents] = await Promise.all([
      runPosts ? searchPosts({ viewer: req.user, query, limit }) : Promise.resolve([]),
      runUsers ? searchUsers({ viewer: req.user, query, limit }) : Promise.resolve([]),
      runDocuments ? searchDocuments({ viewer: req.user, query, limit }) : Promise.resolve([]),
    ]);

    return res.json({
      ok: true,
      query,
      scope: {
        posts: runPosts,
        users: runUsers,
        documents: runDocuments,
      },
      totals: {
        posts: posts.length,
        users: users.length,
        documents: documents.length,
      },
      results: {
        posts,
        users,
        documents,
      },
    });
  } catch (error) {
    console.error('Global search failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to search right now.' });
  }
});

module.exports = router;
