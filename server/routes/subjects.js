const express = require('express');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getSignedUrl } = require('../services/storage');
const { hasAdminPrivileges, hasProfessorPrivileges } = require('../services/roleAccess');
const { isSubjectsEnabled, isUnifiedVisibilityEnabled } = require('../services/featureFlags');

const router = express.Router();

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const SUBJECTS_ACCESS_MODEL = 'auto_course_membership';
const RATE_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();
const COURSE_SUBJECT_SOURCES = [
  {
    canonicalCourseName: 'Computer Science',
    aliases: ['computer science', 'comsci', 'cs', 'bscs', 'bs computer science'],
  },
  {
    canonicalCourseName: 'History',
    aliases: ['history', 'ba history'],
  },
  {
    canonicalCourseName: 'Psychology',
    aliases: ['psychology', 'bs psychology', 'ab psychology'],
  },
  {
    canonicalCourseName: 'Physics',
    aliases: ['physics', 'bs physics'],
  },
  {
    canonicalCourseName: 'Civil Engineering',
    aliases: ['civil engineering', 'ce', 'bsce', 'bs civil engineering'],
  },
];

router.use('/api/subjects', requireAuthApi);

router.use('/api/subjects', (req, res, next) => {
  if (!isSubjectsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Subjects feature is disabled.' });
  }
  return next();
});

function normalizeText(value, max = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeCourse(value) {
  return normalizeText(value, 200);
}

function normalizeCourseKey(value) {
  return normalizeCourse(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveCourseSubjectSource(courseValue) {
  const key = normalizeCourseKey(courseValue);
  if (!key) return null;
  return (
    COURSE_SUBJECT_SOURCES.find((entry) => entry.aliases.some((alias) => normalizeCourseKey(alias) === key)) ||
    null
  );
}

function canonicalCourseNameForSubjects(courseValue) {
  const source = resolveCourseSubjectSource(courseValue);
  if (source && source.canonicalCourseName) {
    return source.canonicalCourseName;
  }
  return normalizeCourse(courseValue);
}

function parsePositiveInt(value, fallback = 1, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function looksLikeUuid(value) {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function enforceRateLimit(req, res, action, maxPerWindow) {
  const uid = req.user && req.user.uid;
  if (!uid) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return false;
  }

  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [bucketKey, bucket] of rateBuckets.entries()) {
      if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS * 2) {
        rateBuckets.delete(bucketKey);
      }
    }
  }
  const key = `${uid}:${action}`;
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, startedAt: now });
    return true;
  }

  if (current.count >= maxPerWindow) {
    res.status(429).json({ ok: false, message: 'Too many requests. Please try again shortly.' });
    return false;
  }

  current.count += 1;
  return true;
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

function canReadSubjectRow(subject, user) {
  if (!subject || !user) return false;
  if (hasAdminPrivileges(user)) return true;
  const viewerCourse = canonicalCourseNameForSubjects(user.course).toLowerCase();
  const subjectCourse = canonicalCourseNameForSubjects(subject.course_name).toLowerCase();
  if (!viewerCourse || !subjectCourse || viewerCourse !== subjectCourse) {
    return false;
  }
  if (subject.membership_state === 'banned') {
    return false;
  }
  return true;
}

async function loadSubjectForViewer(subjectId, user, client = pool) {
  const result = await client.query(
    `SELECT
       s.id,
       s.course_code,
       s.course_name,
       s.subject_code,
       s.subject_name,
       s.description,
       s.created_by_uid,
       s.is_active,
       s.created_at,
       s.updated_at,
       m.state AS membership_state
     FROM subjects s
     LEFT JOIN subject_memberships m
       ON m.subject_id = s.id
      AND m.user_uid = $2
     WHERE s.id = $1
       AND s.is_active = true
     LIMIT 1`,
    [subjectId, user.uid]
  );
  const subject = result.rows[0];
  if (!subject) return { status: 'not_found', subject: null };
  if (!canReadSubjectRow(subject, user)) return { status: 'forbidden', subject };
  return { status: 'ok', subject };
}

async function ensureActiveMembership(subjectId, userUid, client = pool) {
  const now = new Date();
  const result = await client.query(
    `INSERT INTO subject_memberships
       (subject_id, user_uid, state, joined_at, created_at, updated_at)
     VALUES
       ($1, $2, 'member', $3, $3, $3)
     ON CONFLICT (subject_id, user_uid)
     DO UPDATE
       SET state = CASE
         WHEN subject_memberships.state = 'banned' THEN subject_memberships.state
         ELSE 'member'
       END,
           joined_at = CASE
             WHEN subject_memberships.state = 'banned' THEN subject_memberships.joined_at
             ELSE COALESCE(subject_memberships.joined_at, $3)
           END,
           left_at = CASE
             WHEN subject_memberships.state = 'banned' THEN subject_memberships.left_at
             ELSE NULL
           END,
           updated_at = $3
     RETURNING state`,
    [subjectId, userUid, now]
  );
  return result.rows[0] ? result.rows[0].state : 'member';
}

