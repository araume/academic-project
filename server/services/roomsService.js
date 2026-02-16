const pool = require('../db/pool');

let ensureRoomsPromise = null;

async function ensureRoomsSchema() {
  const sql = `
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

    CREATE TABLE IF NOT EXISTS blocked_users (
      id BIGSERIAL PRIMARY KEY,
      blocker_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      blocked_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (blocker_uid, blocked_uid),
      CHECK (blocker_uid <> blocked_uid)
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
  `;

  await pool.query(sql);
}

async function ensureRoomsReady() {
  if (!ensureRoomsPromise) {
    ensureRoomsPromise = ensureRoomsSchema().catch((error) => {
      ensureRoomsPromise = null;
      throw error;
    });
  }
  await ensureRoomsPromise;
}

async function expirePendingRoomRequests() {
  await pool.query(
    `UPDATE room_requests
     SET status = 'expired',
         updated_at = NOW()
     WHERE status = 'pending'
       AND expires_at <= NOW()`
  );
}

module.exports = {
  ensureRoomsReady,
  expirePendingRoomRequests,
};
