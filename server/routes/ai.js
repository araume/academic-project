const path = require('path');
const express = require('express');
const { ObjectId } = require('mongodb');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const { getMongoDb } = require('../db/mongo');
const requireAuthApi = require('../middleware/requireAuthApi');
const { downloadFromStorage } = require('../services/storage');
const { getOpenAIClient, getOpenAIModel } = require('../services/openaiClient');
const {
  ensureAiGovernanceReady,
  logAiAuditEvent,
  incrementAiUsage,
  checkAiDailyQuota,
  recordContentScan,
  recordRoomSummary,
  listAiUsageSummary,
} = require('../services/aiGovernanceService');
const { getPlatformRole } = require('../services/roleAccess');
const { invokeGcloudMcp, isAllowedMcpAction, ALLOWED_MCP_ACTIONS } = require('../services/mcpService');
const {
  isAiScanEnabled,
  isRoomAiSummaryEnabled,
  isGcloudMcpEnabled,
  AI_RUNTIME_FEATURE_KEYS,
  normalizeFeatureKey,
  listFeatureFlagStates,
  setFeatureFlagOverride,
} = require('../services/featureFlags');

const router = express.Router();
const DEFAULT_AI_SCAN_DAILY_LIMIT = 20;
const DEFAULT_ROOM_SUMMARY_DAILY_LIMIT = 8;
const DEFAULT_MCP_DAILY_LIMIT = 20;
const MAX_SCAN_TEXT_CHARS = 10000;
const MAX_ROOM_TRANSCRIPT_CHARS = 24000;

router.use('/api/ai', requireAuthApi);
router.use('/api/admin/ai-usage', requireAuthApi);
router.use('/api/admin/ai-features', requireAuthApi);

router.use(['/api/ai', '/api/admin/ai-usage'], async (req, res, next) => {
  try {
    await ensureAiGovernanceReady();
    return next();
  } catch (error) {
    console.error('AI governance bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'AI governance service not available.' });
  }
});

function sanitizeText(value, maxLen = 600) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return false;
}

function normalizeCourseName(value) {
  return sanitizeText(value, 160).toLowerCase();
}

function isOwnerOrAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

function truncateText(value, maxChars) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars).trim()}...` : text;
}

function getFileExtension(filenameOrPath) {
  if (!filenameOrPath) return '';
  const normalized = String(filenameOrPath).split('?')[0].split('#')[0];
  return path.extname(normalized).toLowerCase();
}

function extractOpenAiText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const chunks = [];
  output.forEach((item) => {
    const contentItems = Array.isArray(item && item.content) ? item.content : [];
    contentItems.forEach((content) => {
      const text = typeof content && typeof content.text === 'string' ? content.text.trim() : '';
      if (text) chunks.push(text);
    });
  });
  return chunks.join('\n\n').trim();
}

function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // continue
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (_error) {
      // continue
    }
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    } catch (_error) {
      // continue
    }
  }

  return null;
}

function normalizeRiskLevel(value) {
  const normalized = sanitizeText(value, 20).toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(normalized)) {
    return normalized;
  }
  return 'unknown';
}

async function getViewer(uid, client = pool) {
  const result = await client.query(
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

async function ensureViewerOrReject(req, res, client = pool) {
  const viewer = await getViewer(req.user.uid, client);
  if (!viewer) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return null;
  }
  if (viewer.is_banned === true) {
    res.status(403).json({ ok: false, message: 'Account is banned.' });
    return null;
  }
  return viewer;
}

async function loadDocumentForScan(viewer, targetId, client = pool) {
  const result = await client.query(
    `SELECT
      id,
      uuid::text AS uuid,
      title,
      description,
      course,
      subject,
      visibility,
      uploader_uid,
      link,
      filename,
      COALESCE(is_restricted, false) AS is_restricted
     FROM documents
     WHERE uuid::text = $1
        OR id::text = $1
     LIMIT 1`,
    [targetId]
  );
  const row = result.rows[0] || null;
  if (!row) return { allowed: false, reason: 'Document not found.', code: 404 };
  if (row.is_restricted === true) {
    return { allowed: false, reason: 'Document is restricted.', code: 403 };
  }

  const role = getPlatformRole(viewer);
  const isPrivileged = isOwnerOrAdminRole(role);
  const sameCourse = normalizeCourseName(viewer.course) && normalizeCourseName(viewer.course) === normalizeCourseName(row.course);
  const isOwner = row.uploader_uid === viewer.uid;
  const visibility = sanitizeText(row.visibility, 40).toLowerCase() || 'public';
  const canAccess =
    isPrivileged ||
    isOwner ||
    visibility === 'public' ||
    ((visibility === 'private' || visibility === 'course_exclusive') && sameCourse);
  if (!canAccess) {
    return { allowed: false, reason: 'You do not have access to this document.', code: 403 };
  }

  let extractedText = '';
  if (row.link && !row.link.startsWith('http')) {
    try {
      const buffer = await downloadFromStorage(row.link);
      if (buffer && buffer.length && buffer.length <= 6 * 1024 * 1024) {
        const ext = getFileExtension(row.filename || row.link);
        if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
          extractedText = truncateText(buffer.toString('utf8'), 6000);
        } else if (ext === '.pdf') {
          const parsed = await pdfParse(buffer);
          extractedText = truncateText(parsed && parsed.text ? parsed.text : '', 6000);
        }
      }
    } catch (error) {
      extractedText = '';
    }
  }

  const combined = [
    `Title: ${row.title || ''}`,
    `Description: ${row.description || ''}`,
    `Course: ${row.course || ''}`,
    `Subject: ${row.subject || ''}`,
    extractedText ? `Document excerpt:\n${extractedText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    allowed: true,
    targetType: 'document',
    targetId: row.uuid || String(row.id),
    content: truncateText(combined, MAX_SCAN_TEXT_CHARS),
    metadata: {
      documentUuid: row.uuid || null,
      documentId: row.id ? Number(row.id) : null,
      visibility,
    },
  };
}

