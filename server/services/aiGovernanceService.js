const pool = require('../db/pool');

let ensureAiGovernancePromise = null;

function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function toPositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function usageDateToday() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureAiGovernanceTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS ai_audit_events (
      id BIGSERIAL PRIMARY KEY,
      actor_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      provider TEXT NOT NULL CHECK (provider IN ('openai', 'mcp')),
      event_type TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'blocked', 'error')),
      model TEXT,
      request_id TEXT,
      input_chars INTEGER NOT NULL DEFAULT 0,
      output_chars INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_usage_daily (
      id BIGSERIAL PRIMARY KEY,
      usage_date DATE NOT NULL,
      uid TEXT REFERENCES accounts(uid) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('openai', 'mcp')),
      metric_key TEXT NOT NULL,
      call_count INTEGER NOT NULL DEFAULT 0,
      input_chars INTEGER NOT NULL DEFAULT 0,
      output_chars INTEGER NOT NULL DEFAULT 0,
      last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (usage_date, uid, provider, metric_key)
    );

    CREATE TABLE IF NOT EXISTS ai_content_scans (
      id BIGSERIAL PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('post', 'subject_post', 'document')),
      target_id TEXT NOT NULL,
      requested_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai')),
      model TEXT,
      risk_level TEXT NOT NULL DEFAULT 'unknown'
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical', 'unknown')),
      risk_score NUMERIC(5,2),
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      excerpt TEXT,
      status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'failed', 'skipped')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE ai_content_scans
      DROP CONSTRAINT IF EXISTS ai_content_scans_target_type_check;
    ALTER TABLE ai_content_scans
      ADD CONSTRAINT ai_content_scans_target_type_check
      CHECK (target_type IN ('post', 'subject_post', 'document'));

    CREATE TABLE IF NOT EXISTS room_ai_summaries (
      id BIGSERIAL PRIMARY KEY,
      room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      requested_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai')),
      model TEXT,
      summary_text TEXT,
      keypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
      transcript_excerpt TEXT,
      consent_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ai_audit_events_actor_created_idx
      ON ai_audit_events(actor_uid, created_at DESC);
    CREATE INDEX IF NOT EXISTS ai_audit_events_scope_created_idx
      ON ai_audit_events(scope_type, scope_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ai_audit_events_provider_status_idx
      ON ai_audit_events(provider, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS ai_usage_daily_uid_date_idx
      ON ai_usage_daily(uid, usage_date DESC);
    CREATE INDEX IF NOT EXISTS ai_usage_daily_provider_metric_idx
      ON ai_usage_daily(provider, metric_key, usage_date DESC);

    CREATE INDEX IF NOT EXISTS ai_content_scans_target_created_idx
      ON ai_content_scans(target_type, target_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ai_content_scans_status_created_idx
      ON ai_content_scans(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS room_ai_summaries_room_created_idx
      ON room_ai_summaries(room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS room_ai_summaries_requester_created_idx
      ON room_ai_summaries(requested_by_uid, created_at DESC);
  `;
  await pool.query(sql);
}

async function ensureAiGovernanceReady() {
  if (!ensureAiGovernancePromise) {
    ensureAiGovernancePromise = ensureAiGovernanceTables().catch((error) => {
      ensureAiGovernancePromise = null;
      throw error;
    });
  }
  await ensureAiGovernancePromise;
}

async function logAiAuditEvent(payload = {}, client = pool) {
  const actorUid = sanitizeText(payload.actorUid, 120) || null;
  const provider = sanitizeText(payload.provider, 40).toLowerCase() || 'openai';
  const eventType = sanitizeText(payload.eventType, 120) || 'unknown_event';
  const scopeType = sanitizeText(payload.scopeType, 120) || 'unknown_scope';
  const scopeId = sanitizeText(payload.scopeId, 300) || null;
  const status = sanitizeText(payload.status, 40).toLowerCase() || 'success';
  const model = sanitizeText(payload.model, 120) || null;
  const requestId = sanitizeText(payload.requestId, 160) || null;
  const inputChars = toPositiveInt(payload.inputChars, 0);
  const outputChars = toPositiveInt(payload.outputChars, 0);
  const latencyMs = toPositiveInt(payload.latencyMs, 0) || null;
  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};

  await client.query(
    `INSERT INTO ai_audit_events
      (actor_uid, provider, event_type, scope_type, scope_id, status, model, request_id, input_chars, output_chars, latency_ms, metadata, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())`,
    [
      actorUid,
      provider,
      eventType,
      scopeType,
      scopeId,
      status,
      model,
      requestId,
      inputChars,
      outputChars,
      latencyMs,
      JSON.stringify(metadata),
    ]
  );
}

async function incrementAiUsage(payload = {}, client = pool) {
  const usageDate = sanitizeText(payload.usageDate, 20) || usageDateToday();
  const uid = sanitizeText(payload.uid, 120);
  const provider = sanitizeText(payload.provider, 40).toLowerCase() || 'openai';
  const metricKey = sanitizeText(payload.metricKey, 120) || 'general';
  const callCount = Math.max(1, toPositiveInt(payload.callCount, 1));
  const inputChars = toPositiveInt(payload.inputChars, 0);
  const outputChars = toPositiveInt(payload.outputChars, 0);

  if (!uid) return;

  await client.query(
    `INSERT INTO ai_usage_daily
      (usage_date, uid, provider, metric_key, call_count, input_chars, output_chars, last_event_at)
     VALUES
      ($1::date, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (usage_date, uid, provider, metric_key)
     DO UPDATE SET
       call_count = ai_usage_daily.call_count + EXCLUDED.call_count,
       input_chars = ai_usage_daily.input_chars + EXCLUDED.input_chars,
       output_chars = ai_usage_daily.output_chars + EXCLUDED.output_chars,
       last_event_at = NOW()`,
    [usageDate, uid, provider, metricKey, callCount, inputChars, outputChars]
  );
}

async function getDailyUsageCount(payload = {}, client = pool) {
  const usageDate = sanitizeText(payload.usageDate, 20) || usageDateToday();
  const uid = sanitizeText(payload.uid, 120);
  const provider = sanitizeText(payload.provider, 40).toLowerCase() || 'openai';
  const metricKey = sanitizeText(payload.metricKey, 120) || 'general';
  if (!uid) return 0;

  const result = await client.query(
    `SELECT call_count
     FROM ai_usage_daily
     WHERE usage_date = $1::date
       AND uid = $2
       AND provider = $3
       AND metric_key = $4
     LIMIT 1`,
    [usageDate, uid, provider, metricKey]
  );
  if (!result.rows.length) return 0;
  return toPositiveInt(result.rows[0].call_count, 0);
}

async function checkAiDailyQuota(payload = {}, client = pool) {
  const limit = toPositiveInt(payload.limit, 0);
  if (limit <= 0) {
    return { allowed: true, used: 0, limit: null };
  }
  const used = await getDailyUsageCount(payload, client);
  return {
    allowed: used < limit,
    used,
    limit,
  };
}

async function recordContentScan(payload = {}, client = pool) {
  const targetType = sanitizeText(payload.targetType, 30).toLowerCase() || 'post';
  const targetId = sanitizeText(payload.targetId, 240);
  const requestedByUid = sanitizeText(payload.requestedByUid, 120) || null;
  const provider = sanitizeText(payload.provider, 40).toLowerCase() || 'openai';
  const model = sanitizeText(payload.model, 120) || null;
  const riskLevel = sanitizeText(payload.riskLevel, 20).toLowerCase() || 'unknown';
  const riskScoreRaw = Number(payload.riskScore);
  const riskScore = Number.isFinite(riskScoreRaw) ? Math.max(0, Math.min(100, riskScoreRaw)) : null;
  const resultPayload = payload.result && typeof payload.result === 'object' ? payload.result : {};
  const excerpt = typeof payload.excerpt === 'string' ? payload.excerpt.slice(0, 12000) : null;
  const status = sanitizeText(payload.status, 20).toLowerCase() || 'completed';

  const result = await client.query(
    `INSERT INTO ai_content_scans
      (target_type, target_id, requested_by_uid, provider, model, risk_level, risk_score, result, excerpt, status, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, NOW(), NOW())
     RETURNING id, target_type, target_id, risk_level, risk_score, status, created_at`,
    [
      targetType,
      targetId,
      requestedByUid,
      provider,
      model,
      riskLevel,
      riskScore,
      JSON.stringify(resultPayload),
      excerpt,
      status,
    ]
  );
  return result.rows[0] || null;
}

async function recordRoomSummary(payload = {}, client = pool) {
  const roomId = toPositiveInt(payload.roomId, 0);
  const requestedByUid = sanitizeText(payload.requestedByUid, 120) || null;
  const provider = sanitizeText(payload.provider, 40).toLowerCase() || 'openai';
  const model = sanitizeText(payload.model, 120) || null;
  const summaryText = typeof payload.summaryText === 'string' ? payload.summaryText.slice(0, 12000) : null;
  const keypoints = Array.isArray(payload.keypoints) ? payload.keypoints : [];
  const transcriptExcerpt = typeof payload.transcriptExcerpt === 'string' ? payload.transcriptExcerpt.slice(0, 12000) : null;
  const consentSnapshot = payload.consentSnapshot && typeof payload.consentSnapshot === 'object'
    ? payload.consentSnapshot
    : {};
  const status = sanitizeText(payload.status, 20).toLowerCase() || 'completed';

  const result = await client.query(
    `INSERT INTO room_ai_summaries
      (room_id, requested_by_uid, provider, model, summary_text, keypoints, transcript_excerpt, consent_snapshot, status, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, NOW(), NOW())
     RETURNING id, room_id, status, created_at`,
    [
      roomId,
      requestedByUid,
      provider,
      model,
      summaryText,
      JSON.stringify(keypoints),
      transcriptExcerpt,
      JSON.stringify(consentSnapshot),
      status,
    ]
  );
  return result.rows[0] || null;
}

async function listAiUsageSummary(payload = {}, client = pool) {
  const days = Math.min(Math.max(toPositiveInt(payload.days, 14), 1), 60);
  const limit = Math.min(Math.max(toPositiveInt(payload.limit, 200), 1), 500);

  const [dailyUsageResult, recentEventsResult] = await Promise.all([
    client.query(
      `SELECT
        usage_date,
        uid,
        provider,
        metric_key,
        call_count,
        input_chars,
        output_chars,
        last_event_at
       FROM ai_usage_daily
       WHERE usage_date >= (CURRENT_DATE - $1::int + 1)
       ORDER BY usage_date DESC, provider ASC, metric_key ASC`,
      [days]
    ),
    client.query(
      `SELECT
        id,
        actor_uid,
        provider,
        event_type,
        scope_type,
        scope_id,
        status,
        model,
        request_id,
        input_chars,
        output_chars,
        latency_ms,
        metadata,
        created_at
       FROM ai_audit_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    ),
  ]);

  return {
    days,
    dailyUsage: dailyUsageResult.rows,
    recentEvents: recentEventsResult.rows,
  };
}

module.exports = {
  ensureAiGovernanceReady,
  logAiAuditEvent,
  incrementAiUsage,
  getDailyUsageCount,
  checkAiDailyQuota,
  recordContentScan,
  recordRoomSummary,
  listAiUsageSummary,
  usageDateToday,
};
