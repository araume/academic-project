const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getSignedUrl } = require('../services/storage');
const { bootstrapCommunityForUser } = require('../services/communityService');
const { ensureRoomsReady, expirePendingRoomRequests } = require('../services/roomsService');

const router = express.Router();

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const RATE_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();
let lastExpirySweepAt = 0;

function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
}

function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parsePagination(req, defaultPageSize = 20, maxPageSize = 50) {
  const requestedPage = parsePositiveInt(req.query.page) || 1;
  const requestedPageSize = parsePositiveInt(req.query.pageSize) || defaultPageSize;
  const page = Math.max(requestedPage, 1);
  const pageSize = Math.min(Math.max(requestedPageSize, 1), maxPageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function enforceRateLimit(req, res, action, limitPerWindow) {
  const uid = req.user && req.user.uid;
  if (!uid) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return false;
  }

  const key = `${uid}:${action}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, start: now });
    return true;
  }

  if (bucket.count >= limitPerWindow) {
    res.status(429).json({ ok: false, message: 'Too many requests. Please try again shortly.' });
    return false;
  }

  bucket.count += 1;
  return true;
}

function displayNameFromRow(row) {
  return row.profile_display_name || row.account_display_name || row.username || row.email || 'Member';
}

function normalizeUid(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isSameUid(left, right) {
  const a = normalizeUid(left);
  const b = normalizeUid(right);
  return Boolean(a) && a === b;
}

function isOwnerOrAdmin(viewer) {
  return viewer && (viewer.platform_role === 'owner' || viewer.platform_role === 'admin');
}

function normalizeCourseName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}
function randomBase64Url(bytes) {
  return crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashRoomPassword(password) {
  const salt = randomBase64Url(16);
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived.toString('hex'));
    });
  });
  return `scrypt$${salt}$${hash}`;
}

async function verifyRoomPassword(password, storedHash) {
  if (!storedHash) return true;
  if (typeof password !== 'string' || !password) return false;
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  if (!salt || !expectedHex) return false;

  const actualHex = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived.toString('hex'));
    });
  });

  let expectedBuf;
  let actualBuf;
  try {
    expectedBuf = Buffer.from(expectedHex, 'hex');
    actualBuf = Buffer.from(actualHex, 'hex');
  } catch (error) {
    return false;
  }
  if (!expectedBuf.length || expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function buildInviteLink(req, meetId, inviteToken) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const params = new URLSearchParams({
    room: String(meetId),
    invite: inviteToken,
  });
  return `${baseUrl}/rooms?${params.toString()}`;
}

function buildCallLink(meetId) {
  const configured = sanitizeText(process.env.ROOMS_CALL_BASE_URL || '', 500);
  const base = (configured || 'https://meet.ffmuc.net').replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(String(meetId))}`;
}

async function signPhotoIfNeeded(photoLink) {
  if (!photoLink) return null;
  if (photoLink.startsWith('http')) return photoLink;
  try {
    return await getSignedUrl(photoLink, SIGNED_TTL);
  } catch (error) {
    console.error('Rooms photo signing failed:', error);
    return null;
  }
}

function normalizeVisibility(raw) {
  const value = sanitizeText(raw || 'public', 40).toLowerCase();
  if (value === 'public' || value === 'course_exclusive' || value === 'private') return value;
  return null;
}

async function getViewer(uid, client = pool) {
  const result = await client.query(
    `SELECT
      a.uid,
      a.email,
      a.username,
      a.display_name AS account_display_name,
      a.course,
      COALESCE(a.platform_role, 'member') AS platform_role,
      p.display_name AS profile_display_name,
      p.photo_link
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

async function loadAllowedHostCourseNames(uid, client = pool) {
  const result = await client.query(
    `SELECT
      a.course AS account_course,
      p.main_course,
      p.sub_courses
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = $1
     LIMIT 1`,
    [uid]
  );
  if (!result.rows.length) return [];

  const row = result.rows[0];
  const names = new Set();
  const pushName = (value) => {
    const normalized = normalizeCourseName(value);
    if (normalized) names.add(normalized);
  };

  pushName(row.account_course);
  pushName(row.main_course);
  if (Array.isArray(row.sub_courses)) {
    row.sub_courses.forEach((entry) => pushName(entry));
  }

  return Array.from(names);
}
async function getCommunityById(communityId, client = pool) {
  if (!communityId) return null;
  const result = await client.query(
    `SELECT id, course_code, course_name
     FROM communities
     WHERE id = $1
     LIMIT 1`,
    [communityId]
  );
  return result.rows[0] || null;
}

async function isCommunityModerator(communityId, uid, client = pool) {
  if (!communityId || !uid) return false;
  const result = await client.query(
    `SELECT 1
     FROM community_roles
     WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'
     LIMIT 1`,
    [communityId, uid]
  );
  return result.rows.length > 0;
}

async function hasCommunityMembership(communityId, uid, client = pool) {
  if (!communityId || !uid) return false;
  const result = await client.query(
    `SELECT 1
     FROM community_memberships
     WHERE community_id = $1 AND user_uid = $2 AND state = 'member'
     LIMIT 1`,
    [communityId, uid]
  );
  return result.rows.length > 0;
}

async function hasAnyModeratorRole(uid, client = pool) {
  const result = await client.query(
    `SELECT 1
     FROM community_roles
     WHERE user_uid = $1 AND role = 'moderator'
     LIMIT 1`,
    [uid]
  );
  return result.rows.length > 0;
}

async function canCreateRoomDirect(viewer, visibility, communityId, client = pool) {
  if (!viewer || !viewer.uid) return false;
  if (isOwnerOrAdmin(viewer)) return true;
  if (visibility === 'public') return false;
  if (communityId) {
    return isCommunityModerator(communityId, viewer.uid, client);
  }
  return false;
}

async function canReviewRoomRequest(viewer, visibility, communityId, client = pool) {
  if (!viewer || !viewer.uid) return false;
  if (isOwnerOrAdmin(viewer)) return true;
  if (visibility === 'public') return false;
  if (!communityId) return false;
  return isCommunityModerator(communityId, viewer.uid, client);
}

async function maybeExpirePendingRequests() {
  const now = Date.now();
  if (now - lastExpirySweepAt < 60 * 1000) return;
  lastExpirySweepAt = now;
  await expirePendingRoomRequests();
}

function normalizeRoomInput(payload = {}) {
  const meetName = sanitizeText(payload.meet_name, 80);
  const visibility = normalizeVisibility(payload.visibility);
  const communityId = parsePositiveInt(payload.community_id);
  const maxParticipantsRaw = parsePositiveInt(payload.max_participants);
  const maxParticipants = maxParticipantsRaw || 25;
  const allowMic = parseBoolean(payload.allow_mic, true);
  const allowVideo = parseBoolean(payload.allow_video, true);
  const allowScreenShare = parseBoolean(payload.allow_screen_share, false);
  const scheduledAt = parseDateInput(payload.scheduled_at);
  const meetPassword = typeof payload.meet_password === 'string' ? payload.meet_password.trim() : '';

  return {
    meetName,
    visibility,
    communityId,
    maxParticipants,
    allowMic,
    allowVideo,
    allowScreenShare,
    scheduledAt,
    meetPassword,
  };
}

function validateRoomInput(input) {
  if (!input.meetName || input.meetName.length < 3) {
    return 'Meet name must be at least 3 characters.';
  }
  if (!input.visibility) {
    return 'Invalid visibility.';
  }
  if (!input.maxParticipants || input.maxParticipants < 2 || input.maxParticipants > 99) {
    return 'Maximum participants must be between 2 and 99.';
  }
  if (input.scheduledAt && input.scheduledAt.getTime() < Date.now() - 30 * 1000) {
    return 'Scheduled time cannot be in the past.';
  }
  if (input.visibility === 'private' && input.meetPassword && input.meetPassword.length < 6) {
    return 'Private meet password must be at least 6 characters.';
  }
  if (input.visibility !== 'private' && input.meetPassword) {
    return 'Password is allowed only for private rooms.';
  }
  if (input.visibility === 'course_exclusive' && !input.communityId) {
    return 'Course-exclusive rooms require a course community.';
  }
  return null;
}

async function generateUniqueMeetId(client = pool) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const bytes = crypto.randomBytes(8);
    let meetId = '';
    for (let i = 0; i < 8; i += 1) {
      meetId += chars[bytes[i] % chars.length];
    }

    const exists = await client.query(
      'SELECT 1 FROM rooms WHERE meet_id = $1 LIMIT 1',
      [meetId]
    );
    if (!exists.rows.length) {
      return meetId;
    }
  }
  throw new Error('Unable to generate a unique meet ID.');
}

function computeRoomState(scheduledAt) {
  if (scheduledAt && scheduledAt.getTime() > Date.now() + 60 * 1000) {
    return 'scheduled';
  }
  return 'live';
}

async function createPrivateInvite(client, roomId, creatorUid, expiresInHours = 24) {
  const inviteToken = randomBase64Url(24);
  const tokenDigest = sha256Hex(inviteToken);
  await client.query(
    `INSERT INTO room_invites (room_id, token_digest, created_by_uid, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4::text || ' hours')::interval)`,
    [roomId, tokenDigest, creatorUid, String(expiresInHours)]
  );
  return inviteToken;
}

function toRoomResponse(row) {
  return {
    id: Number(row.id),
    meetId: row.meet_id,
    meetName: row.meet_name,
    visibility: row.visibility,
    state: row.state,
    communityId: row.community_id ? Number(row.community_id) : null,
    courseName: row.course_name || null,
    maxParticipants: Number(row.max_participants),
    allowMic: row.allow_mic === true,
    allowVideo: row.allow_video === true,
    allowScreenShare: row.allow_screen_share === true,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: {
      uid: row.creator_uid,
      displayName: row.creator_display_name,
      photoLink: row.creator_photo_link || null,
      platformRole: row.creator_platform_role || 'member',
    },
    activeParticipants: Number(row.active_participants || 0),
    canManage: row.can_manage === true,
  };
}

router.use('/api/rooms', requireAuthApi);

router.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/rooms')) {
    return next();
  }
  try {
    await bootstrapCommunityForUser(req.user.uid);
    await ensureRoomsReady();
    await maybeExpirePendingRequests();
    return next();
  } catch (error) {
    console.error('Rooms bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Rooms service is unavailable.' });
  }
});

router.get('/api/rooms/bootstrap', async (req, res) => {
  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const canCreatePublicRooms = isOwnerOrAdmin(viewer);
    const isPrivileged = canCreatePublicRooms;
    const hasModeratorRole = await hasAnyModeratorRole(viewer.uid);
    const canReviewRequests = isPrivileged || hasModeratorRole;
    const allowedHostCourseNames = await loadAllowedHostCourseNames(viewer.uid);
    const allowedHostCourseSet = new Set(allowedHostCourseNames);

    const communitiesResult = await pool.query(
      `SELECT
        c.id,
        c.course_code,
        c.course_name,
        COALESCE(cm.state, 'none') AS membership_state,
        EXISTS (
          SELECT 1
          FROM community_roles cr
          WHERE cr.community_id = c.id
            AND cr.user_uid = $1
            AND cr.role = 'moderator'
        ) AS is_moderator
      FROM communities c
      LEFT JOIN community_memberships cm
        ON cm.community_id = c.id
       AND cm.user_uid = $1
      WHERE
        $2::boolean = true
        OR COALESCE(cm.state, 'none') IN ('member', 'pending')
        OR EXISTS (
          SELECT 1
          FROM community_roles cr2
          WHERE cr2.community_id = c.id
            AND cr2.user_uid = $1
            AND cr2.role = 'moderator'
        )
        OR (COALESCE($3, '') <> '' AND lower(c.course_name) = lower($3))
        OR (COALESCE(array_length($4::text[], 1), 0) > 0 AND lower(c.course_name) = ANY($4::text[]))
      ORDER BY lower(c.course_name) ASC`,
      [viewer.uid, isPrivileged, viewer.course || null, allowedHostCourseNames]
    );

    const communities = communitiesResult.rows.map((row) => ({
      id: Number(row.id),
      courseCode: row.course_code || null,
      courseName: row.course_name,
      membershipState: row.membership_state,
      isModerator: row.is_moderator === true,
      canCreateHere: canCreatePublicRooms || row.is_moderator === true,
    }));

    const requestHostCommunities = communities.filter((community) => {
      const normalized = normalizeCourseName(community.courseName);
      return normalized && allowedHostCourseSet.has(normalized);
    });
    let pendingRequestsToReview = 0;
    if (canReviewRequests) {
      const pendingCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM room_requests rr
         WHERE rr.status = 'pending'
           AND rr.expires_at > NOW()
           AND (
             $1::boolean = true
             OR (
               rr.community_id IS NOT NULL
               AND EXISTS (
                 SELECT 1
                 FROM community_roles cr
                 WHERE cr.community_id = rr.community_id
                   AND cr.user_uid = $2
                   AND cr.role = 'moderator'
               )
             )
           )`,
        [isPrivileged, viewer.uid]
      );
      pendingRequestsToReview = Number(pendingCountResult.rows[0] && pendingCountResult.rows[0].total) || 0;
    }

    return res.json({
      ok: true,
      viewer: {
        uid: viewer.uid,
        displayName: displayNameFromRow(viewer),
        platformRole: viewer.platform_role,
        course: viewer.course || null,
        photoLink: await signPhotoIfNeeded(viewer.photo_link),
        canCreatePublicRooms,
        canReviewRequests,
      },
      communities,
      requestHostCommunities,
      pendingRequestsToReview,
    });
  } catch (error) {
    console.error('Rooms bootstrap fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load Rooms workspace.' });
  }
});

