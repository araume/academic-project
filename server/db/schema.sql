CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  uid TEXT NOT NULL,
  password TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  course TEXT,
  gender TEXT,
  content_preference JSONB NOT NULL DEFAULT '{}'::jsonb,
  student_number TEXT,
  id_verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (id_verification_status IN ('pending', 'approved', 'rejected')),
  id_verification_note TEXT,
  id_verified_by_uid TEXT,
  id_verified_at TIMESTAMPTZ,
  platform_role TEXT NOT NULL DEFAULT 'member',
  recovery_email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  banned_by_uid TEXT,
  datecreated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_uid_unique_idx ON accounts(uid);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'member';

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS content_preference JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS student_number TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS id_verification_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS id_verification_note TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS id_verified_by_uid TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMPTZ;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS banned_by_uid TEXT;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_id_verification_status_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_id_verification_status_check
    CHECK (id_verification_status IN ('pending', 'approved', 'rejected'));

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
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'course_exclusive')),
  source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('vault', 'library')),
  aiallowed BOOLEAN NOT NULL DEFAULT false,
  link TEXT NOT NULL,
  thumbnail_link TEXT,
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  restricted_at TIMESTAMPTZ,
  restricted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  restricted_reason TEXT
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'library';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMPTZ;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS restricted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS restricted_reason TEXT;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_visibility_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_visibility_check
    CHECK (visibility IN ('public', 'private', 'course_exclusive'));

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_source_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_check
    CHECK (source IN ('vault', 'library'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_banned_by_uid_fkey'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_banned_by_uid_fkey
      FOREIGN KEY (banned_by_uid)
      REFERENCES accounts(uid)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_id_verified_by_uid_fkey'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_id_verified_by_uid_fkey
      FOREIGN KEY (id_verified_by_uid)
      REFERENCES accounts(uid)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (uid)
);

CREATE TABLE IF NOT EXISTS auth_schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE REFERENCES accounts(uid) ON DELETE CASCADE,
  code_digest TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  code_verified_at TIMESTAMPTZ,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reset_token_digest TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS professor_registration_codes (
  id BIGSERIAL PRIMARY KEY,
  code_digest TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  consumed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS account_disciplinary_actions (
  id BIGSERIAL PRIMARY KEY,
  target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  issued_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('warn', 'suspend', 'ban')),
  reason TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  revoked_reason TEXT
);

CREATE TABLE IF NOT EXISTS account_appeals (
  id BIGSERIAL PRIMARY KEY,
  appellant_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  disciplinary_action_id BIGINT REFERENCES account_disciplinary_actions(id) ON DELETE SET NULL,
  appeal_type TEXT NOT NULL CHECK (appeal_type IN ('warning', 'suspension', 'ban', 'verification_rejection', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'accepted', 'denied', 'withdrawn')),
  message TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restricted_content_queue (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN (
    'main_post',
    'library_document',
    'community_post',
    'community_comment',
    'chat_message'
  )),
  report_key TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  course TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restore_deadline_at TIMESTAMPTZ NOT NULL,
  restored_at TIMESTAMPTZ,
  restored_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  purged_at TIMESTAMPTZ,
  purged_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'restricted' CHECK (status IN ('restricted', 'restored', 'purged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS documents_restricted_idx ON documents(is_restricted, uploaddate DESC);
CREATE INDEX IF NOT EXISTS documents_source_visibility_idx ON documents(source, visibility, uploaddate DESC);
CREATE INDEX IF NOT EXISTS email_verification_tokens_uid_idx ON email_verification_tokens(uid);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS password_reset_codes_uid_idx ON password_reset_codes(uid);
CREATE INDEX IF NOT EXISTS password_reset_codes_code_expires_idx ON password_reset_codes(code_expires_at);
CREATE INDEX IF NOT EXISTS password_reset_codes_reset_token_expires_idx ON password_reset_codes(reset_token_expires_at);
CREATE INDEX IF NOT EXISTS professor_registration_codes_active_idx
  ON professor_registration_codes(is_active, consumed_at, expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_uid_idx ON auth_sessions(uid);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS accounts_platform_role_idx ON accounts(platform_role);
CREATE INDEX IF NOT EXISTS accounts_id_verification_status_idx ON accounts(id_verification_status);
CREATE INDEX IF NOT EXISTS accounts_student_number_idx ON accounts(student_number);
CREATE INDEX IF NOT EXISTS account_disciplinary_actions_target_active_idx
  ON account_disciplinary_actions(target_uid, active, created_at DESC);
CREATE INDEX IF NOT EXISTS account_disciplinary_actions_target_type_idx
  ON account_disciplinary_actions(target_uid, action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS account_appeals_appellant_created_idx
  ON account_appeals(appellant_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS account_appeals_status_created_idx
  ON account_appeals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS restricted_content_queue_status_deadline_idx
  ON restricted_content_queue(status, restore_deadline_at);
CREATE INDEX IF NOT EXISTS restricted_content_queue_target_idx
  ON restricted_content_queue(source, target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS restricted_content_queue_active_target_idx
  ON restricted_content_queue(source, target_type, target_id)
  WHERE status = 'restricted';

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  main_course TEXT,
  sub_courses TEXT[],
  facebook TEXT,
  linkedin TEXT,
  instagram TEXT,
  github TEXT,
  portfolio TEXT,
  photo_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_privacy_settings (
  uid TEXT PRIMARY KEY REFERENCES accounts(uid) ON DELETE CASCADE,
  searchable BOOLEAN NOT NULL DEFAULT true,
  follow_approval_required BOOLEAN NOT NULL DEFAULT true,
  non_follower_chat_policy TEXT NOT NULL DEFAULT 'request'
    CHECK (non_follower_chat_policy IN ('allow', 'request', 'deny')),
  active_visible BOOLEAN NOT NULL DEFAULT true,
  notify_new_posts_from_following BOOLEAN NOT NULL DEFAULT true,
  notify_post_activity BOOLEAN NOT NULL DEFAULT true,
  notify_document_activity BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_privacy_settings
  ADD COLUMN IF NOT EXISTS notify_new_posts_from_following BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE user_privacy_settings
  ADD COLUMN IF NOT EXISTS notify_post_activity BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE user_privacy_settings
  ADD COLUMN IF NOT EXISTS notify_document_activity BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  actor_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'following_new_post',
      'post_liked',
      'post_commented',
      'document_liked',
      'document_commented',
      'community_rules_required',
      'admin_custom'
    )
  ),
  entity_type TEXT,
  entity_id TEXT,
  target_url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'following_new_post',
      'post_liked',
      'post_commented',
      'document_liked',
      'document_commented',
      'community_rules_required',
      'admin_custom'
    )
  );

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications(recipient_uid, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON notifications(recipient_uid, is_read, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_actor_idx
  ON notifications(actor_uid);

CREATE TABLE IF NOT EXISTS push_device_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android'
    CHECK (platform IN ('android', 'ios', 'web')),
  device_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_device_tokens_user_active_idx
  ON push_device_tokens(user_uid, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS push_device_tokens_last_seen_idx
  ON push_device_tokens(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS user_presence (
  uid TEXT PRIMARY KEY REFERENCES accounts(uid) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follow_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_uid, target_uid),
  CHECK (requester_uid <> target_uid)
);

CREATE TABLE IF NOT EXISTS follows (
  id BIGSERIAL PRIMARY KEY,
  follower_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_uid, target_uid),
  CHECK (follower_uid <> target_uid)
);

CREATE TABLE IF NOT EXISTS chat_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_uid, target_uid),
  CHECK (requester_uid <> target_uid)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id BIGSERIAL PRIMARY KEY,
  thread_type TEXT NOT NULL CHECK (thread_type IN ('direct', 'group')),
  created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_participants (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'pending', 'declined')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE (thread_id, user_uid)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  body TEXT NOT NULL,
  parent_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  attachment_type TEXT CHECK (attachment_type IN ('image', 'video')),
  attachment_key TEXT,
  attachment_link TEXT,
  attachment_filename TEXT,
  attachment_mime_type TEXT,
  attachment_size_bytes INTEGER CHECK (attachment_size_bytes IS NULL OR attachment_size_bytes >= 0),
  deleted_at TIMESTAMPTZ,
  deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS parent_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_key TEXT;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_link TEXT;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_filename TEXT;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_size_bytes INTEGER;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_attachment_type_check;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_attachment_type_check
  CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'video'));

CREATE TABLE IF NOT EXISTS chat_message_reports (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  message_sender_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  resolution_note TEXT,
  resolved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, reporter_uid)
);

CREATE TABLE IF NOT EXISTS chat_typing (
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_uid)
);

CREATE TABLE IF NOT EXISTS chat_thread_user_state (
  thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  last_read_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  manual_unread BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_uid)
);

ALTER TABLE chat_thread_user_state
  ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE chat_thread_user_state
  ADD COLUMN IF NOT EXISTS manual_unread BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_thread_user_state
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_thread_user_state
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_thread_user_state
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS blocked_users (
  id BIGSERIAL PRIMARY KEY,
  blocker_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  blocked_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_uid, blocked_uid),
  CHECK (blocker_uid <> blocked_uid)
);

