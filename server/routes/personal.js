const express = require('express');
const { ObjectId } = require('mongodb');
const path = require('path');
const zlib = require('zlib');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const pool = require('../db/pool');
const { getOpenAIClient, getOpenAIModel, getOpenAIKey } = require('../services/openaiClient');
const pdfParse = require('pdf-parse');
const { downloadFromStorage } = require('../services/storage');

const GCLOUD_MCP_SERVER_URL = (process.env.GCLOUD_MCP_SERVER_URL || '').trim();
const CONTEXT_PARSE_MAX_BYTES = 8 * 1024 * 1024;
const CONTEXT_EXCERPT_MAX_CHARS = 3500;
const PDF_OCR_MIN_TEXT_CHARS = 140;

const router = express.Router();

router.use('/api/personal', requireAuthApi);

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((tag) => tag.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function extractProposedTasks(text) {
  if (!text) return [];
  const match = text.match(
    /(?:^|\n)\s*(?:(?:create|add|make|generate|set up)\s+)?(?:tasks?|to-?dos?|checklist)\s*[:\-]\s*([\s\S]+)/i
  );
  if (!match) return [];
  const raw = match[1]
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  const parsed = raw.slice(0, 10).map((title) => ({
    title,
    status: 'pending',
    priority: 'normal',
  }));
  if (parsed.length) return parsed;

  const singleMatch = text.match(
    /(?:^|\n)\s*(?:create|add|make|generate|set up)\s+(?:a\s+)?(?:task|to-?do)\s*[:\-]?\s*(.+)$/i
  );
  if (!singleMatch) return [];
  const singleTitle = String(singleMatch[1] || '').trim();
  if (!singleTitle) return [];
  return [{ title: singleTitle, status: 'pending', priority: 'normal' }];
}

function hasTaskIntent(text) {
  if (!text) return false;
  const normalized = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  if (/\b(do not|don't|dont|not now)\b.{0,30}\b(create|add|make|generate)\b.{0,30}\b(task|to-?do|checklist)\b/i.test(normalized)) {
    return false;
  }

  return (
    /\b(create|add|make|generate|set up|prepare|draft|organize|break down)\b[\s\S]{0,80}\b(task|tasks|to-?do|to-?dos|checklist|action items?|study plan|plan|schedule|roadmap)\b/i.test(normalized) ||
    /\b(task|tasks|to-?do|to-?dos|checklist|action items?|study plan|schedule|roadmap)\b[\s\S]{0,60}\b(for|about|from|based on|using)\b/i.test(normalized) ||
    /\b(remind me|next steps|what should i do|help me plan|help me organize|help me schedule)\b/i.test(normalized) ||
    /\b(can you|could you|please|i need|i want|let's)\b[\s\S]{0,80}\b(task|to-?do|checklist|action items?|study plan|schedule)\b/i.test(normalized)
  );
}

function parseTaskJson(text) {
  if (!text) return [];
  const cleaned = text.trim();
  const candidates = [cleaned];
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      // try next candidate
    }
  }
  return [];
}

function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = String(text).trim();
  if (!cleaned) return null;
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      // try next candidate
    }
  }
  return null;
}

