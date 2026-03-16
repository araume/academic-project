const express = require('express');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const {
  DEFAULT_SCHEMA_KEY,
  loadSchemaSql,
  computeSchemaChecksum,
  getLatestSchemaMigration,
  validateSchemaAgainstDatabase,
} = require('../services/schemaService');

const router = express.Router();

function parseTimeoutMs(rawValue, fallback = 4000) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.round(parsed), 500), 20000);
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  const ms = parseTimeoutMs(timeoutMs, 4000);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage || 'Timed out'));
      }, ms);
    }),
  ]);
}

async function loadViewerRole(uid, client = pool) {
  const result = await client.query(
    `SELECT COALESCE(platform_role, 'member') AS platform_role
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] ? result.rows[0].platform_role : 'member';
}

async function collectReadinessSnapshot(client) {
  const dbResult = await client.query(
    `SELECT current_database() AS db_name, NOW() AS db_now, version() AS db_version`
  );
  const tablesResult = await client.query(
    `SELECT
      to_regclass('public.accounts') IS NOT NULL AS has_accounts,
      to_regclass('public.documents') IS NOT NULL AS has_documents,
      to_regclass('public.communities') IS NOT NULL AS has_communities,
      to_regclass('public.rooms') IS NOT NULL AS has_rooms,
      to_regclass('public.workbenches') IS NOT NULL AS has_workbenches,
      to_regclass('public.tasks') IS NOT NULL AS has_tasks`
  );

  const dbRow = dbResult.rows[0] || {};
  const tableRow = tablesResult.rows[0] || {};
  const missingCoreTables = Object.entries({
    accounts: tableRow.has_accounts === true,
    documents: tableRow.has_documents === true,
    communities: tableRow.has_communities === true,
    rooms: tableRow.has_rooms === true,
    workbenches: tableRow.has_workbenches === true,
    tasks: tableRow.has_tasks === true,
  })
    .filter(([, present]) => present !== true)
    .map(([name]) => name);

  const latestSchemaMigration = await getLatestSchemaMigration(client, DEFAULT_SCHEMA_KEY);
  return {
    database: {
      name: dbRow.db_name || null,
      serverTime: dbRow.db_now || null,
      version: dbRow.db_version || null,
    },
    missingCoreTables,
    latestSchemaMigration,
  };
}

router.get('/healthz', (_req, res) => {
  return res.json({
    ok: true,
    status: 'healthy',
    service: 'thesis-webapp',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

router.get('/readyz', async (_req, res) => {
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    const snapshot = await withTimeout(
      collectReadinessSnapshot(client),
      process.env.READINESS_TIMEOUT_MS || 5000,
      'Readiness DB check timed out'
    );
    const ready = snapshot.missingCoreTables.length === 0;
    return res.status(ready ? 200 : 503).json({
      ok: ready,
      status: ready ? 'ready' : 'not_ready',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      database: snapshot.database,
      missingCoreTables: snapshot.missingCoreTables,
      schemaMigration: snapshot.latestSchemaMigration,
      expectedSchemaChecksum: computeSchemaChecksum(loadSchemaSql()),
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      status: 'not_ready',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: error.message || 'Readiness check failed',
    });
  } finally {
    client.release();
  }
});

router.get('/api/admin/system/readiness', requireAuthApi, async (req, res) => {
  const client = await pool.connect();
  try {
    const role = await loadViewerRole(req.user.uid, client);
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can access readiness diagnostics.' });
    }

    const schemaSql = loadSchemaSql();
    const [snapshot, validation] = await Promise.all([
      collectReadinessSnapshot(client),
      validateSchemaAgainstDatabase(client, schemaSql),
    ]);

    const expectedSchemaChecksum = computeSchemaChecksum(schemaSql);
    const latestChecksum = snapshot.latestSchemaMigration
      ? String(snapshot.latestSchemaMigration.schema_checksum || '')
      : '';
    const checksumAligned = Boolean(latestChecksum) && latestChecksum === expectedSchemaChecksum;

    return res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      viewerRole: role,
      database: snapshot.database,
      schema: {
        key: DEFAULT_SCHEMA_KEY,
        expectedChecksum: expectedSchemaChecksum,
        latestMigration: snapshot.latestSchemaMigration,
        checksumAligned,
        tableCount: validation.tableCount,
        indexCount: validation.indexCount,
        presentTableCount: validation.presentTableCount,
        presentIndexCount: validation.presentIndexCount,
        missingTables: validation.missingTables,
        missingIndexes: validation.missingIndexes,
      },
      missingCoreTables: snapshot.missingCoreTables,
    });
  } catch (error) {
    console.error('System readiness diagnostics failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load readiness diagnostics.' });
  } finally {
    client.release();
  }
});

module.exports = router;