CREATE TABLE IF NOT EXISTS hidden_post_authors (
  id BIGSERIAL PRIMARY KEY,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  hidden_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_uid, hidden_uid),
  CHECK (user_uid <> hidden_uid)
);

CREATE TABLE IF NOT EXISTS user_profile_reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  target_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reporter_uid <> target_uid)
);

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

CREATE TABLE IF NOT EXISTS subjects (
  id BIGSERIAL PRIMARY KEY,
  course_code TEXT,
  course_name TEXT NOT NULL,
  subject_code TEXT,
  subject_name TEXT NOT NULL,
  description TEXT,
  created_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_name, subject_name)
);

CREATE TABLE IF NOT EXISTS subject_memberships (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'member'
    CHECK (state IN ('pending', 'member', 'left', 'banned')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, user_uid)
);

CREATE TABLE IF NOT EXISTS subject_posts (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_library_document_uuid UUID REFERENCES documents(uuid) ON DELETE SET NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'taken_down')),
  taken_down_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  taken_down_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subject_comments (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES subject_posts(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'taken_down')),
  taken_down_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  taken_down_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subject_post_likes (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES subject_posts(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, post_id, user_uid)
);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_uid);
CREATE INDEX IF NOT EXISTS follows_target_idx ON follows(target_uid);
CREATE INDEX IF NOT EXISTS follow_requests_target_status_idx ON follow_requests(target_uid, status);
CREATE INDEX IF NOT EXISTS follow_requests_requester_status_idx ON follow_requests(requester_uid, status);

