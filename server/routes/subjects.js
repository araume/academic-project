const express = require('express');
const pool = require('../db/pool');
const { getMongoDb } = require('../db/mongo');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getSignedUrl } = require('../services/storage');
const { hasAdminPrivileges, getPlatformRole } = require('../services/roleAccess');
const { isSubjectsEnabled, isUnifiedVisibilityEnabled } = require('../services/featureFlags');
const { autoScanIncomingContent } = require('../services/aiContentScanService');
const { getOpenAIClient, getOpenAIModel, getOpenAIKey } = require('../services/openaiClient');
const { parseReportPayload } = require('../services/reporting');

const router = express.Router();

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const SUBJECTS_ACCESS_MODEL = 'auto_course_membership';
const RATE_WINDOW_MS = 60 * 1000;
const SUBJECT_AI_CONTEXT_POST_LIMIT = 6;
const SUBJECT_AI_HISTORY_LIMIT = 14;
const SUBJECT_AI_CONTEXT_BODY_CHARS = 700;
const SUBJECT_AI_CONTEXT_SUMMARY_CHARS = 240;
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
let ensureDepAdminAssignmentsReadyPromise = null;
let ensureSubjectEngagementReadyPromise = null;
let ensureSubjectAiIndexesPromise = null;

router.use('/api/subjects', requireAuthApi);

router.use('/api/subjects', async (req, res, next) => {
  if (!isSubjectsEnabled()) {
    return res.status(404).json({ ok: false, message: 'Subjects feature is disabled.' });
  }
  try {
    await ensureSubjectEngagementReady();
    return next();
  } catch (error) {
    console.error('Subjects governance bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Units service is unavailable.' });
  }
});

function normalizeText(value, max = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeContextText(text) {
  if (!text) return '';
  return String(text).replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateContextText(text, max = 1200) {
  const normalized = normalizeContextText(text);
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max).trim()}...` : normalized;
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

async function ensureDepAdminAssignmentsReady(client = pool) {
  if (!ensureDepAdminAssignmentsReadyPromise) {
    ensureDepAdminAssignmentsReadyPromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS course_dep_admin_assignments (
          id BIGSERIAL PRIMARY KEY,
          course_code TEXT,
          course_name TEXT NOT NULL UNIQUE,
          depadmin_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS course_dep_admin_assignments_depadmin_uid_idx
          ON course_dep_admin_assignments(depadmin_uid, updated_at DESC);
      `);
    })().catch((error) => {
      ensureDepAdminAssignmentsReadyPromise = null;
      throw error;
    });
  }
  await ensureDepAdminAssignmentsReadyPromise;
}

