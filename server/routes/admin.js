const express = require('express');
const { ObjectId } = require('mongodb');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { deleteSessionsForUid } = require('../auth/sessionStore');
const { getMongoDb } = require('../db/mongo');
const { deleteFromStorage, getSignedUrl, normalizeStorageKey } = require('../services/storage');
const { ensureAuditReady } = require('../services/auditLog');

const router = express.Router();
const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);

function sanitizeText(value, maxLen = 300) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePagination(req, defaultPageSize = 20, maxPageSize = 100) {
  const page = parsePositiveInt(req.query.page) || 1;
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize) || defaultPageSize, maxPageSize);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

async function getViewer(uid) {
  const result = await pool.query(
    `SELECT
      uid,
      email,
      username,
      display_name,
      course,
      COALESCE(platform_role, 'member') AS platform_role,
      COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

function isOwnerOrAdmin(viewer) {
  return viewer && (viewer.platform_role === 'owner' || viewer.platform_role === 'admin');
}

function normalizeReportStatus(row) {
  if (!row) return 'open';
  if (row.status) return row.status;
  return 'open';
}

const ADMIN_REPORT_STATUSES = new Set([
  'open',
  'under_review',
  'resolved_action_taken',
  'resolved_no_action',
  'rejected',
]);

const ADMIN_REPORT_ACTIONS = new Set([
  'none',
  'delete_main_post',
  'delete_library_document',
  'delete_chat_message',
  'take_down_community_post',
  'take_down_community_comment',
  'ban_target_user',
]);

function parseReportKey(value) {
  const text = sanitizeText(value, 220);
  if (!text || !text.includes(':')) return null;
  const separator = text.indexOf(':');
  const source = text.slice(0, separator);
  const rawId = text.slice(separator + 1);
  if (!source || !rawId) return null;
  return { source, rawId, key: `${source}:${rawId}` };
}

function normalizeAdminReportStatus(value, fallback = 'open') {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (ADMIN_REPORT_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function normalizeAdminReportAction(value, fallback = 'none') {
  const normalized = sanitizeText(value, 80).toLowerCase();
  if (ADMIN_REPORT_ACTIONS.has(normalized)) return normalized;
  return fallback;
}

function mapAdminStatusToChatStatus(status) {
  if (status === 'open') return 'pending';
  if (status === 'under_review') return 'reviewed';
  return 'dismissed';
}

async function loadDisplayNamesByUid(uids) {
  const deduped = Array.from(new Set((uids || []).filter(Boolean)));
  if (!deduped.length) return new Map();
  const result = await pool.query(
    `SELECT
      a.uid,
      COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = ANY($1::text[])`,
    [deduped]
  );
  return new Map(result.rows.map((row) => [row.uid, row.display_name || 'Member']));
}

async function loadAdminReportActionsMap(reportKeys) {
  const deduped = Array.from(new Set((reportKeys || []).filter(Boolean)));
  if (!deduped.length) return new Map();
  const db = await getMongoDb();
  const rows = await db
    .collection('admin_report_actions')
    .find({ reportKey: { $in: deduped } })
    .toArray();
  return new Map(rows.map((item) => [item.reportKey, item]));
}

async function deleteMainPostById(postIdValue) {
  if (!postIdValue) return false;
  const postId = ObjectId.isValid(postIdValue) ? new ObjectId(postIdValue) : null;
  if (!postId) return false;

  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const post = await postsCollection.findOne({ _id: postId });
  if (!post) return false;

  const attachmentKey =
    post.attachment &&
    (post.attachment.type === 'image' || post.attachment.type === 'video')
      ? post.attachment.key
      : null;
  if (attachmentKey && !String(attachmentKey).startsWith('http')) {
    try {
      await deleteFromStorage(attachmentKey);
    } catch (storageError) {
      console.error('Admin report action post attachment delete failed:', storageError);
    }
  }

  await postsCollection.deleteOne({ _id: postId });
  await db.collection('post_likes').deleteMany({ postId });
  await db.collection('post_comments').deleteMany({ postId });
  await db.collection('post_bookmarks').deleteMany({ postId });
  await db.collection('post_reports').deleteMany({ postId });
  return true;
}

async function deleteLibraryDocumentByUuid(uuid) {
  const docUuid = sanitizeText(uuid, 120);
  if (!docUuid) return false;

  const docResult = await pool.query(
    `SELECT uuid, link, thumbnail_link
     FROM documents
     WHERE uuid = $1
     LIMIT 1`,
    [docUuid]
  );
  if (!docResult.rows.length) return false;
  const doc = docResult.rows[0];

  await pool.query('DELETE FROM documents WHERE uuid = $1', [docUuid]);

  const keys = [doc.link, doc.thumbnail_link].filter(Boolean);
  for (const key of keys) {
    if (!String(key).startsWith('http')) {
      try {
        await deleteFromStorage(key);
      } catch (storageError) {
        console.error('Admin report action document storage delete failed:', storageError);
      }
    }
  }

  const db = await getMongoDb();
  await db.collection('document_reports').deleteMany({ documentUuid: docUuid });
  return true;
}

async function deleteChatMessageById(messageId, adminUid) {
  const numericMessageId = Number(messageId);
  if (!Number.isInteger(numericMessageId) || numericMessageId <= 0) return false;

  const result = await pool.query(
    `UPDATE chat_messages
     SET body = '',
         attachment_type = NULL,
         attachment_key = NULL,
         attachment_link = NULL,
         attachment_filename = NULL,
         attachment_mime_type = NULL,
         attachment_size_bytes = NULL,
         deleted_at = NOW(),
         deleted_by_uid = $2
     WHERE id = $1
     RETURNING id`,
    [numericMessageId, adminUid]
  );
  return Boolean(result.rows.length);
}

async function takeDownCommunityPostById(postId, adminUid, reason) {
  const numericPostId = Number(postId);
  if (!Number.isInteger(numericPostId) || numericPostId <= 0) return false;
  const result = await pool.query(
    `UPDATE community_posts
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [numericPostId, adminUid, reason || 'Taken down from report review']
  );
  return Boolean(result.rows.length);
}

async function takeDownCommunityCommentById(commentId, adminUid, reason) {
  const numericCommentId = Number(commentId);
  if (!Number.isInteger(numericCommentId) || numericCommentId <= 0) return false;
  const result = await pool.query(
    `UPDATE community_comments
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [numericCommentId, adminUid, reason || 'Taken down from report review']
  );
  return Boolean(result.rows.length);
}

async function banTargetUserFromReport(targetUid, adminViewer, note) {
  const normalizedTargetUid = sanitizeText(targetUid, 120);
  if (!normalizedTargetUid) {
    return { ok: false, message: 'Target account unavailable for ban action.' };
  }
  if (normalizedTargetUid === adminViewer.uid) {
    return { ok: false, message: 'You cannot ban your own account.' };
  }

  const targetResult = await pool.query(
    `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [normalizedTargetUid]
  );
  const target = targetResult.rows[0];
  if (!target) {
    return { ok: false, message: 'Target account not found.' };
  }
  if (target.platform_role === 'owner') {
    return { ok: false, message: 'Owner account cannot be banned.' };
  }
  if (adminViewer.platform_role !== 'owner' && (target.platform_role === 'owner' || target.platform_role === 'admin')) {
    return { ok: false, message: 'Admins cannot ban owner/admin accounts.' };
  }

  await pool.query(
    `UPDATE accounts
     SET is_banned = true,
         banned_at = NOW(),
         banned_reason = $1,
         banned_by_uid = $2
     WHERE uid = $3`,
    [note || 'Banned from report resolution', adminViewer.uid, normalizedTargetUid]
  );
  await deleteSessionsForUid(normalizedTargetUid);
  return { ok: true };
}

