const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const zlib = require('zlib');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const {
  uploadToStorage,
  deleteFromStorage,
  getSignedUrl,
  downloadFromStorage,
  objectExists,
  normalizeStorageKey,
} = require('../services/storage');
const { getOpenAIClient, getOpenAIModel, getOpenAIKey } = require('../services/openaiClient');
const { isUnifiedVisibilityEnabled } = require('../services/featureFlags');
const { hasAdminPrivileges } = require('../services/roleAccess');
const { createNotification, isBlockedEitherDirection } = require('../services/notificationService');
const { parseReportPayload } = require('../services/reporting');
const {
  autoScanIncomingContent,
  extractDocumentExcerptForScan,
} = require('../services/aiContentScanService');
const {
  ensureDepartmentWorkflowReady,
  loadUserCourseAccess,
  listDocumentUploadCoursePoliciesForUser,
  resolveDocumentCoursePolicyForUser,
  normalizeDocumentApprovalStatus,
  canUserAccessLibraryDocumentRow,
} = require('../services/departmentAccess');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const AI_DOC_CONTEXT_MAX_BYTES = 8 * 1024 * 1024;
const AI_DOC_CONTEXT_MAX_CHARS = 3800;
const AI_DOC_PDF_OCR_MIN_TEXT_CHARS = 140;
const UNIFIED_VISIBILITY_ENABLED = isUnifiedVisibilityEnabled();
const COURSE_SHARED_VISIBILITY_SQL = UNIFIED_VISIBILITY_ENABLED
  ? "d.visibility IN ('private', 'course_exclusive')"
  : "d.visibility = 'private'";
const DOCUMENT_NOT_RESTRICTED_SQL = 'COALESCE(d.is_restricted, false) = false';
const LIBRARY_VISIBLE_DOCUMENT_SQL =
  "(COALESCE(d.source, 'library') <> 'vault' OR d.visibility <> 'private')";
const LIBRARY_VISIBLE_PLAIN_SQL =
  "(COALESCE(source, 'library') <> 'vault' OR visibility <> 'private')";

async function signIfNeeded(value, { ensureExists = false } = {}) {
  if (!value) return null;
  try {
    const normalized = normalizeStorageKey(value);
    const looksLikeHttp = /^https?:\/\//i.test(String(value).trim());
    const isExternalHttp = looksLikeHttp && normalized === String(value).trim();
    if (isExternalHttp) {
      return value;
    }
    const keyForStorage = normalized || value;
    if (ensureExists) {
      try {
        const exists = await objectExists(keyForStorage);
        if (exists === false) return null;
      } catch (existError) {
        console.warn(
          'Library object existence check failed; continuing with signed URL attempt:',
          existError && existError.message ? existError.message : existError
        );
      }
    }
    return await getSignedUrl(keyForStorage, SIGNED_TTL);
  } catch (error) {
    console.warn('Library sign URL failed:', error && error.message ? error.message : error);
    return null;
  }
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

function normalizeExtractedText(text) {
  if (!text) return '';
  return String(text).replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateExcerpt(text, maxChars = AI_DOC_CONTEXT_MAX_CHARS) {
  if (!text) return null;
  const normalized = normalizeExtractedText(text);
  if (!normalized) return null;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}...` : normalized;
}

function getFileExtension(filenameOrPath) {
  if (!filenameOrPath) return '';
  const normalized = String(filenameOrPath).split('?')[0].split('#')[0];
  return path.extname(normalized).toLowerCase();
}

function escapePostgresRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyContextDocument(document = {}) {
  const extension = getFileExtension(document.filename || document.link || '');
  if (extension === '.pdf') return { type: 'pdf', mimeType: 'application/pdf' };
  if (extension === '.md' || extension === '.markdown') {
    return { type: 'markdown', mimeType: 'text/markdown' };
  }
  if (extension === '.docx') {
    return {
      type: 'docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  if (extension === '.pptx') {
    return {
      type: 'pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
  }
  if (extension === '.txt') return { type: 'text', mimeType: 'text/plain' };
  return { type: 'unknown', mimeType: 'application/octet-stream' };
}

function decodeXmlEntities(text) {
  if (!text) return '';
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\n')
    .replace(/&#9;/g, '\t')
    .replace(/&nbsp;/g, ' ');
}

function extractDocxXmlText(xml) {
  if (!xml) return '';
  const withBreaks = String(xml)
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:cr[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n');
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, ' '));
}

function extractPptxXmlText(xml) {
  if (!xml) return '';
  const withBreaks = String(xml)
    .replace(/<a:br[^>]*\/>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<\/p:txBody>/g, '\n\n');
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, ' '));
}

function sortNumberedXmlEntries(entries, pattern) {
  return entries
    .filter((entry) => pattern.test(entry))
    .sort((a, b) => {
      const aNum = Number((a.match(/\d+/g) || ['0']).slice(-1)[0]);
      const bNum = Number((b.match(/\d+/g) || ['0']).slice(-1)[0]);
      return aNum - bNum;
    });
}

function findZipEocdOffset(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return new Map();
  const eocdOffset = findZipEocdOffset(buffer);
  if (eocdOffset < 0) return new Map();

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  let cursor = centralDirOffset;
  const entries = new Map();

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length) break;
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > buffer.length) break;
    const entryName = buffer.toString('utf8', nameStart, nameEnd);

    cursor = nameEnd + extraLength + commentLength;
    if (!entryName || entryName.endsWith('/')) continue;
    if (
      compressedSize === 0xffffffff ||
      localHeaderOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      continue;
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart < 0 || dataEnd > buffer.length || dataEnd < dataStart) continue;

    const compressed = buffer.subarray(dataStart, dataEnd);
    try {
      const content =
        compressionMethod === 0
          ? compressed
          : compressionMethod === 8
            ? zlib.inflateRawSync(compressed)
            : null;
      if (!content) continue;
      entries.set(entryName, content);
    } catch (error) {
      // skip invalid archive entry
    }
  }
  return entries;
}

async function extractDocxTextFromBuffer(buffer) {
  const zipEntries = readZipEntries(buffer);
  const docParts = sortNumberedXmlEntries(
    Array.from(zipEntries.keys()),
    /^(word\/document\.xml|word\/header\d+\.xml|word\/footer\d+\.xml)$/i
  );
  if (!docParts.length) return null;
  const chunks = docParts
    .map((part) => zipEntries.get(part)?.toString('utf8') || '')
    .map((xml) => extractDocxXmlText(xml))
    .filter(Boolean);
  return normalizeExtractedText(chunks.join('\n\n'));
}

async function extractPptxTextFromBuffer(buffer) {
  const zipEntries = readZipEntries(buffer);
  const allEntries = Array.from(zipEntries.keys());
  const slideEntries = sortNumberedXmlEntries(allEntries, /^ppt\/slides\/slide\d+\.xml$/i);
  const noteEntries = sortNumberedXmlEntries(allEntries, /^ppt\/notesSlides\/notesSlide\d+\.xml$/i);
  const selected = [...slideEntries, ...noteEntries];
  if (!selected.length) return null;
  const chunks = selected
    .map((part) => zipEntries.get(part)?.toString('utf8') || '')
    .map((xml) => extractPptxXmlText(xml))
    .filter(Boolean);
  return normalizeExtractedText(chunks.join('\n\n'));
}

async function extractTextFromFileWithOpenAI({ openai, buffer, filename, mimeType, ocrMode = false }) {
  if (!openai || !buffer || !buffer.length) return null;
  if (buffer.length > AI_DOC_CONTEXT_MAX_BYTES) return null;

  try {
    const fileData = `data:${mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
    const response = await openai.responses.create({
      model: getOpenAIModel(),
      max_output_tokens: 1300,
      input: [
        {
          role: 'system',
          content:
            'Extract readable text from the provided file. Output only plain text with no commentary.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: ocrMode
                ? 'Run OCR on this PDF and return the extracted readable text.'
                : 'Return the key readable text content from this file.',
            },
            {
              type: 'input_file',
              filename: filename || 'library-file',
              file_data: fileData,
            },
          ],
        },
      ],
    });
    return normalizeExtractedText(extractTextFromOpenAIResponse(response));
  } catch (error) {
    console.error('Library OpenAI file extraction failed:', error);
    return null;
  }
}

