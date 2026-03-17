const path = require('path');
const { ObjectId } = require('mongodb');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const { getMongoDb } = require('../db/mongo');
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
const CRITICAL_AUTO_MODERATION_REASON =
  'Automatically removed by AI moderation due to critical-risk content.';
const RISK_LEVEL_PRIORITY = Object.freeze({
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});
const AI_REPORT_SCORE_SCALE = Object.freeze([
  { label: 'low', min: 0, max: 29 },
  { label: 'medium', min: 30, max: 59 },
  { label: 'high', min: 60, max: 84 },
  { label: 'critical', min: 85, max: 100 },
]);

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

function deriveRiskLevelFromScore(score) {
  const safeScore = toSafeScore(score);
  if (safeScore === null) return 'unknown';
  if (safeScore >= 85) return 'critical';
  if (safeScore >= 60) return 'high';
  if (safeScore >= 30) return 'medium';
  return 'low';
}

function describeRiskScoreBand(score) {
  const label = deriveRiskLevelFromScore(score);
  const band = AI_REPORT_SCORE_SCALE.find((item) => item.label === label);
  if (!band) return null;
  return { ...band };
}

function pickHigherRiskLevel(...levels) {
  return levels
    .map((level) => normalizeRiskLevel(level))
    .reduce((best, current) => {
      return (RISK_LEVEL_PRIORITY[current] || 0) > (RISK_LEVEL_PRIORITY[best] || 0)
        ? current
        : best;
    }, 'unknown');
}

function normalizeRecommendedAction(value, riskLevel, riskScore) {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (['none', 'review', 'restrict'].includes(normalized)) {
    return normalized;
  }
  const effectiveRisk = pickHigherRiskLevel(riskLevel, deriveRiskLevelFromScore(riskScore));
  if (effectiveRisk === 'critical' || effectiveRisk === 'high') return 'restrict';
  if (effectiveRisk === 'medium') return 'review';
  return 'none';
}

async function restrictMainPostById(postIdValue, reason) {
  if (!postIdValue || !ObjectId.isValid(postIdValue)) return null;
  const postId = new ObjectId(postIdValue);
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const post = await postsCollection.findOne(
    { _id: postId },
    { projection: { _id: 1, title: 1, uploaderUid: 1, course: 1, moderationStatus: 1 } }
  );
  if (!post) {
    return {
      applied: false,
      action: 'restrict_main_post',
      targetState: 'missing',
      message: 'Target post no longer exists.',
    };
  }
  await postsCollection.updateOne(
    { _id: postId },
    {
      $set: {
        moderationStatus: 'restricted',
        restrictedAt: new Date(),
        restrictedByUid: null,
        restrictedReason: sanitizeText(reason, 1000) || CRITICAL_AUTO_MODERATION_REASON,
      },
    }
  );
  return {
    applied: true,
    action: 'restrict_main_post',
    targetState: 'restricted',
    targetUid: post.uploaderUid || null,
    course: post.course || null,
    title: post.title || 'Untitled post',
  };
}

async function restrictDocumentByUuid(uuidValue, reason, client = pool) {
  const uuid = sanitizeText(uuidValue, 120);
  if (!uuid) return null;
  const result = await client.query(
    `UPDATE documents
     SET
       is_restricted = true,
       restricted_at = NOW(),
       restricted_by_uid = NULL,
       restricted_reason = $2
     WHERE uuid::text = $1
     RETURNING uuid::text AS uuid, title, uploader_uid, course`,
    [uuid, sanitizeText(reason, 1000) || CRITICAL_AUTO_MODERATION_REASON]
  );
  if (!result.rows.length) {
    return {
      applied: false,
      action: 'restrict_document',
      targetState: 'missing',
      message: 'Target document no longer exists.',
    };
  }
  const row = result.rows[0];
  return {
    applied: true,
    action: 'restrict_document',
    targetState: 'restricted',
    targetUid: row.uploader_uid || null,
    course: row.course || null,
    title: row.title || 'Untitled document',
  };
}

async function takeDownSubjectPostById(postIdValue, reason, client = pool) {
  const postId = Number(postIdValue);
  if (!Number.isInteger(postId) || postId <= 0) return null;
  const result = await client.query(
    `UPDATE subject_posts sp
     SET
       status = 'taken_down',
       taken_down_by_uid = NULL,
       taken_down_reason = $2,
       updated_at = NOW()
     FROM subjects s
     WHERE sp.id = $1
       AND sp.subject_id = s.id
     RETURNING sp.id, sp.author_uid, sp.title, s.course_name, s.subject_name`,
    [postId, sanitizeText(reason, 1000) || CRITICAL_AUTO_MODERATION_REASON]
  );
  if (!result.rows.length) {
    return {
      applied: false,
      action: 'take_down_subject_post',
      targetState: 'missing',
      message: 'Target subject post no longer exists.',
    };
  }
  const row = result.rows[0];
  return {
    applied: true,
    action: 'take_down_subject_post',
    targetState: 'taken_down',
    targetUid: row.author_uid || null,
    course: row.course_name || null,
    title: row.title || row.subject_name || 'Unit post',
  };
}

