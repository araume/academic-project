const pool = require('../db/pool');

let ensureCommunityPromise = null;

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function parseSeedEmailList(value) {
  if (typeof value !== 'string') return [];
  const parts = value
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function sanitizeSlug(value) {
  if (!value) return 'community';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'community';
}

async function ensureCommunitySchema() {
  const sql = `
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'member';

    CREATE TABLE IF NOT EXISTS communities (
      id SERIAL PRIMARY KEY,
      course_code TEXT UNIQUE,
      course_name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_memberships (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK (state IN ('pending', 'member', 'banned', 'left')),
      joined_at TIMESTAMPTZ,
      left_at TIMESTAMPTZ,
      banned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (community_id, user_uid)
    );

    CREATE TABLE IF NOT EXISTS community_roles (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('moderator')),
      assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (community_id, user_uid, role)
    );

    CREATE TABLE IF NOT EXISTS community_rules (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (community_id, version)
    );

    CREATE TABLE IF NOT EXISTS community_rule_acceptances (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (community_id, user_uid, version)
    );

    CREATE TABLE IF NOT EXISTS community_posts (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      author_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'community' CHECK (visibility IN ('community', 'main_course_only')),
      attachment_type TEXT CHECK (attachment_type IN ('image', 'video', 'library_doc', 'link')),
      attachment_key TEXT,
      attachment_link TEXT,
      attachment_title TEXT,
      attachment_library_document_uuid UUID REFERENCES documents(uuid) ON DELETE SET NULL,
      attachment_filename TEXT,
      attachment_mime_type TEXT,
      likes_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'taken_down')),
      taken_down_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      taken_down_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_comments (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      author_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'taken_down')),
      taken_down_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      taken_down_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_post_likes (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (community_id, post_id, user_uid)
    );

    CREATE TABLE IF NOT EXISTS community_warnings (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      issued_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_bans (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      issued_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      reason TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lifted_at TIMESTAMPTZ,
      lifted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS community_reports (
      id BIGSERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('member', 'moderator', 'post', 'comment')),
      target_post_id BIGINT REFERENCES community_posts(id) ON DELETE SET NULL,
      target_comment_id BIGINT REFERENCES community_comments(id) ON DELETE SET NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_action_taken', 'resolved_no_action', 'rejected')),
      resolution_note TEXT,
      resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_post_reports (
      id BIGSERIAL PRIMARY KEY,
      report_id BIGINT NOT NULL UNIQUE REFERENCES community_reports(id) ON DELETE CASCADE,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS community_comment_reports (
      id BIGSERIAL PRIMARY KEY,
      report_id BIGINT NOT NULL UNIQUE REFERENCES community_reports(id) ON DELETE CASCADE,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      comment_id BIGINT NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
      reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_type TEXT;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_key TEXT;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_link TEXT;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_title TEXT;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_library_document_uuid UUID REFERENCES documents(uuid) ON DELETE SET NULL;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_filename TEXT;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT;
    ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS communities_course_name_idx ON communities(course_name);
    CREATE INDEX IF NOT EXISTS community_memberships_user_state_idx ON community_memberships(user_uid, state);
    CREATE INDEX IF NOT EXISTS community_memberships_community_state_idx ON community_memberships(community_id, state);
    CREATE INDEX IF NOT EXISTS community_roles_community_role_idx ON community_roles(community_id, role);
    CREATE INDEX IF NOT EXISTS community_posts_community_created_idx ON community_posts(community_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_posts_community_likes_idx ON community_posts(community_id, likes_count DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_comments_post_created_idx ON community_comments(post_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS community_post_likes_post_idx ON community_post_likes(post_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_post_likes_user_idx ON community_post_likes(user_uid, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_reports_community_status_idx ON community_reports(community_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_post_reports_community_idx ON community_post_reports(community_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_post_reports_post_idx ON community_post_reports(post_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_comment_reports_community_idx ON community_comment_reports(community_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS community_comment_reports_comment_idx ON community_comment_reports(comment_id, created_at DESC);
  `;

  await pool.query(sql);
  await pool.query(
    `UPDATE accounts
     SET platform_role = 'member'
     WHERE platform_role IS NULL OR platform_role NOT IN ('owner', 'admin', 'member')`
  );
}

async function syncCommunitiesFromCourses() {
  const coursesResult = await pool.query(
    'SELECT course_code, course_name FROM courses ORDER BY course_name ASC'
  );

  for (const row of coursesResult.rows) {
    const courseName = (row.course_name || '').trim();
    if (!courseName) continue;

    await pool.query(
      `INSERT INTO communities (course_code, course_name, slug, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (course_name)
       DO UPDATE SET
         course_code = EXCLUDED.course_code,
         slug = EXCLUDED.slug,
         updated_at = NOW()`,
      [row.course_code || null, courseName, sanitizeSlug(courseName)]
    );
  }
}

async function seedPlatformRoles() {
  // Optional bootstrap seeding via env only. Keep empty by default to avoid
  // silently re-assigning privileged roles to newly recreated accounts.
  const ownerEmails = parseSeedEmailList(process.env.PLATFORM_OWNER_SEED_EMAILS || '');
  const adminEmails = parseSeedEmailList(process.env.PLATFORM_ADMIN_SEED_EMAILS || '');

  if (ownerEmails.length) {
    await pool.query(
      `UPDATE accounts
       SET platform_role = 'owner'
       WHERE lower(email) = ANY($1::text[])`,
      [ownerEmails]
    );
  }

  if (adminEmails.length) {
    await pool.query(
      `UPDATE accounts
       SET platform_role = 'admin'
       WHERE lower(email) = ANY($1::text[])
         AND platform_role <> 'owner'`,
      [adminEmails]
    );
  }
}

async function ensureUserMainCourseMembership(uid) {
  if (!uid) return;

  const accountResult = await pool.query(
    'SELECT course FROM accounts WHERE uid = $1 LIMIT 1',
    [uid]
  );
  const mainCourse = accountResult.rows[0] && accountResult.rows[0].course
    ? String(accountResult.rows[0].course).trim()
    : '';

  if (!mainCourse) return;

  await pool.query(
    `INSERT INTO communities (course_code, course_name, slug, updated_at)
     VALUES (NULL, $1, $2, NOW())
     ON CONFLICT (course_name)
     DO UPDATE SET slug = EXCLUDED.slug, updated_at = NOW()`,
    [mainCourse, sanitizeSlug(mainCourse)]
  );

  const communityResult = await pool.query(
    'SELECT id FROM communities WHERE course_name = $1 LIMIT 1',
    [mainCourse]
  );
  if (!communityResult.rows.length) return;

  const communityId = Number(communityResult.rows[0].id);
  await pool.query(
    `INSERT INTO community_memberships
      (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
     VALUES
      ($1, $2, 'member', NOW(), NULL, NULL, NOW())
     ON CONFLICT (community_id, user_uid)
     DO UPDATE SET
      state = CASE
        WHEN community_memberships.state = 'banned' THEN 'banned'
        ELSE 'member'
      END,
      joined_at = CASE
        WHEN community_memberships.state = 'banned' THEN community_memberships.joined_at
        ELSE COALESCE(community_memberships.joined_at, NOW())
      END,
      left_at = NULL,
      updated_at = NOW()`,
    [communityId, uid]
  );
}

async function ensureCommunityReady() {
  if (!ensureCommunityPromise) {
    ensureCommunityPromise = ensureCommunitySchema().catch((error) => {
      ensureCommunityPromise = null;
      throw error;
    });
  }
  await ensureCommunityPromise;
}

async function bootstrapCommunityForUser(uid) {
  await ensureCommunityReady();
  await syncCommunitiesFromCourses();
  await seedPlatformRoles();
  await ensureUserMainCourseMembership(uid);
}

module.exports = {
  bootstrapCommunityForUser,
  ensureCommunityReady,
  syncCommunitiesFromCourses,
  ensureUserMainCourseMembership,
};
