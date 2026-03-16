const pool = require('../db/pool');

function parseBooleanFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return Boolean(defaultValue);
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return Boolean(defaultValue);
}

const FEATURE_DEFINITIONS = Object.freeze({
  global_course_feed: {
    envVar: 'FEATURE_GLOBAL_COURSE_FEED',
    defaultValue: true,
    label: 'Global course feed',
  },
  subjects: {
    envVar: 'FEATURE_SUBJECTS',
    defaultValue: true,
    label: 'Subjects page',
  },
  unified_visibility: {
    envVar: 'FEATURE_UNIFIED_VISIBILITY',
    defaultValue: true,
    label: 'Unified visibility controls',
  },
  restricted_contents: {
    envVar: 'FEATURE_RESTRICTED_CONTENTS',
    defaultValue: true,
    label: 'Restricted content workflow',
  },
  admin_appeals: {
    envVar: 'FEATURE_ADMIN_APPEALS',
    defaultValue: true,
    label: 'Admin appeals',
  },
  admin_custom_notification: {
    envVar: 'FEATURE_ADMIN_CUSTOM_NOTIFICATION',
    defaultValue: true,
    label: 'Admin custom notifications',
  },
  workbench: {
    envVar: 'FEATURE_WORKBENCH',
    defaultValue: true,
    label: 'Repository',
  },
  taskboard: {
    envVar: 'FEATURE_TASKBOARD',
    defaultValue: true,
    label: 'Repository taskboard',
  },
  workbench_transfer: {
    envVar: 'FEATURE_WORKBENCH_TRANSFER',
    defaultValue: true,
    label: 'Repository ownership transfer',
  },
  ai_scan: {
    envVar: 'FEATURE_AI_SCAN',
    defaultValue: true,
    label: 'AI scan and repository AI notes',
  },
  room_ai_summary: {
    envVar: 'FEATURE_ROOM_AI_SUMMARY',
    defaultValue: false,
    label: 'Room AI summary',
  },
  gcloud_mcp: {
    envVar: 'FEATURE_GCLOUD_MCP',
    defaultValue: () => Boolean(String(process.env.GCLOUD_MCP_SERVER_URL || '').trim()),
    label: 'GCLOUD MCP bridge',
  },
});

const AI_RUNTIME_FEATURE_KEYS = Object.freeze(['ai_scan', 'room_ai_summary', 'gcloud_mcp']);

const runtimeOverrides = new Map();
let ensureFeatureOverridesTablePromise = null;
let loadRuntimeFeatureOverridesPromise = null;
let runtimeOverridesLoaded = false;

function normalizeFeatureKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_');
}

function isSupportedFeatureKey(featureKey) {
  const normalized = normalizeFeatureKey(featureKey);
  return Boolean(normalized && FEATURE_DEFINITIONS[normalized]);
}

function resolveEnvDefault(featureKey) {
  const normalized = normalizeFeatureKey(featureKey);
  const definition = FEATURE_DEFINITIONS[normalized];
  if (!definition) return false;
  const fallback =
    typeof definition.defaultValue === 'function' ? definition.defaultValue() : definition.defaultValue;
  return parseBooleanFlag(process.env[definition.envVar], fallback);
}

function getFeatureEnabled(featureKey) {
  const normalized = normalizeFeatureKey(featureKey);
  if (!normalized || !FEATURE_DEFINITIONS[normalized]) return false;
  if (runtimeOverrides.has(normalized)) {
    return runtimeOverrides.get(normalized) === true;
  }
  return resolveEnvDefault(normalized);
}

function getFeatureState(featureKey) {
  const normalized = normalizeFeatureKey(featureKey);
  if (!normalized || !FEATURE_DEFINITIONS[normalized]) {
    return null;
  }
  const defaultEnabled = resolveEnvDefault(normalized);
  const hasOverride = runtimeOverrides.has(normalized);
  const enabled = hasOverride ? runtimeOverrides.get(normalized) === true : defaultEnabled;
  return {
    key: normalized,
    label: FEATURE_DEFINITIONS[normalized].label,
    enabled,
    defaultEnabled,
    source: hasOverride ? 'admin_override' : 'env_default',
  };
}

