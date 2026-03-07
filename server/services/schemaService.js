const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_SCHEMA_KEY = 'server/db/schema.sql';
const SCHEMA_FILE_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

function loadSchemaSql() {
  return fs.readFileSync(SCHEMA_FILE_PATH, 'utf8');
}

function computeSchemaChecksum(schemaSql) {
  return crypto
    .createHash('sha256')
    .update(String(schemaSql || ''), 'utf8')
    .digest('hex');
}

function collectNamesFromRegex(regex, text) {
  const names = new Set();
  if (!text) return [];
  let match = regex.exec(text);
  while (match) {
    const name = String(match[1] || '').trim();
    if (name) names.add(name.toLowerCase());
    match = regex.exec(text);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function listSchemaTables(schemaSql) {
  return collectNamesFromRegex(
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    schemaSql
  );
}

function listSchemaIndexes(schemaSql) {
  return collectNamesFromRegex(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    schemaSql
  );
}

async function ensureSchemaMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      schema_key TEXT NOT NULL,
      schema_checksum TEXT NOT NULL,
      applied_by TEXT,
      notes TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (schema_key, schema_checksum)
    );

    CREATE INDEX IF NOT EXISTS schema_migrations_schema_applied_idx
      ON schema_migrations(schema_key, applied_at DESC);
  `);
}

async function recordSchemaMigration(client, payload = {}) {
  const schemaKey = String(payload.schemaKey || DEFAULT_SCHEMA_KEY).trim();
  const schemaChecksum = String(payload.schemaChecksum || '').trim();
  if (!schemaChecksum) {
    throw new Error('schemaChecksum is required.');
  }
  const appliedBy = payload.appliedBy ? String(payload.appliedBy).trim().slice(0, 180) : null;
  const notes = payload.notes ? String(payload.notes).trim().slice(0, 2000) : null;
  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};

  const result = await client.query(
    `INSERT INTO schema_migrations
      (schema_key, schema_checksum, applied_by, notes, metadata, applied_at)
     VALUES
      ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (schema_key, schema_checksum)
     DO UPDATE SET
       applied_by = EXCLUDED.applied_by,
       notes = EXCLUDED.notes,
       metadata = EXCLUDED.metadata,
       applied_at = NOW()
     RETURNING id, schema_key, schema_checksum, applied_by, notes, metadata, applied_at`,
    [schemaKey, schemaChecksum, appliedBy, notes, JSON.stringify(metadata)]
  );
  return result.rows[0] || null;
}

async function getLatestSchemaMigration(client, schemaKey = DEFAULT_SCHEMA_KEY) {
  const key = String(schemaKey || DEFAULT_SCHEMA_KEY).trim();
  const existsResult = await client.query(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`
  );
  if (!existsResult.rows[0] || existsResult.rows[0].present !== true) {
    return null;
  }

  const result = await client.query(
    `SELECT id, schema_key, schema_checksum, applied_by, notes, metadata, applied_at
     FROM schema_migrations
     WHERE schema_key = $1
     ORDER BY applied_at DESC, id DESC
     LIMIT 1`,
    [key]
  );
  return result.rows[0] || null;
}

async function checkRelationsExist(client, names = []) {
  const safeNames = Array.isArray(names)
    ? names.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!safeNames.length) return { missing: [], presentCount: 0, total: 0 };

  const result = await client.query(
    `SELECT
      rel_name,
      to_regclass('public.' || rel_name) IS NOT NULL AS present
     FROM unnest($1::text[]) AS rel_name`,
    [safeNames]
  );

  const missing = result.rows
    .filter((row) => row.present !== true)
    .map((row) => row.rel_name)
    .sort((a, b) => a.localeCompare(b));

  return {
    missing,
    presentCount: result.rows.length - missing.length,
    total: result.rows.length,
  };
}

async function validateSchemaAgainstDatabase(client, schemaSql) {
  const tableNames = listSchemaTables(schemaSql);
  const indexNames = listSchemaIndexes(schemaSql);
  const [tableStatus, indexStatus] = await Promise.all([
    checkRelationsExist(client, tableNames),
    checkRelationsExist(client, indexNames),
  ]);

  return {
    tableNames,
    indexNames,
    missingTables: tableStatus.missing,
    missingIndexes: indexStatus.missing,
    tableCount: tableStatus.total,
    indexCount: indexStatus.total,
    presentTableCount: tableStatus.presentCount,
    presentIndexCount: indexStatus.presentCount,
  };
}

module.exports = {
  DEFAULT_SCHEMA_KEY,
  SCHEMA_FILE_PATH,
  loadSchemaSql,
  computeSchemaChecksum,
  listSchemaTables,
  listSchemaIndexes,
  ensureSchemaMigrationLedger,
  recordSchemaMigration,
  getLatestSchemaMigration,
  validateSchemaAgainstDatabase,
};
