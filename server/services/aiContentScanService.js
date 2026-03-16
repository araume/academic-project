const path = require('path');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const { getOpenAIClient, getOpenAIModel } = require('./openaiClient');
const { isAiScanEnabled } = require('./featureFlags');
const {
  ensureAiGovernanceReady,
  recordContentScan,
  logAiAuditEvent,
  incrementAiUsage,
} = require('./aiGovernanceService');

const MAX_SCAN_TEXT_CHARS = 10000;
const MAX_DOC_EXCERPT_BYTES = 8 * 1024 * 1024;
const MAX_DOC_EXCERPT_CHARS = 6000;

function sanitizeText(value, maxLen = 600) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
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

function toSafeScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
}

function isInappropriateScan(scanResult) {
  if (!scanResult || !scanResult.parsed) return false;
  const riskLevel = normalizeRiskLevel(scanResult.parsed.riskLevel);
  const riskScore = toSafeScore(scanResult.parsed.riskScore);
  const recommendedAction = sanitizeText(scanResult.parsed.recommendedAction, 40).toLowerCase();

  if (recommendedAction === 'restrict') return true;
  if (riskLevel === 'critical' || riskLevel === 'high') return true;
  if (recommendedAction === 'review' && (riskLevel === 'medium' || riskLevel === 'high' || riskLevel === 'critical')) {
    return true;
  }
  if (riskScore !== null && riskScore >= 70) return true;
  return false;
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
  const riskScore = toSafeScore(parsed.riskScore);
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

async function extractDocumentExcerptForScan({ buffer, filename, mimeType } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) return '';
  if (buffer.length <= 0 || buffer.length > MAX_DOC_EXCERPT_BYTES) return '';

  const ext = getFileExtension(filename);
  const normalizedMime = sanitizeText(mimeType, 120).toLowerCase();
  try {
    if (ext === '.txt' || ext === '.md' || ext === '.markdown' || normalizedMime.startsWith('text/')) {
      return truncateText(buffer.toString('utf8'), MAX_DOC_EXCERPT_CHARS);
    }
    if (ext === '.pdf' || normalizedMime === 'application/pdf') {
      const parsed = await pdfParse(buffer);
      return truncateText(parsed && parsed.text ? parsed.text : '', MAX_DOC_EXCERPT_CHARS);
    }
  } catch (_error) {
    return '';
  }
  return '';
}

async function autoScanIncomingContent({
  targetType,
  targetId,
  requestedByUid = null,
  content,
  metadata = {},
  client = pool,
} = {}) {
  if (!isAiScanEnabled()) {
    return { ok: false, skipped: true, reason: 'feature_disabled' };
  }

  const safeTargetType = sanitizeText(targetType, 40).toLowerCase();
  const safeTargetId = sanitizeText(targetId, 240);
  const safeRequestedByUid = sanitizeText(requestedByUid, 120) || null;
  const safeContent = truncateText(String(content || ''), MAX_SCAN_TEXT_CHARS);

  if (!safeTargetType || !safeTargetId) {
    return { ok: false, skipped: true, reason: 'invalid_target' };
  }
  if (!safeContent) {
    return { ok: false, skipped: true, reason: 'empty_content' };
  }

  await ensureAiGovernanceReady();

  const startedAt = Date.now();
  try {
    const scanResult = await runContentScanWithOpenAi(safeContent);
    const flagged = isInappropriateScan(scanResult);
    const record = await recordContentScan(
      {
        targetType: safeTargetType,
        targetId: safeTargetId,
        requestedByUid: safeRequestedByUid,
        provider: 'openai',
        model: scanResult.model,
        riskLevel: scanResult.parsed.riskLevel,
        riskScore: scanResult.parsed.riskScore,
        result: {
          ...scanResult.parsed,
          rawText: scanResult.rawText,
          context: metadata && typeof metadata === 'object' ? metadata : {},
          autoTriggered: true,
          flagged,
        },
        excerpt: safeContent,
        status: 'completed',
      },
      client
    );

    if (safeRequestedByUid) {
      await incrementAiUsage(
        {
          uid: safeRequestedByUid,
          provider: 'openai',
          metricKey: 'scan_content_auto',
          callCount: 1,
          inputChars: safeContent.length,
          outputChars: (scanResult.rawText || '').length,
        },
        client
      );
    }

    await logAiAuditEvent(
      {
        actorUid: safeRequestedByUid,
        provider: 'openai',
        eventType: 'content_scan_auto',
        scopeType: safeTargetType,
        scopeId: safeTargetId,
        status: 'success',
        model: scanResult.model,
        requestId: scanResult.requestId,
        inputChars: safeContent.length,
        outputChars: (scanResult.rawText || '').length,
        latencyMs: Date.now() - startedAt,
        metadata: {
          riskLevel: scanResult.parsed.riskLevel,
          riskScore: scanResult.parsed.riskScore,
          flags: scanResult.parsed.flags,
          recommendedAction: scanResult.parsed.recommendedAction,
          flagged,
        },
      },
      client
    );

    return {
      ok: true,
      flagged,
      scanId: record ? Number(record.id) : null,
      parsed: scanResult.parsed,
    };
  } catch (error) {
    try {
      await recordContentScan(
        {
          targetType: safeTargetType,
          targetId: safeTargetId,
          requestedByUid: safeRequestedByUid,
          provider: 'openai',
          model: getOpenAIModel(),
          riskLevel: 'unknown',
          riskScore: null,
          result: {
            autoTriggered: true,
            error: error && error.message ? error.message : 'Unknown scan failure',
            context: metadata && typeof metadata === 'object' ? metadata : {},
          },
          excerpt: safeContent,
          status: 'failed',
        },
        client
      );
    } catch (_recordError) {
      // no-op
    }

    try {
      await logAiAuditEvent(
        {
          actorUid: safeRequestedByUid,
          provider: 'openai',
          eventType: 'content_scan_auto',
          scopeType: safeTargetType,
          scopeId: safeTargetId,
          status: 'error',
          model: getOpenAIModel(),
          latencyMs: Date.now() - startedAt,
          metadata: {
            error: error && error.message ? error.message : 'Unknown scan failure',
          },
        },
        client
      );
    } catch (_auditError) {
      // no-op
    }

    return {
      ok: false,
      error: error && error.message ? error.message : 'Scan failed',
    };
  }
}

module.exports = {
  runContentScanWithOpenAi,
  extractDocumentExcerptForScan,
  isInappropriateScan,
  autoScanIncomingContent,
};