async function ensureSubjectInteractionAccess(subjectId, user, client = pool) {
  const subjectState = await loadSubjectForViewer(subjectId, user, client);
  if (subjectState.status !== 'ok') {
    return subjectState;
  }

  if (hasAdminPrivileges(user)) {
    return { status: 'ok', subject: subjectState.subject, membershipState: 'member' };
  }

  const membershipState = await ensureActiveMembership(subjectId, user.uid, client);
  if (membershipState === 'banned') {
    return { status: 'banned', subject: subjectState.subject };
  }

  return { status: 'ok', subject: subjectState.subject, membershipState };
}

function canAccessDocumentRow(document, user) {
  if (!document || !user) return false;
  if (document.is_restricted === true) return false;
  if (hasAdminPrivileges(user)) return true;
  if (document.uploader_uid && document.uploader_uid === user.uid) return true;
  if (document.visibility === 'public') return true;
  const viewerCourse = canonicalCourseNameForSubjects(user.course).toLowerCase();
  const docCourse = canonicalCourseNameForSubjects(document.course).toLowerCase();
  const includeCourseExclusive = isUnifiedVisibilityEnabled();
  return Boolean(
    viewerCourse &&
      docCourse &&
      viewerCourse === docCourse &&
      (
        document.visibility === 'private' ||
        (includeCourseExclusive && document.visibility === 'course_exclusive')
      )
  );
}

async function loadAccessibleLibraryDocument(uuid, user, client = pool) {
  if (!uuid) return null;
  if (!looksLikeUuid(uuid)) return null;
  const result = await client.query(
    `SELECT
       uuid,
       title,
       course,
       subject,
       visibility,
       is_restricted,
       link,
       uploader_uid
     FROM documents
     WHERE uuid = $1
     LIMIT 1`,
    [uuid]
  );
  const document = result.rows[0];
  if (!document || !canAccessDocumentRow(document, user)) return null;
  const link = await signIfNeeded(document.link);
  return {
    uuid: document.uuid,
    title: document.title || 'Untitled document',
    course: document.course || null,
    subject: document.subject || null,
    visibility: document.visibility || 'public',
    link,
  };
}