async function extractContextExcerpt(document) {
  if (!document || !document.link || document.link.startsWith('http')) return null;
  try {
    const buffer = await downloadFromStorage(document.link);
    if (!buffer || !buffer.length) return null;
    if (buffer.length > AI_DOC_CONTEXT_MAX_BYTES) {
      return `Document is larger than ${Math.round(AI_DOC_CONTEXT_MAX_BYTES / 1024 / 1024)}MB.`;
    }

    const typeInfo = classifyContextDocument(document);
    if (typeInfo.type === 'markdown' || typeInfo.type === 'text') {
      return truncateExcerpt(buffer.toString('utf8'));
    }

    if (typeInfo.type === 'pdf') {
      const data = await pdfParse(buffer);
      const parsed = normalizeExtractedText(data?.text || '');
      if (parsed.length >= AI_DOC_PDF_OCR_MIN_TEXT_CHARS) {
        return truncateExcerpt(parsed);
      }
      const openai = await getOpenAIClient();
      const ocrText = await extractTextFromFileWithOpenAI({
        openai,
        buffer,
        filename: document.filename || 'document.pdf',
        mimeType: typeInfo.mimeType,
        ocrMode: true,
      });
      return truncateExcerpt(ocrText);
    }

    if (typeInfo.type === 'docx') {
      const extracted = await extractDocxTextFromBuffer(buffer);
      return truncateExcerpt(extracted);
    }

    if (typeInfo.type === 'pptx') {
      const extracted = await extractPptxTextFromBuffer(buffer);
      return truncateExcerpt(extracted);
    }

    return null;
  } catch (error) {
    console.error('Library context extraction failed:', error);
    return null;
  }
}

function buildDocumentContextText(document, excerpt) {
  const lines = [
    `Document title: ${document.title || 'Untitled document'}`,
    `Uploader: ${document.uploader_name || 'Member'}`,
    `Course: ${document.course || 'N/A'}`,
    `Subject: ${document.subject || 'N/A'}`,
    `Filename: ${document.filename || 'N/A'}`,
    `Description: ${document.description || 'N/A'}`,
    `Visibility: ${document.visibility || 'public'}`,
    `Uploaded at: ${document.uploaddate ? new Date(document.uploaddate).toISOString() : 'N/A'}`,
  ];
  if (excerpt) {
    lines.push(`Document excerpt:\n${excerpt}`);
  } else {
    lines.push('Document excerpt unavailable; rely on metadata and user instructions.');
  }
  return lines.join('\n');
}

async function loadAccessibleDocumentForUser(user, uuid) {
  const viewerCourseAccess = user && user.uid ? await loadUserCourseAccess(user.uid) : null;
  const result = await pool.query(
    `SELECT
       d.uuid,
       d.title,
       d.description,
       d.filename,
       d.uploader_uid,
       d.uploaddate,
       d.course,
       d.subject,
       d.views,
       d.popularity,
       d.visibility,
       d.source,
       d.aiallowed,
       d.link,
       d.thumbnail_link,
       d.is_restricted,
       d.upload_approval_status,
       d.upload_approval_required,
       d.upload_approval_requested_at,
       d.upload_approved_at,
       d.upload_rejected_at,
       d.upload_rejection_note,
       COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
     FROM documents d
     LEFT JOIN accounts a ON d.uploader_uid = a.uid
     LEFT JOIN profiles p ON d.uploader_uid = p.uid
     WHERE d.uuid = $1
     LIMIT 1`,
    [uuid]
  );
  const document = result.rows[0] || null;
  if (!document || !canUserAccessLibraryDocumentRow(document, user, viewerCourseAccess)) {
    return null;
  }
  return document;
}