router.get('/api/rooms', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 18, 50);
  const viewerUid = req.user.uid;
  const stateFilter = sanitizeText(req.query.state || '', 30).toLowerCase();
  const context = sanitizeText(req.query.context || 'all', 20).toLowerCase();
  const communityId = parsePositiveInt(req.query.communityId);
  const mineOnly = parseBoolean(req.query.mine, false);

  const validStates = new Set(['scheduled', 'live', 'ended', 'canceled']);
  if (stateFilter && !validStates.has(stateFilter)) {
    return res.status(400).json({ ok: false, message: 'Invalid state filter.' });
  }

  if (context === 'community' && !communityId) {
    return res.status(400).json({ ok: false, message: 'communityId is required for community context.' });
  }

  try {
    const viewer = await getViewer(viewerUid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const conditions = [
      `(r.state <> 'ended' OR r.ended_at IS NULL OR r.ended_at > NOW() - INTERVAL '1 minute')`,
      `(
        r.visibility = 'public'
        OR (
          r.visibility = 'course_exclusive'
          AND (
            $2::text IN ('owner', 'admin')
            OR (
              COALESCE($3::text, '') <> ''
              AND lower(COALESCE(r.course_name, '')) = lower($3::text)
            )
            OR EXISTS (
              SELECT 1
              FROM community_memberships cm
              WHERE cm.community_id = r.community_id
                AND cm.user_uid = $1
                AND cm.state = 'member'
            )
            OR EXISTS (
              SELECT 1
              FROM community_roles cr
              WHERE cr.community_id = r.community_id
                AND cr.user_uid = $1
                AND cr.role = 'moderator'
            )
          )
        )
        OR (r.visibility = 'private' AND lower(r.creator_uid) = lower($1))
      )`,
      `NOT EXISTS (
        SELECT 1
        FROM blocked_users bu
        WHERE (bu.blocker_uid = r.creator_uid AND bu.blocked_uid = $1)
           OR (bu.blocker_uid = $1 AND bu.blocked_uid = r.creator_uid)
      )`,
    ];
    const params = [viewerUid, viewer.platform_role, viewer.course || null];

    if (context === 'public') {
      conditions.push(`r.visibility = 'public'`);
    } else if (context === 'community' && communityId) {
      params.push(communityId);
      conditions.push(`r.community_id = $${params.length}`);
    }

    if (stateFilter) {
      params.push(stateFilter);
      conditions.push(`r.state = $${params.length}`);
    }

    if (mineOnly) {
      conditions.push(`lower(r.creator_uid) = lower($1)`);
    }

    params.push(pageSize, offset);

    const query = `
      SELECT
        r.*,
        a.uid AS creator_uid,
        a.email,
        a.username,
        a.display_name AS account_display_name,
        COALESCE(a.platform_role, 'member') AS creator_platform_role,
        p.display_name AS profile_display_name,
        p.photo_link,
        (
          SELECT COUNT(*)::int
          FROM room_participants rp
          WHERE rp.room_id = r.id
            AND rp.status = 'active'
        ) AS active_participants,
        (
          $2::text IN ('owner', 'admin')
          OR lower(r.creator_uid) = lower($1)
          OR (
            r.community_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM community_roles cr2
              WHERE cr2.community_id = r.community_id
                AND cr2.user_uid = $1
                AND cr2.role = 'moderator'
            )
          )
        ) AS can_manage
      FROM rooms r
      JOIN accounts a ON a.uid = r.creator_uid
      LEFT JOIN profiles p ON p.uid = r.creator_uid
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE r.state
          WHEN 'live' THEN 0
          WHEN 'scheduled' THEN 1
          WHEN 'ended' THEN 2
          ELSE 3
        END,
        COALESCE(r.scheduled_at, r.created_at) DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;

    const result = await pool.query(query, params);
    const rooms = await Promise.all(
      result.rows.map(async (row) => ({
        ...toRoomResponse({
          ...row,
          creator_display_name: displayNameFromRow(row),
          creator_photo_link: await signPhotoIfNeeded(row.photo_link),
        }),
      }))
    );

    return res.json({
      ok: true,
      rooms,
      pagination: { page, pageSize, count: rooms.length },
    });
  } catch (error) {
    console.error('Rooms fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load rooms.' });
  }
});

router.get('/api/rooms/search', async (req, res) => {
  const meetId = sanitizeText(req.query.meetId || '', 80).toUpperCase();
  if (!meetId || !/^[A-Z0-9_-]{3,80}$/.test(meetId)) {
    return res.status(400).json({ ok: false, message: 'Enter a valid Meet ID.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const result = await pool.query(
      `SELECT
        r.*,
        a.uid AS creator_uid,
        a.email,
        a.username,
        a.display_name AS account_display_name,
        COALESCE(a.platform_role, 'member') AS creator_platform_role,
        p.display_name AS profile_display_name,
        p.photo_link
       FROM rooms r
       JOIN accounts a ON a.uid = r.creator_uid
       LEFT JOIN profiles p ON p.uid = r.creator_uid
       WHERE upper(r.meet_id) = $1
       LIMIT 1`,
      [meetId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }

    const row = result.rows[0];
    if (row.state === 'ended' || row.state === 'canceled') {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }

    const blockedResult = await pool.query(
      `SELECT 1
       FROM blocked_users bu
       WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = $2)
          OR (bu.blocker_uid = $2 AND bu.blocked_uid = $1)
       LIMIT 1`,
      [row.creator_uid, viewer.uid]
    );
    if (blockedResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }

    const canModerateRoomCommunity = row.community_id
      ? await isCommunityModerator(Number(row.community_id), viewer.uid)
      : false;
    const canManage =
      isOwnerOrAdmin(viewer) || isSameUid(row.creator_uid, viewer.uid) || canModerateRoomCommunity;

    let canAccess = canManage || row.visibility === 'public' || row.visibility === 'private';
    if (!canAccess && row.visibility === 'course_exclusive') {
      const courseMatches =
        Boolean(viewer.course) &&
        Boolean(row.course_name) &&
        String(viewer.course).trim().toLowerCase() === String(row.course_name).trim().toLowerCase();
      const hasMembership = row.community_id
        ? await hasCommunityMembership(Number(row.community_id), viewer.uid)
        : false;
      canAccess = courseMatches || hasMembership;
    }

    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }

    const activeCountResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM room_participants
       WHERE room_id = $1
         AND status = 'active'`,
      [row.id]
    );

    return res.json({
      ok: true,
      room: toRoomResponse({
        ...row,
        creator_display_name: displayNameFromRow(row),
        creator_photo_link: await signPhotoIfNeeded(row.photo_link),
        active_participants: Number(activeCountResult.rows[0] && activeCountResult.rows[0].total) || 0,
        can_manage: canManage,
      }),
    });
  } catch (error) {
    console.error('Room search failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to search room.' });
  }
});

