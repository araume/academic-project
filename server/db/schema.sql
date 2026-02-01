CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  uid TEXT NOT NULL,
  password TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  course TEXT,
  recovery_email TEXT,
  datecreated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