async function applyCriticalAutoModeration({ targetType, targetId, client = pool } = {}) {
  const safeTargetType = sanitizeText(targetType, 40).toLowerCase();
  const safeTargetId = sanitizeText(targetId, 240);
  if (!safeTargetType || !safeTargetId) {
    return {
      triggered: true,
      applied: false,
      policy: 'critical_auto_takedown',
      action: 'none',
      targetState: 'invalid_target',
      reason: CRITICAL_AUTO_MODERATION_REASON,
      appliedAt: new Date().toISOString(),
    };
  }

  let outcome = null;
  if (safeTargetType === 'post') {
    outcome = await restrictMainPostById(safeTargetId, CRITICAL_AUTO_MODERATION_REASON);
  } else if (safeTargetType === 'document') {
    outcome = await restrictDocumentByUuid(safeTargetId, CRITICAL_AUTO_MODERATION_REASON, client);
  } else if (safeTargetType === 'subject_post') {
    outcome = await takeDownSubjectPostById(safeTargetId, CRITICAL_AUTO_MODERATION_REASON, client);
  }

  if (!outcome) {
    return {
      triggered: true,
      applied: false,
      policy: 'critical_auto_takedown',
      action: 'none',
      targetState: 'unsupported_target',
      reason: CRITICAL_AUTO_MODERATION_REASON,
      appliedAt: new Date().toISOString(),
    };
  }

  return {
    triggered: true,
    applied: outcome.applied === true,
    policy: 'critical_auto_takedown',
    action: outcome.action || 'none',
    targetState: outcome.targetState || null,
    targetUid: outcome.targetUid || null,
    course: outcome.course || null,
    title: outcome.title || null,
    reason: CRITICAL_AUTO_MODERATION_REASON,
    message: outcome.message || null,
    appliedAt: new Date().toISOString(),
  };
}

function isInappropriateScan(scanResult) {
  if (!scanResult || !scanResult.parsed) return false;
  const riskScore = toSafeScore(scanResult.parsed.riskScore);
  const riskLevel = pickHigherRiskLevel(
    scanResult.parsed.riskLevel,
    deriveRiskLevelFromScore(riskScore)
  );
  const recommendedAction = normalizeRecommendedAction(
    scanResult.parsed.recommendedAction,
    riskLevel,
    riskScore
  );

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
  const riskScore = toSafeScore(parsed.riskScore);
  const rawRiskLevel = normalizeRiskLevel(parsed.riskLevel || parsed.level || parsed.risk || '');
  const scoreBand = describeRiskScoreBand(riskScore);
  const riskLevel = pickHigherRiskLevel(rawRiskLevel, scoreBand ? scoreBand.label : 'unknown');
  const flags = Array.isArray(parsed.flags)
    ? parsed.flags.map((flag) => sanitizeText(String(flag), 120)).filter(Boolean)
    : [];
  const summary = sanitizeText(parsed.summary || text, 2000);
  const recommendedAction = normalizeRecommendedAction(parsed.recommendedAction, riskLevel, riskScore);

  return {
    model,
    requestId: response && response.id ? response.id : null,
    rawText: text,
    parsed: {
      riskLevel,
      riskScore,
      rawRiskLevel,
      scoreBand,
      scoreScale: AI_REPORT_SCORE_SCALE,
      flags,
      summary,
      recommendedAction,
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
    const resultPayload = {
      ...scanResult.parsed,
      rawText: scanResult.rawText,
      context: metadata && typeof metadata === 'object' ? metadata : {},
      autoTriggered: true,
      flagged,
    };
    const record = await recordContentScan(
      {
        targetType: safeTargetType,
        targetId: safeTargetId,
        requestedByUid: safeRequestedByUid,
        provider: 'openai',
        model: scanResult.model,
        riskLevel: scanResult.parsed.riskLevel,
        riskScore: scanResult.parsed.riskScore,
        result: resultPayload,
        excerpt: safeContent,
        status: 'completed',
      },
      client
    );

    let autoModeration = null;
    if (scanResult.parsed.riskLevel === 'critical' && record && record.id) {
      try {
        autoModeration = await applyCriticalAutoModeration({
          targetType: safeTargetType,
          targetId: safeTargetId,
          client,
        });
        resultPayload.autoModeration = autoModeration;
        await client.query(
          `UPDATE ai_content_scans
           SET result = $2::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [Number(record.id), JSON.stringify(resultPayload)]
        );

        await logAiAuditEvent(
          {
            actorUid: safeRequestedByUid,
            provider: 'openai',
            eventType: 'content_scan_auto_moderated',
            scopeType: safeTargetType,
            scopeId: safeTargetId,
            status: autoModeration && autoModeration.applied ? 'blocked' : 'error',
            model: scanResult.model,
            requestId: scanResult.requestId,
            inputChars: safeContent.length,
            outputChars: (scanResult.rawText || '').length,
            latencyMs: Date.now() - startedAt,
            metadata: autoModeration || {},
          },
          client
        );
      } catch (autoModerationError) {
        resultPayload.autoModeration = {
          triggered: true,
          applied: false,
          policy: 'critical_auto_takedown',
          action: 'none',
          targetState: 'auto_moderation_failed',
          reason: CRITICAL_AUTO_MODERATION_REASON,
          error: autoModerationError && autoModerationError.message ? autoModerationError.message : 'Unknown error',
          appliedAt: new Date().toISOString(),
        };
        await client.query(
          `UPDATE ai_content_scans
           SET result = $2::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [Number(record.id), JSON.stringify(resultPayload)]
        );
      }
    }

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
      autoModeration,
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