router.post('/api/rooms', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_create_direct', 25)) return;

  const input = normalizeRoomInput(req.body);
  const validationError = validateRoomInput(input);
  if (validationError) {
    return res.status(400).json({ ok: false, message: validationError });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const viewer = await getViewer(req.user.uid, client);
    if (!viewer) {
      await client.query('ROLLBACK');
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const community = input.communityId
      ? await getCommunityById(input.communityId, client)
      : null;
    if (input.communityId && !community) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Selected course community was not found.' });
    }

    const canCreate = await canCreateRoomDirect(viewer, input.visibility, input.communityId, client);
    if (!canCreate) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: 'You cannot create this room directly. Submit a room request instead.',
      });
    }

    if (
      input.visibility === 'course_exclusive' &&
      !(await hasCommunityMembership(input.communityId, viewer.uid, client)) &&
      !(await isCommunityModerator(input.communityId, viewer.uid, client)) &&
      !isOwnerOrAdmin(viewer)
    ) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        message: 'You must belong to the selected community to create a course-exclusive room.',
      });
    }

    const meetId = await generateUniqueMeetId(client);
    const state = computeRoomState(input.scheduledAt);
    const passwordHash =
      input.visibility === 'private' && input.meetPassword
        ? await hashRoomPassword(input.meetPassword)
        : null;

    const inserted = await client.query(
      `INSERT INTO rooms
        (meet_id, meet_name, creator_uid, visibility, community_id, course_name, max_participants,
         allow_mic, allow_video, allow_screen_share, password_hash, state, scheduled_at, started_at, ended_at, source_request_id, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14, NULL, NULL, NOW(), NOW())
       RETURNING *`,
      [
        meetId,
        input.meetName,
        viewer.uid,
        input.visibility,
        input.communityId || null,
        community ? community.course_name : null,
        input.maxParticipants,
        input.allowMic,
        input.allowVideo,
        input.allowScreenShare,
        passwordHash,
        state,
        input.scheduledAt,
        state === 'live' ? new Date() : null,
      ]
    );

    const room = inserted.rows[0];
    let inviteLink = null;
    if (room.visibility === 'private') {
      const inviteToken = await createPrivateInvite(client, Number(room.id), viewer.uid, 24);
      inviteLink = buildInviteLink(req, room.meet_id, inviteToken);
    }

    await client.query(
      `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
       VALUES ($1, $2, NULL, 'create_room', $3::jsonb)`,
      [room.id, viewer.uid, JSON.stringify({ visibility: room.visibility, state: room.state })]
    );

    await client.query('COMMIT');

    const mapped = toRoomResponse({
      ...room,
      creator_display_name: displayNameFromRow(viewer),
      creator_photo_link: await signPhotoIfNeeded(viewer.photo_link),
      creator_platform_role: viewer.platform_role,
      active_participants: 0,
      can_manage: true,
    });

    return res.status(201).json({
      ok: true,
      room: mapped,
      inviteLink,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Room create failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to create room.' });
  } finally {
    client.release();
  }
});