async function cleanupMongoDataForAccount(uid) {
  if (!uid) return;
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');

  const userPosts = await postsCollection
    .find({ uploaderUid: uid })
    .project({ _id: 1, attachment: 1 })
    .toArray();
  const userPostIds = userPosts.map((post) => post && post._id).filter(Boolean);
  let postLinkedAiConversationIds = [];

  if (userPosts.length) {
    await Promise.all(
      userPosts.map(async (post) => {
        const key =
          post &&
          post.attachment &&
          (post.attachment.type === 'image' || post.attachment.type === 'video')
            ? post.attachment.key
            : null;
        if (!key || String(key).startsWith('http')) return;
        try {
          await deleteFromStorage(key);
        } catch (storageError) {
          console.error('Admin account delete attachment cleanup failed:', storageError);
        }
      })
    );
  }

  if (userPostIds.length) {
    const postLinkedAiConversations = await db
      .collection('post_ai_conversations')
      .find({ postId: { $in: userPostIds } })
      .project({ _id: 1 })
      .toArray();
    postLinkedAiConversationIds = postLinkedAiConversations
      .map((item) => item && item._id)
      .filter(Boolean);
  }

  const [postAiConversations, libraryAiConversations, personalAiConversations] = await Promise.all([
    db.collection('post_ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
    db.collection('library_ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
    db.collection('ai_conversations').find({ userUid: uid }).project({ _id: 1 }).toArray(),
  ]);

  const postAiConversationIds = postAiConversations.map((item) => item && item._id).filter(Boolean);
  const libraryAiConversationIds = libraryAiConversations.map((item) => item && item._id).filter(Boolean);
  const personalAiConversationIds = personalAiConversations.map((item) => item && item._id).filter(Boolean);

  const cleanupOps = [
    db.collection('post_likes').deleteMany({ userUid: uid }),
    db.collection('post_comments').deleteMany({ userUid: uid }),
    db.collection('post_bookmarks').deleteMany({ userUid: uid }),
    db.collection('post_reports').deleteMany({ userUid: uid }),
    db.collection('document_reports').deleteMany({ userUid: uid }),
    db.collection('admin_report_actions').deleteMany({ $or: [{ resolvedByUid: uid }, { targetUid: uid }] }),
    db.collection('doccomment').deleteMany({ userUid: uid }),
    db.collection('personal_journal_folders').deleteMany({ userUid: uid }),
    db.collection('personal_journals').deleteMany({ userUid: uid }),
    db.collection('personal_tasks').deleteMany({ userUid: uid }),
    db.collection('ai_task_proposals').deleteMany({ userUid: uid }),
    db.collection('ai_messages').deleteMany({ userUid: uid }),
    db.collection('ai_conversations').deleteMany({ userUid: uid }),
    db.collection('post_ai_messages').deleteMany({ userUid: uid }),
    db.collection('post_ai_conversations').deleteMany({ userUid: uid }),
    db.collection('library_ai_messages').deleteMany({ userUid: uid }),
    db.collection('library_ai_conversations').deleteMany({ userUid: uid }),
  ];

  if (userPostIds.length) {
    cleanupOps.push(postsCollection.deleteMany({ _id: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_likes').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_comments').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_bookmarks').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_reports').deleteMany({ postId: { $in: userPostIds } }));
    cleanupOps.push(db.collection('post_ai_conversations').deleteMany({ postId: { $in: userPostIds } }));
  }
  cleanupOps.push(db.collection('document_reports').deleteMany({ targetUid: uid }));
  const postMessageConversationIds = Array.from(
    new Set([...postAiConversationIds, ...postLinkedAiConversationIds].map((value) => String(value)))
  ).map((value) => new ObjectId(value));
  if (postMessageConversationIds.length) {
    cleanupOps.push(
      db.collection('post_ai_messages').deleteMany({ conversationId: { $in: postMessageConversationIds } })
    );
  }
  if (libraryAiConversationIds.length) {
    cleanupOps.push(
      db.collection('library_ai_messages').deleteMany({ conversationId: { $in: libraryAiConversationIds } })
    );
  }
  if (personalAiConversationIds.length) {
    cleanupOps.push(
      db.collection('ai_messages').deleteMany({ conversationId: { $in: personalAiConversationIds } })
    );
    cleanupOps.push(
      db.collection('ai_task_proposals').deleteMany({ conversationId: { $in: personalAiConversationIds } })
    );
  }

  await Promise.all(cleanupOps);
}

const ALLOWED_SITE_PAGE_SLUGS = new Set(['about', 'faq', 'rooms', 'mobile-app']);

const DEFAULT_SITE_PAGES = {
  about: {
    title: 'About Open Library',
    subtitle: 'Built to help students learn, collaborate, and ship work together.',
    body: {
      overview:
        'Open Library is an academic collaboration space where students can share knowledge, publish course resources, discuss ideas, and work in live rooms. The platform combines social interaction, document intelligence, and practical productivity tools in one place.',
      highlights: [
        'Home feed with discussions, attachments, and AI-assisted post exploration',
        'Open Library for course documents and reusable learning references',
        'Communities and Rooms for real-time group coordination',
      ],
      commitments: [
        'Student-first product decisions and practical workflows',
        'Privacy-aware moderation and reporting controls',
        'Continuous iteration based on course and community feedback',
      ],
      contactEmail: '',
    },
  },
  faq: {
    title: 'Frequently Asked Questions',
    subtitle: 'Quick answers to common questions about using the platform.',
    body: {
      items: [
        {
          question: 'Who can access private posts or private documents?',
          answer:
            'Private content is restricted to users in the same course as the uploader, plus the uploader themselves.',
        },
        {
          question: 'How does Ask AI use document context?',
          answer:
            'Ask AI uses document metadata and available extracted excerpts. If AI is disabled by the uploader, the feature is blocked.',
        },
        {
          question: 'Can I control what notifications I receive?',
          answer:
            'Yes. Notification preferences can be managed in the Preferences page.',
        },
      ],
    },
  },
  rooms: {
    title: 'Rooms settings',
    subtitle: 'Configurable labels for Rooms UI',
    body: {
      courseContextLabel: 'Course context',
    },
  },
  'mobile-app': {
    title: 'Open Library Lite',
    subtitle: 'Scan the QR code to download the Android lite app.',
    body: {
      description:
        'Use the lite mobile app to stay connected with your communities, view feed updates, and access core features on the go.',
      qrImageUrl: '',
      qrAltText: 'Open Library Lite QR code',
      downloadUrl: '',
      downloadLabel: 'Download APK',
    },
  },
};

let ensureSitePagesReadyPromise = null;

async function ensureSitePagesReady() {
  if (ensureSitePagesReadyPromise) return ensureSitePagesReadyPromise;
  ensureSitePagesReadyPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_page_content (
        slug TEXT PRIMARY KEY CHECK (slug IN ('about', 'faq', 'rooms', 'mobile-app')),
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        body JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE site_page_content
      DROP CONSTRAINT IF EXISTS site_page_content_slug_check;
    `);
    await pool.query(`
      ALTER TABLE site_page_content
      ADD CONSTRAINT site_page_content_slug_check
      CHECK (slug IN ('about', 'faq', 'rooms', 'mobile-app'));
    `);
  })().catch((error) => {
    ensureSitePagesReadyPromise = null;
    throw error;
  });
  return ensureSitePagesReadyPromise;
}

function normalizeSitePageSlug(value) {
  const slug = sanitizeText(value, 40).toLowerCase();
  return ALLOWED_SITE_PAGE_SLUGS.has(slug) ? slug : '';
}

function normalizeAboutBody(body = {}) {
  const highlights = Array.isArray(body.highlights)
    ? body.highlights.map((item) => sanitizeText(item, 240)).filter(Boolean).slice(0, 12)
    : [];
  const commitments = Array.isArray(body.commitments)
    ? body.commitments.map((item) => sanitizeText(item, 240)).filter(Boolean).slice(0, 12)
    : [];

  return {
    overview: sanitizeText(body.overview, 7000),
    highlights,
    commitments,
    contactEmail: sanitizeText(body.contactEmail, 320),
  };
}

function normalizeFaqBody(body = {}) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item) => ({
      question: sanitizeText(item && item.question, 300),
      answer: sanitizeText(item && item.answer, 3000),
    }))
    .filter((item) => item.question && item.answer)
    .slice(0, 40);

  return { items };
}

function normalizeRoomsBody(body = {}) {
  return {
    courseContextLabel: sanitizeText(body.courseContextLabel, 80) || 'Course context',
  };
}

function normalizeMobileAppBody(body = {}) {
  return {
    description: sanitizeText(body.description, 7000),
    qrImageUrl: sanitizeText(body.qrImageUrl, 2000),
    qrAltText: sanitizeText(body.qrAltText, 180) || 'Open Library Lite QR code',
    downloadUrl: sanitizeText(body.downloadUrl, 2000),
    downloadLabel: sanitizeText(body.downloadLabel, 80) || 'Download APK',
  };
}

function normalizeSitePageBody(slug, body = {}) {
  if (slug === 'about') {
    return normalizeAboutBody(body);
  }
  if (slug === 'faq') {
    return normalizeFaqBody(body);
  }
  if (slug === 'mobile-app') {
    return normalizeMobileAppBody(body);
  }
  return normalizeRoomsBody(body);
}

function getDefaultSitePage(slug) {
  const base = DEFAULT_SITE_PAGES[slug];
  if (!base) return null;
  return {
    slug,
    title: base.title,
    subtitle: base.subtitle,
    body: normalizeSitePageBody(slug, base.body || {}),
    updatedAt: null,
    updatedByUid: null,
    isDefault: true,
  };
}

function normalizeSitePageResult(slug, row) {
  if (!row) {
    return getDefaultSitePage(slug);
  }
  return {
    slug,
    title: sanitizeText(row.title, 180) || getDefaultSitePage(slug).title,
    subtitle: sanitizeText(row.subtitle, 500),
    body: normalizeSitePageBody(slug, row.body || {}),
    updatedAt: row.updated_at || null,
    updatedByUid: row.updated_by_uid || null,
    isDefault: false,
  };
}

async function resolveMobileAppBodyAssets(page) {
  if (!page || page.slug !== 'mobile-app') return page;
  const body = page.body && typeof page.body === 'object' ? { ...page.body } : {};

  async function resolveAssetUrl(rawValue, label) {
    const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!raw) return raw;
    try {
      const normalized = normalizeStorageKey(raw);
      const isHttp = /^https?:\/\//i.test(raw);
      const shouldSign = Boolean(normalized) && (!isHttp || normalized !== raw);
      if (!shouldSign) return raw;
      return await getSignedUrl(normalized, SIGNED_TTL);
    } catch (error) {
      console.warn(
        `Mobile app ${label} signing failed; returning raw URL:`,
        error && error.message ? error.message : error
      );
      return raw;
    }
  }

  body.qrImageUrl = await resolveAssetUrl(body.qrImageUrl, 'QR');
  body.downloadUrl = await resolveAssetUrl(body.downloadUrl, 'download');
  return { ...page, body };
}

router.get('/api/admin/me', requireAuthApi, async (req, res) => {
  try {
    await ensureAuditReady();
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    return res.json({
      ok: true,
      allowed: isOwnerOrAdmin(viewer) && viewer.is_banned !== true,
      role: viewer.platform_role || 'member',
      uid: viewer.uid,
    });
  } catch (error) {
    console.error('Admin me failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load admin context.' });
  }
});

router.get('/api/site-pages/:slug', requireAuthApi, async (req, res) => {
  const slug = normalizeSitePageSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, message: 'Invalid page slug.' });
  }

  try {
    await ensureSitePagesReady();
    const result = await pool.query(
      `SELECT slug, title, subtitle, body, updated_by_uid, updated_at
       FROM site_page_content
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    const page = await resolveMobileAppBodyAssets(normalizeSitePageResult(slug, result.rows[0] || null));
    return res.json({ ok: true, page });
  } catch (error) {
    console.error('Site page fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load page content.' });
  }
});