function normalizeGeneratedTasks(tasks) {
  return tasks
    .filter((task) => task && typeof task === 'object')
    .map((task) => {
      const title = String(task.title || '').trim();
      if (!title) return null;
      const priority = ['low', 'normal', 'urgent'].includes(task.priority)
        ? task.priority
        : 'normal';
      const dueDate =
        typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
          ? task.dueDate
          : null;
      return {
        title,
        description: String(task.description || '').trim(),
        status: 'pending',
        priority,
        dueDate,
        tags: normalizeTags(task.tags || []),
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

async function analyzeTaskOrderIntent(openai, { content, history = [], contextDocument = null, contextExcerpt = '' }) {
  if (!openai || !content) return { isTaskOrder: false, tasks: [] };
  const historyText = history
    .filter((item) => item && item.role && item.content)
    .slice(-6)
    .map((item) => `${item.role}: ${String(item.content).slice(0, 600)}`)
    .join('\n');
  const contextBlock = contextDocument
    ? [
        `Context title: ${contextDocument.title || 'N/A'}`,
        `Context course: ${contextDocument.course || 'N/A'}`,
        `Context subject: ${contextDocument.subject || 'N/A'}`,
        contextExcerpt ? `Context excerpt: ${String(contextExcerpt).slice(0, 1800)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No linked context document.';

  const response = await openai.responses.create({
    model: getOpenAIModel(),
    max_output_tokens: 700,
    input: [
      {
        role: 'system',
        content:
          'Classify if the latest user message is a request to create tasks in the app. Return ONLY JSON object with keys: isTaskOrder(boolean), tasks(array). For tasks, each item must include: title, description, priority(low|normal|urgent), dueDate(YYYY-MM-DD or null), tags(string array). If not a task order, return {"isTaskOrder":false,"tasks":[]}.',
      },
      {
        role: 'user',
        content: [
          'Conversation history:',
          historyText || '(none)',
          '',
          'Linked document context:',
          contextBlock,
          '',
          'Latest user message:',
          String(content).slice(0, 2500),
        ].join('\n'),
      },
    ],
  });

  const payload = parseJsonObject(extractTextFromOpenAIResponse(response)) || {};
  const isTaskOrder = Boolean(payload.isTaskOrder);
  const tasks = normalizeGeneratedTasks(payload.tasks || []);
  return { isTaskOrder, tasks };
}

async function inferTasksFromConversation(openai, { content, history = [], contextDocument = null, contextExcerpt = '' }) {
  const historyText = history
    .filter((item) => item && item.role && item.content)
    .slice(-6)
    .map((item) => `${item.role}: ${String(item.content).slice(0, 600)}`)
    .join('\n');
  const contextBlock = contextDocument
    ? [
        `Context title: ${contextDocument.title || 'N/A'}`,
        `Context course: ${contextDocument.course || 'N/A'}`,
        `Context subject: ${contextDocument.subject || 'N/A'}`,
        contextExcerpt ? `Context excerpt: ${String(contextExcerpt).slice(0, 1800)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No linked context document.';

  const response = await openai.responses.create({
    model: getOpenAIModel(),
    max_output_tokens: 800,
    input: [
      {
        role: 'system',
        content:
          'Extract actionable tasks that the user wants added to the app task board. Use the latest message, history, and context document. Return ONLY a JSON array. Each item must include: title, description, priority(low|normal|urgent), dueDate(YYYY-MM-DD or null), tags(string array). Return [] if no task should be created.',
      },
      {
        role: 'user',
        content: [
          'Conversation history:',
          historyText || '(none)',
          '',
          'Linked document context:',
          contextBlock,
          '',
          'Latest user message:',
          String(content || '').slice(0, 2500),
        ].join('\n'),
      },
    ],
  });
  return normalizeGeneratedTasks(parseTaskJson(extractTextFromOpenAIResponse(response)));
}

async function createTasksForUser(db, userUid, tasks) {
  if (!tasks.length) return [];
  const now = new Date();
  const taskDocs = tasks.map((task) => ({
    ...task,
    userUid,
    createdAt: now,
    updatedAt: now,
  }));
  const insertResult = await db.collection('personal_tasks').insertMany(taskDocs);
  return taskDocs.map((task, index) => ({
    ...task,
    _id: insertResult.insertedIds[index],
  }));
}

async function createTaskProposalForUser(db, { conversationId, userUid, tasks, sourceMessage }) {
  const normalizedTasks = normalizeGeneratedTasks(tasks || []);
  if (!normalizedTasks.length) return null;
  const now = new Date();
  const proposal = {
    conversationId,
    userUid,
    tasks: normalizedTasks,
    sourceMessage: String(sourceMessage || '').slice(0, 4000),
    status: 'pending',
    intentType: 'mcp_task_order',
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('ai_task_proposals').insertOne(proposal);
  return { ...proposal, _id: result.insertedId };
}

function buildTaskProposalMessage(tasks) {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  if (!safeTasks.length) {
    return 'I can draft tasks, but I need one more detail. Tell me what you want to prioritize first.';
  }
  const preview = safeTasks
    .slice(0, 6)
    .map((task, index) => `${index + 1}. ${task.title}`)
    .join('\n');
  const remainder =
    safeTasks.length > 6
      ? `\n…and ${safeTasks.length - 6} more task${safeTasks.length - 6 === 1 ? '' : 's'}.`
      : '';
  return [
    `I prepared an MCP task order draft with ${safeTasks.length} task${safeTasks.length === 1 ? '' : 's'}:`,
    preview,
    remainder,
    '',
    'Do you want me to add these to your task board?',
    'Use `Confirm tasks` to save them or `Reject tasks` to discard.',
  ]
    .filter(Boolean)
    .join('\n');
}

function deriveConversationTitle(text) {
  if (!text) return 'New conversation';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New conversation';
  const words = cleaned.split(' ');
  const title = words.slice(0, 6).join(' ');
  return title.length > 60 ? `${title.slice(0, 60).trim()}…` : title;
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
        const text =
          typeof contentItem?.text === 'string' ? contentItem.text.trim() : '';
        if (!text) continue;
        if (contentItem.type === 'output_text' || contentItem.type === 'text') {
          chunks.push(text);
        }
      }
    }
  }

  return chunks.join('\n\n').trim();
}

function wantsMessageStream(req) {
  const queryValue = String(req.query?.stream || '').trim().toLowerCase();
  if (queryValue === '1' || queryValue === 'true' || queryValue === 'yes') {
    return true;
  }
  const accept = String(req.headers?.accept || '').toLowerCase();
  return accept.includes('application/x-ndjson');
}

function beginNdjsonStream(res) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function writeNdjsonEvent(res, payload) {
  if (!res || res.writableEnded || !payload) return;
  try {
    res.write(`${JSON.stringify(payload)}\n`);
  } catch (error) {
    // Ignore write errors caused by client disconnects.
  }
}

function isMcpToolError(error) {
  return (
    error?.status === 424 ||
    /mcp|tool list|failed dependency/i.test(String(error?.message || ''))
  );
}

async function getOpenAIOutputText({
  openai,
  requestBody,
  streamToClient = false,
  onDelta = null,
}) {
  if (!streamToClient) {
    const response = await openai.responses.create(requestBody);
    return extractTextFromOpenAIResponse(response);
  }

  const stream = openai.responses.stream(requestBody);
  let streamedText = '';
  for await (const event of stream) {
    if (event?.type === 'response.output_text.delta' && event.delta) {
      streamedText += event.delta;
      if (typeof onDelta === 'function') {
        onDelta(event.delta);
      }
      continue;
    }
    if (event?.type === 'response.output_text.done' && !streamedText && event.text) {
      streamedText = event.text;
    }
  }

  let finalText = '';
  try {
    const finalResponse = await stream.finalResponse();
    finalText = extractTextFromOpenAIResponse(finalResponse);
  } catch (error) {
    // If final aggregation fails, keep whatever arrived through deltas.
  }
  const resolvedText = finalText || streamedText;

  if (
    finalText &&
    streamedText &&
    finalText.startsWith(streamedText) &&
    finalText.length > streamedText.length &&
    typeof onDelta === 'function'
  ) {
    onDelta(finalText.slice(streamedText.length));
  }

  return resolvedText;
}

function shouldRequireMcpTool(text) {
  if (!text) return false;
  return /(gcloud|google cloud|cloud run|gcs|bucket|project|service account|artifact registry|compute|sql|pub\/sub|bigquery|cloud functions|cloud storage)/i.test(
    text
  );
}

function getFileExtension(filenameOrPath) {
  if (!filenameOrPath) return '';
  const normalized = String(filenameOrPath).split('?')[0].split('#')[0];
  return path.extname(normalized).toLowerCase();
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

function normalizeExtractedText(text) {
  if (!text) return '';
  return String(text).replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateExcerpt(text, maxChars = CONTEXT_EXCERPT_MAX_CHARS) {
  if (!text) return null;
  const normalized = normalizeExtractedText(text);
  if (!normalized) return null;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}…` : normalized;
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
      // Skip unreadable zip entry.
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
  if (buffer.length > CONTEXT_PARSE_MAX_BYTES) {
    return `Document is larger than ${Math.round(CONTEXT_PARSE_MAX_BYTES / 1024 / 1024)}MB.`;
  }

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
              filename: filename || 'context-file',
              file_data: fileData,
            },
          ],
        },
      ],
    });
    return normalizeExtractedText(extractTextFromOpenAIResponse(response));
  } catch (error) {
    console.error('OpenAI file extraction failed:', error);
    return null;
  }
}

async function loadContextDocument(uuid) {
  if (!uuid) return null;
  try {
    const result = await pool.query(
      `SELECT uuid, title, description, subject, course, filename, link
       FROM documents
       WHERE uuid = $1`,
      [uuid]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Context document fetch failed:', error);
    return null;
  }
}

async function extractContextExcerpt(document) {
  if (!document || !document.link) return null;
  if (document.link.startsWith('http')) return null;
  try {
    const buffer = await downloadFromStorage(document.link);
    if (!buffer) return null;
    if (buffer.length > CONTEXT_PARSE_MAX_BYTES) {
      return `Document is larger than ${Math.round(CONTEXT_PARSE_MAX_BYTES / 1024 / 1024)}MB.`;
    }
    const typeInfo = classifyContextDocument(document);
    if (typeInfo.type === 'markdown' || typeInfo.type === 'text') {
      return truncateExcerpt(buffer.toString('utf8'));
    }

    if (typeInfo.type === 'pdf') {
      const data = await pdfParse(buffer);
      const parsed = normalizeExtractedText(data?.text || '');
      if (parsed.length >= PDF_OCR_MIN_TEXT_CHARS) {
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
    console.error('Context document parse failed:', error);
    return null;
  }
}

router.get('/api/personal/journals', async (req, res) => {
  try {
    const db = await getMongoDb();
    const entries = await db
      .collection('personal_journals')
      .find({ userUid: req.user.uid })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();
    return res.json({ ok: true, entries });
  } catch (error) {
    console.error('Journal fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load journals.' });
  }
});

router.get('/api/personal/journal-folders', async (req, res) => {
  try {
    const db = await getMongoDb();
    const folders = await db
      .collection('personal_journal_folders')
      .find({ userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .toArray();
    return res.json({ ok: true, folders });
  } catch (error) {
    console.error('Journal folders fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load folders.' });
  }
});

router.post('/api/personal/journal-folders', async (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ ok: false, message: 'Folder name is required.' });
  }
  try {
    const db = await getMongoDb();
    const existing = await db
      .collection('personal_journal_folders')
      .findOne({ userUid: req.user.uid, name: name.trim() });
    if (existing) {
      return res.status(409).json({ ok: false, message: 'Folder already exists.' });
    }
    const folder = {
      userUid: req.user.uid,
      name: name.trim(),
      createdAt: new Date(),
    };
    const result = await db.collection('personal_journal_folders').insertOne(folder);
    return res.json({ ok: true, folder: { ...folder, _id: result.insertedId } });
  } catch (error) {
    console.error('Journal folder create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create folder.' });
  }
});

router.delete('/api/personal/journal-folders/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid folder id.' });
  }
  try {
    const db = await getMongoDb();
    const folderId = new ObjectId(id);
    const folder = await db
      .collection('personal_journal_folders')
      .findOne({ _id: folderId, userUid: req.user.uid });
    if (!folder) {
      return res.status(404).json({ ok: false, message: 'Folder not found.' });
    }
    await db.collection('personal_journal_folders').deleteOne({ _id: folderId, userUid: req.user.uid });
    await db
      .collection('personal_journals')
      .updateMany({ userUid: req.user.uid, folder: folder.name }, { $set: { folder: null } });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Journal folder delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete folder.' });
  }
});

router.post('/api/personal/journals', async (req, res) => {
  const { title, content, folder, tags } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }
  try {
    const db = await getMongoDb();
    if (folder) {
      const folderExists = await db
        .collection('personal_journal_folders')
        .findOne({ userUid: req.user.uid, name: folder.trim() });
      if (!folderExists) {
        return res.status(400).json({ ok: false, message: 'Selected folder does not exist.' });
      }
    }
    const now = new Date();
    const entry = {
      userUid: req.user.uid,
      title: title.trim(),
      content,
      folder: folder ? folder.trim() : null,
      tags: normalizeTags(tags),
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection('personal_journals').insertOne(entry);
    return res.json({ ok: true, entry: { ...entry, _id: result.insertedId } });
  } catch (error) {
    console.error('Journal create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create journal.' });
  }
});

router.patch('/api/personal/journals/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid journal id.' });
  }
  const { title, content, folder, tags } = req.body || {};
  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (folder !== undefined) updates.folder = folder ? folder.trim() : null;
  if (tags !== undefined) updates.tags = normalizeTags(tags);
  updates.updatedAt = new Date();

  try {
    const db = await getMongoDb();
    if (folder) {
      const folderExists = await db
        .collection('personal_journal_folders')
        .findOne({ userUid: req.user.uid, name: folder.trim() });
      if (!folderExists) {
        return res.status(400).json({ ok: false, message: 'Selected folder does not exist.' });
      }
    }
    const result = await db.collection('personal_journals').updateOne(
      { _id: new ObjectId(id), userUid: req.user.uid },
      { $set: updates }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ ok: false, message: 'Journal not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Journal update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update journal.' });
  }
});

router.delete('/api/personal/journals/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid journal id.' });
  }
  try {
    const db = await getMongoDb();
    const result = await db
      .collection('personal_journals')
      .deleteOne({ _id: new ObjectId(id), userUid: req.user.uid });
    if (!result.deletedCount) {
      return res.status(404).json({ ok: false, message: 'Journal not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Journal delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete journal.' });
  }
});

router.get('/api/personal/tasks', async (req, res) => {
  try {
    const db = await getMongoDb();
    const tasks = await db
      .collection('personal_tasks')
      .find({ userUid: req.user.uid })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({ ok: true, tasks });
  } catch (error) {
    console.error('Tasks fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load tasks.' });
  }
});

router.post('/api/personal/tasks', async (req, res) => {
  const { title, description, status, priority, dueDate, tags } = req.body || {};
  if (!title) {
    return res.status(400).json({ ok: false, message: 'Task title is required.' });
  }
  const now = new Date();
  try {
    const db = await getMongoDb();
    const task = {
      userUid: req.user.uid,
      title: title.trim(),
      description: description ? description.trim() : '',
      status: status || 'pending',
      priority: priority || 'normal',
      dueDate: dueDate || null,
      tags: normalizeTags(tags),
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection('personal_tasks').insertOne(task);
    return res.json({ ok: true, task: { ...task, _id: result.insertedId } });
  } catch (error) {
    console.error('Task create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create task.' });
  }
});

router.patch('/api/personal/tasks/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid task id.' });
  }
  const { title, description, status, priority, dueDate, tags } = req.body || {};
  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description.trim();
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;
  if (tags !== undefined) updates.tags = normalizeTags(tags);
  updates.updatedAt = new Date();

  try {
    const db = await getMongoDb();
    const result = await db.collection('personal_tasks').updateOne(
      { _id: new ObjectId(id), userUid: req.user.uid },
      { $set: updates }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Task update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update task.' });
  }
});

router.delete('/api/personal/tasks/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid task id.' });
  }
  try {
    const db = await getMongoDb();
    const result = await db
      .collection('personal_tasks')
      .deleteOne({ _id: new ObjectId(id), userUid: req.user.uid });
    if (!result.deletedCount) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Task delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete task.' });
  }
});

router.get('/api/personal/conversations', async (req, res) => {
  try {
    const db = await getMongoDb();
    const conversations = await db
      .collection('ai_conversations')
      .find({ userUid: req.user.uid })
      .sort({ updatedAt: -1 })
      .toArray();
    return res.json({ ok: true, conversations });
  } catch (error) {
    console.error('Conversations fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load conversations.' });
  }
});

router.post('/api/personal/conversations', async (req, res) => {
  const { title } = req.body || {};
  try {
    const db = await getMongoDb();
    const now = new Date();
    const conversation = {
      userUid: req.user.uid,
      title: title ? title.trim() : 'New conversation',
      contextDoc: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection('ai_conversations').insertOne(conversation);
    return res.json({ ok: true, conversation: { ...conversation, _id: result.insertedId } });
  } catch (error) {
    console.error('Conversation create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create conversation.' });
  }
});

router.delete('/api/personal/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  try {
    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    await db.collection('ai_conversations').deleteOne({ _id: conversationId, userUid: req.user.uid });
    await db.collection('ai_messages').deleteMany({ conversationId, userUid: req.user.uid });
    await db.collection('ai_task_proposals').deleteMany({ conversationId, userUid: req.user.uid });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Conversation delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete conversation.' });
  }
});

router.patch('/api/personal/conversations/:id/context', async (req, res) => {
  const { id } = req.params;
  const { contextDoc } = req.body || {};
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'contextDoc')) {
    return res.status(400).json({ ok: false, message: 'contextDoc is required.' });
  }
  try {
    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    const conversation = await db
      .collection('ai_conversations')
      .findOne({ _id: conversationId, userUid: req.user.uid });
    if (!conversation) {
      return res.status(404).json({ ok: false, message: 'Conversation not found.' });
    }

    let nextContext = null;
    if (contextDoc && contextDoc.uuid) {
      const contextDocument = await loadContextDocument(String(contextDoc.uuid));
      if (!contextDocument) {
        return res.status(404).json({ ok: false, message: 'Context document not found.' });
      }
      nextContext = {
        uuid: contextDocument.uuid,
        title: contextDocument.title || 'Context document',
        course: contextDocument.course || null,
        subject: contextDocument.subject || null,
      };
    }

    await db.collection('ai_conversations').updateOne(
      { _id: conversationId, userUid: req.user.uid },
      {
        $set: {
          contextDoc: nextContext,
          updatedAt: new Date(),
        },
      }
    );
    return res.json({ ok: true, contextDoc: nextContext });
  } catch (error) {
    console.error('Conversation context update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update context.' });
  }
});

router.get('/api/personal/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  try {
    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    const conversation = await db
      .collection('ai_conversations')
      .findOne({ _id: conversationId, userUid: req.user.uid });
    if (!conversation) {
      return res.status(404).json({ ok: false, message: 'Conversation not found.' });
    }
    const messages = await db
      .collection('ai_messages')
      .find({ conversationId, userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .toArray();
    return res.json({
      ok: true,
      messages,
      conversation: {
        _id: conversation._id,
        title: conversation.title || 'New conversation',
        contextDoc: conversation.contextDoc || null,
      },
    });
  } catch (error) {
    console.error('Messages fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load messages.' });
  }
});

router.post('/api/personal/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { content, contextDoc } = req.body || {};
  const hasContextPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'contextDoc');
  const streamRequested = wantsMessageStream(req);
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    if (streamRequested) {
      beginNdjsonStream(res);
    }
    let streamDeltaSent = false;
    const emitStreamEvent = (payload) => {
      if (!streamRequested) return;
      writeNdjsonEvent(res, payload);
    };
    const emitDelta = (delta) => {
      if (!streamRequested || !delta) return;
      streamDeltaSent = true;
      emitStreamEvent({ type: 'delta', delta });
    };

    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    const now = new Date();
    const contextUuid = contextDoc && contextDoc.uuid ? String(contextDoc.uuid) : null;
    const conversation = await db
      .collection('ai_conversations')
      .findOne({ _id: conversationId, userUid: req.user.uid });
    if (!conversation) {
      if (streamRequested) {
        writeNdjsonEvent(res, {
          type: 'error',
          message: 'Conversation not found.',
        });
        res.end();
        return;
      }
      return res.status(404).json({ ok: false, message: 'Conversation not found.' });
    }
    const fallbackContextUuid =
      !hasContextPayload && conversation.contextDoc && conversation.contextDoc.uuid
        ? String(conversation.contextDoc.uuid)
        : null;
    const resolvedContextUuid = contextUuid || fallbackContextUuid;
    const contextDocument = await loadContextDocument(resolvedContextUuid);
    const contextExcerpt = await extractContextExcerpt(contextDocument);
    const userMessage = {
      conversationId,
      userUid: req.user.uid,
      role: 'user',
      content: content.trim(),
      contextDoc: resolvedContextUuid ? { uuid: resolvedContextUuid } : null,
      createdAt: now,
    };
    await db.collection('ai_messages').insertOne(userMessage);
    let conversationTitle = null;
    const userMessageCount = await db
      .collection('ai_messages')
      .countDocuments({ conversationId, userUid: req.user.uid, role: 'user' });
    if (conversation && userMessageCount === 1) {
      const currentTitle = (conversation.title || '').trim();
      if (!currentTitle || currentTitle.toLowerCase() === 'new conversation') {
        conversationTitle = deriveConversationTitle(content);
      }
    }

    const conversationUpdate = { updatedAt: now };
    if (conversationTitle) {
      conversationUpdate.title = conversationTitle;
    }
    if (hasContextPayload) {
      conversationUpdate.contextDoc =
        contextDocument && contextDocument.uuid
          ? {
              uuid: contextDocument.uuid,
              title: contextDocument.title || 'Context document',
              course: contextDocument.course || null,
              subject: contextDocument.subject || null,
            }
          : null;
    }

    await db.collection('ai_conversations').updateOne(
      { _id: conversationId, userUid: req.user.uid },
      { $set: conversationUpdate }
    );

    const hasOpenAIKey = Boolean(getOpenAIKey());
    let assistantText = hasOpenAIKey
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses. I can still store your conversation.';
    let proposalId = null;
    let proposedTasks = [];
    let createdTasks = [];
    let recentMessages = [];

    const proposed = extractProposedTasks(content);
    if (proposed.length) {
      const proposal = await createTaskProposalForUser(db, {
        conversationId,
        userUid: req.user.uid,
        tasks: proposed.map((task) => ({ ...task, description: task.description || '', tags: [] })),
        sourceMessage: content,
      });
      if (proposal) {
        proposalId = String(proposal._id);
        proposedTasks = proposal.tasks;
        assistantText = buildTaskProposalMessage(proposal.tasks);
      }
    } else {
      const openai = await getOpenAIClient();
      if (openai) {
        recentMessages = await db
          .collection('ai_messages')
          .find({ conversationId, userUid: req.user.uid })
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray();
        const history = [...recentMessages].reverse().map((message) => ({
          role: message.role,
          content: message.content,
        }));

        let analyzedTaskOrder = null;
        try {
          analyzedTaskOrder = await analyzeTaskOrderIntent(openai, {
            content,
            history,
            contextDocument,
            contextExcerpt,
          });
        } catch (error) {
          console.error('Task intent analysis failed:', error);
        }

        if (analyzedTaskOrder?.isTaskOrder) {
          if (analyzedTaskOrder.tasks.length) {
            const proposal = await createTaskProposalForUser(db, {
              conversationId,
              userUid: req.user.uid,
              tasks: analyzedTaskOrder.tasks,
              sourceMessage: content,
            });
            if (proposal) {
              proposalId = String(proposal._id);
              proposedTasks = proposal.tasks;
              assistantText = buildTaskProposalMessage(proposal.tasks);
            }
          } else {
            assistantText =
              'I recognized this as a task request but need more detail to draft tasks. Tell me the scope, deadline, or priorities, and I will prepare tasks for confirmation.';
          }
        } else {
          try {
            const inferredTasks = await inferTasksFromConversation(openai, {
              content,
              history,
              contextDocument,
              contextExcerpt,
            });
            if (inferredTasks.length) {
              const proposal = await createTaskProposalForUser(db, {
                conversationId,
                userUid: req.user.uid,
                tasks: inferredTasks,
                sourceMessage: content,
              });
              if (proposal) {
                proposalId = String(proposal._id);
                proposedTasks = proposal.tasks;
                assistantText = buildTaskProposalMessage(proposal.tasks);
              }
            } else if (hasTaskIntent(content)) {
              assistantText =
                'I understood this as a task request, but I could not extract concrete tasks yet. Share more specifics and I can draft them for confirmation.';
            }
          } catch (error) {
            console.error('Task inference failed:', error);
          }
        }

        if (proposalId) {
          // MCP-like task order drafted; wait for explicit confirmation before saving tasks.
        } else {
        const history = recentMessages.length
          ? [...recentMessages].reverse().map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : [];

        const systemPrompt = [
          'You are a private academic companion. Keep responses concise, helpful, and specific.',
          'If the user asks for plans or tasks, suggest a short, structured list.',
          'If you are unsure, ask a brief clarifying question.',
          GCLOUD_MCP_SERVER_URL
            ? 'When the user asks for Google Cloud environment state/actions, use the MCP tool and return concrete results from tool output. Do not ask for confirmation; tool access is already granted. The gcloud MCP tool run_gcloud accepts action values: run:services:list, projects:list, storage:buckets:list. For Cloud Run service listing, call run_gcloud with action run:services:list.'
            : '',
        ].join(' ');

        const input = [{ role: 'system', content: systemPrompt }, ...history];
        if (contextDocument) {
          input.unshift({
            role: 'system',
            content: [
              'Context document (use if relevant):',
              `Title: ${contextDocument.title}`,
              `Course: ${contextDocument.course || 'N/A'}`,
              `Subject: ${contextDocument.subject || 'N/A'}`,
              `Description: ${contextDocument.description || 'N/A'}`,
              `Filename: ${contextDocument.filename || 'N/A'}`,
              contextExcerpt ? `Excerpt: ${contextExcerpt}` : '',
            ].join('\n'),
          });
        }

        try {
          const requestBody = {
            model: getOpenAIModel(),
            input,
            max_output_tokens: 700,
          };
          if (GCLOUD_MCP_SERVER_URL) {
            const requireMcpTool = shouldRequireMcpTool(content);
            requestBody.tools = [
              {
                type: 'mcp',
                server_label: 'gcloud',
                server_url: GCLOUD_MCP_SERVER_URL,
                require_approval: 'never',
              },
            ];
            requestBody.tool_choice = requireMcpTool ? 'required' : 'auto';
          }

          let outputText = '';
          try {
            outputText = await getOpenAIOutputText({
              openai,
              requestBody,
              streamToClient: streamRequested,
              onDelta: emitDelta,
            });
          } catch (error) {
            const hasMcpConfigured = Boolean(GCLOUD_MCP_SERVER_URL);
            if (!(hasMcpConfigured && isMcpToolError(error))) {
              throw error;
            }

            // Fallback keeps chat functional when MCP endpoint is unreachable/misconfigured.
            console.error('OpenAI MCP tool failed, retrying without MCP:', error?.message || error);
            outputText = await getOpenAIOutputText({
              openai,
              requestBody: {
                model: getOpenAIModel(),
                input,
              },
              streamToClient: streamRequested,
              onDelta: emitDelta,
            });
          }

          if (!outputText) {
            // Some runs can return tool-only output; force a plain-text retry.
            const fallbackInput = [
              { role: 'system', content: 'Reply in plain text only. Do not call tools.' },
              ...input,
            ];
            outputText = await getOpenAIOutputText({
              openai,
              requestBody: {
                model: getOpenAIModel(),
                input: fallbackInput,
                max_output_tokens: 700,
              },
              streamToClient: streamRequested,
              onDelta: emitDelta,
            });
          }

          if (outputText) {
            assistantText = outputText;
          } else {
            assistantText =
              'AI returned no text output for this request. Set OPENAI_MODEL to gpt-4.1-mini and retry.';
          }
        } catch (error) {
          console.error('OpenAI response failed:', error);
          if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
            assistantText =
              'Model access/config issue detected. Set OPENAI_MODEL to an available model (for example: gpt-4.1-mini).';
          }
        }
        }
      } else if (!hasOpenAIKey) {
        assistantText =
          'AI is not configured yet. Add OPENAI_API_KEY to enable responses. I can still store your conversation.';
      } else if (/not helpful|unsatisfied|confused|doesn\\'t help/i.test(content)) {
        assistantText =
          'I can suggest alternative documents or articles if you want. Tell me the topic or course.';
      }
    }

    if (streamRequested && !streamDeltaSent && assistantText) {
      emitDelta(assistantText);
    }

    const assistantMessage = {
      conversationId,
      userUid: req.user.uid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    await db.collection('ai_messages').insertOne(assistantMessage);

    if (streamRequested) {
      emitStreamEvent({
        type: 'meta',
        conversationTitle,
        proposalId,
        proposedTasks,
        createdTasks,
      });
      emitStreamEvent({ type: 'done' });
      res.end();
      return;
    }

    return res.json({
      ok: true,
      message: assistantMessage,
      proposedTasks,
      proposalId,
      createdTasks,
      conversationTitle,
    });
  } catch (error) {
    console.error('Message create failed:', error);
    if (streamRequested) {
      writeNdjsonEvent(res, {
        type: 'error',
        message: 'Unable to add message.',
      });
      res.end();
      return;
    }
    return res.status(500).json({ ok: false, message: 'Unable to add message.' });
  }
});

router.post('/api/personal/task-proposals/:id/confirm', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid proposal id.' });
  }
  try {
    const db = await getMongoDb();
    const proposalId = new ObjectId(id);
    const proposal = await db
      .collection('ai_task_proposals')
      .findOne({ _id: proposalId, userUid: req.user.uid, status: 'pending' });
    if (!proposal) {
      return res.status(404).json({ ok: false, message: 'Proposal not found.' });
    }

    const tasksToCreate = normalizeGeneratedTasks(proposal.tasks || []);
    const created = await createTasksForUser(db, req.user.uid, tasksToCreate);
    await db.collection('ai_task_proposals').updateOne(
      { _id: proposalId },
      { $set: { status: 'accepted', decidedAt: new Date(), updatedAt: new Date() } }
    );
    return res.json({ ok: true, created: created.length });
  } catch (error) {
    console.error('Proposal confirm failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to confirm proposal.' });
  }
});

router.post('/api/personal/task-proposals/:id/reject', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid proposal id.' });
  }
  try {
    const db = await getMongoDb();
    const proposalId = new ObjectId(id);
    await db.collection('ai_task_proposals').updateOne(
      { _id: proposalId, userUid: req.user.uid },
      { $set: { status: 'rejected', decidedAt: new Date() } }
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Proposal reject failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reject proposal.' });
  }
});

module.exports = router;
