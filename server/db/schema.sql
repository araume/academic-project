CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  uid TEXT NOT NULL,
  password TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  course TEXT,
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

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
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
CREATE INDEX IF NOT EXISTS email_verification_tokens_uid_idx ON email_verification_tokens(uid);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS password_reset_codes_uid_idx ON password_reset_codes(uid);
CREATE INDEX IF NOT EXISTS password_reset_codes_code_expires_idx ON password_reset_codes(code_expires_at);
CREATE INDEX IF NOT EXISTS password_reset_codes_reset_token_expires_idx ON password_reset_codes(reset_token_expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_uid_idx ON auth_sessions(uid);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);

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
      'community_rules_required'
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
      'community_rules_required'
    )
  );

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications(recipient_uid, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON notifications(recipient_uid, is_read, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_actor_idx
  ON notifications(actor_uid);

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
  slug TEXT PRIMARY KEY CHECK (slug IN ('about', 'faq', 'rooms')),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
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