async function ensureFeatureOverridesTable(client = pool) {
  if (!ensureFeatureOverridesTablePromise) {
    ensureFeatureOverridesTablePromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS platform_feature_overrides (
          feature_key TEXT PRIMARY KEY,
          enabled BOOLEAN NOT NULL,
          updated_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS platform_feature_overrides_updated_idx
          ON platform_feature_overrides(updated_at DESC);
      `);
    })().catch((error) => {
      ensureFeatureOverridesTablePromise = null;
      throw error;
    });
  }
  await ensureFeatureOverridesTablePromise;
}

async function loadRuntimeFeatureOverrides(client = pool) {
  if (!loadRuntimeFeatureOverridesPromise) {
    loadRuntimeFeatureOverridesPromise = (async () => {
      await ensureFeatureOverridesTable(client);
      const result = await client.query(
        `SELECT feature_key, enabled
         FROM platform_feature_overrides`
      );
      runtimeOverrides.clear();
      result.rows.forEach((row) => {
        const key = normalizeFeatureKey(row.feature_key);
        if (!FEATURE_DEFINITIONS[key]) return;
        runtimeOverrides.set(key, row.enabled === true);
      });
      runtimeOverridesLoaded = true;
      return runtimeOverrides.size;
    })().catch((error) => {
      loadRuntimeFeatureOverridesPromise = null;
      runtimeOverridesLoaded = false;
      throw error;
    });
  }
  return loadRuntimeFeatureOverridesPromise;
}

async function ensureRuntimeFeatureOverridesLoaded(client = pool) {
  if (runtimeOverridesLoaded) return;
  await loadRuntimeFeatureOverrides(client);
}

async function listFeatureFlagStates(options = {}, client = pool) {
  await ensureRuntimeFeatureOverridesLoaded(client);
  const requestedKeys = Array.isArray(options.keys)
    ? options.keys
        .map((value) => normalizeFeatureKey(value))
        .filter((value) => Boolean(value && FEATURE_DEFINITIONS[value]))
    : Object.keys(FEATURE_DEFINITIONS);
  return requestedKeys.map((key) => getFeatureState(key)).filter(Boolean);
}

async function setFeatureFlagOverride(featureKey, enabled, updatedByUid = null, client = pool) {
  const normalizedKey = normalizeFeatureKey(featureKey);
  if (!FEATURE_DEFINITIONS[normalizedKey]) {
    const error = new Error('Unsupported feature key.');
    error.code = 'UNSUPPORTED_FEATURE_KEY';
    throw error;
  }

  await ensureFeatureOverridesTable(client);
  const normalizedEnabled = enabled === true;
  const result = await client.query(
    `INSERT INTO platform_feature_overrides
      (feature_key, enabled, updated_by_uid, updated_at)
     VALUES
      ($1, $2, $3, NOW())
     ON CONFLICT (feature_key)
     DO UPDATE SET
      enabled = EXCLUDED.enabled,
      updated_by_uid = EXCLUDED.updated_by_uid,
      updated_at = NOW()
     RETURNING feature_key, enabled, updated_by_uid, updated_at`,
    [normalizedKey, normalizedEnabled, updatedByUid || null]
  );

  runtimeOverrides.set(normalizedKey, normalizedEnabled);
  runtimeOverridesLoaded = true;
  const row = result.rows[0] || null;
  const state = getFeatureState(normalizedKey);
  return {
    ...(state || { key: normalizedKey, enabled: normalizedEnabled }),
    updatedByUid: row ? row.updated_by_uid || null : updatedByUid || null,
    updatedAt: row ? row.updated_at : null,
  };
}

function isGlobalCourseFeedEnabled() {
  return getFeatureEnabled('global_course_feed');
}

function isSubjectsEnabled() {
  return getFeatureEnabled('subjects');
}

function isUnifiedVisibilityEnabled() {
  return getFeatureEnabled('unified_visibility');
}

function isRestrictedContentsEnabled() {
  return getFeatureEnabled('restricted_contents');
}

function isAdminAppealsEnabled() {
  return getFeatureEnabled('admin_appeals');
}

function isAdminCustomNotificationEnabled() {
  return getFeatureEnabled('admin_custom_notification');
}

function isWorkbenchEnabled() {
  return getFeatureEnabled('workbench');
}

function isTaskboardEnabled() {
  return getFeatureEnabled('taskboard');
}

function isWorkbenchTransferEnabled() {
  return getFeatureEnabled('workbench_transfer');
}

function isAiScanEnabled() {
  return getFeatureEnabled('ai_scan');
}

function isRoomAiSummaryEnabled() {
  return getFeatureEnabled('room_ai_summary');
}

function isGcloudMcpEnabled() {
  return getFeatureEnabled('gcloud_mcp');
}

module.exports = {
  FEATURE_DEFINITIONS,
  AI_RUNTIME_FEATURE_KEYS,
  parseBooleanFlag,
  normalizeFeatureKey,
  isSupportedFeatureKey,
  resolveEnvDefault,
  getFeatureEnabled,
  getFeatureState,
  ensureFeatureOverridesTable,
  loadRuntimeFeatureOverrides,
  ensureRuntimeFeatureOverridesLoaded,
  listFeatureFlagStates,
  setFeatureFlagOverride,
  isGlobalCourseFeedEnabled,
  isSubjectsEnabled,
  isUnifiedVisibilityEnabled,
  isRestrictedContentsEnabled,
  isAdminAppealsEnabled,
  isAdminCustomNotificationEnabled,
  isWorkbenchEnabled,
  isTaskboardEnabled,
  isWorkbenchTransferEnabled,
  isAiScanEnabled,
  isRoomAiSummaryEnabled,
  isGcloudMcpEnabled,
};