CREATE INDEX IF NOT EXISTS chat_requests_target_status_idx ON chat_requests(target_uid, status);
CREATE INDEX IF NOT EXISTS chat_requests_requester_status_idx ON chat_requests(requester_uid, status);
CREATE INDEX IF NOT EXISTS chat_participants_user_status_idx ON chat_participants(user_uid, status);
CREATE INDEX IF NOT EXISTS chat_participants_thread_status_idx ON chat_participants(thread_id, status);
CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON chat_messages(thread_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS chat_messages_parent_idx ON chat_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS chat_messages_deleted_idx ON chat_messages(thread_id, deleted_at);
CREATE INDEX IF NOT EXISTS chat_message_reports_status_created_idx ON chat_message_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_message_reports_thread_idx ON chat_message_reports(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_message_reports_reporter_idx ON chat_message_reports(reporter_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_typing_thread_updated_idx ON chat_typing(thread_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_thread_user_state_user_idx ON chat_thread_user_state(user_uid, is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_thread_user_state_thread_idx ON chat_thread_user_state(thread_id, user_uid);
CREATE INDEX IF NOT EXISTS blocked_users_blocker_idx ON blocked_users(blocker_uid);
CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx ON blocked_users(blocked_uid);
CREATE INDEX IF NOT EXISTS hidden_post_authors_user_idx ON hidden_post_authors(user_uid);
CREATE INDEX IF NOT EXISTS hidden_post_authors_hidden_idx ON hidden_post_authors(hidden_uid);
CREATE INDEX IF NOT EXISTS user_profile_reports_target_idx ON user_profile_reports(target_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS accounts_uid_text_idx ON accounts(uid);
CREATE INDEX IF NOT EXISTS accounts_display_name_lower_idx ON accounts((lower(COALESCE(display_name, username, email))));
CREATE INDEX IF NOT EXISTS profiles_display_name_lower_idx ON profiles((lower(COALESCE(display_name, ''))));
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
CREATE INDEX IF NOT EXISTS subjects_course_name_idx ON subjects(course_name, is_active);
CREATE INDEX IF NOT EXISTS subject_memberships_user_state_idx ON subject_memberships(user_uid, state);
CREATE INDEX IF NOT EXISTS subject_memberships_subject_state_idx ON subject_memberships(subject_id, state);
CREATE INDEX IF NOT EXISTS subject_posts_subject_created_idx ON subject_posts(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subject_posts_subject_likes_idx ON subject_posts(subject_id, likes_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS subject_comments_post_created_idx ON subject_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS subject_post_likes_post_idx ON subject_post_likes(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subject_post_likes_user_idx ON subject_post_likes(user_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  meet_id TEXT NOT NULL UNIQUE,
  meet_name TEXT NOT NULL,
  creator_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'course_exclusive', 'private')),
  community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  course_name TEXT,
  max_participants INTEGER NOT NULL CHECK (max_participants BETWEEN 2 AND 99),
  allow_mic BOOLEAN NOT NULL DEFAULT true,
  allow_video BOOLEAN NOT NULL DEFAULT true,
  allow_screen_share BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending_approval', 'scheduled', 'live', 'ended', 'canceled')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  source_request_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  meet_name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'course_exclusive', 'private')),
  community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  course_name TEXT,
  max_participants INTEGER NOT NULL CHECK (max_participants BETWEEN 2 AND 99),
  allow_mic BOOLEAN NOT NULL DEFAULT true,
  allow_video BOOLEAN NOT NULL DEFAULT true,
  allow_screen_share BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 day'),
  reviewed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  decision_note TEXT,
  approved_room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_invites (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_participants (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'co_host', 'participant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'kicked')),
  mic_on BOOLEAN NOT NULL DEFAULT true,
  video_on BOOLEAN NOT NULL DEFAULT true,
  screen_sharing BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE (room_id, user_uid)
);

CREATE TABLE IF NOT EXISTS room_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_moderation_events (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
  actor_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  target_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'create_room',
    'request_room',
    'approve_request',
    'reject_request',
    'start_room',
    'end_room',
    'kick_participant'
  )),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  executor_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  executor_role TEXT,
  action_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  course TEXT,
  source_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_page_content (
  slug TEXT PRIMARY KEY CHECK (slug IN ('about', 'faq', 'rooms', 'mobile-app')),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_feature_overrides (
  feature_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  updated_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rooms_state_scheduled_idx ON rooms(state, scheduled_at);
CREATE INDEX IF NOT EXISTS rooms_visibility_created_idx ON rooms(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_community_created_idx ON rooms(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_creator_created_idx ON rooms(creator_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS room_requests_status_expires_idx ON room_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS room_requests_requester_status_idx ON room_requests(requester_uid, status, created_at DESC);
CREATE INDEX IF NOT EXISTS room_requests_community_status_idx ON room_requests(community_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS room_invites_room_expires_idx ON room_invites(room_id, expires_at);
CREATE INDEX IF NOT EXISTS room_participants_room_status_idx ON room_participants(room_id, status, joined_at DESC);
CREATE INDEX IF NOT EXISTS room_chat_messages_room_created_idx ON room_chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_moderation_events_room_created_idx ON room_moderation_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_executor_idx ON admin_audit_logs(executor_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_course_idx ON admin_audit_logs(course, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action_key, created_at DESC);
CREATE INDEX IF NOT EXISTS site_page_content_updated_idx ON site_page_content(updated_at DESC);
CREATE INDEX IF NOT EXISTS platform_feature_overrides_updated_idx ON platform_feature_overrides(updated_at DESC);

CREATE TABLE IF NOT EXISTS workbenches (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  course TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'invite_only'
    CHECK (visibility IN ('open', 'invite_only')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'archived')),
  owner_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  approved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workbench_members (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'manager', 'member', 'viewer')),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('pending', 'active', 'removed')),
  invited_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workbench_id, user_uid)
);

CREATE TABLE IF NOT EXISTS workbench_nodes (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  markdown_content TEXT NOT NULL DEFAULT '',
  node_type TEXT NOT NULL DEFAULT 'file' CHECK (node_type IN ('file', 'folder')),
  parent_node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'members')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  shared_token TEXT,
  shared_at TIMESTAMPTZ,
  copied_from_node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE SET NULL,
  position_x DOUBLE PRECISION,
  position_y DOUBLE PRECISION,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
  ai_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workbench_edges (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  from_node_id BIGINT NOT NULL REFERENCES workbench_nodes(id) ON DELETE CASCADE,
  to_node_id BIGINT NOT NULL REFERENCES workbench_nodes(id) ON DELETE CASCADE,
  from_anchor TEXT NOT NULL DEFAULT 'right' CHECK (from_anchor IN ('top', 'right', 'bottom', 'left')),
  to_anchor TEXT NOT NULL DEFAULT 'left' CHECK (to_anchor IN ('top', 'right', 'bottom', 'left')),
  description TEXT NOT NULL DEFAULT '',
  created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_node_id <> to_node_id),
  UNIQUE (workbench_id, from_node_id, to_node_id)
);

ALTER TABLE workbench_edges
  ADD COLUMN IF NOT EXISTS from_anchor TEXT NOT NULL DEFAULT 'right';

ALTER TABLE workbench_edges
  ADD COLUMN IF NOT EXISTS to_anchor TEXT NOT NULL DEFAULT 'left';

UPDATE workbench_edges
SET from_anchor = 'right'
WHERE from_anchor IS NULL
   OR from_anchor NOT IN ('top', 'right', 'bottom', 'left');

UPDATE workbench_edges
SET to_anchor = 'left'
WHERE to_anchor IS NULL
   OR to_anchor NOT IN ('top', 'right', 'bottom', 'left');

ALTER TABLE workbench_edges
  DROP CONSTRAINT IF EXISTS workbench_edges_from_anchor_check;

ALTER TABLE workbench_edges
  ADD CONSTRAINT workbench_edges_from_anchor_check
    CHECK (from_anchor IN ('top', 'right', 'bottom', 'left'));

ALTER TABLE workbench_edges
  DROP CONSTRAINT IF EXISTS workbench_edges_to_anchor_check;

ALTER TABLE workbench_edges
  ADD CONSTRAINT workbench_edges_to_anchor_check
    CHECK (to_anchor IN ('top', 'right', 'bottom', 'left'));

CREATE TABLE IF NOT EXISTS workbench_notes (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE CASCADE,
  edge_id BIGINT REFERENCES workbench_edges(id) ON DELETE CASCADE,
  author_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
  ai_model TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((CASE WHEN node_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN edge_id IS NULL THEN 0 ELSE 1 END) = 1)
);

CREATE TABLE IF NOT EXISTS workbench_professor_assignments (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  professor_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workbench_scoped_privileges (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  granted_role TEXT NOT NULL CHECK (granted_role IN ('manager', 'professor_scoped')),
  granted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  reason TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workbench_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  course TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'invite_only'
    CHECK (visibility IN ('open', 'invite_only')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  review_note TEXT,
  reviewed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_workbench_id BIGINT REFERENCES workbenches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workbench_ownership_transfers (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
  from_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  to_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  requested_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled', 'expired')),
  temp_privilege_hours INTEGER NOT NULL DEFAULT 72 CHECK (temp_privilege_hours >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_groups (
  id BIGSERIAL PRIMARY KEY,
  workbench_id BIGINT REFERENCES workbenches(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'workbench'
    CHECK (visibility IN ('personal', 'workbench')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  task_group_id BIGINT NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
  workbench_id BIGINT REFERENCES workbenches(id) ON DELETE CASCADE,
  creator_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'collaborative'
    CHECK (task_type IN ('personal', 'collaborative')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
  requires_submission_file BOOLEAN NOT NULL DEFAULT false,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_assignees (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'assigned'
    CHECK (state IN ('assigned', 'accepted', 'declined', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, user_uid)
);

CREATE TABLE IF NOT EXISTS task_submissions (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitted_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, submitted_by_uid)
);

CREATE TABLE IF NOT EXISTS task_status_history (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  changed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workbenches_owner_idx ON workbenches(owner_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS workbenches_course_idx ON workbenches(course, visibility, status, created_at DESC);
CREATE INDEX IF NOT EXISTS workbench_members_user_idx ON workbench_members(user_uid, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS workbench_nodes_workbench_idx ON workbench_nodes(workbench_id, sort_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS workbench_nodes_parent_idx ON workbench_nodes(workbench_id, parent_node_id, is_deleted, sort_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS workbench_nodes_deleted_idx ON workbench_nodes(workbench_id, is_deleted, deleted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS workbench_nodes_shared_token_unique_idx
  ON workbench_nodes(shared_token)
  WHERE shared_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS workbench_edges_workbench_idx ON workbench_edges(workbench_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS workbench_notes_workbench_idx ON workbench_notes(workbench_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS workbench_professor_assignments_active_idx
  ON workbench_professor_assignments(workbench_id, professor_uid, active, expires_at);
CREATE INDEX IF NOT EXISTS workbench_scoped_privileges_active_idx
  ON workbench_scoped_privileges(workbench_id, user_uid, active, expires_at);
CREATE INDEX IF NOT EXISTS workbench_requests_status_course_idx
  ON workbench_requests(status, course, created_at DESC);
CREATE INDEX IF NOT EXISTS workbench_ownership_transfers_workbench_idx
  ON workbench_ownership_transfers(workbench_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS task_groups_workbench_idx ON task_groups(workbench_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_workbench_status_idx ON tasks(workbench_id, status, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS task_assignees_user_state_idx ON task_assignees(user_uid, state, created_at DESC);
CREATE INDEX IF NOT EXISTS task_submissions_task_idx ON task_submissions(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_status_history_task_idx ON task_status_history(task_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS workbench_professor_assignments_active_unique_idx
  ON workbench_professor_assignments(workbench_id, professor_uid)
  WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS workbench_scoped_privileges_active_unique_idx
  ON workbench_scoped_privileges(workbench_id, user_uid, granted_role)
  WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS workbench_ownership_transfer_pending_idx
  ON workbench_ownership_transfers(workbench_id)
  WHERE status = 'pending';

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
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'document')),
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