router.post('/api/rooms/requests', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_request_create', 20)) return;

  const input = normalizeRoomInput(req.body);
  const validationError = validateRoomInput(input);
  if (validationError) {
    return res.status(400).json({ ok: false, message: validationError });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const community = input.communityId ? await getCommunityById(input.communityId) : null;
    if (input.communityId && !community) {
      return res.status(404).json({ ok: false, message: 'Selected course community was not found.' });
    }

    if (input.visibility === 'course_exclusive') {
      const allowedHostCourseNames = await loadAllowedHostCourseNames(viewer.uid);
      const allowedHostCourseSet = new Set(allowedHostCourseNames);
      const selectedCourseName = normalizeCourseName(community && community.course_name);
      if (!selectedCourseName || !allowedHostCourseSet.has(selectedCourseName)) {
        return res.status(403).json({
          ok: false,
          message: 'You can only request course rooms for your main course or listed sub-courses.',
        });
      }
    }
    const canCreateDirect = await canCreateRoomDirect(viewer, input.visibility, input.communityId);
    if (canCreateDirect) {
      return res.status(400).json({
        ok: false,
        message: 'You can create this room directly. Use Create Room instead of request.',
      });
    }

    if (input.visibility === 'course_exclusive') {
      const allowedHostCourseNames = await loadAllowedHostCourseNames(viewer.uid);
      const allowedHostCourseSet = new Set(allowedHostCourseNames);
      const selectedCourseName = normalizeCourseName(community && community.course_name);
      if (!selectedCourseName || !allowedHostCourseSet.has(selectedCourseName)) {
        return res.status(403).json({
          ok: false,
          message: 'You can only request course rooms for your main course or listed sub-courses.',
        });
      }

      const hasMembership = await hasCommunityMembership(input.communityId, viewer.uid);
      if (!hasMembership) {
        return res.status(403).json({
          ok: false,
          message: 'You must be a member of the selected community to request a course-exclusive room.',
        });
      }
    }
    const pendingCountResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM room_requests
       WHERE requester_uid = $1
         AND status = 'pending'
         AND expires_at > NOW()`,
      [viewer.uid]
    );
    const pendingCount = Number(pendingCountResult.rows[0] && pendingCountResult.rows[0].total) || 0;
    if (pendingCount >= 3) {
      return res.status(429).json({
        ok: false,
        message: 'You already have 3 pending room requests. Wait for review before creating more.',
      });
    }

    const passwordHash =
      input.visibility === 'private' && input.meetPassword
        ? await hashRoomPassword(input.meetPassword)
        : null;

    const requestResult = await pool.query(
      `INSERT INTO room_requests
        (requester_uid, meet_name, visibility, community_id, course_name, max_participants,
         allow_mic, allow_video, allow_screen_share, password_hash, scheduled_at,
         status, expires_at, reviewed_by_uid, reviewed_at, decision_note, approved_room_id, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         'pending', NOW() + INTERVAL '1 day', NULL, NULL, NULL, NULL, NOW(), NOW())
       RETURNING *`,
      [
        viewer.uid,
        input.meetName,
        input.visibility,
        input.communityId || null,
        community ? community.course_name : null,
        input.maxParticipants,
        input.allowMic,
        input.allowVideo,
        input.allowScreenShare,
        passwordHash,
        input.scheduledAt,
      ]
    );

    await pool.query(
      `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
       VALUES (NULL, $1, NULL, 'request_room', $2::jsonb)`,
      [
        viewer.uid,
        JSON.stringify({
          requestId: Number(requestResult.rows[0].id),
          visibility: input.visibility,
          communityId: input.communityId || null,
        }),
      ]
    );

    return res.status(201).json({
      ok: true,
      request: {
        id: Number(requestResult.rows[0].id),
        meetName: requestResult.rows[0].meet_name,
        visibility: requestResult.rows[0].visibility,
        communityId: requestResult.rows[0].community_id ? Number(requestResult.rows[0].community_id) : null,
        courseName: requestResult.rows[0].course_name || null,
        maxParticipants: Number(requestResult.rows[0].max_participants),
        status: requestResult.rows[0].status,
        expiresAt: requestResult.rows[0].expires_at,
        createdAt: requestResult.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Room request create failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to submit room request.' });
  }
});

router.get('/api/rooms/requests', async (req, res) => {
  const { page, pageSize, offset } = parsePagination(req, 20, 50);
  const status = sanitizeText(req.query.status || 'pending', 20).toLowerCase();
  const communityId = parsePositiveInt(req.query.communityId);
  const validStatus = new Set(['pending', 'approved', 'rejected', 'expired']);
  if (!validStatus.has(status)) {
    return res.status(400).json({ ok: false, message: 'Invalid request status.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const canReviewAny = isOwnerOrAdmin(viewer);
    const hasModerator = canReviewAny ? true : await hasAnyModeratorRole(viewer.uid);
    if (!canReviewAny && !hasModerator) {
      return res.status(403).json({ ok: false, message: 'Not allowed to review room requests.' });
    }

    const params = [status, viewer.uid, canReviewAny];
    const conditions = [
      `rr.status = $1`,
      `(
        $3::boolean = true
        OR (
          rr.community_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM community_roles cr
            WHERE cr.community_id = rr.community_id
              AND cr.user_uid = $2
              AND cr.role = 'moderator'
          )
        )
      )`,
    ];

    if (status === 'pending') {
      conditions.push(`rr.expires_at > NOW()`);
    }

    if (communityId) {
      params.push(communityId);
      conditions.push(`rr.community_id = $${params.length}`);
    }

    params.push(pageSize, offset);

    const result = await pool.query(
      `SELECT
        rr.*,
        c.course_name AS community_course_name,
        a.uid AS requester_uid,
        a.email,
        a.username,
        a.display_name AS account_display_name,
        p.display_name AS profile_display_name,
        p.photo_link
       FROM room_requests rr
       JOIN accounts a ON a.uid = rr.requester_uid
       LEFT JOIN profiles p ON p.uid = rr.requester_uid
       LEFT JOIN communities c ON c.id = rr.community_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY rr.created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    const requests = await Promise.all(
      result.rows.map(async (row) => ({
        id: Number(row.id),
        meetName: row.meet_name,
        visibility: row.visibility,
        communityId: row.community_id ? Number(row.community_id) : null,
        courseName: row.course_name || row.community_course_name || null,
        maxParticipants: Number(row.max_participants),
        allowMic: row.allow_mic === true,
        allowVideo: row.allow_video === true,
        allowScreenShare: row.allow_screen_share === true,
        scheduledAt: row.scheduled_at,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        requester: {
          uid: row.requester_uid,
          displayName: displayNameFromRow(row),
          photoLink: await signPhotoIfNeeded(row.photo_link),
        },
      }))
    );

    return res.json({
      ok: true,
      requests,
      pagination: { page, pageSize, count: requests.length },
    });
  } catch (error) {
    console.error('Room requests fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load room requests.' });
  }
});