router.use('/api/admin', requireAuthApi);

router.use('/api/admin', async (req, res, next) => {
  try {
    await ensureAuditReady();
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    if (viewer.is_banned === true) {
      return res.status(403).json({ ok: false, message: 'Account is banned.' });
    }
    if (!isOwnerOrAdmin(viewer)) {
      return res.status(403).json({ ok: false, message: 'Admin access required.' });
    }
    req.adminViewer = viewer;
    return next();
  } catch (error) {
    console.error('Admin guard failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to authorize admin request.' });
  }
});

router.get('/api/admin/logs', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 30, 120);
  const executorUid = sanitizeText(req.query.executorUid, 120);
  const course = sanitizeText(req.query.course, 120);
  const query = sanitizeText(req.query.q, 200);
  const sort = sanitizeText(req.query.sort, 30).toLowerCase();
  const order = sort === 'oldest' ? 'ASC' : 'DESC';

  try {
    const where = [];
    const params = [];
    if (executorUid) {
      params.push(executorUid);
      where.push(`l.executor_uid = $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`l.course = $${params.length}`);
    }
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(l.action_type ILIKE $${params.length}
          OR l.action_key ILIKE $${params.length}
          OR l.source_path ILIKE $${params.length}
          OR COALESCE(l.target_id, '') ILIKE $${params.length})`
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM admin_audit_logs l
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        l.id,
        l.action_key,
        l.action_type,
        l.target_type,
        l.target_id,
        l.course,
        l.source_path,
        l.metadata,
        l.created_at,
        l.executor_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS executor_name
       FROM admin_audit_logs l
       LEFT JOIN accounts a ON a.uid = l.executor_uid
       LEFT JOIN profiles p ON p.uid = l.executor_uid
       ${whereClause}
       ORDER BY l.created_at ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      logs: rowsResult.rows.map((row) => ({
        ...(row.metadata && typeof row.metadata === 'object'
          ? {
              targetUrl:
                typeof row.metadata.targetUrl === 'string' && row.metadata.targetUrl.trim()
                  ? row.metadata.targetUrl.trim().slice(0, 512)
                  : null,
            }
          : { targetUrl: null }),
        id: Number(row.id),
        actionKey: row.action_key,
        actionType: row.action_type,
        targetType: row.target_type || null,
        targetId: row.target_id || null,
        course: row.course || null,
        sourcePath: row.source_path || null,
        executorUid: row.executor_uid || null,
        executor: row.executor_name || 'Unknown',
        metadata: row.metadata || {},
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin logs fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load audit logs.' });
  }
});

router.get('/api/admin/reports', async (req, res) => {
  const { page, pageSize } = parsePagination(req, 25, 80);
  const source = sanitizeText(req.query.source, 40).toLowerCase();
  const status = sanitizeText(req.query.status, 40).toLowerCase();
  const course = sanitizeText(req.query.course, 120);
  const query = sanitizeText(req.query.q, 200).toLowerCase();
  const maxSourceRows = 600;

  try {
    const reports = [];

    if (!source || source === 'profile') {
      const profileResult = await pool.query(
        `SELECT
          r.id,
          r.created_at,
          r.reason,
          r.reporter_uid,
          r.target_uid,
          COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
          COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) AS target_name,
          ta.course AS target_course
         FROM user_profile_reports r
         JOIN accounts ra ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
         JOIN accounts ta ON ta.uid = r.target_uid
         LEFT JOIN profiles tp ON tp.uid = r.target_uid
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [maxSourceRows]
      );
      profileResult.rows.forEach((row) => {
        reports.push({
          id: `profile:${row.id}`,
          source: 'profile',
          status: 'open',
          targetType: 'user_profile',
          targetId: row.target_uid,
          targetUid: row.target_uid,
          targetName: row.target_name || 'User',
          reporterUid: row.reporter_uid,
          reporterName: row.reporter_name || 'Member',
          category: null,
          customReason: null,
          details: null,
          reason: row.reason || null,
          course: row.target_course || null,
          createdAt: row.created_at,
        });
      });
    }

    if (!source || source === 'community') {
      const where = [];
      const params = [];
      if (status && status !== 'all') {
        params.push(status);
        where.push(`r.status = $${params.length}`);
      }
      if (course) {
        params.push(course);
        where.push(`c.course_name = $${params.length}`);
      }
      params.push(maxSourceRows);
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const communityResult = await pool.query(
        `SELECT
          r.id,
          r.target_type,
          r.target_uid,
          r.target_post_id,
          r.target_comment_id,
          r.reason,
          r.status,
          r.created_at,
          c.course_name,
          COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
          COALESCE(tp.display_name, ta.display_name, ta.username, ta.email) AS target_name,
          r.reporter_uid
         FROM community_reports r
         JOIN communities c ON c.id = r.community_id
         JOIN accounts ra ON ra.uid = r.reporter_uid
         LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
         LEFT JOIN accounts ta ON ta.uid = r.target_uid
         LEFT JOIN profiles tp ON tp.uid = r.target_uid
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $${params.length}`,
        params
      );
      communityResult.rows.forEach((row) => {
        reports.push({
          id: `community:${row.id}`,
          source: 'community',
          status: normalizeReportStatus(row),
          targetType: row.target_type || 'community',
          targetId: row.target_uid || row.target_post_id || row.target_comment_id || null,
          targetUid: row.target_uid || null,
          targetName: row.target_name || null,
          reporterUid: row.reporter_uid,
          reporterName: row.reporter_name || 'Member',
          category: null,
          customReason: null,
          details: null,
          reason: row.reason || null,
          course: row.course_name || null,
          createdAt: row.created_at,
        });
      });
    }

    if (!source || source === 'main_post') {
      const db = await getMongoDb();
      const mongoReports = await db
        .collection('post_reports')
        .find({})
        .sort({ createdAt: -1 })
        .limit(maxSourceRows)
        .toArray();

      if (mongoReports.length) {
        const postIds = Array.from(
          new Set(
            mongoReports
              .map((item) => (item.postId && ObjectId.isValid(item.postId) ? new ObjectId(item.postId) : item.postId))
              .filter(Boolean)
          )
        );
        const posts = await db
          .collection('posts')
          .find({ _id: { $in: postIds } })
          .project({ _id: 1, title: 1, course: 1, uploaderUid: 1 })
          .toArray();
        const postsMap = new Map(posts.map((post) => [String(post._id), post]));

        const reporterUids = mongoReports.map((item) => item.userUid).filter(Boolean);
        const uploaderUids = posts.map((post) => post.uploaderUid).filter(Boolean);
        const namesMap = await loadDisplayNamesByUid([...reporterUids, ...uploaderUids]);

        mongoReports.forEach((report) => {
          const post = postsMap.get(String(report.postId));
          reports.push({
            id: `main_post:${report._id}`,
            source: 'main_post',
            status: normalizeAdminReportStatus(report.status, 'open'),
            targetType: 'main_post',
            targetId: post ? String(post._id) : String(report.postId || ''),
            targetUid: post ? post.uploaderUid || null : report.targetUid || null,
            targetName: post ? post.title : 'Post',
            reporterUid: report.userUid || null,
            reporterName: namesMap.get(report.userUid) || report.userUid || 'Member',
            category: report.category || null,
            customReason: report.customReason || null,
            details: report.details || null,
            reason: report.reason || null,
            course: post ? post.course || null : null,
            moderationAction: report.moderationAction || 'none',
            resolutionNote: report.resolutionNote || null,
            resolvedAt: report.resolvedAt || null,
            resolvedByUid: report.resolvedByUid || null,
            createdAt: report.createdAt || new Date(),
          });
        });
      }
    }

    if (!source || source === 'library_document') {
      const db = await getMongoDb();
      const mongoReports = await db
        .collection('document_reports')
        .find({})
        .sort({ createdAt: -1 })
        .limit(maxSourceRows)
        .toArray();

      if (mongoReports.length) {
        const documentUuids = Array.from(
          new Set(mongoReports.map((item) => sanitizeText(item.documentUuid, 120)).filter(Boolean))
        );
        let docsMap = new Map();
        if (documentUuids.length) {
          const docsResult = await pool.query(
            `SELECT uuid::text AS uuid, title, course, uploader_uid
             FROM documents
             WHERE uuid::text = ANY($1::text[])`,
            [documentUuids]
          );
          docsMap = new Map(docsResult.rows.map((row) => [row.uuid, row]));
        }

        const reporterUids = mongoReports.map((item) => item.userUid).filter(Boolean);
        const uploaderUids = mongoReports
          .map((item) => {
            const doc = docsMap.get(sanitizeText(item.documentUuid, 120));
            return doc ? doc.uploader_uid : item.targetUid;
          })
          .filter(Boolean);
        const namesMap = await loadDisplayNamesByUid([...reporterUids, ...uploaderUids]);

        mongoReports.forEach((report) => {
          const documentUuid = sanitizeText(report.documentUuid, 120);
          const doc = docsMap.get(documentUuid);
          reports.push({
            id: `library_document:${report._id}`,
            source: 'library_document',
            status: normalizeAdminReportStatus(report.status, 'open'),
            targetType: 'library_document',
            targetId: documentUuid || null,
            targetUid: (doc && doc.uploader_uid) || report.targetUid || null,
            targetName: (doc && doc.title) || report.documentTitle || 'Document',
            reporterUid: report.userUid || null,
            reporterName: namesMap.get(report.userUid) || report.userUid || 'Member',
            category: report.category || null,
            customReason: report.customReason || null,
            details: report.details || null,
            reason: report.reason || null,
            course: (doc && doc.course) || null,
            moderationAction: report.moderationAction || 'none',
            resolutionNote: report.resolutionNote || null,
            resolvedAt: report.resolvedAt || null,
            resolvedByUid: report.resolvedByUid || null,
            createdAt: report.createdAt || new Date(),
          });
        });
      }
    }

    if (!source || source === 'chat_message') {
      try {
        const params = [];
        params.push(maxSourceRows);

        const chatMessageResult = await pool.query(
          `SELECT
            r.id,
            r.message_id,
            r.thread_id,
            r.message_sender_uid,
            r.reason,
            r.status,
            r.created_at,
            r.reporter_uid,
            COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS reporter_name,
            COALESCE(sp.display_name, sa.display_name, sa.username, sa.email) AS sender_name
           FROM chat_message_reports r
           JOIN accounts ra ON ra.uid = r.reporter_uid
           LEFT JOIN profiles rp ON rp.uid = r.reporter_uid
           LEFT JOIN accounts sa ON sa.uid = r.message_sender_uid
           LEFT JOIN profiles sp ON sp.uid = r.message_sender_uid
           ORDER BY r.created_at DESC
           LIMIT $${params.length}`,
          params
        );

        chatMessageResult.rows.forEach((row) => {
          const normalizedStatus =
            row.status === 'pending'
              ? 'open'
              : row.status === 'reviewed'
                ? 'under_review'
                : 'resolved_no_action';
          reports.push({
            id: `chat_message:${row.id}`,
            source: 'chat_message',
            status: normalizedStatus,
            targetType: 'chat_message',
            targetId: row.message_id ? String(row.message_id) : null,
            targetUid: row.message_sender_uid || null,
            targetName: row.sender_name || 'Conversation message',
            reporterUid: row.reporter_uid || null,
            reporterName: row.reporter_name || 'Member',
            category: null,
            customReason: null,
            details: null,
            reason: row.reason || null,
            course: null,
            createdAt: row.created_at,
            threadId: row.thread_id ? String(row.thread_id) : null,
          });
        });
      } catch (chatReportError) {
        if (chatReportError && chatReportError.code !== '42P01') {
          throw chatReportError;
        }
      }
    }

    if (reports.length) {
      const actionsMap = await loadAdminReportActionsMap(reports.map((item) => item.id));
      reports.forEach((item) => {
        const action = actionsMap.get(item.id);
        if (!action) {
          if (!item.moderationAction) item.moderationAction = 'none';
          return;
        }
        item.status = normalizeAdminReportStatus(action.status, item.status || 'open');
        item.moderationAction = normalizeAdminReportAction(action.moderationAction, item.moderationAction || 'none');
        item.resolutionNote = action.resolutionNote || item.resolutionNote || null;
        item.resolvedByUid = action.resolvedByUid || item.resolvedByUid || null;
        item.resolvedAt = action.resolvedAt || action.updatedAt || item.resolvedAt || null;
      });
    }

    let filtered = reports;
    if (status && status !== 'all') {
      filtered = filtered.filter((item) => String(item.status || '').toLowerCase() === status);
    }
    if (course) {
      filtered = filtered.filter((item) => String(item.course || '') === course);
    }
    if (query) {
      filtered = filtered.filter((item) => {
        const haystack = [
          item.source,
          item.targetType,
          item.targetName,
          item.reporterName,
          item.category,
          item.customReason,
          item.details,
          item.reason,
          item.moderationAction,
          item.resolutionNote,
          item.course,
          item.targetId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const paged = filtered.slice(offset, offset + pageSize);

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      reports: paged,
    });
  } catch (error) {
    console.error('Admin reports fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load reports.' });
  }
});

router.post('/api/admin/reports/action', async (req, res) => {
  const parsed = parseReportKey(req.body && req.body.reportId);
  if (!parsed) {
    return res.status(400).json({ ok: false, message: 'Invalid report id.' });
  }

  let status = normalizeAdminReportStatus(req.body && req.body.status, 'open');
  const moderationAction = normalizeAdminReportAction(req.body && req.body.moderationAction, 'none');
  const resolutionNote = sanitizeText(req.body && req.body.note, 1000) || null;
  if (moderationAction !== 'none' && (status === 'open' || status === 'under_review')) {
    status = 'resolved_action_taken';
  }

  const allowedActionsBySource = {
    profile: new Set(['none', 'ban_target_user']),
    community: new Set(['none', 'take_down_community_post', 'take_down_community_comment', 'ban_target_user']),
    main_post: new Set(['none', 'delete_main_post', 'ban_target_user']),
    library_document: new Set(['none', 'delete_library_document', 'ban_target_user']),
    chat_message: new Set(['none', 'delete_chat_message', 'ban_target_user']),
  };
  const sourceActions = allowedActionsBySource[parsed.source];
  if (!sourceActions) {
    return res.status(400).json({ ok: false, message: 'Unsupported report source.' });
  }
  if (!sourceActions.has(moderationAction)) {
    return res.status(400).json({ ok: false, message: 'Invalid moderation action for this report source.' });
  }

  const shouldMarkResolved = !['open', 'under_review'].includes(status);
  const resolvedAt = shouldMarkResolved ? new Date() : null;
  const adminUid = req.adminViewer.uid;

  let targetType = null;
  let targetId = null;
  let targetUid = null;
  let reportExists = false;

  try {
    const db = await getMongoDb();

    if (parsed.source === 'main_post') {
      if (!ObjectId.isValid(parsed.rawId)) {
        return res.status(400).json({ ok: false, message: 'Invalid main post report id.' });
      }
      const reportObjectId = new ObjectId(parsed.rawId);
      const report = await db.collection('post_reports').findOne({ _id: reportObjectId });
      if (!report) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      reportExists = true;
      targetType = 'main_post';
      targetId = report.postId ? String(report.postId) : null;

      if (targetId && ObjectId.isValid(targetId)) {
        const post = await db.collection('posts').findOne(
          { _id: new ObjectId(targetId) },
          { projection: { uploaderUid: 1 } }
        );
        targetUid = (post && post.uploaderUid) || report.targetUid || null;
      } else {
        targetUid = report.targetUid || null;
      }

      if (moderationAction === 'delete_main_post') {
        const removed = await deleteMainPostById(targetId);
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target post no longer exists.' });
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }

      await db.collection('post_reports').updateOne(
        { _id: reportObjectId },
        {
          $set: {
            status,
            moderationAction,
            resolutionNote,
            resolvedAt,
            resolvedByUid: shouldMarkResolved ? adminUid : null,
            updatedAt: new Date(),
          },
        }
      );
    } else if (parsed.source === 'library_document') {
      if (!ObjectId.isValid(parsed.rawId)) {
        return res.status(400).json({ ok: false, message: 'Invalid document report id.' });
      }
      const reportObjectId = new ObjectId(parsed.rawId);
      const report = await db.collection('document_reports').findOne({ _id: reportObjectId });
      if (!report) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      reportExists = true;
      targetType = 'library_document';
      targetId = sanitizeText(report.documentUuid, 120) || null;
      targetUid = report.targetUid || null;

      if (targetId) {
        const docResult = await pool.query(
          `SELECT uploader_uid
           FROM documents
           WHERE uuid::text = $1
           LIMIT 1`,
          [targetId]
        );
        targetUid = (docResult.rows[0] && docResult.rows[0].uploader_uid) || targetUid;
      }

      if (moderationAction === 'delete_library_document') {
        const removed = await deleteLibraryDocumentByUuid(targetId);
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target document no longer exists.' });
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }

      await db.collection('document_reports').updateOne(
        { _id: reportObjectId },
        {
          $set: {
            status,
            moderationAction,
            resolutionNote,
            resolvedAt,
            resolvedByUid: shouldMarkResolved ? adminUid : null,
            updatedAt: new Date(),
          },
        }
      );
    } else if (parsed.source === 'profile') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid profile report id.' });
      }
      const profileReport = await pool.query(
        `SELECT id, target_uid
         FROM user_profile_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!profileReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      reportExists = true;
      targetType = 'user_profile';
      targetId = profileReport.rows[0].target_uid || null;
      targetUid = profileReport.rows[0].target_uid || null;

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }
    } else if (parsed.source === 'chat_message') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid chat message report id.' });
      }
      const chatReport = await pool.query(
        `SELECT id, message_id, message_sender_uid
         FROM chat_message_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!chatReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      const reportRow = chatReport.rows[0];
      reportExists = true;
      targetType = 'chat_message';
      targetId = reportRow.message_id ? String(reportRow.message_id) : null;
      targetUid = reportRow.message_sender_uid || null;

      if (moderationAction === 'delete_chat_message') {
        const removed = await deleteChatMessageById(reportRow.message_id, adminUid);
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target chat message no longer exists.' });
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }

      await pool.query(
        `UPDATE chat_message_reports
         SET status = $2,
             resolution_note = $3,
             resolved_by_uid = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [reportId, mapAdminStatusToChatStatus(status), resolutionNote, shouldMarkResolved ? adminUid : null]
      );
    } else if (parsed.source === 'community') {
      const reportId = parsePositiveInt(parsed.rawId);
      if (!reportId) {
        return res.status(400).json({ ok: false, message: 'Invalid community report id.' });
      }
      const communityReport = await pool.query(
        `SELECT id, target_type, target_uid, target_post_id, target_comment_id
         FROM community_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );
      if (!communityReport.rows.length) {
        return res.status(404).json({ ok: false, message: 'Report not found.' });
      }
      const reportRow = communityReport.rows[0];
      reportExists = true;
      targetType = reportRow.target_type || 'community';
      targetUid = reportRow.target_uid || null;
      targetId = reportRow.target_post_id
        ? String(reportRow.target_post_id)
        : (reportRow.target_comment_id ? String(reportRow.target_comment_id) : targetUid);

      if (moderationAction === 'take_down_community_post') {
        if (targetType !== 'post') {
          return res.status(400).json({ ok: false, message: 'This report does not target a community post.' });
        }
        const removed = await takeDownCommunityPostById(reportRow.target_post_id, adminUid, resolutionNote);
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target community post no longer exists.' });
        }
      }

      if (moderationAction === 'take_down_community_comment') {
        if (targetType !== 'comment') {
          return res.status(400).json({ ok: false, message: 'This report does not target a community comment.' });
        }
        const removed = await takeDownCommunityCommentById(reportRow.target_comment_id, adminUid, resolutionNote);
        if (!removed) {
          return res.status(404).json({ ok: false, message: 'Target community comment no longer exists.' });
        }
      }

      if (moderationAction === 'ban_target_user') {
        const banResult = await banTargetUserFromReport(targetUid, req.adminViewer, resolutionNote);
        if (!banResult.ok) {
          return res.status(400).json({ ok: false, message: banResult.message });
        }
      }

      await pool.query(
        `UPDATE community_reports
         SET status = $2,
             resolution_note = $3,
             resolved_by_uid = $4,
             resolved_at = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [reportId, status, resolutionNote, shouldMarkResolved ? adminUid : null, resolvedAt]
      );
    }

    if (!reportExists) {
      return res.status(404).json({ ok: false, message: 'Report not found.' });
    }

    await db.collection('admin_report_actions').updateOne(
      { reportKey: parsed.key },
      {
        $set: {
          source: parsed.source,
          sourceReportId: parsed.rawId,
          reportKey: parsed.key,
          status,
          moderationAction,
          resolutionNote,
          targetType,
          targetId,
          targetUid,
          resolvedByUid: shouldMarkResolved ? adminUid : null,
          resolvedAt,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({
      ok: true,
      report: {
        reportId: parsed.key,
        status,
        moderationAction,
        resolutionNote,
        targetType,
        targetId,
        targetUid,
        resolvedAt,
      },
    });
  } catch (error) {
    console.error('Admin report action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to apply report action.' });
  }
});

router.get('/api/admin/accounts', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 30, 120);
  const role = sanitizeText(req.query.role, 30).toLowerCase();
  const status = sanitizeText(req.query.status, 40).toLowerCase();
  const course = sanitizeText(req.query.course, 120);
  const query = sanitizeText(req.query.q, 200);

  try {
    const where = [];
    const params = [];

    if (role && ['owner', 'admin', 'member'].includes(role)) {
      params.push(role);
      where.push(`COALESCE(a.platform_role, 'member') = $${params.length}`);
    }

    if (status === 'banned') {
      where.push(`COALESCE(a.is_banned, false) = true`);
    } else if (status === 'verified') {
      where.push(`COALESCE(a.is_banned, false) = false AND COALESCE(a.email_verified, false) = true`);
    } else if (status === 'non-verified') {
      where.push(`COALESCE(a.is_banned, false) = false AND COALESCE(a.email_verified, false) = false`);
    }

    if (course) {
      params.push(course);
      where.push(`a.course = $${params.length}`);
    }

    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(a.uid ILIKE $${params.length}
          OR COALESCE(a.username, '') ILIKE $${params.length}
          OR COALESCE(a.display_name, '') ILIKE $${params.length}
          OR COALESCE(p.display_name, '') ILIKE $${params.length}
          OR a.email ILIKE $${params.length})`
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        a.uid,
        a.username,
        a.display_name,
        p.display_name AS profile_display_name,
        a.email,
        COALESCE(a.platform_role, 'member') AS platform_role,
        a.recovery_email,
        a.datecreated,
        COALESCE(a.email_verified, false) AS email_verified,
        COALESCE(a.is_banned, false) AS is_banned,
        a.course
       FROM accounts a
       LEFT JOIN profiles p ON p.uid = a.uid
       ${whereClause}
       ORDER BY a.datecreated DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      accounts: rowsResult.rows.map((row) => {
        let derivedStatus = 'non-verified';
        if (row.is_banned === true) {
          derivedStatus = 'banned';
        } else if (row.email_verified === true) {
          derivedStatus = 'verified';
        }
        return {
          uid: row.uid,
          username: row.username || '',
          displayName: row.profile_display_name || row.display_name || '',
          email: row.email,
          userType: row.platform_role || 'member',
          recoveryEmail: row.recovery_email || '',
          status: derivedStatus,
          course: row.course || '',
          dateRegistered: row.datecreated,
        };
      }),
    });
  } catch (error) {
    console.error('Admin accounts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load accounts.' });
  }
});

router.patch('/api/admin/accounts/:uid/role', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);
  const role = sanitizeText(req.body && req.body.role, 30).toLowerCase();

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (!['member', 'admin'].includes(role)) {
    return res.status(400).json({ ok: false, message: 'Role must be member or admin.' });
  }
  if (req.adminViewer.platform_role !== 'owner') {
    return res.status(403).json({ ok: false, message: 'Only owner can change platform roles.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'Cannot change your own role.' });
  }

  try {
    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    if (targetResult.rows[0].platform_role === 'owner') {
      return res.status(403).json({ ok: false, message: 'Owner role cannot be modified.' });
    }

    await pool.query(
      `UPDATE accounts
       SET platform_role = $1
       WHERE uid = $2`,
      [role, targetUid]
    );

    return res.json({ ok: true, message: `Role updated to ${role}.` });
  } catch (error) {
    console.error('Admin role update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update role.' });
  }
});

router.post('/api/admin/accounts/:uid/transfer-ownership', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);
  const transferToken = sanitizeText(req.body && req.body.transferToken, 40).toUpperCase();

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (req.adminViewer.platform_role !== 'owner') {
    return res.status(403).json({ ok: false, message: 'Only owner can transfer ownership.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'You already own this account.' });
  }
  if (transferToken !== 'TRANSFER') {
    return res.status(400).json({ ok: false, message: 'Transfer confirmation token is invalid.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentOwnerResult = await client.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [req.adminViewer.uid]
    );
    if (!currentOwnerResult.rows.length || currentOwnerResult.rows[0].platform_role !== 'owner') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Current account is no longer owner.' });
    }

    const targetResult = await client.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    const target = targetResult.rows[0];
    if (target.is_banned === true) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Cannot transfer ownership to a banned account.' });
    }
    if (target.platform_role === 'owner') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Target account is already owner.' });
    }

    await client.query(
      `UPDATE accounts
       SET platform_role = CASE
         WHEN uid = $1 THEN 'owner'
         WHEN uid = $2 THEN 'admin'
         ELSE platform_role
       END
       WHERE uid IN ($1, $2)`,
      [targetUid, req.adminViewer.uid]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Ownership transferred successfully.' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // ignore rollback errors
    }
    console.error('Admin ownership transfer failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to transfer ownership.' });
  } finally {
    client.release();
  }
});

router.patch('/api/admin/accounts/:uid/ban', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);
  const reason = sanitizeText(req.body && req.body.reason, 600);
  const banned = Boolean(req.body && req.body.banned);

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'Cannot change your own ban status.' });
  }

  try {
    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    const target = targetResult.rows[0];

    if (target.platform_role === 'owner') {
      return res.status(403).json({ ok: false, message: 'Owner account cannot be banned.' });
    }
    if (req.adminViewer.platform_role === 'admin' && target.platform_role !== 'member') {
      return res.status(403).json({ ok: false, message: 'Admins cannot ban owner/admin accounts.' });
    }

    if (banned) {
      await pool.query(
        `UPDATE accounts
         SET is_banned = true,
             banned_at = NOW(),
             banned_reason = $1,
             banned_by_uid = $2
         WHERE uid = $3`,
        [reason || null, req.adminViewer.uid, targetUid]
      );
      await deleteSessionsForUid(targetUid);
      return res.json({ ok: true, message: 'Account banned.' });
    }

    await pool.query(
      `UPDATE accounts
       SET is_banned = false,
           banned_at = NULL,
           banned_reason = NULL,
           banned_by_uid = NULL
       WHERE uid = $1`,
      [targetUid]
    );
    return res.json({ ok: true, message: 'Account unbanned.' });
  } catch (error) {
    console.error('Admin ban update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update ban status.' });
  }
});

router.delete('/api/admin/accounts/:uid', async (req, res) => {
  const targetUid = sanitizeText(req.params.uid, 120);

  if (!targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid target user.' });
  }
  if (targetUid === req.adminViewer.uid) {
    return res.status(400).json({ ok: false, message: 'Cannot delete your own account.' });
  }

  try {
    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    const target = targetResult.rows[0];

    if (target.platform_role === 'owner') {
      return res.status(403).json({ ok: false, message: 'Owner account cannot be deleted.' });
    }
    if (req.adminViewer.platform_role === 'admin' && target.platform_role !== 'member') {
      return res.status(403).json({ ok: false, message: 'Admins can only delete member accounts.' });
    }

    await cleanupMongoDataForAccount(targetUid);
    await pool.query('DELETE FROM accounts WHERE uid = $1', [targetUid]);
    await deleteSessionsForUid(targetUid);

    return res.json({ ok: true, message: 'Account deleted.' });
  } catch (error) {
    console.error('Admin account delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete account.' });
  }
});

router.get('/api/admin/communities', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, course_name, description
       FROM communities
       ORDER BY lower(course_name) ASC`
    );
    return res.json({
      ok: true,
      communities: result.rows.map((row) => ({
        id: Number(row.id),
        courseName: row.course_name,
        description: row.description || '',
      })),
    });
  } catch (error) {
    console.error('Admin communities fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load communities.' });
  }
});