function getViewerAccessibleCourses(req) {
  return req && req.viewerCourseAccess && Array.isArray(req.viewerCourseAccess.accessibleCourses)
    ? req.viewerCourseAccess.accessibleCourses.filter(Boolean)
    : [];
}

router.use('/api/library', requireAuthApi);

router.use('/api/library', async (req, res, next) => {
  try {
    await ensureDepartmentWorkflowReady();
    req.viewerCourseAccess = await loadUserCourseAccess(req.user && req.user.uid ? req.user.uid : '');
    return next();
  } catch (error) {
    console.error('Library department workflow bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to resolve library access.' });
  }
});

router.get('/api/library/upload-access', async (req, res) => {
  try {
    const access = await listDocumentUploadCoursePoliciesForUser(req.user && req.user.uid ? req.user.uid : '');
    return res.json({
      ok: true,
      mainCourse: access.mainCourse || '',
      uploadCourses: Array.isArray(access.uploadCourses) ? access.uploadCourses : [],
      blockedSubcourses: Array.isArray(access.blockedSubcourses) ? access.blockedSubcourses : [],
    });
  } catch (error) {
    console.error('Library upload access fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load upload course access.' });
  }
});

router.get('/api/library/courses', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT course_code, course_name FROM courses ORDER BY course_name ASC'
    );
    return res.json({ ok: true, courses: result.rows });
  } catch (error) {
    console.error('Courses fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load courses.' });
  }
});