router.get('/api/subjects/bootstrap', async (req, res) => {
  const viewerCourse = normalizeCourse(req.user.course);
  const requestedCourse = normalizeCourse(req.query.course);
  const canViewAll = hasAdminPrivileges(req.user);
  const canCreate = hasProfessorPrivileges(req.user);
  let effectiveViewerCourse = canonicalCourseNameForSubjects(viewerCourse);
  let effectiveRequestedCourse = canonicalCourseNameForSubjects(requestedCourse);

  try {
    if (!canViewAll && !effectiveViewerCourse) {
      return res.json({
        ok: true,
        subjects: [],
        canCreate: false,
        policy: {
          accessModel: SUBJECTS_ACCESS_MODEL,
          viewerCourse: null,
        },
      });
    }

    const values = [req.user.uid];
    const filters = ['s.is_active = true'];
    if (canViewAll) {
      if (effectiveRequestedCourse) {
        values.push(effectiveRequestedCourse);
        filters.push(`lower(s.course_name) = lower($${values.length})`);
      }
    } else {
      values.push(effectiveViewerCourse);
      filters.push(`lower(s.course_name) = lower($${values.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT
         s.id,
         s.course_code,
         s.course_name,
         s.subject_code,
         s.subject_name,
         s.description,
         s.created_at,
         s.updated_at,
         m.state AS membership_state,
         COALESCE((
           SELECT COUNT(*)::int
           FROM subject_posts sp
           WHERE sp.subject_id = s.id
             AND sp.status = 'active'
         ), 0) AS posts_count
       FROM subjects s
       LEFT JOIN subject_memberships m
         ON m.subject_id = s.id
        AND m.user_uid = $1
       ${whereClause}
       ORDER BY lower(s.subject_name) ASC, s.id ASC`,
      values
    );

    const subjects = result.rows.map((row) => ({
      id: Number(row.id),
      courseCode: row.course_code || null,
      courseName: row.course_name || '',
      subjectCode: row.subject_code || null,
      subjectName: row.subject_name || 'Untitled subject',
      description: row.description || '',
      postsCount: Number(row.posts_count || 0),
      membershipState: row.membership_state || 'member',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.json({
      ok: true,
      subjects,
      canCreate,
      policy: {
        accessModel: SUBJECTS_ACCESS_MODEL,
        viewerCourse: effectiveViewerCourse || null,
      },
    });
  } catch (error) {
    console.error('Subjects bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load subjects.' });
  }
});

router.post('/api/subjects', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:create', 12)) {
    return;
  }
  if (!hasProfessorPrivileges(req.user)) {
    return res.status(403).json({ ok: false, message: 'Not allowed.' });
  }

  const subjectName = normalizeText(req.body && req.body.subjectName, 180);
  const description = normalizeText(req.body && req.body.description, 2000);
  const subjectCode = normalizeText(req.body && req.body.subjectCode, 60);
  const viewerCourse = canonicalCourseNameForSubjects(normalizeCourse(req.user.course));
  const requestedCourse = canonicalCourseNameForSubjects(normalizeCourse(req.body && req.body.courseName));
  const courseName = hasAdminPrivileges(req.user) ? requestedCourse || viewerCourse : viewerCourse;

  if (!subjectName || !courseName) {
    return res.status(400).json({
      ok: false,
      message: 'Subject name and course are required.',
    });
  }

  try {
    const courseCodeResult = await pool.query(
      `SELECT course_code, course_name
       FROM courses
       WHERE lower(course_name) = lower($1)
       LIMIT 1`,
      [courseName]
    );
    if (!courseCodeResult.rows.length) {
      return res.status(400).json({
        ok: false,
        message: 'Course does not exist. Choose a valid course.',
      });
    }

    const canonicalCourseName = courseCodeResult.rows[0].course_name || courseName;
    const canonicalCourseCode = courseCodeResult.rows[0].course_code || null;

    const existingResult = await pool.query(
      `SELECT
         id,
         course_code,
         course_name,
         subject_code,
         subject_name,
         description,
         created_at,
         updated_at
       FROM subjects
       WHERE lower(course_name) = lower($1)
         AND lower(subject_name) = lower($2)
       LIMIT 1`,
      [canonicalCourseName, subjectName]
    );
    if (existingResult.rows[0]) {
      const existing = existingResult.rows[0];
      return res.status(409).json({
        ok: false,
        message: 'Subject already exists in this course.',
        subject: {
          id: Number(existing.id),
          courseCode: existing.course_code || null,
          courseName: existing.course_name || '',
          subjectCode: existing.subject_code || null,
          subjectName: existing.subject_name || '',
          description: existing.description || '',
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        },
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO subjects
         (course_code, course_name, subject_code, subject_name, description, created_by_uid, is_active)
      VALUES
         ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (course_name, subject_name)
       DO NOTHING
      RETURNING
         id,
         course_code,
         course_name,
         subject_code,
         subject_name,
         description,
         created_at,
         updated_at`,
      [
        canonicalCourseCode || null,
        canonicalCourseName,
        subjectCode || null,
        subjectName,
        description || null,
        req.user.uid,
      ]
    );
    let row = insertResult.rows[0] || null;
    if (!row) {
      return res.status(409).json({
        ok: false,
        message: 'Subject already exists in this course.',
      });
    }

    return res.json({
      ok: true,
      subject: {
        id: Number(row.id),
        courseCode: row.course_code || null,
        courseName: row.course_name || '',
        subjectCode: row.subject_code || null,
        subjectName: row.subject_name || '',
        description: row.description || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Subject create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create subject.' });
  }
});

router.get('/api/subjects/:id/feed', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const page = parsePositiveInt(req.query.page, 1, 2000);
  const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  try {
    const subjectState = await loadSubjectForViewer(subjectId, req.user);
    if (subjectState.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectState.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this subject.' });
    }

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM subject_posts
       WHERE subject_id = $1
         AND status = 'active'`,
      [subjectId]
    );
    const total = Number(totalResult.rows[0]?.total || 0);

    const listResult = await pool.query(
      `SELECT
         sp.id,
         sp.subject_id,
         sp.author_uid,
         sp.title,
         sp.content,
         sp.attachment_library_document_uuid,
         sp.likes_count,
         sp.comments_count,
         sp.created_at,
         sp.updated_at,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name,
         pr.photo_link AS author_photo_link,
         CASE WHEN spl.id IS NULL THEN false ELSE true END AS liked
       FROM subject_posts sp
       JOIN accounts a ON a.uid = sp.author_uid
       LEFT JOIN profiles pr ON pr.uid = sp.author_uid
       LEFT JOIN subject_post_likes spl
         ON spl.subject_id = sp.subject_id
        AND spl.post_id = sp.id
        AND spl.user_uid = $2
       WHERE sp.subject_id = $1
         AND sp.status = 'active'
       ORDER BY sp.created_at DESC, sp.id DESC
       LIMIT $3 OFFSET $4`,
      [subjectId, req.user.uid, pageSize, (page - 1) * pageSize]
    );

    const attachmentUuids = [
      ...new Set(
        listResult.rows
          .map((row) => row.attachment_library_document_uuid)
          .filter(Boolean)
      ),
    ];
    const documentByUuid = new Map();
    if (attachmentUuids.length) {
      const docsResult = await pool.query(
        `SELECT uuid, title, course, subject, visibility, is_restricted, link, uploader_uid
         FROM documents
         WHERE uuid = ANY($1::uuid[])`,
        [attachmentUuids]
      );
      const signedRows = await Promise.all(
        docsResult.rows.map(async (row) => {
          const visible = canAccessDocumentRow(row, req.user);
          if (!visible) return null;
          const link = await signIfNeeded(row.link);
          return {
            uuid: row.uuid,
            title: row.title || 'Untitled document',
            course: row.course || null,
            subject: row.subject || null,
            visibility: row.visibility || 'public',
            link,
          };
        })
      );
      signedRows.forEach((row) => {
        if (row && row.uuid) {
          documentByUuid.set(row.uuid, row);
        }
      });
    }

    const postIds = listResult.rows.map((row) => Number(row.id)).filter(Boolean);
    const commentsByPost = new Map();
    if (postIds.length) {
      const commentsResult = await pool.query(
        `SELECT
           sc.id,
           sc.post_id,
           sc.author_uid,
           sc.content,
           sc.created_at,
           COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
         FROM subject_comments sc
         JOIN accounts a ON a.uid = sc.author_uid
         LEFT JOIN profiles pr ON pr.uid = sc.author_uid
         WHERE sc.subject_id = $1
           AND sc.post_id = ANY($2::bigint[])
           AND sc.status = 'active'
         ORDER BY sc.created_at ASC, sc.id ASC`,
        [subjectId, postIds]
      );
      commentsResult.rows.forEach((row) => {
        const postId = Number(row.post_id);
        if (!commentsByPost.has(postId)) {
          commentsByPost.set(postId, []);
        }
        commentsByPost.get(postId).push({
          id: Number(row.id),
          postId,
          authorUid: row.author_uid,
          authorName: row.author_name || 'Member',
          content: row.content || '',
          createdAt: row.created_at,
        });
      });
    }

    const posts = await Promise.all(
      listResult.rows.map(async (row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || 'Untitled post',
        content: row.content || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        liked: Boolean(row.liked),
        isOwner: row.author_uid === req.user.uid,
        author: {
          uid: row.author_uid,
          displayName: row.author_name || 'Member',
          photoLink: await signIfNeeded(row.author_photo_link),
        },
        attachment: row.attachment_library_document_uuid
          ? documentByUuid.get(row.attachment_library_document_uuid) || null
          : null,
        comments: commentsByPost.get(Number(row.id)) || [],
      }))
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      subject: {
        id: Number(subjectState.subject.id),
        courseName: subjectState.subject.course_name || '',
        subjectName: subjectState.subject.subject_name || '',
        description: subjectState.subject.description || '',
      },
      posts,
    });
  } catch (error) {
    console.error('Subject feed fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load subject feed.' });
  }
});

