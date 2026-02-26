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
const { hasAdminPrivileges } = require('../services/roleAccess');
const { createNotification, isBlockedEitherDirection } = require('../services/notificationService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const AI_DOC_CONTEXT_MAX_BYTES = 8 * 1024 * 1024;
const AI_DOC_CONTEXT_MAX_CHARS = 3800;
const AI_DOC_PDF_OCR_MIN_TEXT_CHARS = 140;

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
  const userCourse = user && user.course ? user.course : null;
  const userUid = user && user.uid ? user.uid : null;
  const isPrivilegedViewer = hasAdminPrivileges(user);
  const filters = ['d.uuid = $1'];
  const values = [uuid];

  if (!isPrivilegedViewer) {
    if (userCourse && userUid) {
      values.push(userCourse);
      const courseParam = values.length;
      values.push(userUid);
      const uidParam = values.length;
      filters.push(
        `(d.visibility = 'public' OR (d.visibility IN ('private', 'course_exclusive') AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
      );
    } else if (userUid) {
      values.push(userUid);
      filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${values.length})`);
    } else {
      filters.push(`d.visibility = 'public'`);
    }
  }

  const query = `
    SELECT
      d.uuid, d.title, d.description, d.filename, d.uploader_uid, d.uploaddate, d.course,
      d.subject, d.views, d.popularity, d.visibility, d.aiallowed, d.link, d.thumbnail_link,
      COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
    FROM documents d
    LEFT JOIN accounts a ON d.uploader_uid = a.uid
    LEFT JOIN profiles p ON d.uploader_uid = p.uid
    WHERE ${filters.join(' AND ')}
    LIMIT 1
  `;
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

router.use('/api/library', requireAuthApi);

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
  const userCourse = req.user && req.user.course ? req.user.course : null;
  const userUid = req.user && req.user.uid ? req.user.uid : null;
  const isPrivilegedViewer = hasAdminPrivileges(req.user);

  const values = [];
  const filters = [];

  if (q) {
    values.push(`%${q}%`);
    filters.push(
      `(COALESCE(p.display_name, a.display_name, a.username, a.email) ILIKE $${values.length}
        OR a.username ILIKE $${values.length}
        OR a.email ILIKE $${values.length})`
    );
  }

  if (!isPrivilegedViewer) {
    if (userCourse && userUid) {
      values.push(userCourse);
      const courseParam = values.length;
      values.push(userUid);
      const uidParam = values.length;
      filters.push(
        `(d.visibility = 'public' OR (d.visibility IN ('private', 'course_exclusive') AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
      );
    } else if (userUid) {
      values.push(userUid);
      filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${values.length})`);
    } else {
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
  const userCourse = req.user && req.user.course ? req.user.course : null;
  const userUid = req.user && req.user.uid ? req.user.uid : null;
  const isPrivilegedViewer = hasAdminPrivileges(req.user);

  const filters = [];
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
    if (userCourse && userUid) {
      countValues.push(userCourse);
      const courseParam = countValues.length;
      countValues.push(userUid);
      const uidParam = countValues.length;
      filters.push(
        `(d.visibility = 'public' OR (d.visibility IN ('private', 'course_exclusive') AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
      );
    } else if (userUid) {
      countValues.push(userUid);
      filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${countValues.length})`);
    } else {
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
    const userCourse = req.user && req.user.course ? req.user.course : null;
    const userUid = req.user && req.user.uid ? req.user.uid : null;
    const isPrivilegedViewer = hasAdminPrivileges(req.user);
    const filters = ['d.uuid = $1'];
    const values = [uuid];

    if (!isPrivilegedViewer) {
      if (userCourse && userUid) {
        values.push(userCourse);
        const courseParam = values.length;
        values.push(userUid);
        const uidParam = values.length;
        filters.push(
          `(d.visibility = 'public' OR (d.visibility IN ('private', 'course_exclusive') AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
        );
      } else if (userUid) {
        values.push(userUid);
        filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${values.length})`);
      } else {
        filters.push(`d.visibility = 'public'`);
      }
    }

    const query = `
      SELECT
        d.uuid, d.title, d.description, d.filename, d.uploader_uid, d.uploaddate, d.course,
        d.subject, d.views, d.popularity, d.visibility, d.aiallowed, d.link, d.thumbnail_link,
        COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
      FROM documents d
      LEFT JOIN accounts a ON d.uploader_uid = a.uid
      LEFT JOIN profiles p ON d.uploader_uid = p.uid
      WHERE ${filters.join(' AND ')}
      LIMIT 1
    `;
    const result = await pool.query(query, values);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    const doc = result.rows[0];
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
      },
    });
  } catch (error) {
    console.error('Document fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load document.' });
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
      const visibilityValue = visibility === 'private' ? 'private' : 'public';

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
          (uuid, title, description, filename, uploader_uid, course, subject, visibility, aiallowed, link, thumbnail_link)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING uuid, title, description, filename, uploader_uid, uploaddate, course, subject,
                  views, popularity, visibility, aiallowed, link, thumbnail_link
      `;
      const aiAllowedValue = aiallowed === 'true' || aiallowed === true || aiallowed === 'on';
      const insertValues = [
        uuid,
        title.trim(),
        description ? description.trim() : '',
        file.originalname,
        req.user.uid,
        course.trim(),
        subject.trim(),
        visibilityValue,
        aiAllowedValue,
        uploadedFile.key,
        thumbnailLink,
      ];

      const result = await pool.query(insertQuery, insertValues);
      return res.json({ ok: true, document: result.rows[0] });
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
    const result = await pool.query(
      'UPDATE documents SET views = views + 1 WHERE uuid = $1 RETURNING views',
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
    updates.push(`course = $${values.length}`);
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
      'SELECT uploader_uid FROM documents WHERE uuid = $1',
      [uuid]
    );
    if (!ownerCheck.rows[0] || ownerCheck.rows[0].uploader_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    values.push(uuid);
    const updateQuery = `
      UPDATE documents
      SET ${updates.join(', ')}
      WHERE uuid = $${values.length}
      RETURNING uuid, title, description, course, subject
    `;
    const result = await pool.query(updateQuery, values);
    return res.json({ ok: true, document: result.rows[0] });
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
      'SELECT link, thumbnail_link, uploader_uid FROM documents WHERE uuid = $1',
      [uuid]
    );
    const doc = docResult.rows[0];
    if (!doc || doc.uploader_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const deleteResult = await pool.query(
      'DELETE FROM documents WHERE uuid = $1 AND uploader_uid = $2 RETURNING uuid',
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

    return res.json({ ok: true });
  } catch (error) {
    console.error('Document delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete document.' });
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
    const docResult = await pool.query(
      'SELECT uuid, uploader_uid, title FROM documents WHERE uuid = $1 LIMIT 1',
      [documentUuid]
    );
    const doc = docResult.rows[0];
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
          'UPDATE documents SET popularity = GREATEST(popularity - 1, 0) WHERE uuid = $1',
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
          'UPDATE documents SET popularity = popularity + 1 WHERE uuid = $1',
          [documentUuid]
        );
      }
    }

    const popularity = await pool.query(
      'SELECT popularity FROM documents WHERE uuid = $1',
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
            targetUrl: '/open-library',
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
      popularity: popularity.rows[0] ? popularity.rows[0].popularity : 0,
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
    const docResult = await pool.query(
      'SELECT uuid, uploader_uid, title FROM documents WHERE uuid = $1 LIMIT 1',
      [documentUuid]
    );
    const doc = docResult.rows[0];
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
            targetUrl: '/open-library',
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