async function ensureSubjectEngagementReady(client = pool) {
  if (!ensureSubjectEngagementReadyPromise) {
    ensureSubjectEngagementReadyPromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS subject_post_bookmarks (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES subject_posts(id) ON DELETE CASCADE,
          user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (subject_id, post_id, user_uid)
        );

        CREATE TABLE IF NOT EXISTS subject_post_reports (
          id BIGSERIAL PRIMARY KEY,
          subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          post_id BIGINT NOT NULL REFERENCES subject_posts(id) ON DELETE CASCADE,
          reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          category TEXT,
          custom_reason TEXT,
          details TEXT,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'under_review', 'resolved_action_taken', 'resolved_no_action', 'rejected')),
          moderation_action TEXT,
          resolution_note TEXT,
          resolved_at TIMESTAMPTZ,
          resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (post_id, reporter_uid)
        );

        CREATE INDEX IF NOT EXISTS subject_post_bookmarks_user_created_idx
          ON subject_post_bookmarks(user_uid, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_post_reports_subject_status_idx
          ON subject_post_reports(subject_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS subject_post_reports_target_idx
          ON subject_post_reports(post_id, created_at DESC);
      `);
    })().catch((error) => {
      ensureSubjectEngagementReadyPromise = null;
      throw error;
    });
  }
  await ensureSubjectEngagementReadyPromise;
}

async function hasDepAdminAssignmentForCourse(uid, courseName, client = pool) {
  if (!uid || !courseName) return false;
  await ensureDepAdminAssignmentsReady(client);
  const result = await client.query(
    `SELECT 1
     FROM course_dep_admin_assignments
     WHERE depadmin_uid = $1
       AND lower(course_name) = lower($2)
     LIMIT 1`,
    [uid, courseName]
  );
  return result.rows.length > 0;
}

async function canViewerCreateSubjects(user, client = pool) {
  const role = getPlatformRole(user);
  if (role === 'owner' || role === 'admin') return true;
  if (role !== 'depadmin') return false;
  const viewerCourse = canonicalCourseNameForSubjects(normalizeCourse(user && user.course));
  if (!viewerCourse) return false;
  return hasDepAdminAssignmentForCourse(user.uid, viewerCourse, client);
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

function extractTextFromOpenAIResponse(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const contentItem of item.content) {
        const text = typeof contentItem?.text === 'string' ? contentItem.text.trim() : '';
        if (!text) continue;
        if (contentItem.type === 'output_text' || contentItem.type === 'text') {
          chunks.push(text);
        }
      }
    }
  }

  return chunks.join('\n\n').trim();
}

async function ensureSubjectAiIndexes() {
  if (!ensureSubjectAiIndexesPromise) {
    ensureSubjectAiIndexesPromise = (async () => {
      const db = await getMongoDb();
      await Promise.all([
        db.collection('subject_ai_conversations').createIndex({ subjectId: 1, userUid: 1 }, { unique: true }),
        db.collection('subject_ai_messages').createIndex({ conversationId: 1, userUid: 1, createdAt: 1 }),
        db.collection('subject_post_ai_conversations').createIndex({ subjectId: 1, postId: 1, userUid: 1 }, { unique: true }),
        db.collection('subject_post_ai_messages').createIndex({ conversationId: 1, userUid: 1, createdAt: 1 }),
      ]);
    })().catch((error) => {
      ensureSubjectAiIndexesPromise = null;
      throw error;
    });
  }
  await ensureSubjectAiIndexesPromise;
}

async function cleanupSubjectPostAiArtifacts(postId) {
  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId < 1) return;

  try {
    const db = await getMongoDb();
    const conversations = await db
      .collection('subject_post_ai_conversations')
      .find({ postId: numericPostId })
      .project({ _id: 1 })
      .toArray();
    const conversationIds = conversations.map((item) => item && item._id).filter(Boolean);

    const cleanupOps = [
      db.collection('subject_post_ai_conversations').deleteMany({ postId: numericPostId }),
    ];
    if (conversationIds.length) {
      cleanupOps.push(
        db.collection('subject_post_ai_messages').deleteMany({ conversationId: { $in: conversationIds } })
      );
    }
    await Promise.all(cleanupOps);
  } catch (error) {
    console.error('Subject post AI artifact cleanup failed:', error);
  }
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

async function loadSubjectAiContext(subjectId, user, client = pool) {
  const subjectAccess = await ensureSubjectInteractionAccess(subjectId, user, client);
  if (subjectAccess.status !== 'ok') {
    return subjectAccess;
  }

  const subject = subjectAccess.subject || {};
  const recentPostsResult = await client.query(
    `SELECT
       sp.id,
       sp.title,
       sp.content,
       sp.created_at,
       sp.comments_count,
       sp.likes_count,
       sp.attachment_library_document_uuid,
       COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name,
       CASE
         WHEN d.uuid IS NULL OR COALESCE(d.is_restricted, false) = true THEN NULL
         ELSE d.title
       END AS attachment_title
     FROM subject_posts sp
     JOIN accounts a ON a.uid = sp.author_uid
     LEFT JOIN profiles pr ON pr.uid = sp.author_uid
     LEFT JOIN documents d ON d.uuid = sp.attachment_library_document_uuid
     WHERE sp.subject_id = $1
       AND sp.status = 'active'
     ORDER BY sp.created_at DESC, sp.id DESC
     LIMIT $2`,
    [subjectId, SUBJECT_AI_CONTEXT_POST_LIMIT]
  );

  const recentPosts = recentPostsResult.rows.map((row) => ({
    id: Number(row.id),
    title: row.title || 'Untitled post',
    content: truncateContextText(row.content || '', SUBJECT_AI_CONTEXT_BODY_CHARS),
    createdAt: row.created_at,
    commentsCount: Number(row.comments_count || 0),
    likesCount: Number(row.likes_count || 0),
    authorName: row.author_name || 'Member',
    attachmentTitle: row.attachment_title || null,
  }));

  const summaryParts = [
    `${subject.subject_name || 'This unit'} in ${subject.course_name || 'the course catalog'}.`,
    subject.description ? truncateContextText(subject.description, SUBJECT_AI_CONTEXT_SUMMARY_CHARS) : '',
    recentPosts.length
      ? `Recent topics: ${recentPosts.map((post) => post.title).filter(Boolean).slice(0, 4).join('; ')}.`
      : 'No recent unit posts yet.',
  ].filter(Boolean);

  return {
    status: 'ok',
    membershipState: subjectAccess.membershipState || 'member',
    subject,
    recentPosts,
    contextSummary: summaryParts.join(' '),
  };
}

function buildSubjectAiContextBlock(subject, recentPosts = []) {
  const lines = [
    `Unit name: ${subject.subject_name || 'Untitled unit'}`,
    `Unit code: ${subject.subject_code || 'N/A'}`,
    `Course: ${subject.course_name || 'N/A'}`,
    `Unit description:\n${truncateContextText(subject.description || 'No unit description provided.', 1400)}`,
  ];

  if (recentPosts.length) {
    lines.push(
      `Recent unit posts:\n${recentPosts
        .map((post, index) => {
          const segments = [
            `${index + 1}. ${post.title || 'Untitled post'}`,
            `Author: ${post.authorName || 'Member'}`,
            `Post body: ${truncateContextText(post.content || '', SUBJECT_AI_CONTEXT_BODY_CHARS) || 'No body.'}`,
            post.attachmentTitle ? `Attached reading: ${post.attachmentTitle}` : '',
            `Signals: ${post.likesCount || 0} likes, ${post.commentsCount || 0} comments`,
          ].filter(Boolean);
          return segments.join('\n');
        })
        .join('\n\n')}`
    );
  } else {
    lines.push('Recent unit posts: none yet.');
  }

  return lines.join('\n\n');
}

async function loadSubjectPostAiContext(subjectId, postId, user, client = pool) {
  const subjectAccess = await ensureSubjectInteractionAccess(subjectId, user, client);
  if (subjectAccess.status !== 'ok') {
    return subjectAccess;
  }

  const postResult = await client.query(
    `SELECT
       sp.id,
       sp.subject_id,
       sp.author_uid,
       sp.title,
       sp.content,
       sp.created_at,
       sp.likes_count,
       sp.comments_count,
       sp.attachment_library_document_uuid,
       COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name
     FROM subject_posts sp
     JOIN accounts a ON a.uid = sp.author_uid
     LEFT JOIN profiles pr ON pr.uid = sp.author_uid
     WHERE sp.id = $1
       AND sp.subject_id = $2
       AND sp.status = 'active'
     LIMIT 1`,
    [postId, subjectId]
  );
  const post = postResult.rows[0] || null;
  if (!post) {
    return { status: 'not_found', subject: subjectAccess.subject, post: null };
  }

  let attachment = null;
  if (post.attachment_library_document_uuid) {
    attachment = await loadAccessibleLibraryDocument(post.attachment_library_document_uuid, user, client);
  }

  return {
    status: 'ok',
    subject: subjectAccess.subject,
    post: {
      id: Number(post.id),
      subjectId: Number(post.subject_id),
      authorUid: post.author_uid,
      authorName: post.author_name || 'Member',
      title: post.title || 'Untitled post',
      content: post.content || '',
      createdAt: post.created_at,
      likesCount: Number(post.likes_count || 0),
      commentsCount: Number(post.comments_count || 0),
      attachment,
    },
  };
}

function buildSubjectPostAiContextBlock(subject, post) {
  const lines = [
    `Unit name: ${subject.subject_name || 'Untitled unit'}`,
    `Unit code: ${subject.subject_code || 'N/A'}`,
    `Course: ${subject.course_name || 'N/A'}`,
    `Unit description:\n${truncateContextText(subject.description || 'No unit description provided.', 1200)}`,
    `Post title: ${post.title || 'Untitled post'}`,
    `Post author: ${post.authorName || 'Member'}`,
    `Created: ${post.createdAt ? new Date(post.createdAt).toISOString() : 'N/A'}`,
    `Post body:\n${truncateContextText(post.content || '', 3500)}`,
    `Post signals: ${post.likesCount || 0} likes, ${post.commentsCount || 0} comments`,
    post.attachment
      ? `Attached document: ${post.attachment.title || 'Open Library document'}`
      : 'Attached document: none',
  ];
  return lines.join('\n\n');
}

router.get('/api/subjects/bootstrap', async (req, res) => {
  const viewerCourse = normalizeCourse(req.user.course);
  const requestedCourse = normalizeCourse(req.query.course);
  const canViewAll = hasAdminPrivileges(req.user);
  let effectiveViewerCourse = canonicalCourseNameForSubjects(viewerCourse);
  let effectiveRequestedCourse = canonicalCourseNameForSubjects(requestedCourse);

  try {
    const canCreate = await canViewerCreateSubjects(req.user);
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
  const role = getPlatformRole(req.user);
  if (!(role === 'owner' || role === 'admin' || role === 'depadmin')) {
    return res.status(403).json({ ok: false, message: 'Only owner/admin/depadmin can create units.' });
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
    if (role === 'depadmin') {
      const canCreateForCourse = await hasDepAdminAssignmentForCourse(req.user.uid, courseName);
      if (!canCreateForCourse) {
        return res.status(403).json({
          ok: false,
          message: 'You are not assigned as DepAdmin for this course.',
        });
      }
    }

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
         CASE WHEN spl.id IS NULL THEN false ELSE true END AS liked,
         CASE WHEN spb.id IS NULL THEN false ELSE true END AS bookmarked
       FROM subject_posts sp
       JOIN accounts a ON a.uid = sp.author_uid
       LEFT JOIN profiles pr ON pr.uid = sp.author_uid
       LEFT JOIN subject_post_likes spl
         ON spl.subject_id = sp.subject_id
        AND spl.post_id = sp.id
        AND spl.user_uid = $2
       LEFT JOIN subject_post_bookmarks spb
         ON spb.subject_id = sp.subject_id
        AND spb.post_id = sp.id
        AND spb.user_uid = $2
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
        bookmarked: Boolean(row.bookmarked),
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

    setImmediate(() => {
      const subject = subjectAccess && subjectAccess.subject ? subjectAccess.subject : {};
      const contentScanText = [
        `Title: ${row.title || ''}`,
        `Content: ${row.content || ''}`,
        `Course: ${subject.course_name || ''}`,
        `Subject: ${subject.subject_name || ''}`,
        row.attachment_library_document_uuid
          ? `Attached Open Library document UUID: ${row.attachment_library_document_uuid}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      autoScanIncomingContent({
        targetType: 'subject_post',
        targetId: String(row.id),
        requestedByUid: req.user.uid,
        content: contentScanText,
        metadata: {
          subjectId: Number(row.subject_id),
          course: subject.course_name || '',
          subjectName: subject.subject_name || '',
          attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
          source: 'units_create_post',
        },
      }).catch((error) => {
        console.error('Subject post auto content scan failed:', error);
      });
    });

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