router.post('/api/rooms/requests/:id/approve', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_request_approve', 25)) return;
  const requestId = parsePositiveInt(req.params.id);
  if (!requestId) {
    return res.status(400).json({ ok: false, message: 'Invalid request id.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const viewer = await getViewer(req.user.uid, client);
    if (!viewer) {
      await client.query('ROLLBACK');
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const requestResult = await client.query(
      `SELECT *
       FROM room_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );
    if (!requestResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Room request not found.' });
    }

    const requestRow = requestResult.rows[0];
    if (requestRow.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'This request has already been reviewed.' });
    }
    if (new Date(requestRow.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE room_requests
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [requestId]
      );
      await client.query('COMMIT');
      return res.status(410).json({ ok: false, message: 'This request has expired.' });
    }

    const canReview = await canReviewRoomRequest(
      viewer,
      requestRow.visibility,
      requestRow.community_id,
      client
    );
    if (!canReview) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'You are not allowed to approve this request.' });
    }

    if (isSameUid(requestRow.requester_uid, viewer.uid)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'You cannot approve your own room request.' });
    }

    const meetId = await generateUniqueMeetId(client);
    const state = computeRoomState(requestRow.scheduled_at);

    const insertRoom = await client.query(
      `INSERT INTO rooms
        (meet_id, meet_name, creator_uid, visibility, community_id, course_name, max_participants,
         allow_mic, allow_video, allow_screen_share, password_hash, state, scheduled_at, started_at, ended_at, source_request_id, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14, NULL, $15, NOW(), NOW())
       RETURNING *`,
      [
        meetId,
        requestRow.meet_name,
        requestRow.requester_uid,
        requestRow.visibility,
        requestRow.community_id,
        requestRow.course_name || null,
        requestRow.max_participants,
        requestRow.allow_mic,
        requestRow.allow_video,
        requestRow.allow_screen_share,
        requestRow.password_hash || null,
        state,
        requestRow.scheduled_at,
        state === 'live' ? new Date() : null,
        requestRow.id,
      ]
    );
    const room = insertRoom.rows[0];

    let inviteLink = null;
    if (room.visibility === 'private') {
      const inviteToken = await createPrivateInvite(client, Number(room.id), viewer.uid, 24);
      inviteLink = buildInviteLink(req, room.meet_id, inviteToken);
    }

    await client.query(
      `UPDATE room_requests
       SET status = 'approved',
           reviewed_by_uid = $2,
           reviewed_at = NOW(),
           approved_room_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [requestRow.id, viewer.uid, room.id]
    );

    await client.query(
      `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
       VALUES ($1, $2, $3, 'approve_request', $4::jsonb)`,
      [
        room.id,
        viewer.uid,
        requestRow.requester_uid,
        JSON.stringify({ requestId: requestRow.id, visibility: requestRow.visibility }),
      ]
    );

    await client.query('COMMIT');

    const creator = await getViewer(requestRow.requester_uid);
    return res.json({
      ok: true,
      room: toRoomResponse({
        ...room,
        creator_display_name: creator ? displayNameFromRow(creator) : 'Member',
        creator_photo_link: creator ? await signPhotoIfNeeded(creator.photo_link) : null,
        creator_platform_role: creator ? creator.platform_role : 'member',
        active_participants: 0,
        can_manage: true,
      }),
      inviteLink,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Room request approval failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to approve room request.' });
  } finally {
    client.release();
  }
});

router.post('/api/rooms/requests/:id/reject', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_request_reject', 30)) return;
  const requestId = parsePositiveInt(req.params.id);
  const note = sanitizeText(req.body && req.body.note, 800);
  if (!requestId) {
    return res.status(400).json({ ok: false, message: 'Invalid request id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const requestResult = await pool.query(
      `SELECT *
       FROM room_requests
       WHERE id = $1
       LIMIT 1`,
      [requestId]
    );
    if (!requestResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room request not found.' });
    }

    const requestRow = requestResult.rows[0];
    if (requestRow.status !== 'pending') {
      return res.status(409).json({ ok: false, message: 'This request has already been reviewed.' });
    }

    const canReview = await canReviewRoomRequest(viewer, requestRow.visibility, requestRow.community_id);
    if (!canReview) {
      return res.status(403).json({ ok: false, message: 'You are not allowed to reject this request.' });
    }

    await pool.query(
      `UPDATE room_requests
       SET status = 'rejected',
           reviewed_by_uid = $2,
           reviewed_at = NOW(),
           decision_note = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [requestRow.id, viewer.uid, note || null]
    );

    await pool.query(
      `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
       VALUES (NULL, $1, $2, 'reject_request', $3::jsonb)`,
      [viewer.uid, requestRow.requester_uid, JSON.stringify({ requestId: requestRow.id, note: note || null })]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Room request rejection failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to reject room request.' });
  }
});

router.post('/api/rooms/:id/join', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_join', 80)) return;
  const roomId = parsePositiveInt(req.params.id);
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'Invalid room id.' });
  }

  const inviteToken = sanitizeText(req.body && req.body.invite_token, 512);
  const meetPassword = typeof (req.body && req.body.meet_password) === 'string' ? req.body.meet_password : '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const viewer = await getViewer(req.user.uid, client);
    if (!viewer) {
      await client.query('ROLLBACK');
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const roomResult = await client.query(
      `SELECT r.*
       FROM rooms r
       WHERE r.id = $1
       FOR UPDATE`,
      [roomId]
    );
    if (!roomResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }
    const room = roomResult.rows[0];
    const isCreator = isSameUid(room.creator_uid, viewer.uid);

    const blockedResult = await client.query(
      `SELECT 1
       FROM blocked_users bu
       WHERE (bu.blocker_uid = $1 AND bu.blocked_uid = $2)
          OR (bu.blocker_uid = $2 AND bu.blocked_uid = $1)
       LIMIT 1`,
      [room.creator_uid, viewer.uid]
    );
    if (blockedResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'You cannot join this room.' });
    }

    const canModerateRoomCommunity = room.community_id
      ? await isCommunityModerator(Number(room.community_id), viewer.uid, client)
      : false;
    const canManage = isOwnerOrAdmin(viewer) || isCreator || canModerateRoomCommunity;

    if (room.visibility === 'course_exclusive') {
      let allowed = canManage;
      if (!allowed) {
        const courseMatches =
          Boolean(viewer.course) &&
          Boolean(room.course_name) &&
          String(viewer.course).trim().toLowerCase() === String(room.course_name).trim().toLowerCase();
        const hasMembership = room.community_id
          ? await hasCommunityMembership(Number(room.community_id), viewer.uid, client)
          : false;
        allowed = courseMatches || hasMembership;
      }
      if (!allowed) {
        await client.query('ROLLBACK');
        return res.status(403).json({ ok: false, message: 'You are not allowed to join this course room.' });
      }
    } else if (room.visibility === 'private' && !canManage) {
      let inviteAuthorized = false;
      if (inviteToken) {
        const inviteDigest = sha256Hex(inviteToken);
        const inviteResult = await client.query(
          `SELECT id
           FROM room_invites
           WHERE room_id = $1
             AND token_digest = $2
             AND revoked_at IS NULL
             AND expires_at > NOW()
           LIMIT 1`,
          [room.id, inviteDigest]
        );
        inviteAuthorized = inviteResult.rows.length > 0;
      }

      if (!inviteAuthorized && room.password_hash) {
        const passwordOk = await verifyRoomPassword(meetPassword, room.password_hash);
        if (!passwordOk) {
          await client.query('ROLLBACK');
          return res.status(403).json({ ok: false, message: 'Valid room password is required.' });
        }
      }
    }

    if (room.state === 'ended' || room.state === 'canceled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'This room is no longer active.' });
    }
    if (room.state === 'pending_approval') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'This room is still pending approval.' });
    }

    let resolvedState = room.state;
    if (room.state === 'scheduled') {
      if (!canManage) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, message: 'This room has not started yet.' });
      }
      await client.query(
        `UPDATE rooms
         SET state = 'live',
             started_at = COALESCE(started_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [room.id]
      );
      await client.query(
        `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
         VALUES ($1, $2, NULL, 'start_room', '{"source":"join"}'::jsonb)`,
        [room.id, viewer.uid]
      );
      resolvedState = 'live';
    }

    if (resolvedState !== 'live') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'This room cannot be joined right now.' });
    }

    const existingParticipantResult = await client.query(
      `SELECT status
       FROM room_participants
       WHERE room_id = $1
         AND user_uid = $2
       LIMIT 1`,
      [room.id, viewer.uid]
    );
    const existingStatus = existingParticipantResult.rows[0] ? existingParticipantResult.rows[0].status : null;
    if (existingStatus === 'kicked' && !canManage) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'You were removed from this room.' });
    }

    if (existingStatus !== 'active') {
      const activeCountResult = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM room_participants
         WHERE room_id = $1
           AND status = 'active'`,
        [room.id]
      );
      const activeCount = Number(activeCountResult.rows[0] && activeCountResult.rows[0].total) || 0;
      if (activeCount >= Number(room.max_participants)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ ok: false, message: 'Room is full.' });
      }
    }

    await client.query(
      `INSERT INTO room_participants
        (room_id, user_uid, role, status, mic_on, video_on, screen_sharing, joined_at, left_at)
       VALUES
        ($1, $2, $3, 'active', $4, $5, false, NOW(), NULL)
       ON CONFLICT (room_id, user_uid)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = 'active',
         screen_sharing = false,
         joined_at = CASE
           WHEN room_participants.status = 'active' THEN room_participants.joined_at
           ELSE NOW()
         END,
         left_at = NULL`,
      [room.id, viewer.uid, isCreator ? 'host' : 'participant', room.allow_mic, room.allow_video]
    );

    await client.query('COMMIT');
    return res.json({
      ok: true,
      room: {
        id: Number(room.id),
        meetId: room.meet_id,
        state: resolvedState,
      },
      joinUrl: buildCallLink(room.meet_id),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Room join failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to join room.' });
  } finally {
    client.release();
  }
});

router.get('/api/rooms/:id/session', async (req, res) => {
  const roomId = parsePositiveInt(req.params.id);
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'Invalid room id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const roomResult = await pool.query(
      `SELECT r.*
       FROM rooms r
       WHERE r.id = $1
       LIMIT 1`,
      [roomId]
    );
    if (!roomResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }
    const room = roomResult.rows[0];
    const participantResult = await pool.query(
      `SELECT status, role, joined_at, left_at
       FROM room_participants
       WHERE room_id = $1
         AND user_uid = $2
       LIMIT 1`,
      [roomId, viewer.uid]
    );
    const participant = participantResult.rows[0] || null;
    const participantStatus = participant ? participant.status : 'none';

    const isCreator = isSameUid(room.creator_uid, viewer.uid);
    const canModerateRoomCommunity = room.community_id
      ? await isCommunityModerator(Number(room.community_id), viewer.uid)
      : false;
    const canManage = isOwnerOrAdmin(viewer) || isCreator || canModerateRoomCommunity;

    let canAccess = canManage || room.visibility === 'public';
    if (!canAccess && room.visibility === 'course_exclusive') {
      const courseMatches =
        Boolean(viewer.course) &&
        Boolean(room.course_name) &&
        String(viewer.course).trim().toLowerCase() === String(room.course_name).trim().toLowerCase();
      const hasMembership = room.community_id
        ? await hasCommunityMembership(Number(room.community_id), viewer.uid)
        : false;
      canAccess = courseMatches || hasMembership;
    } else if (!canAccess && room.visibility === 'private') {
      canAccess = participantStatus !== 'none';
    }

    if (!canAccess) {
      return res.status(403).json({ ok: false, message: 'You are not allowed to view this room session.' });
    }

    const activeCountResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM room_participants
       WHERE room_id = $1
         AND status = 'active'`,
      [roomId]
    );
    const activeParticipants = Number(activeCountResult.rows[0] && activeCountResult.rows[0].total) || 0;

    return res.json({
      ok: true,
      room: {
        id: Number(room.id),
        meetId: room.meet_id,
        state: room.state,
        endedAt: room.ended_at,
        updatedAt: room.updated_at,
        activeParticipants,
      },
      participant: {
        status: participantStatus,
        role: participant ? participant.role : null,
        joinedAt: participant ? participant.joined_at : null,
        leftAt: participant ? participant.left_at : null,
      },
    });
  } catch (error) {
    console.error('Room session fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load room session.' });
  }
});