router.post('/api/subjects/:id/posts', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:create_post', 30)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  const title = normalizeText(req.body && req.body.title, 220);
  const content = normalizeText(req.body && req.body.content, 8000);
  const attachmentLibraryDocumentUuid = normalizeText(
    req.body && req.body.attachmentLibraryDocumentUuid,
    100
  );
  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }
  if (attachmentLibraryDocumentUuid && !looksLikeUuid(attachmentLibraryDocumentUuid)) {
    return res.status(400).json({ ok: false, message: 'Invalid attachment document id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client);
    if (subjectAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed to post in this subject.' });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ ok: false, message: 'You are banned from interacting in this subject.' });
    }

    let attachmentUuid = null;
    if (attachmentLibraryDocumentUuid) {
      const document = await loadAccessibleLibraryDocument(
        attachmentLibraryDocumentUuid,
        req.user,
        client
      );
      if (!document) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          ok: false,
          message: 'Selected Open Library document is not accessible.',
        });
      }
      attachmentUuid = document.uuid;
    }

    const insertResult = await client.query(
      `INSERT INTO subject_posts
         (subject_id, author_uid, title, content, attachment_library_document_uuid)
       VALUES
         ($1, $2, $3, $4, $5)
       RETURNING
         id,
         subject_id,
         author_uid,
         title,
         content,
         attachment_library_document_uuid,
         likes_count,
         comments_count,
         created_at,
         updated_at`,
      [subjectId, req.user.uid, title, content, attachmentUuid]
    );
    await client.query('COMMIT');

    const row = insertResult.rows[0];
    return res.json({
      ok: true,
      post: {
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || '',
        content: row.content || '',
        attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create subject post.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/like', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:like_post', 160)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const action = normalizeText(req.body && req.body.action, 20).toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client);
    if (subjectAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ ok: false, message: 'You are banned from interacting in this subject.' });
    }

    const postResult = await client.query(
      `SELECT id
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    if (!postResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    if (action === 'unlike') {
      await client.query(
        `DELETE FROM subject_post_likes
         WHERE subject_id = $1
           AND post_id = $2
           AND user_uid = $3`,
        [subjectId, postId, req.user.uid]
      );
    } else {
      await client.query(
        `INSERT INTO subject_post_likes (subject_id, post_id, user_uid)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, post_id, user_uid) DO NOTHING`,
        [subjectId, postId, req.user.uid]
      );
    }

    const updateResult = await client.query(
      `UPDATE subject_posts sp
       SET likes_count = (
         SELECT COUNT(*)::int
         FROM subject_post_likes spl
         WHERE spl.subject_id = sp.subject_id
           AND spl.post_id = sp.id
       ),
           updated_at = NOW()
       WHERE sp.subject_id = $1
         AND sp.id = $2
       RETURNING sp.likes_count`,
      [subjectId, postId]
    );

    const likedResult = await client.query(
      `SELECT 1
       FROM subject_post_likes
       WHERE subject_id = $1
         AND post_id = $2
         AND user_uid = $3
       LIMIT 1`,
      [subjectId, postId, req.user.uid]
    );
    await client.query('COMMIT');

    return res.json({
      ok: true,
      liked: likedResult.rowCount > 0,
      likesCount: Number(updateResult.rows[0]?.likes_count || 0),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post like failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update like.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/comments', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:create_comment', 80)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 4000);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Comment content required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client);
    if (subjectAccess.status === 'not_found') {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res
        .status(403)
        .json({ ok: false, message: 'You are banned from interacting in this subject.' });
    }

    const postResult = await client.query(
      `SELECT id
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    if (!postResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    const insertResult = await client.query(
      `INSERT INTO subject_comments (subject_id, post_id, author_uid, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, subject_id, post_id, author_uid, content, created_at`,
      [subjectId, postId, req.user.uid, content]
    );
    const countResult = await client.query(
      `UPDATE subject_posts sp
       SET comments_count = (
         SELECT COUNT(*)::int
         FROM subject_comments sc
         WHERE sc.subject_id = sp.subject_id
           AND sc.post_id = sp.id
           AND sc.status = 'active'
       ),
           updated_at = NOW()
       WHERE sp.subject_id = $1
         AND sp.id = $2
       RETURNING comments_count`,
      [subjectId, postId]
    );
    await client.query('COMMIT');

    const row = insertResult.rows[0];
    return res.json({
      ok: true,
      commentsCount: Number(countResult.rows[0]?.comments_count || 0),
      comment: {
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        postId: Number(row.post_id),
        authorUid: row.author_uid,
        authorName: req.user.displayName || req.user.username || req.user.email || 'Member',
        content: row.content || '',
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject comment create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create comment.' });
  } finally {
    client.release();
  }
});

router.get('/api/subjects/:id/posts/:postId/comments', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  try {
    const subjectState = await loadSubjectForViewer(subjectId, req.user);
    if (subjectState.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectState.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const result = await pool.query(
      `SELECT
         sc.id,
         sc.subject_id,
         sc.post_id,
         sc.author_uid,
         sc.content,
         sc.created_at,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
       FROM subject_comments sc
       JOIN accounts a ON a.uid = sc.author_uid
       LEFT JOIN profiles pr ON pr.uid = sc.author_uid
       WHERE sc.subject_id = $1
         AND sc.post_id = $2
         AND sc.status = 'active'
       ORDER BY sc.created_at ASC, sc.id ASC
       LIMIT 300`,
      [subjectId, postId]
    );

    return res.json({
      ok: true,
      comments: result.rows.map((row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        postId: Number(row.post_id),
        authorUid: row.author_uid,
        authorName: row.author_name || 'Member',
        content: row.content || '',
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Subject comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load comments.' });
  }
});

module.exports = router;