router.patch('/api/admin/communities/:id/details', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  const description = sanitizeText(req.body && req.body.description, 4000);

  try {
    const result = await pool.query(
      `UPDATE communities
       SET description = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, course_name, description`,
      [communityId, description || null]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }
    const community = result.rows[0];
    return res.json({
      ok: true,
      community: {
        id: Number(community.id),
        courseName: community.course_name,
        description: community.description || '',
      },
    });
  } catch (error) {
    console.error('Admin community details update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update community details.' });
  }
});

router.post('/api/admin/communities/:id/moderators/:uid', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  const action = sanitizeText(req.body && req.body.action, 20).toLowerCase();

  if (!communityId || !targetUid || !['assign', 'remove'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Invalid moderator action payload.' });
  }

  try {
    const communityResult = await pool.query('SELECT id FROM communities WHERE id = $1 LIMIT 1', [communityId]);
    if (!communityResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const targetResult = await pool.query(
      `SELECT uid, COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }

    const target = targetResult.rows[0];
    if (target.platform_role === 'owner' || target.platform_role === 'admin') {
      return res.status(400).json({ ok: false, message: 'Owner/admin accounts cannot be assigned as moderators.' });
    }

    if (action === 'assign') {
      await pool.query(
        `INSERT INTO community_roles (community_id, user_uid, role, assigned_by_uid)
         VALUES ($1, $2, 'moderator', $3)
         ON CONFLICT (community_id, user_uid, role) DO NOTHING`,
        [communityId, targetUid, req.adminViewer.uid]
      );
      await pool.query(
        `INSERT INTO community_memberships
          (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
         VALUES
          ($1, $2, 'member', NOW(), NULL, NULL, NOW())
         ON CONFLICT (community_id, user_uid)
         DO UPDATE SET state = 'member', joined_at = COALESCE(community_memberships.joined_at, NOW()), left_at = NULL, banned_at = NULL, updated_at = NOW()`,
        [communityId, targetUid]
      );
      return res.json({ ok: true, message: 'Moderator assigned.' });
    }

    await pool.query(
      `DELETE FROM community_roles
       WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'`,
      [communityId, targetUid]
    );
    return res.json({ ok: true, message: 'Moderator removed.' });
  } catch (error) {
    console.error('Admin moderator action failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update moderator role.' });
  }
});

router.get('/api/admin/content/main-posts', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);

  try {
    const db = await getMongoDb();
    const filter = {};
    if (course) {
      filter.course = course;
    }
    if (query) {
      filter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
      ];
    }

    const postsCollection = db.collection('posts');
    const total = await postsCollection.countDocuments(filter);
    const posts = await postsCollection
      .find(filter)
      .sort({ uploadDate: -1 })
      .skip(offset)
      .limit(pageSize)
      .toArray();

    const uploaderUids = posts.map((post) => post.uploaderUid).filter(Boolean);
    const namesMap = await loadDisplayNamesByUid(uploaderUids);

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      posts: posts.map((post) => ({
        id: String(post._id),
        title: post.title || '',
        content: post.content || '',
        course: post.course || null,
        visibility: post.visibility || 'public',
        likesCount: Number(post.likesCount || 0),
        commentsCount: Number(post.commentsCount || 0),
        uploaderUid: post.uploaderUid || null,
        uploaderName: namesMap.get(post.uploaderUid) || post.uploader?.displayName || 'Member',
        createdAt: post.uploadDate || null,
      })),
    });
  } catch (error) {
    console.error('Admin main posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load main feed posts.' });
  }
});

