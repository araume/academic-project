const { Pool } = require('pg');

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: hasDatabaseUrl ? process.env.DATABASE_URL : undefined,
  host: hasDatabaseUrl ? undefined : process.env.DB_HOST || 'localhost',
  port: hasDatabaseUrl ? undefined : Number(process.env.DB_PORT || 5432),
  user: hasDatabaseUrl ? undefined : process.env.DB_USER || 'postgres',
  password: hasDatabaseUrl ? undefined : process.env.DB_PASSWORD || '',
  database: hasDatabaseUrl ? undefined : process.env.DB_NAME || 'thesis_webapp',
  ssl: hasDatabaseUrl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
});

module.exports = pool;