router.patch('/api/subjects/:id/posts/:postId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:edit_post', 40)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
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
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const postResult = await client.query(
      `SELECT id, author_uid
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    const post = postResult.rows[0] || null;
    if (!post) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (post.author_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only the post owner can edit this unit post.' });
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

    const updateResult = await client.query(
      `UPDATE subject_posts
       SET title = $4,
           content = $5,
           attachment_library_document_uuid = $6,
           updated_at = NOW()
       WHERE id = $1
         AND subject_id = $2
         AND author_uid = $3
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
      [postId, subjectId, req.user.uid, title, content, attachmentUuid]
    );
    await client.query('COMMIT');

    const row = updateResult.rows[0];
    setImmediate(() => {
      const subject = subjectAccess && subjectAccess.subject ? subjectAccess.subject : {};
      const contentScanText = [
        `Title: ${row.title || ''}`,
        `Content: ${row.content || ''}`,
        `Course: ${subject.course_name || ''}`,
        `Subject: ${subject.subject_name || ''}`,
        row.attachment_library_document_uuid
          ? `Attached Open Library document UUID: ${row.attachment_library_document_uuid}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      autoScanIncomingContent({
        targetType: 'subject_post',
        targetId: String(row.id),
        requestedByUid: req.user.uid,
        content: contentScanText,
        metadata: {
          subjectId: Number(row.subject_id),
          course: subject.course_name || '',
          subjectName: subject.subject_name || '',
          attachmentLibraryDocumentUuid: row.attachment_library_document_uuid || null,
          source: 'units_edit_post',
        },
      }).catch((error) => {
        console.error('Subject post edit auto content scan failed:', error);
      });
    });

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
    console.error('Subject post update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update subject post.' });
  } finally {
    client.release();
  }
});

router.delete('/api/subjects/:id/posts/:postId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'subjects:delete_post', 20)) {
    return;
  }

  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
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
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const postResult = await client.query(
      `SELECT id, author_uid
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    const post = postResult.rows[0] || null;
    if (!post) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (post.author_uid !== req.user.uid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only the post owner can delete this unit post.' });
    }

    const deleteResult = await client.query(
      `DELETE FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND author_uid = $3
       RETURNING id`,
      [postId, subjectId, req.user.uid]
    );
    await client.query('COMMIT');

    if (deleteResult.rows[0]) {
      setImmediate(() => {
        cleanupSubjectPostAiArtifacts(postId).catch((error) => {
          console.error('Subject post delete cleanup failed:', error);
        });
      });
    }

    return res.json({ ok: true, deleted: Boolean(deleteResult.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Subject post delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete subject post.' });
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

router.post('/api/subjects/:id/posts/:postId/bookmark', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const action = normalizeText(req.body && req.body.action, 20).toLowerCase();
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const client = await pool.connect();
  try {
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client);
    if (subjectAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
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
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    if (action === 'remove') {
      await client.query(
        `DELETE FROM subject_post_bookmarks
         WHERE subject_id = $1
           AND post_id = $2
           AND user_uid = $3`,
        [subjectId, postId, req.user.uid]
      );
      return res.json({ ok: true, bookmarked: false });
    }

    await client.query(
      `INSERT INTO subject_post_bookmarks (subject_id, post_id, user_uid)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject_id, post_id, user_uid) DO NOTHING`,
      [subjectId, postId, req.user.uid]
    );
    return res.json({ ok: true, bookmarked: true });
  } catch (error) {
    console.error('Subject post bookmark failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update bookmark.' });
  } finally {
    client.release();
  }
});

router.post('/api/subjects/:id/posts/:postId/report', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  const client = await pool.connect();
  try {
    const subjectAccess = await ensureSubjectInteractionAccess(subjectId, req.user, client);
    if (subjectAccess.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (subjectAccess.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (subjectAccess.status === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const { category, customReason, details, reason } = parseReportPayload(req.body || {});
    const postResult = await client.query(
      `SELECT id, author_uid, title
       FROM subject_posts
       WHERE id = $1
         AND subject_id = $2
         AND status = 'active'
       LIMIT 1`,
      [postId, subjectId]
    );
    const post = postResult.rows[0] || null;
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (post.author_uid && post.author_uid === req.user.uid) {
      return res.status(400).json({ ok: false, message: 'You cannot report your own post.' });
    }

    await client.query(
      `INSERT INTO subject_post_reports
         (subject_id, post_id, reporter_uid, target_uid, category, custom_reason, details, reason, status, moderation_action, resolution_note, resolved_at, resolved_by_uid, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NULL, NULL, NULL, NULL, NOW(), NOW())
       ON CONFLICT (post_id, reporter_uid)
       DO UPDATE SET
         target_uid = EXCLUDED.target_uid,
         category = EXCLUDED.category,
         custom_reason = EXCLUDED.custom_reason,
         details = EXCLUDED.details,
         reason = EXCLUDED.reason,
         status = 'open',
         moderation_action = NULL,
         resolution_note = NULL,
         resolved_at = NULL,
         resolved_by_uid = NULL,
         updated_at = NOW()`,
      [subjectId, postId, req.user.uid, post.author_uid || null, category, customReason || null, details || null, reason]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Subject post report failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to report post.' });
  } finally {
    client.release();
  }
});

router.get('/api/subjects/:id/posts/:postId/ask-ai/bootstrap', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectPostAiContext(subjectId, postId, req.user);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject post not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_post_ai_conversations');
    const messagesCollection = db.collection('subject_post_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.post.title || 'Unit post'}`;

    await conversations.updateOne(
      { subjectId, postId, userUid: req.user.uid },
      {
        $set: {
          title,
          updatedAt: now,
        },
        $setOnInsert: {
          subjectId,
          postId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const conversation = await conversations.findOne({ subjectId, postId, userUid: req.user.uid });
    const messages = await messagesCollection
      .find({ conversationId: conversation._id, userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .limit(120)
      .toArray();

    return res.json({
      ok: true,
      conversation: {
        id: conversation._id.toString(),
        title,
        subjectId,
        postId,
      },
      context: {
        postTitle: context.post.title || 'Untitled post',
        subjectTitle: context.subject.subject_name || 'Untitled unit',
        summary: truncateContextText(context.post.content || '', 220) || 'Post context ready.',
      },
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content || '',
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error('Subject post AI bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load subject post AI conversation.' });
  }
});

router.post('/api/subjects/:id/posts/:postId/ask-ai/messages', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const postId = parsePositiveInt(req.params.postId, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 3000);
  if (!subjectId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject post id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectPostAiContext(subjectId, postId, req.user);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject post not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_post_ai_conversations');
    const messagesCollection = db.collection('subject_post_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.post.title || 'Unit post'}`;

    await conversations.updateOne(
      { subjectId, postId, userUid: req.user.uid },
      {
        $set: { title, updatedAt: now },
        $setOnInsert: {
          subjectId,
          postId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );
    const conversation = await conversations.findOne({ subjectId, postId, userUid: req.user.uid });

    const userMessage = {
      conversationId: conversation._id,
      subjectId,
      postId,
      userUid: req.user.uid,
      role: 'user',
      content,
      createdAt: now,
    };
    await messagesCollection.insertOne(userMessage);

    let assistantText = Boolean(getOpenAIKey())
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses.';

    const openai = await getOpenAIClient();
    if (openai) {
      const recentMessages = await messagesCollection
        .find({ conversationId: conversation._id, userUid: req.user.uid })
        .sort({ createdAt: -1 })
        .limit(SUBJECT_AI_HISTORY_LIMIT)
        .toArray();

      const history = [...recentMessages].reverse().map((message) => ({
        role: message.role,
        content: message.content || '',
      }));
      const contextBlock = buildSubjectPostAiContextBlock(context.subject, context.post);

      try {
        const response = await openai.responses.create({
          model: getOpenAIModel(),
          max_output_tokens: 900,
          input: [
            {
              role: 'system',
              content:
                'You are an academic assistant helping discuss a specific unit post. Stay grounded in the supplied unit and post context. If the user asks for something unrelated to the unit post, briefly say it is outside this post discussion and redirect them back to the post or unit topic.',
            },
            {
              role: 'system',
              content: contextBlock,
            },
            ...history,
          ],
        });
        const outputText = extractTextFromOpenAIResponse(response);
        if (outputText) {
          assistantText = outputText;
        }
      } catch (error) {
        console.error('Subject post AI response failed:', error);
        if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
          assistantText = 'Model access/config issue detected. Set OPENAI_MODEL to an available model and retry.';
        }
      }
    }

    const assistantMessage = {
      conversationId: conversation._id,
      subjectId,
      postId,
      userUid: req.user.uid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    const insertedAssistant = await messagesCollection.insertOne(assistantMessage);
    await conversations.updateOne({ _id: conversation._id }, { $set: { title, updatedAt: new Date() } });

    return res.json({
      ok: true,
      conversationId: conversation._id.toString(),
      message: {
        id: insertedAssistant.insertedId.toString(),
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    });
  } catch (error) {
    console.error('Subject post AI message failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to send subject post AI message.' });
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

router.get('/api/subjects/:id/ask-ai/bootstrap', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectAiContext(subjectId, req.user);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this subject.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_ai_conversations');
    const messagesCollection = db.collection('subject_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.subject.subject_name || 'Unit'}`;

    await conversations.updateOne(
      { subjectId, userUid: req.user.uid },
      {
        $set: {
          title,
          contextSummary: context.contextSummary || null,
          updatedAt: now,
        },
        $setOnInsert: {
          subjectId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const conversation = await conversations.findOne({ subjectId, userUid: req.user.uid });
    const messages = await messagesCollection
      .find({ conversationId: conversation._id, userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .limit(120)
      .toArray();

    return res.json({
      ok: true,
      conversation: {
        id: conversation._id.toString(),
        title,
        subjectId,
      },
      context: {
        subjectTitle: context.subject.subject_name || 'Untitled unit',
        subjectCode: context.subject.subject_code || null,
        courseName: context.subject.course_name || null,
        summary: context.contextSummary || 'Unit context ready.',
        policy:
          'This AI is limited to this unit. Unrelated prompts are declined and redirected back to unit topics.',
      },
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content || '',
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error('Subject AI bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load unit AI conversation.' });
  }
});

router.post('/api/subjects/:id/ask-ai/messages', async (req, res) => {
  const subjectId = parsePositiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const content = normalizeText(req.body && req.body.content, 3000);
  if (!subjectId) {
    return res.status(400).json({ ok: false, message: 'Invalid subject id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    await ensureSubjectAiIndexes();
    const context = await loadSubjectAiContext(subjectId, req.user);
    if (context.status === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Subject not found.' });
    }
    if (context.status === 'forbidden') {
      return res.status(403).json({ ok: false, message: 'Not allowed to view this subject.' });
    }
    if (context.status === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from interacting in this unit.' });
    }

    const db = await getMongoDb();
    const conversations = db.collection('subject_ai_conversations');
    const messagesCollection = db.collection('subject_ai_messages');
    const now = new Date();
    const title = `Ask AI: ${context.subject.subject_name || 'Unit'}`;

    await conversations.updateOne(
      { subjectId, userUid: req.user.uid },
      {
        $set: {
          title,
          contextSummary: context.contextSummary || null,
          updatedAt: now,
        },
        $setOnInsert: {
          subjectId,
          userUid: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const conversation = await conversations.findOne({ subjectId, userUid: req.user.uid });
    const userMessage = {
      conversationId: conversation._id,
      subjectId,
      userUid: req.user.uid,
      role: 'user',
      content,
      createdAt: now,
    };
    await messagesCollection.insertOne(userMessage);

    let assistantText = Boolean(getOpenAIKey())
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses.';

    const openai = await getOpenAIClient();
    if (openai) {
      const recentMessages = await messagesCollection
        .find({ conversationId: conversation._id, userUid: req.user.uid })
        .sort({ createdAt: -1 })
        .limit(SUBJECT_AI_HISTORY_LIMIT)
        .toArray();

      const history = [...recentMessages].reverse().map((message) => ({
        role: message.role,
        content: message.content || '',
      }));
      const contextBlock = buildSubjectAiContextBlock(context.subject, context.recentPosts);

      try {
        const response = await openai.responses.create({
          model: getOpenAIModel(),
          max_output_tokens: 900,
          input: [
            {
              role: 'system',
              content:
                'You are the dedicated academic assistant for exactly one university unit. Only answer requests that are directly related to this unit, its topics, concepts, readings, assignments, study tasks, or discussions. If a request is unrelated or meaningfully outside this unit, do not answer it directly. Briefly explain that it is outside this unit AI scope and redirect the user to ask about this unit instead. If a request is only partly related, answer only the unit-relevant portion and explicitly say what is out of scope. Do not invent syllabus details, policies, or facts not grounded in the provided unit context.',
            },
            {
              role: 'system',
              content: contextBlock,
            },
            ...history,
          ],
        });
        const outputText = extractTextFromOpenAIResponse(response);
        if (outputText) {
          assistantText = outputText;
        }
      } catch (error) {
        console.error('Subject AI response failed:', error);
        if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
          assistantText = 'Model access/config issue detected. Set OPENAI_MODEL to an available model and retry.';
        }
      }
    }

    const assistantMessage = {
      conversationId: conversation._id,
      subjectId,
      userUid: req.user.uid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    const insertedAssistant = await messagesCollection.insertOne(assistantMessage);
    await conversations.updateOne(
      { _id: conversation._id },
      {
        $set: {
          title,
          contextSummary: context.contextSummary || null,
          updatedAt: new Date(),
        },
      }
    );

    return res.json({
      ok: true,
      conversationId: conversation._id.toString(),
      message: {
        id: insertedAssistant.insertedId.toString(),
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    });
  } catch (error) {
    console.error('Subject AI message failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to send unit AI message.' });
  }
});

module.exports = router;