router.delete('/api/admin/content/main-posts/:id', async (req, res) => {
  const id = sanitizeText(req.params.id, 80);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postId = new ObjectId(id);
    const postsCollection = db.collection('posts');
    const post = await postsCollection.findOne({ _id: postId });
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    const attachmentKey =
      post.attachment &&
      (post.attachment.type === 'image' || post.attachment.type === 'video')
        ? post.attachment.key
        : null;
    if (attachmentKey && !String(attachmentKey).startsWith('http')) {
      try {
        await deleteFromStorage(attachmentKey);
      } catch (storageError) {
        console.error('Admin post attachment delete failed:', storageError);
      }
    }

    await postsCollection.deleteOne({ _id: postId });
    await db.collection('post_likes').deleteMany({ postId });
    await db.collection('post_comments').deleteMany({ postId });
    await db.collection('post_bookmarks').deleteMany({ postId });
    await db.collection('post_reports').deleteMany({ postId });
    await db.collection('admin_report_actions').deleteMany({ source: 'main_post', targetId: String(postId) });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete main post failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete post.' });
  }
});

router.get('/api/admin/content/main-comments', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);

  try {
    const db = await getMongoDb();
    const filter = {};
    if (query) {
      filter.content = { $regex: query, $options: 'i' };
    }

    const commentsCollection = db.collection('post_comments');
    const total = await commentsCollection.countDocuments(filter);
    const comments = await commentsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(pageSize)
      .toArray();

    const postIds = Array.from(new Set(comments.map((item) => String(item.postId)).filter(Boolean))).map(
      (value) => new ObjectId(value)
    );
    const posts = await db
      .collection('posts')
      .find({ _id: { $in: postIds } })
      .project({ _id: 1, title: 1, course: 1 })
      .toArray();
    const postMap = new Map(posts.map((post) => [String(post._id), post]));

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      comments: comments.map((comment) => {
        const post = postMap.get(String(comment.postId));
        return {
          id: String(comment._id),
          postId: String(comment.postId),
          postTitle: post ? post.title || 'Untitled post' : 'Unknown post',
          postCourse: post ? post.course || null : null,
          content: comment.content || '',
          authorUid: comment.userUid || null,
          authorName: comment.displayName || 'Member',
          createdAt: comment.createdAt || null,
        };
      }),
    });
  } catch (error) {
    console.error('Admin main comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load post comments.' });
  }
});

