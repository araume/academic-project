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

CREATE UNIQUE INDEX IF NOT EXISTS accounts_uid_unique_idx ON accounts(uid);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  course_code TEXT UNIQUE NOT NULL,
  course_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  filename TEXT NOT NULL,
  uploader_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  uploaddate TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  course TEXT NOT NULL,
  subject TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  popularity INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  aiallowed BOOLEAN NOT NULL DEFAULT false,
  link TEXT NOT NULL,
  thumbnail_link TEXT
);

CREATE TABLE IF NOT EXISTS document_likes (
  id SERIAL PRIMARY KEY,
  document_uuid UUID NOT NULL REFERENCES documents(uuid) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_uuid, user_uid)
);

CREATE INDEX IF NOT EXISTS documents_course_idx ON documents(course);
CREATE INDEX IF NOT EXISTS documents_uploaddate_idx ON documents(uploaddate);
CREATE INDEX IF NOT EXISTS documents_popularity_idx ON documents(popularity);
CREATE INDEX IF NOT EXISTS documents_views_idx ON documents(views);