router.post('/api/rooms/:id/leave', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_leave', 120)) return;
  const roomId = parsePositiveInt(req.params.id);
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'Invalid room id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const roomResult = await pool.query(
      `SELECT id, state
       FROM rooms
       WHERE id = $1
       LIMIT 1`,
      [roomId]
    );
    if (!roomResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }
    const room = roomResult.rows[0];

    const update = await pool.query(
      `UPDATE room_participants
       SET status = 'left',
           left_at = NOW()
       WHERE room_id = $1
         AND user_uid = $2
         AND status = 'active'`,
      [roomId, viewer.uid]
    );

    return res.json({
      ok: true,
      left: update.rowCount > 0,
      room: { id: Number(room.id), state: room.state },
    });
  } catch (error) {
    console.error('Room leave failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to leave room.' });
  }
});

router.post('/api/rooms/:id/start', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_start', 40)) return;
  const roomId = parsePositiveInt(req.params.id);
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'Invalid room id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const roomResult = await pool.query(
      `SELECT r.*
       FROM rooms r
       WHERE r.id = $1
       LIMIT 1`,
      [roomId]
    );
    if (!roomResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }
    const room = roomResult.rows[0];
    const canModerateRoomCommunity = room.community_id
      ? await isCommunityModerator(Number(room.community_id), viewer.uid)
      : false;
    const canManage = isOwnerOrAdmin(viewer) || isSameUid(room.creator_uid, viewer.uid) || canModerateRoomCommunity;
    if (!canManage) {
      return res.status(403).json({ ok: false, message: 'You are not allowed to start this room.' });
    }

    if (room.state === 'ended' || room.state === 'canceled') {
      return res.status(409).json({ ok: false, message: 'This room cannot be started anymore.' });
    }
    if (room.state === 'live') {
      return res.json({ ok: true, state: 'live' });
    }

    await pool.query(
      `UPDATE rooms
       SET state = 'live',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [roomId]
    );

    await pool.query(
      `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
       VALUES ($1, $2, NULL, 'start_room', '{}'::jsonb)`,
      [roomId, viewer.uid]
    );

    return res.json({ ok: true, state: 'live' });
  } catch (error) {
    console.error('Room start failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to start room.' });
  }
});

router.post('/api/rooms/:id/end', async (req, res) => {
  if (!enforceRateLimit(req, res, 'room_end', 40)) return;
  const roomId = parsePositiveInt(req.params.id);
  if (!roomId) {
    return res.status(400).json({ ok: false, message: 'Invalid room id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const roomResult = await pool.query(
      `SELECT r.*
       FROM rooms r
       WHERE r.id = $1
       LIMIT 1`,
      [roomId]
    );
    if (!roomResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Room not found.' });
    }
    const room = roomResult.rows[0];
    const canModerateRoomCommunity = room.community_id
      ? await isCommunityModerator(Number(room.community_id), viewer.uid)
      : false;
    const canManage = isOwnerOrAdmin(viewer) || isSameUid(room.creator_uid, viewer.uid) || canModerateRoomCommunity;
    if (!canManage) {
      return res.status(403).json({ ok: false, message: 'You are not allowed to end this room.' });
    }

    if (room.state === 'ended') {
      return res.json({ ok: true, state: 'ended' });
    }
    if (room.state === 'canceled') {
      return res.status(409).json({ ok: false, message: 'Canceled rooms cannot be ended.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE rooms
         SET state = 'ended',
             ended_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [roomId]
      );
      const participantsUpdate = await client.query(
        `UPDATE room_participants
         SET status = CASE
               WHEN lower(user_uid) = lower($2) THEN 'left'
               ELSE 'kicked'
             END,
             left_at = NOW()
         WHERE room_id = $1
           AND status = 'active'`,
        [roomId, viewer.uid]
      );

      await client.query(
        `INSERT INTO room_moderation_events (room_id, actor_uid, target_uid, action, meta)
         VALUES ($1, $2, NULL, 'end_room', $3::jsonb)`,
        [
          roomId,
          viewer.uid,
          JSON.stringify({ forcedParticipantExitCount: Number(participantsUpdate.rowCount || 0) }),
        ]
      );
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    return res.json({ ok: true, state: 'ended' });
  } catch (error) {
    console.error('Room end failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to end room.' });
  }
});

router.use('/api/rooms', (err, req, res, next) => {
  console.error('Rooms route error:', err);
  return res.status(500).json({ ok: false, message: 'Unexpected Rooms error.' });
});

module.exports = router;