router.delete('/api/admin/content/main-comments/:id', async (req, res) => {
  const id = sanitizeText(req.params.id, 80);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid comment id.' });
  }

  try {
    const db = await getMongoDb();
    const commentsCollection = db.collection('post_comments');
    const postsCollection = db.collection('posts');
    const commentId = new ObjectId(id);
    const comment = await commentsCollection.findOne({ _id: commentId });
    if (!comment) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    await commentsCollection.deleteOne({ _id: commentId });
    if (comment.postId) {
      const postId = comment.postId instanceof ObjectId ? comment.postId : new ObjectId(String(comment.postId));
      const nextCount = await commentsCollection.countDocuments({ postId });
      await postsCollection.updateOne({ _id: postId }, { $set: { commentsCount: nextCount } });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete main comment failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete comment.' });
  }
});

router.get('/api/admin/content/community-posts', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);
  const status = sanitizeText(req.query.status, 20).toLowerCase();

  try {
    const where = [];
    const params = [];
    if (query) {
      params.push(`%${query}%`);
      where.push(`(cp.title ILIKE $${params.length} OR cp.content ILIKE $${params.length})`);
    }
    if (course) {
      params.push(course);
      where.push(`c.course_name = $${params.length}`);
    }
    if (status && ['active', 'taken_down'].includes(status)) {
      params.push(status);
      where.push(`cp.status = $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM community_posts cp
       JOIN communities c ON c.id = cp.community_id
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        cp.id,
        cp.community_id,
        cp.title,
        cp.content,
        cp.status,
        cp.likes_count,
        cp.created_at,
        cp.taken_down_reason,
        c.course_name,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS author_name,
        cp.author_uid
       FROM community_posts cp
       JOIN communities c ON c.id = cp.community_id
       JOIN accounts a ON a.uid = cp.author_uid
       LEFT JOIN profiles p ON p.uid = cp.author_uid
       ${whereClause}
       ORDER BY cp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      posts: rowsResult.rows.map((row) => ({
        id: Number(row.id),
        communityId: Number(row.community_id),
        title: row.title || '',
        content: row.content || '',
        status: row.status,
        likesCount: Number(row.likes_count || 0),
        course: row.course_name || null,
        authorUid: row.author_uid,
        authorName: row.author_name || 'Member',
        takenDownReason: row.taken_down_reason || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin community posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load community posts.' });
  }
});

router.post('/api/admin/content/community-posts/:id/takedown', async (req, res) => {
  const postId = parsePositiveInt(req.params.id);
  const reason = sanitizeText(req.body && req.body.reason, 600);
  if (!postId) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const result = await pool.query(
      `UPDATE community_posts
       SET status = 'taken_down',
           taken_down_by_uid = $2,
           taken_down_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [postId, req.adminViewer.uid, reason || 'Taken down by admin']
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community post not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin community post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down community post.' });
  }
});