async function loadPostForScan(viewer, targetId) {
  let objectId = null;
  try {
    objectId = new ObjectId(targetId);
  } catch (_error) {
    return { allowed: false, reason: 'Invalid post id.', code: 400 };
  }

  const db = await getMongoDb();
  const posts = db.collection('posts');
  const post = await posts.findOne({ _id: objectId });
  if (!post) {
    return { allowed: false, reason: 'Post not found.', code: 404 };
  }
  if (post.moderationStatus === 'restricted') {
    return { allowed: false, reason: 'Post is restricted.', code: 403 };
  }

  const role = getPlatformRole(viewer);
  const isPrivileged = isOwnerOrAdminRole(role);
  const visibility = sanitizeText(post.visibility || 'public', 40).toLowerCase() || 'public';
  const sameCourse =
    normalizeCourseName(viewer.course) &&
    normalizeCourseName(viewer.course) === normalizeCourseName(post.course);
  const isOwner = sanitizeText(post.uploaderUid, 120) === sanitizeText(viewer.uid, 120);
  const canAccess =
    isPrivileged ||
    isOwner ||
    visibility === 'public' ||
    ((visibility === 'private' || visibility === 'course_exclusive') && sameCourse);
  if (!canAccess) {
    return { allowed: false, reason: 'You do not have access to this post.', code: 403 };
  }

  const combined = [
    `Title: ${post.title || ''}`,
    `Content: ${post.content || ''}`,
    `Course: ${post.course || ''}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    allowed: true,
    targetType: 'post',
    targetId: String(post._id),
    content: truncateText(combined, MAX_SCAN_TEXT_CHARS),
    metadata: {
      visibility,
      course: post.course || '',
    },
  };
}

async function runContentScanWithOpenAi(content) {
  const openAiClient = await getOpenAIClient();
  if (!openAiClient) {
    const error = new Error('AI is not configured. Set OPENAI_API_KEY.');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }
  const model = getOpenAIModel();
  const prompt = [
    'Analyze the following user-generated content for irregularities and safety risk.',
    'Return STRICT JSON with this shape:',
    '{"riskLevel":"low|medium|high|critical","riskScore":0-100,"flags":["..."],"summary":"...","recommendedAction":"none|review|restrict"}',
    'Do not include markdown fences.',
    '',
    content,
  ].join('\n');

  const response = await openAiClient.responses.create({
    model,
    input: prompt,
    max_output_tokens: 900,
  });
  const text = extractOpenAiText(response);
  const parsed = extractJsonFromText(text) || {};
  const riskLevel = normalizeRiskLevel(parsed.riskLevel || parsed.level || parsed.risk || '');
  const scoreRaw = Number(parsed.riskScore);
  const riskScore = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : null;
  const flags = Array.isArray(parsed.flags)
    ? parsed.flags.map((flag) => sanitizeText(String(flag), 120)).filter(Boolean)
    : [];
  const summary = sanitizeText(parsed.summary || text, 2000);
  const recommendedAction = sanitizeText(parsed.recommendedAction || 'review', 40).toLowerCase();

  return {
    model,
    requestId: response && response.id ? response.id : null,
    rawText: text,
    parsed: {
      riskLevel,
      riskScore,
      flags,
      summary,
      recommendedAction: ['none', 'review', 'restrict'].includes(recommendedAction)
        ? recommendedAction
        : 'review',
    },
  };
}

async function runRoomSummaryWithOpenAi(transcript) {
  const openAiClient = await getOpenAIClient();
  if (!openAiClient) {
    const error = new Error('AI is not configured. Set OPENAI_API_KEY.');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }
  const model = getOpenAIModel();
  const prompt = [
    'Summarize this meeting transcript.',
    'Return STRICT JSON with this shape:',
    '{"summary":"...","keyPoints":["..."],"actionItems":["..."]}',
    'Do not include markdown fences.',
    '',
    transcript,
  ].join('\n');

  const response = await openAiClient.responses.create({
    model,
    input: prompt,
    max_output_tokens: 1300,
  });
  const text = extractOpenAiText(response);
  const parsed = extractJsonFromText(text) || {};
  const keyPoints = Array.isArray(parsed.keyPoints)
    ? parsed.keyPoints.map((item) => sanitizeText(String(item), 400)).filter(Boolean)
    : [];
  const actionItems = Array.isArray(parsed.actionItems)
    ? parsed.actionItems.map((item) => sanitizeText(String(item), 400)).filter(Boolean)
    : [];
  const summary = sanitizeText(parsed.summary || text, 6000);

  return {
    model,
    requestId: response && response.id ? response.id : null,
    rawText: text,
    parsed: {
      summary,
      keyPoints,
      actionItems,
    },
  };
}

async function loadRoomSummaryAccess(roomId, viewer, client = pool) {
  const roomResult = await client.query(
    `SELECT
      r.id,
      r.meet_id,
      r.meet_name,
      r.creator_uid,
      r.state,
      r.visibility,
      r.course_name,
      rp.status AS participant_status,
      rp.role AS participant_role
     FROM rooms r
     LEFT JOIN room_participants rp
       ON rp.room_id = r.id
      AND rp.user_uid = $2
     WHERE r.id = $1
     LIMIT 1`,
    [roomId, viewer.uid]
  );
  const room = roomResult.rows[0] || null;
  if (!room) return { allowed: false, statusCode: 404, message: 'Room not found.' };

  const role = getPlatformRole(viewer);
  const privileged = isOwnerOrAdminRole(role);
  const isCreator = room.creator_uid === viewer.uid;
  const wasParticipant = Boolean(room.participant_status);
  const allowed = privileged || isCreator || wasParticipant;
  if (!allowed) {
    return {
      allowed: false,
      statusCode: 403,
      message: 'Only participants or moderators can request room summary.',
    };
  }
  return {
    allowed: true,
    room,
  };
}

router.post('/api/ai/scan-content', async (req, res) => {
  if (!isAiScanEnabled()) {
    return res.status(404).json({ ok: false, message: 'AI scan feature is disabled.' });
  }
  const startedAt = Date.now();
  const targetType = sanitizeText(req.body && req.body.targetType, 40).toLowerCase();
  const targetId = sanitizeText(req.body && req.body.targetId, 240);
  if (!['post', 'document'].includes(targetType) || !targetId) {
    return res.status(400).json({ ok: false, message: 'targetType and targetId are required.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;

    const quota = await checkAiDailyQuota(
      {
        uid: viewer.uid,
        provider: 'openai',
        metricKey: 'scan_content',
        limit: Number(process.env.AI_SCAN_DAILY_LIMIT || DEFAULT_AI_SCAN_DAILY_LIMIT),
      },
      client
    );
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        message: `Daily AI scan limit reached (${quota.limit}).`,
      });
    }

    const context = targetType === 'document'
      ? await loadDocumentForScan(viewer, targetId, client)
      : await loadPostForScan(viewer, targetId);
    if (!context.allowed) {
      return res.status(context.code || 403).json({ ok: false, message: context.reason || 'Access denied.' });
    }
    if (!context.content) {
      return res.status(400).json({ ok: false, message: 'No analyzable content found.' });
    }

    const scanResult = await runContentScanWithOpenAi(context.content);
    const durationMs = Date.now() - startedAt;

    const record = await recordContentScan(
      {
        targetType: context.targetType,
        targetId: context.targetId,
        requestedByUid: viewer.uid,
        provider: 'openai',
        model: scanResult.model,
        riskLevel: scanResult.parsed.riskLevel,
        riskScore: scanResult.parsed.riskScore,
        result: {
          ...scanResult.parsed,
          rawText: scanResult.rawText,
          context: context.metadata || {},
        },
        excerpt: context.content,
        status: 'completed',
      },
      client
    );

    await Promise.all([
      incrementAiUsage(
        {
          uid: viewer.uid,
          provider: 'openai',
          metricKey: 'scan_content',
          callCount: 1,
          inputChars: context.content.length,
          outputChars: scanResult.rawText.length,
        },
        client
      ),
      logAiAuditEvent(
        {
          actorUid: viewer.uid,
          provider: 'openai',
          eventType: 'content_scan',
          scopeType: context.targetType,
          scopeId: context.targetId,
          status: 'success',
          model: scanResult.model,
          requestId: scanResult.requestId,
          inputChars: context.content.length,
          outputChars: scanResult.rawText.length,
          latencyMs: durationMs,
          metadata: {
            riskLevel: scanResult.parsed.riskLevel,
            riskScore: scanResult.parsed.riskScore,
            flags: scanResult.parsed.flags,
          },
        },
        client
      ),
    ]);

    return res.json({
      ok: true,
      scan: {
        id: record ? Number(record.id) : null,
        targetType: context.targetType,
        targetId: context.targetId,
        riskLevel: scanResult.parsed.riskLevel,
        riskScore: scanResult.parsed.riskScore,
        flags: scanResult.parsed.flags,
        summary: scanResult.parsed.summary,
        recommendedAction: scanResult.parsed.recommendedAction,
        createdAt: record ? record.created_at : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('AI content scan failed:', error);
    try {
      await logAiAuditEvent(
        {
          actorUid: req.user && req.user.uid ? req.user.uid : null,
          provider: 'openai',
          eventType: 'content_scan',
          scopeType: targetType || 'unknown',
          scopeId: targetId || null,
          status: 'error',
          model: getOpenAIModel(),
          metadata: {
            error: error && error.message ? error.message : 'Unknown error',
          },
        },
        client
      );
    } catch (_auditError) {
      // no-op
    }
    const statusCode = error && error.code === 'OPENAI_NOT_CONFIGURED' ? 503 : 500;
    return res.status(statusCode).json({
      ok: false,
      message: error && error.message ? error.message : 'Unable to run AI content scan.',
    });
  } finally {
    client.release();
  }
});

router.post('/api/rooms/:id/ai-summary', async (req, res) => {
  if (!isRoomAiSummaryEnabled()) {
    return res.status(404).json({ ok: false, message: 'Room AI summary feature is disabled.' });
  }
  const startedAt = Date.now();
  const roomId = parsePositiveInt(req.params.id);
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'Invalid room id.' });
  }

  const transcript = truncateText(String(req.body && req.body.transcript ? req.body.transcript : ''), MAX_ROOM_TRANSCRIPT_CHARS);
  const consentConfirmed = parseBoolean(req.body && req.body.consentConfirmed);
  if (!consentConfirmed) {
    return res.status(400).json({ ok: false, message: 'Participant consent is required for room summary.' });
  }
  if (!transcript || transcript.length < 40) {
    return res.status(400).json({ ok: false, message: 'Transcript must contain at least 40 characters.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;

    const access = await loadRoomSummaryAccess(roomId, viewer, client);
    if (!access.allowed) {
      return res.status(access.statusCode || 403).json({ ok: false, message: access.message || 'Access denied.' });
    }

    const quota = await checkAiDailyQuota(
      {
        uid: viewer.uid,
        provider: 'openai',
        metricKey: 'room_summary',
        limit: Number(process.env.ROOM_AI_SUMMARY_DAILY_LIMIT || DEFAULT_ROOM_SUMMARY_DAILY_LIMIT),
      },
      client
    );
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        message: `Daily room summary limit reached (${quota.limit}).`,
      });
    }

    const summaryResult = await runRoomSummaryWithOpenAi(transcript);
    const summaryText = [summaryResult.parsed.summary]
      .concat(summaryResult.parsed.actionItems && summaryResult.parsed.actionItems.length
        ? ['Action items:', ...summaryResult.parsed.actionItems.map((item) => `- ${item}`)]
        : [])
      .join('\n');

    const record = await recordRoomSummary(
      {
        roomId,
        requestedByUid: viewer.uid,
        provider: 'openai',
        model: summaryResult.model,
        summaryText,
        keypoints: summaryResult.parsed.keyPoints,
        transcriptExcerpt: transcript,
        consentSnapshot: {
          consentConfirmed: true,
          acceptedAt: new Date().toISOString(),
          requesterUid: viewer.uid,
        },
        status: 'completed',
      },
      client
    );

    const durationMs = Date.now() - startedAt;
    await Promise.all([
      incrementAiUsage(
        {
          uid: viewer.uid,
          provider: 'openai',
          metricKey: 'room_summary',
          callCount: 1,
          inputChars: transcript.length,
          outputChars: summaryResult.rawText.length,
        },
        client
      ),
      logAiAuditEvent(
        {
          actorUid: viewer.uid,
          provider: 'openai',
          eventType: 'room_summary',
          scopeType: 'room',
          scopeId: String(roomId),
          status: 'success',
          model: summaryResult.model,
          requestId: summaryResult.requestId,
          inputChars: transcript.length,
          outputChars: summaryResult.rawText.length,
          latencyMs: durationMs,
          metadata: {
            roomState: access.room.state,
            keyPointsCount: summaryResult.parsed.keyPoints.length,
          },
        },
        client
      ),
    ]);

    return res.json({
      ok: true,
      summary: {
        id: record ? Number(record.id) : null,
        roomId,
        summary: summaryResult.parsed.summary,
        keyPoints: summaryResult.parsed.keyPoints,
        actionItems: summaryResult.parsed.actionItems,
        createdAt: record ? record.created_at : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Room AI summary failed:', error);
    try {
      await logAiAuditEvent(
        {
          actorUid: req.user && req.user.uid ? req.user.uid : null,
          provider: 'openai',
          eventType: 'room_summary',
          scopeType: 'room',
          scopeId: String(roomId),
          status: 'error',
          model: getOpenAIModel(),
          metadata: { error: error && error.message ? error.message : 'Unknown error' },
        },
        client
      );
    } catch (_auditError) {
      // no-op
    }
    const statusCode = error && error.code === 'OPENAI_NOT_CONFIGURED' ? 503 : 500;
    return res.status(statusCode).json({
      ok: false,
      message: error && error.message ? error.message : 'Unable to generate room summary.',
    });
  } finally {
    client.release();
  }
});

router.post('/api/ai/mcp/run', async (req, res) => {
  if (!isGcloudMcpEnabled()) {
    return res.status(404).json({ ok: false, message: 'MCP integration feature is disabled.' });
  }
  const startedAt = Date.now();
  const action = sanitizeText(req.body && req.body.action, 80);
  const scopeType = sanitizeText(req.body && req.body.scopeType, 120) || 'global';
  const scopeId = sanitizeText(req.body && req.body.scopeId, 240) || null;

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    if (!(isOwnerOrAdminRole(role) || role === 'professor')) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin/professor can invoke MCP actions.' });
    }

    const quota = await checkAiDailyQuota(
      {
        uid: viewer.uid,
        provider: 'mcp',
        metricKey: 'mcp_run',
        limit: Number(process.env.MCP_DAILY_LIMIT || DEFAULT_MCP_DAILY_LIMIT),
      },
      client
    );
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        message: `Daily MCP invocation limit reached (${quota.limit}).`,
      });
    }

    if (!isAllowedMcpAction(action)) {
      await logAiAuditEvent(
        {
          actorUid: viewer.uid,
          provider: 'mcp',
          eventType: 'mcp_run',
          scopeType,
          scopeId,
          status: 'blocked',
          metadata: {
            action,
            allowedActions: ALLOWED_MCP_ACTIONS,
          },
        },
        client
      );
      return res.status(400).json({
        ok: false,
        message: 'Requested MCP action is not allowed.',
        allowedActions: ALLOWED_MCP_ACTIONS,
      });
    }

    const result = await invokeGcloudMcp({
      action,
      timeoutMs: Number(process.env.MCP_TIMEOUT_MS || 30000),
      retries: Number(process.env.MCP_RETRY_COUNT || 1),
    });
    const outputText = sanitizeText(result.rawOutput || '', 12000);

    await Promise.all([
      incrementAiUsage(
        {
          uid: viewer.uid,
          provider: 'mcp',
          metricKey: 'mcp_run',
          callCount: 1,
          inputChars: action.length,
          outputChars: outputText.length,
        },
        client
      ),
      logAiAuditEvent(
        {
          actorUid: viewer.uid,
          provider: 'mcp',
          eventType: 'mcp_run',
          scopeType,
          scopeId,
          status: 'success',
          model: result.model || null,
          requestId: result.responseId || null,
          inputChars: action.length,
          outputChars: outputText.length,
          latencyMs: Date.now() - startedAt,
          metadata: {
            action,
          },
        },
        client
      ),
    ]);

    return res.json({
      ok: true,
      action,
      result: result.parsedOutput || result.rawOutput,
      rawOutput: result.rawOutput,
      source: 'openai-mcp',
    });
  } catch (error) {
    console.error('MCP invocation failed:', error);
    try {
      await logAiAuditEvent(
        {
          actorUid: req.user && req.user.uid ? req.user.uid : null,
          provider: 'mcp',
          eventType: 'mcp_run',
          scopeType,
          scopeId,
          status: 'error',
          metadata: {
            action,
            error: error && error.message ? error.message : 'Unknown error',
          },
        },
        client
      );
    } catch (_auditError) {
      // no-op
    }

    const code = String(error && error.code ? error.code : '');
    const statusCode = code === 'MCP_ACTION_BLOCKED'
      ? 400
      : code === 'MCP_NOT_CONFIGURED' || code === 'OPENAI_NOT_CONFIGURED'
        ? 503
        : 502;

    return res.status(statusCode).json({
      ok: false,
      message: error && error.message ? error.message : 'MCP invocation failed.',
      fallback: 'manual',
    });
  } finally {
    client.release();
  }
});

router.get('/api/admin/ai-usage', async (req, res) => {
  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    if (!isOwnerOrAdminRole(role)) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can access AI usage metrics.' });
    }

    const days = parsePositiveInt(req.query.days) || 14;
    const summary = await listAiUsageSummary({ days, limit: 300 }, client);
    return res.json({
      ok: true,
      days: summary.days,
      dailyUsage: summary.dailyUsage,
      recentEvents: summary.recentEvents,
    });
  } catch (error) {
    console.error('Admin AI usage fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load AI usage metrics.' });
  } finally {
    client.release();
  }
});

router.get('/api/admin/ai-features', async (req, res) => {
  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    if (!isOwnerOrAdminRole(role)) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can access AI feature settings.' });
    }

    const features = await listFeatureFlagStates({ keys: AI_RUNTIME_FEATURE_KEYS }, client);
    return res.json({ ok: true, features });
  } catch (error) {
    console.error('Admin AI feature list failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load AI feature settings.' });
  } finally {
    client.release();
  }
});

router.patch('/api/admin/ai-features', async (req, res) => {
  const updates = Array.isArray(req.body && req.body.features) ? req.body.features : [];
  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No feature updates provided.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    if (!isOwnerOrAdminRole(role)) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can update AI feature settings.' });
    }

    const normalizedUpdates = [];
    const seen = new Set();
    updates.forEach((item) => {
      const key = normalizeFeatureKey(item && item.key);
      if (!AI_RUNTIME_FEATURE_KEYS.includes(key) || seen.has(key)) {
        return;
      }
      seen.add(key);
      normalizedUpdates.push({
        key,
        enabled: item && item.enabled === true,
      });
    });
    if (!normalizedUpdates.length) {
      return res.status(400).json({ ok: false, message: 'No valid AI feature updates were provided.' });
    }

    await client.query('BEGIN');
    for (const update of normalizedUpdates) {
      await setFeatureFlagOverride(update.key, update.enabled, viewer.uid, client);
    }
    await client.query('COMMIT');

    const features = await listFeatureFlagStates({ keys: AI_RUNTIME_FEATURE_KEYS }, client);
    return res.json({ ok: true, features });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // no-op
    }
    console.error('Admin AI feature update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update AI feature settings.' });
  } finally {
    client.release();
  }
});

module.exports = router;
