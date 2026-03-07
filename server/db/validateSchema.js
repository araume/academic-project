#!/usr/bin/env node
const { loadEnv } = require('../config/env');

loadEnv();

const pool = require('./pool');
const {
  DEFAULT_SCHEMA_KEY,
  loadSchemaSql,
  computeSchemaChecksum,
  getLatestSchemaMigration,
  validateSchemaAgainstDatabase,
} = require('../services/schemaService');

async function main() {
  const schemaSql = loadSchemaSql();
  const expectedChecksum = computeSchemaChecksum(schemaSql);
  const client = await pool.connect();

  try {
    const report = await validateSchemaAgainstDatabase(client, schemaSql);
    const latest = await getLatestSchemaMigration(client, DEFAULT_SCHEMA_KEY);

    console.log(`[schema] expected checksum=${expectedChecksum}`);
    if (latest) {
      console.log(`[schema] latest applied checksum=${latest.schema_checksum} at ${latest.applied_at}`);
    } else {
      console.log('[schema] no schema_migrations ledger entry found');
    }

    console.log(`[schema] tables ${report.presentTableCount}/${report.tableCount}`);
    console.log(`[schema] indexes ${report.presentIndexCount}/${report.indexCount}`);

    if (report.missingTables.length) {
      console.log(`[schema] missing tables (${report.missingTables.length}): ${report.missingTables.join(', ')}`);
    }
    if (report.missingIndexes.length) {
      console.log(`[schema] missing indexes (${report.missingIndexes.length}): ${report.missingIndexes.join(', ')}`);
    }

    if (!latest || latest.schema_checksum !== expectedChecksum) {
      console.log('[schema] warning: DB schema checksum is not aligned with local schema.sql');
    }

    if (report.missingTables.length || report.missingIndexes.length) {
      process.exitCode = 1;
    } else {
      console.log('[schema] validation passed');
    }
  } catch (error) {
    console.error('[schema] validation failed:', error.message || error);
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
