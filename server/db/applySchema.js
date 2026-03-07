#!/usr/bin/env node
const { loadEnv } = require('../config/env');

loadEnv();

const pool = require('./pool');
const {
  DEFAULT_SCHEMA_KEY,
  loadSchemaSql,
  computeSchemaChecksum,
  ensureSchemaMigrationLedger,
  recordSchemaMigration,
  validateSchemaAgainstDatabase,
} = require('../services/schemaService');

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  const validateOnly = hasFlag('--validate-only');
  const dryRun = hasFlag('--dry-run');
  const skipValidation = hasFlag('--skip-validation');

  const schemaSql = loadSchemaSql();
  const schemaChecksum = computeSchemaChecksum(schemaSql);
  const schemaKey = DEFAULT_SCHEMA_KEY;

  console.log(`[schema] key=${schemaKey}`);
  console.log(`[schema] checksum=${schemaChecksum}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureSchemaMigrationLedger(client);

    if (!validateOnly && !dryRun) {
      await client.query(schemaSql);
      const record = await recordSchemaMigration(client, {
        schemaKey,
        schemaChecksum,
        appliedBy: process.env.SCHEMA_APPLIED_BY || 'manual',
        notes: process.env.SCHEMA_APPLY_NOTES || null,
        metadata: {
          mode: 'apply',
          nodeEnv: process.env.NODE_ENV || 'development',
        },
      });
      console.log(`[schema] applied at ${record ? record.applied_at : 'unknown'}`);
    } else {
      console.log(`[schema] ${validateOnly ? 'validate-only mode' : 'dry-run mode'}, no schema write executed`);
    }

    if (!skipValidation) {
      const report = await validateSchemaAgainstDatabase(client, schemaSql);
      const missingCount = report.missingTables.length + report.missingIndexes.length;
      console.log(`[schema] tables ${report.presentTableCount}/${report.tableCount}`);
      console.log(`[schema] indexes ${report.presentIndexCount}/${report.indexCount}`);
      if (missingCount > 0) {
        throw new Error(
          `Schema validation failed. Missing tables=${report.missingTables.length}, missing indexes=${report.missingIndexes.length}`
        );
      }
    } else {
      console.log('[schema] validation skipped by flag');
    }

    await client.query('COMMIT');
    console.log('[schema] success');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // no-op
    }
    console.error('[schema] failed:', error.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[schema] fatal:', error.message || error);
  process.exitCode = 1;
});