router.get('/api/library/uploaders', async (req, res) => {
  const q = (req.query.q || '').trim();
  const userUid = req.user && req.user.uid ? req.user.uid : null;
  const isPrivilegedViewer = hasAdminPrivileges(req.user);
  const accessibleCourses = getViewerAccessibleCourses(req);

  const values = [];
  const filters = [DOCUMENT_NOT_RESTRICTED_SQL, LIBRARY_VISIBLE_DOCUMENT_SQL];

  if (q) {
    values.push(`%${q}%`);
    filters.push(
      `(COALESCE(p.display_name, a.display_name, a.username, a.email) ILIKE $${values.length}
        OR a.username ILIKE $${values.length}
        OR a.email ILIKE $${values.length})`
    );
  }

  if (!isPrivilegedViewer) {
    if (userUid) {
      values.push(userUid);
      const uidParam = values.length;
      filters.push(`(COALESCE(d.upload_approval_status, 'approved') = 'approved' OR d.uploader_uid = $${uidParam})`);
      if (accessibleCourses.length) {
        values.push(accessibleCourses);
        const courseParam = values.length;
        filters.push(
          `(d.visibility = 'public' OR (${COURSE_SHARED_VISIBILITY_SQL} AND (d.course = ANY($${courseParam}::text[]) OR d.uploader_uid = $${uidParam})))`
        );
      } else {
        filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${uidParam})`);
      }
    } else if (accessibleCourses.length) {
      values.push(accessibleCourses);
      const courseParam = values.length;
      filters.push(
        `COALESCE(d.upload_approval_status, 'approved') = 'approved'`
      );
      filters.push(
        `(d.visibility = 'public' OR (${COURSE_SHARED_VISIBILITY_SQL} AND d.course = ANY($${courseParam}::text[])))`
      );
    } else {
      filters.push(`COALESCE(d.upload_approval_status, 'approved') = 'approved'`);
      filters.push(`d.visibility = 'public'`);
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const query = `
    SELECT
      d.uploader_uid AS uid,
      COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name,
      p.photo_link,
      COUNT(*)::int AS upload_count
    FROM documents d
    JOIN accounts a ON a.uid = d.uploader_uid
    LEFT JOIN profiles p ON p.uid = d.uploader_uid
    ${whereClause}
    GROUP BY d.uploader_uid, COALESCE(p.display_name, a.display_name, a.username, a.email), p.photo_link
    ORDER BY lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) ASC
    LIMIT 50
  `;

  try {
    const result = await pool.query(query, values);
    const uploaders = await Promise.all(
      result.rows.map(async (row) => ({
        uid: row.uid,
        displayName: row.display_name || 'Member',
        photoLink: await signIfNeeded(row.photo_link, { ensureExists: true }),
        uploadCount: row.upload_count || 0,
      }))
    );
    return res.json({ ok: true, uploaders });
  } catch (error) {
    console.error('Uploader filter fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load uploaders.' });
  }
});

router.get('/api/library/documents', async (req, res) => {
  const q = (req.query.q || '').trim();
  const course = (req.query.course || '').trim();
  const uploaderUid = (req.query.uploaderUid || '').trim();
  const sort = (req.query.sort || 'recent').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);
  const userUid = req.user && req.user.uid ? req.user.uid : null;
  const isPrivilegedViewer = hasAdminPrivileges(req.user);
  const accessibleCourses = getViewerAccessibleCourses(req);

  const filters = [DOCUMENT_NOT_RESTRICTED_SQL, LIBRARY_VISIBLE_DOCUMENT_SQL];
  const countValues = [];

  if (q) {
    const terms = q
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    const termFilters = [];
    terms.forEach((term) => {
      const escaped = escapePostgresRegex(term);
      if (!escaped) return;
      countValues.push(`\\m${escaped}\\M`);
      termFilters.push(
        `(COALESCE(d.title, '') ~* $${countValues.length} OR COALESCE(d.subject, '') ~* $${countValues.length})`
      );
    });

    if (termFilters.length) {
      filters.push(`(${termFilters.join(' AND ')})`);
    }
  }

  if (course && course !== 'all') {
    countValues.push(course);
    filters.push(`d.course = $${countValues.length}`);
  }

  if (uploaderUid) {
    countValues.push(uploaderUid);
    filters.push(`d.uploader_uid = $${countValues.length}`);
  }

  if (!isPrivilegedViewer) {
    if (userUid) {
      countValues.push(userUid);
      const uidParam = countValues.length;
      filters.push(`(COALESCE(d.upload_approval_status, 'approved') = 'approved' OR d.uploader_uid = $${uidParam})`);
      if (accessibleCourses.length) {
        countValues.push(accessibleCourses);
        const courseParam = countValues.length;
        filters.push(
          `(d.visibility = 'public' OR (${COURSE_SHARED_VISIBILITY_SQL} AND (d.course = ANY($${courseParam}::text[]) OR d.uploader_uid = $${uidParam})))`
        );
      } else {
        filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${uidParam})`);
      }
    } else if (accessibleCourses.length) {
      countValues.push(accessibleCourses);
      const courseParam = countValues.length;
      filters.push(`COALESCE(d.upload_approval_status, 'approved') = 'approved'`);
      filters.push(
        `(d.visibility = 'public' OR (${COURSE_SHARED_VISIBILITY_SQL} AND d.course = ANY($${courseParam}::text[])))`
      );
    } else {
      filters.push(`COALESCE(d.upload_approval_status, 'approved') = 'approved'`);
      filters.push(`d.visibility = 'public'`);
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  let orderBy = 'd.uploaddate DESC';
  if (sort === 'oldest') {
    orderBy = 'd.uploaddate ASC';
  } else if (sort === 'popularity') {
    orderBy = 'd.popularity DESC';
  } else if (sort === 'views') {
    orderBy = 'd.views DESC';
  } else if (sort === 'az') {
    orderBy = 'd.title ASC';
  } else if (sort === 'za') {
    orderBy = 'd.title DESC';
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM documents d ${whereClause}`,
      countValues
    );
    const total = countResult.rows[0] ? countResult.rows[0].total : 0;

    const listValues = [...countValues];
    const likeUid = userUid || '';
    listValues.push(likeUid);
    const likedParamIndex = listValues.length;
    listValues.push(pageSize, (page - 1) * pageSize);
    const limitParamIndex = listValues.length - 1;
    const offsetParamIndex = listValues.length;

    const listQuery = `
      SELECT
        d.uuid, d.title, d.description, d.filename, d.uploader_uid, d.uploaddate, d.course,
        d.subject, d.views, d.popularity, d.visibility, d.aiallowed, d.link, d.thumbnail_link,
        d.upload_approval_status, d.upload_approval_required, d.upload_approval_requested_at,
        d.upload_approved_at, d.upload_rejected_at, d.upload_rejection_note,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name,
        CASE WHEN l.id IS NULL THEN false ELSE true END AS liked,
        CASE WHEN d.uploader_uid = $${likedParamIndex} THEN true ELSE false END AS is_owner
      FROM documents d
      LEFT JOIN accounts a ON d.uploader_uid = a.uid
      LEFT JOIN profiles p ON d.uploader_uid = p.uid
      LEFT JOIN document_likes l ON l.document_uuid = d.uuid AND l.user_uid = $${likedParamIndex}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `;

    const listResult = await pool.query(listQuery, listValues);
    const documents = await Promise.all(
      listResult.rows.map(async (doc) => {
        const [link, thumbnailLink] = await Promise.all([
          signIfNeeded(doc.link, { ensureExists: true }),
          signIfNeeded(doc.thumbnail_link, { ensureExists: true }),
        ]);
        return {
          ...doc,
          link,
          thumbnail_link: thumbnailLink,
        };
      })
    );
    return res.json({ ok: true, total, page, pageSize, documents });
  } catch (error) {
    console.error('Document fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load documents.' });
  }
});

router.get('/api/library/documents/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  try {
    const doc = await loadAccessibleDocumentForUser(req.user, uuid);
    if (!doc) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    const likedResult = req.user && req.user.uid
      ? await pool.query(
          `SELECT 1
           FROM document_likes
           WHERE document_uuid = $1
             AND user_uid = $2
           LIMIT 1`,
          [uuid, req.user.uid]
        )
      : { rowCount: 0 };
    const [link, thumbnailLink] = await Promise.all([
      signIfNeeded(doc.link, { ensureExists: true }),
      signIfNeeded(doc.thumbnail_link, { ensureExists: true }),
    ]);
    return res.json({
      ok: true,
      document: {
        ...doc,
        link,
        thumbnail_link: thumbnailLink,
        liked: likedResult.rowCount > 0,
        is_owner: Boolean(req.user && req.user.uid && doc.uploader_uid === req.user.uid),
      },
    });
  } catch (error) {
    console.error('Document fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load document.' });
  }
});

router.get('/api/library/my-documents', async (req, res) => {
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const result = await pool.query(
      `SELECT
         uuid::text AS uuid,
         title,
         description,
         filename,
         course,
         subject,
         views,
         popularity,
         visibility,
         source,
         aiallowed,
         upload_approval_status,
         upload_approval_required,
         upload_approval_requested_at,
         upload_approved_at,
         upload_rejected_at,
         upload_rejection_note,
         uploaddate
       FROM documents
       WHERE uploader_uid = $1
         AND source = 'library'
       ORDER BY uploaddate DESC, id DESC`,
      [req.user.uid]
    );

    return res.json({
      ok: true,
      documents: result.rows.map((row) => ({
        uuid: row.uuid,
        title: row.title || 'Untitled document',
        description: row.description || '',
        filename: row.filename || '',
        course: row.course || '',
        subject: row.subject || '',
        views: Number(row.views || 0),
        popularity: Number(row.popularity || 0),
        visibility: row.visibility || 'public',
        source: row.source || 'library',
        aiAllowed: row.aiallowed !== false,
        approvalStatus: normalizeDocumentApprovalStatus(row.upload_approval_status, 'approved'),
        approvalRequired: row.upload_approval_required === true,
        approvalRequestedAt: row.upload_approval_requested_at || null,
        approvedAt: row.upload_approved_at || null,
        rejectedAt: row.upload_rejected_at || null,
        rejectionNote: row.upload_rejection_note || null,
        uploadedAt: row.uploaddate || null,
      })),
    });
  } catch (error) {
    console.error('My library documents fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load your uploads.' });
  }
});

router.post(
  '/api/library/documents',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res) => {
    const {
      title,
      description,
      course,
      subject,
      visibility,
      aiallowed,
    } = req.body || {};

    const file = req.files && req.files.file ? req.files.file[0] : null;
    const thumbnail = req.files && req.files.thumbnail ? req.files.thumbnail[0] : null;

    if (!req.user || !req.user.uid) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    if (!title || !course || !subject || !visibility || !file) {
      return res.status(400).json({ ok: false, message: 'Missing required fields.' });
    }

    try {
      const uuid = crypto.randomUUID();
      const visibilityRaw = typeof visibility === 'string' ? visibility.trim().toLowerCase() : '';
      if (visibilityRaw === 'course_exclusive' && !UNIFIED_VISIBILITY_ENABLED) {
        return res.status(400).json({
          ok: false,
          message: 'Course-exclusive visibility is currently unavailable.',
        });
      }
      const visibilityValue = visibilityRaw === 'private'
        ? 'private'
        : visibilityRaw === 'course_exclusive'
          ? 'course_exclusive'
          : 'public';
      const uploadPolicy = await resolveDocumentCoursePolicyForUser(req.user.uid, course.trim());
      if (!uploadPolicy.ok) {
        return res.status(403).json({ ok: false, message: uploadPolicy.message || 'Course upload is not allowed.' });
      }
      const approvalStatus = uploadPolicy.approvalStatus || 'approved';
      const approvalRequired = uploadPolicy.approvalRequired === true;

      const uploadedFile = await uploadToStorage({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        prefix: 'library',
      });

      let thumbnailLink = null;
      if (thumbnail) {
        const uploadedThumb = await uploadToStorage({
          buffer: thumbnail.buffer,
          filename: thumbnail.originalname,
          mimeType: thumbnail.mimetype,
          prefix: 'library-thumbs',
        });
        thumbnailLink = uploadedThumb.key;
      }

      const insertQuery = `
        INSERT INTO documents
          (
            uuid, title, description, filename, uploader_uid, course, subject, visibility, source, aiallowed,
            link, thumbnail_link, upload_approval_status, upload_approval_required, upload_approval_requested_at,
            upload_approved_at, upload_approved_by_uid, upload_rejected_at, upload_rejected_by_uid, upload_rejection_note
          )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING uuid, title, description, filename, uploader_uid, uploaddate, course, subject,
                  views, popularity, visibility, aiallowed, link, thumbnail_link,
                  upload_approval_status, upload_approval_required, upload_approval_requested_at,
                  upload_approved_at, upload_rejected_at, upload_rejection_note
      `;
      const aiAllowedValue = aiallowed === 'true' || aiallowed === true || aiallowed === 'on';
      const insertValues = [
        uuid,
        title.trim(),
        description ? description.trim() : '',
        file.originalname,
        req.user.uid,
        uploadPolicy.courseName || course.trim(),
        subject.trim(),
        visibilityValue,
        'library',
        aiAllowedValue,
        uploadedFile.key,
        thumbnailLink,
        approvalStatus,
        approvalRequired,
        approvalRequired ? new Date() : null,
        approvalStatus === 'approved' ? new Date() : null,
        null,
        null,
        null,
        null,
      ];

      const result = await pool.query(insertQuery, insertValues);
      const createdDocument = result.rows[0];

      if (approvalRequired && uploadPolicy.depadminUid && uploadPolicy.depadminUid !== req.user.uid) {
        createNotification({
          recipientUid: uploadPolicy.depadminUid,
          actorUid: req.user.uid,
          type: 'document_upload_pending_approval',
          entityType: 'document',
          entityId: uuid,
          targetUrl: '/department',
          meta: {
            documentTitle: createdDocument && createdDocument.title ? createdDocument.title : title.trim(),
            documentUuid: uuid,
            course: uploadPolicy.courseName || course.trim(),
            source: 'open_library',
          },
        }).catch((error) => {
          console.error('Open Library pending approval notification failed:', error);
        });
      }

      setImmediate(async () => {
        try {
          const excerpt = await extractDocumentExcerptForScan({
            buffer: file.buffer,
            filename: file.originalname,
            mimeType: file.mimetype,
          });
          const contentScanText = [
            `Title: ${createdDocument && createdDocument.title ? createdDocument.title : title.trim()}`,
            `Description: ${createdDocument && createdDocument.description ? createdDocument.description : description ? description.trim() : ''}`,
            `Course: ${createdDocument && createdDocument.course ? createdDocument.course : course.trim()}`,
            `Subject: ${createdDocument && createdDocument.subject ? createdDocument.subject : subject.trim()}`,
            `Visibility: ${visibilityValue}`,
            `Filename: ${file.originalname || ''}`,
            excerpt ? `Document excerpt:\n${excerpt}` : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          await autoScanIncomingContent({
            targetType: 'document',
            targetId: String(uuid),
            requestedByUid: req.user.uid,
            content: contentScanText,
            metadata: {
              source: 'open_library_upload',
              visibility: visibilityValue,
              course: createdDocument && createdDocument.course ? createdDocument.course : uploadPolicy.courseName || course.trim(),
              subject: createdDocument && createdDocument.subject ? createdDocument.subject : subject.trim(),
              filename: file.originalname || '',
              mimeType: file.mimetype || '',
              uploadApprovalStatus: approvalStatus,
            },
          });
        } catch (error) {
          console.error('Open Library auto content scan failed:', error);
        }
      });

      return res.json({
        ok: true,
        document: createdDocument,
        message: approvalRequired
          ? 'Document uploaded and submitted for DepAdmin approval for the selected subcourse.'
          : 'Document uploaded successfully.',
      });
    } catch (error) {
      console.error('Document upload failed:', error);
      return res.status(500).json({ ok: false, message: 'Upload failed.' });
    }
  }
);

router.post('/api/library/documents/:uuid/view', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  try {
    const document = await loadAccessibleDocumentForUser(req.user, uuid);
    if (!document) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    const result = await pool.query(
      `UPDATE documents
       SET views = views + 1
       WHERE uuid = $1
         AND ${LIBRARY_VISIBLE_PLAIN_SQL}
         AND COALESCE(is_restricted, false) = false
       RETURNING views`,
      [uuid]
    );
    return res.json({ ok: true, views: result.rows[0] ? result.rows[0].views : 0 });
  } catch (error) {
    console.error('View update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update views.' });
  }
});

router.patch('/api/library/documents/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const { title, description, course, subject } = req.body || {};
  const updates = [];
  const values = [];
  let courseValueIndex = null;

  if (title) {
    values.push(title.trim());
    updates.push(`title = $${values.length}`);
  }
  if (description !== undefined) {
    values.push(description.trim());
    updates.push(`description = $${values.length}`);
  }
  if (course) {
    values.push(course.trim());
    courseValueIndex = values.length;
    updates.push(`course = $${courseValueIndex}`);
  }
  if (subject) {
    values.push(subject.trim());
    updates.push(`subject = $${values.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No fields to update.' });
  }

  try {
    const ownerCheck = await pool.query(
      `SELECT uploader_uid, course
       FROM documents
       WHERE uuid = $1
         AND ${LIBRARY_VISIBLE_PLAIN_SQL}`,
      [uuid]
    );
    if (!ownerCheck.rows[0] || ownerCheck.rows[0].uploader_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    let approvalUpdate = [];
    if (course !== undefined) {
      const nextCourse = course.trim();
      const policy = await resolveDocumentCoursePolicyForUser(req.user.uid, nextCourse);
      if (!policy.ok) {
        return res.status(403).json({ ok: false, message: policy.message || 'Course update is not allowed.' });
      }
      if (courseValueIndex) {
        values[courseValueIndex - 1] = policy.courseName || nextCourse;
      }
      values.push(policy.approvalStatus || 'approved');
      approvalUpdate.push(`upload_approval_status = $${values.length}`);
      values.push(policy.approvalRequired === true);
      approvalUpdate.push(`upload_approval_required = $${values.length}`);
      values.push(policy.approvalRequired ? new Date() : null);
      approvalUpdate.push(`upload_approval_requested_at = $${values.length}`);
      values.push(policy.approvalStatus === 'approved' ? new Date() : null);
      approvalUpdate.push(`upload_approved_at = $${values.length}`);
      approvalUpdate.push(`upload_approved_by_uid = NULL`);
      approvalUpdate.push(`upload_rejected_at = NULL`);
      approvalUpdate.push(`upload_rejected_by_uid = NULL`);
      approvalUpdate.push(`upload_rejection_note = NULL`);

      if (policy.approvalRequired && policy.depadminUid && policy.depadminUid !== req.user.uid) {
        createNotification({
          recipientUid: policy.depadminUid,
          actorUid: req.user.uid,
          type: 'document_upload_pending_approval',
          entityType: 'document',
          entityId: uuid,
          targetUrl: '/department',
          meta: {
            documentTitle: title ? title.trim() : null,
            documentUuid: uuid,
            course: policy.courseName || nextCourse,
            source: 'open_library_edit',
          },
        }).catch((error) => {
          console.error('Open Library edit approval notification failed:', error);
        });
      }
    }

    values.push(uuid);
    const updateQuery = `
      UPDATE documents
      SET ${updates.concat(approvalUpdate).join(', ')}
      WHERE uuid = $${values.length}
      RETURNING uuid, title, description, course, subject,
                upload_approval_status, upload_approval_required, upload_approval_requested_at,
                upload_approved_at, upload_rejected_at, upload_rejection_note
    `;
    const result = await pool.query(updateQuery, values);
    const document = result.rows[0];
    const approvalStatus = normalizeDocumentApprovalStatus(document && document.upload_approval_status, 'approved');
    return res.json({
      ok: true,
      document,
      message:
        course !== undefined && approvalStatus === 'pending'
          ? 'Document update saved and resubmitted for DepAdmin approval.'
          : 'Document updated successfully.',
    });
  } catch (error) {
    console.error('Document update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update document.' });
  }
});