router.get('/api/admin/content/community-comments', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);
  const status = sanitizeText(req.query.status, 20).toLowerCase();

  try {
    const where = [];
    const params = [];
    if (query) {
      params.push(`%${query}%`);
      where.push(`cc.content ILIKE $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`c.course_name = $${params.length}`);
    }
    if (status && ['active', 'taken_down'].includes(status)) {
      params.push(status);
      where.push(`cc.status = $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM community_comments cc
       JOIN community_posts cp ON cp.id = cc.post_id
       JOIN communities c ON c.id = cc.community_id
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        cc.id,
        cc.post_id,
        cc.community_id,
        cc.content,
        cc.status,
        cc.created_at,
        cc.taken_down_reason,
        cp.title AS post_title,
        c.course_name,
        cc.author_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS author_name
       FROM community_comments cc
       JOIN community_posts cp ON cp.id = cc.post_id
       JOIN communities c ON c.id = cc.community_id
       JOIN accounts a ON a.uid = cc.author_uid
       LEFT JOIN profiles p ON p.uid = cc.author_uid
       ${whereClause}
       ORDER BY cc.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      comments: rowsResult.rows.map((row) => ({
        id: Number(row.id),
        postId: Number(row.post_id),
        communityId: Number(row.community_id),
        content: row.content || '',
        status: row.status,
        postTitle: row.post_title || 'Untitled post',
        course: row.course_name || null,
        authorUid: row.author_uid,
        authorName: row.author_name || 'Member',
        takenDownReason: row.taken_down_reason || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin community comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load community comments.' });
  }
});

router.post('/api/admin/content/community-comments/:id/takedown', async (req, res) => {
  const commentId = parsePositiveInt(req.params.id);
  const reason = sanitizeText(req.body && req.body.reason, 600);
  if (!commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid comment id.' });
  }

  try {
    const result = await pool.query(
      `UPDATE community_comments
       SET status = 'taken_down',
           taken_down_by_uid = $2,
           taken_down_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [commentId, req.adminViewer.uid, reason || 'Taken down by admin']
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Community comment not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin community comment takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down community comment.' });
  }
});

router.get('/api/admin/content/library-documents', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 80);
  const query = sanitizeText(req.query.q, 200);
  const course = sanitizeText(req.query.course, 120);

  try {
    const where = [];
    const params = [];
    if (query) {
      params.push(`%${query}%`);
      where.push(
        `(d.title ILIKE $${params.length}
          OR d.filename ILIKE $${params.length}
          OR d.subject ILIKE $${params.length}
          OR COALESCE(d.description, '') ILIKE $${params.length})`
      );
    }
    if (course) {
      params.push(course);
      where.push(`d.course = $${params.length}`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM documents d
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0] ? countResult.rows[0].total : 0);

    params.push(pageSize, offset);
    const rowsResult = await pool.query(
      `SELECT
        d.uuid,
        d.title,
        d.filename,
        d.course,
        d.subject,
        d.visibility,
        d.views,
        d.popularity,
        d.uploaddate,
        d.link,
        d.thumbnail_link,
        d.uploader_uid,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
       FROM documents d
       JOIN accounts a ON a.uid = d.uploader_uid
       LEFT JOIN profiles p ON p.uid = d.uploader_uid
       ${whereClause}
       ORDER BY d.uploaddate DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      documents: rowsResult.rows.map((row) => ({
        uuid: row.uuid,
        title: row.title || '',
        filename: row.filename || '',
        course: row.course || '',
        subject: row.subject || '',
        visibility: row.visibility || 'public',
        views: Number(row.views || 0),
        popularity: Number(row.popularity || 0),
        uploaderUid: row.uploader_uid,
        uploaderName: row.uploader_name || 'Member',
        uploadedAt: row.uploaddate,
      })),
    });
  } catch (error) {
    console.error('Admin library documents fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load library documents.' });
  }
});

router.delete('/api/admin/content/library-documents/:uuid', async (req, res) => {
  const uuid = sanitizeText(req.params.uuid, 120);
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Invalid document id.' });
  }

  try {
    const docResult = await pool.query(
      `SELECT uuid, link, thumbnail_link
       FROM documents
       WHERE uuid = $1
       LIMIT 1`,
      [uuid]
    );
    if (!docResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    const doc = docResult.rows[0];

    await pool.query('DELETE FROM documents WHERE uuid = $1', [uuid]);
    const db = await getMongoDb();
    await db.collection('document_reports').deleteMany({ documentUuid: uuid });
    await db.collection('admin_report_actions').deleteMany({ source: 'library_document', targetId: uuid });

    const keys = [doc.link, doc.thumbnail_link].filter(Boolean);
    for (const key of keys) {
      if (!String(key).startsWith('http')) {
        try {
          await deleteFromStorage(key);
        } catch (storageError) {
          console.error('Admin document storage delete failed:', storageError);
        }
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete library document failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete document.' });
  }
});

router.get('/api/admin/site-pages/:slug', async (req, res) => {
  const slug = normalizeSitePageSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, message: 'Invalid page slug.' });
  }

  try {
    await ensureSitePagesReady();
    const result = await pool.query(
      `SELECT slug, title, subtitle, body, updated_by_uid, updated_at
       FROM site_page_content
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    const page = await resolveMobileAppBodyAssets(normalizeSitePageResult(slug, result.rows[0] || null));
    return res.json({ ok: true, page });
  } catch (error) {
    console.error('Admin site page fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load site page content.' });
  }
});

router.patch('/api/admin/site-pages/:slug', async (req, res) => {
  const slug = normalizeSitePageSlug(req.params.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, message: 'Invalid page slug.' });
  }

  const defaultPage = getDefaultSitePage(slug);
  const title = sanitizeText(req.body && req.body.title, 180) || defaultPage.title;
  const subtitle = sanitizeText(req.body && req.body.subtitle, 500);
  const body = normalizeSitePageBody(slug, (req.body && req.body.body) || {});

  if (slug === 'faq' && (!Array.isArray(body.items) || !body.items.length)) {
    return res.status(400).json({ ok: false, message: 'FAQ requires at least one item.' });
  }

  try {
    await ensureSitePagesReady();
    const result = await pool.query(
      `INSERT INTO site_page_content (slug, title, subtitle, body, updated_by_uid, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (slug)
       DO UPDATE SET
         title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle,
         body = EXCLUDED.body,
         updated_by_uid = EXCLUDED.updated_by_uid,
         updated_at = NOW()
       RETURNING slug, title, subtitle, body, updated_by_uid, updated_at`,
      [slug, title, subtitle, JSON.stringify(body), req.adminViewer.uid]
    );
    const page = await resolveMobileAppBodyAssets(normalizeSitePageResult(slug, result.rows[0] || null));
    return res.json({ ok: true, page });
  } catch (error) {
    console.error('Admin site page update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update site page content.' });
  }
});

module.exports = router;