router.delete('/api/library/documents/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const docResult = await pool.query(
      `SELECT link, thumbnail_link, uploader_uid
       FROM documents
       WHERE uuid = $1
         AND ${LIBRARY_VISIBLE_PLAIN_SQL}`,
      [uuid]
    );
    const doc = docResult.rows[0];
    if (!doc || doc.uploader_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const deleteResult = await pool.query(
      `DELETE FROM documents
       WHERE uuid = $1
         AND uploader_uid = $2
         AND ${LIBRARY_VISIBLE_PLAIN_SQL}
       RETURNING uuid`,
      [uuid, req.user.uid]
    );
    if (!deleteResult.rowCount) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }

    const keysToDelete = [doc.link, doc.thumbnail_link].filter(Boolean);
    for (const key of keysToDelete) {
      if (key.startsWith('http')) {
        continue;
      }
      try {
        await deleteFromStorage(key);
      } catch (error) {
        console.error('Storage delete failed:', error);
      }
    }

    const db = await getMongoDb();
    await db.collection('document_reports').deleteMany({ documentUuid: uuid });

    return res.json({ ok: true });
  } catch (error) {
    console.error('Document delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete document.' });
  }
});

router.post('/api/library/documents/:uuid/report', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  const userUid = req.user && req.user.uid;
  if (!userUid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const doc = await loadAccessibleDocumentForUser(req.user, uuid);
    if (!doc) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    if (doc.uploader_uid && doc.uploader_uid === userUid) {
      return res.status(400).json({ ok: false, message: 'You cannot report your own document.' });
    }

    const payload = parseReportPayload(req.body || {});
    const db = await getMongoDb();
    await db.collection('document_reports').updateOne(
      { documentUuid: uuid, userUid },
      {
        $set: {
          documentUuid: uuid,
          documentTitle: doc.title || '',
          userUid,
          targetUid: doc.uploader_uid || null,
          category: payload.category,
          customReason: payload.customReason || null,
          details: payload.details || null,
          reason: payload.reason,
          status: 'open',
          moderationAction: null,
          resolutionNote: null,
          resolvedAt: null,
          resolvedByUid: null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Document report failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to submit report.' });
  }
});

router.post('/api/library/like', async (req, res) => {
  const { documentUuid, action } = req.body || {};
  if (!documentUuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  const userUid = req.user && req.user.uid;
  if (!userUid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const doc = await loadAccessibleDocumentForUser(req.user, documentUuid);
    if (!doc) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }

    let shouldNotifyLike = false;
    if (action === 'unlike') {
      const del = await pool.query(
        'DELETE FROM document_likes WHERE document_uuid = $1 AND user_uid = $2 RETURNING id',
        [documentUuid, userUid]
      );
      if (del.rowCount) {
        await pool.query(
          `UPDATE documents
           SET popularity = GREATEST(popularity - 1, 0)
           WHERE uuid = $1
             AND ${LIBRARY_VISIBLE_PLAIN_SQL}`,
          [documentUuid]
        );
      }
    } else {
      const ins = await pool.query(
        'INSERT INTO document_likes (document_uuid, user_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [documentUuid, userUid]
      );
      if (ins.rowCount) {
        shouldNotifyLike = true;
        await pool.query(
          `UPDATE documents
           SET popularity = popularity + 1
           WHERE uuid = $1
             AND ${LIBRARY_VISIBLE_PLAIN_SQL}`,
          [documentUuid]
        );
      }
    }

    const popularity = await pool.query(
      `SELECT popularity
       FROM documents
       WHERE uuid = $1
         AND ${LIBRARY_VISIBLE_PLAIN_SQL}
         AND COALESCE(is_restricted, false) = false`,
      [documentUuid]
    );

    if (shouldNotifyLike && doc.uploader_uid && doc.uploader_uid !== userUid) {
      try {
        const blocked = await isBlockedEitherDirection(userUid, doc.uploader_uid);
        if (!blocked) {
          await createNotification({
            recipientUid: doc.uploader_uid,
            actorUid: userUid,
            type: 'document_liked',
            entityType: 'document',
            entityId: documentUuid,
            targetUrl: `/open-library?documentUuid=${encodeURIComponent(documentUuid)}`,
            meta: {
              documentTitle: doc.title || 'Untitled document',
              documentUuid,
            },
          });
        }
      } catch (error) {
        console.error('Document like notification failed:', error);
      }
    }

    return res.json({
      ok: true,
      popularity: popularity.rows[0] ? popularity.rows[0].popularity : Number(doc.popularity || 0),
    });
  } catch (error) {
    console.error('Like update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update like.' });
  }
});

router.get('/api/library/documents/:uuid/ask-ai/bootstrap', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }

  try {
    const document = await loadAccessibleDocumentForUser(req.user, uuid);
    if (!document) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    if (document.aiallowed === false) {
      return res.status(403).json({
        ok: false,
        message: 'AI is disabled for this document by the uploader.',
      });
    }

    const db = await getMongoDb();
    const conversations = db.collection('library_ai_conversations');
    const messagesCollection = db.collection('library_ai_messages');
    const now = new Date();
    let conversation = await conversations.findOne({
      userUid: req.user.uid,
      documentUuid: uuid,
    });

    const excerpt = await extractContextExcerpt(document);
    if (!conversation) {
      const conversationDoc = {
        userUid: req.user.uid,
        documentUuid: uuid,
        title: `Ask AI: ${document.title || 'Document'}`,
        contextExcerpt: excerpt || null,
        createdAt: now,
        updatedAt: now,
      };
      const insert = await conversations.insertOne(conversationDoc);
      conversation = { ...conversationDoc, _id: insert.insertedId };
    } else {
      const updates = { updatedAt: now };
      if (!conversation.contextExcerpt && excerpt) {
        updates.contextExcerpt = excerpt;
        conversation.contextExcerpt = excerpt;
      }
      await conversations.updateOne({ _id: conversation._id }, { $set: updates });
    }

    const messages = await messagesCollection
      .find({ userUid: req.user.uid, conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .limit(120)
      .toArray();

    const contextSummary = conversation.contextExcerpt || excerpt || '';
    const shortSummary = contextSummary
      ? (contextSummary.length > 220 ? `${contextSummary.slice(0, 220).trim()}...` : contextSummary)
      : 'Document metadata will be used as context.';

    return res.json({
      ok: true,
      conversation: {
        id: conversation._id.toString(),
        title: conversation.title,
        documentUuid: uuid,
      },
      context: {
        documentTitle: document.title || 'Untitled document',
        summary: shortSummary,
      },
      messages: messages.map((message) => ({
        id: message._id.toString(),
        role: message.role,
        content: message.content || '',
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error('Library AI bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load document AI conversation.' });
  }
});

router.post('/api/library/documents/:uuid/ask-ai/messages', async (req, res) => {
  const { uuid } = req.params;
  const { content } = req.body || {};
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  if (!content || !String(content).trim()) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    const document = await loadAccessibleDocumentForUser(req.user, uuid);
    if (!document) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    if (document.aiallowed === false) {
      return res.status(403).json({
        ok: false,
        message: 'AI is disabled for this document by the uploader.',
      });
    }

    const db = await getMongoDb();
    const conversations = db.collection('library_ai_conversations');
    const messagesCollection = db.collection('library_ai_messages');
    const now = new Date();
    let conversation = await conversations.findOne({
      userUid: req.user.uid,
      documentUuid: uuid,
    });

    let contextExcerpt = conversation && conversation.contextExcerpt ? conversation.contextExcerpt : null;
    if (!contextExcerpt) {
      contextExcerpt = await extractContextExcerpt(document);
    }

    if (!conversation) {
      const conversationDoc = {
        userUid: req.user.uid,
        documentUuid: uuid,
        title: `Ask AI: ${document.title || 'Document'}`,
        contextExcerpt: contextExcerpt || null,
        createdAt: now,
        updatedAt: now,
      };
      const insert = await conversations.insertOne(conversationDoc);
      conversation = { ...conversationDoc, _id: insert.insertedId };
    }

    const userMessage = {
      conversationId: conversation._id,
      userUid: req.user.uid,
      documentUuid: uuid,
      role: 'user',
      content: String(content).trim(),
      createdAt: now,
    };
    await messagesCollection.insertOne(userMessage);

    let assistantText = getOpenAIKey()
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses.';

    const openai = await getOpenAIClient();
    if (openai) {
      const recentMessages = await messagesCollection
        .find({ userUid: req.user.uid, conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(14)
        .toArray();

      const history = [...recentMessages].reverse().map((message) => ({
        role: message.role,
        content: message.content || '',
      }));

      const contextBlock = buildDocumentContextText(document, contextExcerpt);
      try {
        const response = await openai.responses.create({
          model: getOpenAIModel(),
          max_output_tokens: 900,
          input: [
            {
              role: 'system',
              content:
                'You are an academic assistant helping discuss a specific uploaded document. Stay grounded in the supplied document context and clearly call out uncertainty.',
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
        console.error('Library AI response failed:', error);
        if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
          assistantText = 'Model access/config issue detected. Set OPENAI_MODEL to an available model and retry.';
        }
      }
    }

    const assistantMessage = {
      conversationId: conversation._id,
      userUid: req.user.uid,
      documentUuid: uuid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    const insertedAssistant = await messagesCollection.insertOne(assistantMessage);

    const updateSet = { updatedAt: new Date() };
    if (!conversation.contextExcerpt && contextExcerpt) {
      updateSet.contextExcerpt = contextExcerpt;
    }
    await conversations.updateOne({ _id: conversation._id }, { $set: updateSet });

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
    console.error('Library AI message failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to send document AI message.' });
  }
});

router.get('/api/library/comments', async (req, res) => {
  const documentUuid = (req.query.documentUuid || '').trim();
  if (!documentUuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }

  try {
    const document = await loadAccessibleDocumentForUser(req.user, documentUuid);
    if (!document) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }

    const db = await getMongoDb();
    const comments = await db
      .collection('doccomment')
      .find({ documentUuid })
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray();
    return res.json({ ok: true, comments });
  } catch (error) {
    console.error('Comment fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load comments.' });
  }
});

router.post('/api/library/comments', async (req, res) => {
  const { documentUuid, content } = req.body || {};
  if (!documentUuid || !content) {
    return res.status(400).json({ ok: false, message: 'Missing comment data.' });
  }
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const doc = await loadAccessibleDocumentForUser(req.user, documentUuid);
    if (!doc) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }

    const db = await getMongoDb();
    const comment = {
      documentUuid,
      userUid: req.user.uid,
      displayName: req.user.displayName || req.user.username || req.user.email,
      content,
      createdAt: new Date(),
    };
    const result = await db.collection('doccomment').insertOne(comment);

    if (doc.uploader_uid && doc.uploader_uid !== req.user.uid) {
      try {
        const blocked = await isBlockedEitherDirection(req.user.uid, doc.uploader_uid);
        if (!blocked) {
          await createNotification({
            recipientUid: doc.uploader_uid,
            actorUid: req.user.uid,
            type: 'document_commented',
            entityType: 'document',
            entityId: documentUuid,
            targetUrl: `/open-library?documentUuid=${encodeURIComponent(documentUuid)}`,
            meta: {
              documentTitle: doc.title || 'Untitled document',
              documentUuid,
            },
          });
        }
      } catch (error) {
        console.error('Document comment notification failed:', error);
      }
    }

    return res.json({ ok: true, comment: { ...comment, _id: result.insertedId } });
  } catch (error) {
    console.error('Comment create failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to add comment.' });
  }
});

router.use('/api/library', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'File exceeds 50MB limit.' });
  }
  return next(err);
});

module.exports = router;
