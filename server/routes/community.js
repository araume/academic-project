const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { uploadToStorage, deleteFromStorage, getSignedUrl } = require('../services/storage');
const { bootstrapCommunityForUser } = require('../services/communityService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});
const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000;

function sanitizeText(value, maxLen = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
  const current = rateBuckets.get(key);

  if (!current || now - current.start > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, start: now });
    return true;
  }

  if (current.count >= limitPerWindow) {
    res.status(429).json({ ok: false, message: 'Too many requests. Please try again shortly.' });
    return false;
  }

  current.count += 1;
  return true;
}

async function signPhotoIfNeeded(photoLink) {
  if (!photoLink) return null;
  if (photoLink.startsWith('http')) return photoLink;
  try {
    return await getSignedUrl(photoLink, SIGNED_TTL);
  } catch (error) {
    console.error('Community photo signing failed:', error);
    return null;
  }
}

async function signCommunityAttachment(rawAttachment) {
  if (!rawAttachment || !rawAttachment.type) return null;
  const attachment = { ...rawAttachment };

  if ((attachment.type === 'image' || attachment.type === 'video') && attachment.key) {
    if (attachment.key.startsWith('http')) {
      attachment.link = attachment.key;
      return attachment;
    }
    try {
      attachment.link = await getSignedUrl(attachment.key, SIGNED_TTL);
      return attachment;
    } catch (error) {
      console.error('Community attachment signing failed:', error);
      return null;
    }
  }

  return attachment;
}

function displayNameFromRow(row) {
  return row.profile_display_name || row.account_display_name || row.username || row.email || 'Member';
}

async function getViewer(uid) {
  const result = await pool.query(
    `SELECT uid, email, username, display_name, course, COALESCE(platform_role, 'member') AS platform_role
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

async function getCommunity(communityId) {
  const result = await pool.query(
    `SELECT id, course_code, course_name, slug, description, created_at
     FROM communities
     WHERE id = $1
     LIMIT 1`,
    [communityId]
  );
  return result.rows[0] || null;
}

async function getMembership(communityId, uid) {
  const result = await pool.query(
    `SELECT state, joined_at, left_at, banned_at, updated_at
     FROM community_memberships
     WHERE community_id = $1 AND user_uid = $2
     LIMIT 1`,
    [communityId, uid]
  );
  return result.rows[0] || null;
}

async function getLatestRule(communityId) {
  const result = await pool.query(
    `SELECT version, content, created_at
     FROM community_rules
     WHERE community_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [communityId]
  );
  return result.rows[0] || null;
}

async function hasAcceptedRuleVersion(communityId, uid, version) {
  if (!version) return true;
  const result = await pool.query(
    `SELECT 1
     FROM community_rule_acceptances
     WHERE community_id = $1 AND user_uid = $2 AND version = $3
     LIMIT 1`,
    [communityId, uid, version]
  );
  return result.rows.length > 0;
}

async function isCommunityModerator(communityId, uid) {
  const result = await pool.query(
    `SELECT 1
     FROM community_roles
     WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'
     LIMIT 1`,
    [communityId, uid]
  );
  return result.rows.length > 0;
}

function isOwnerOrAdmin(viewer) {
  return viewer && (viewer.platform_role === 'owner' || viewer.platform_role === 'admin');
}

async function canModerateCommunity(viewer, communityId) {
  if (!viewer || !viewer.uid) return false;
  if (isOwnerOrAdmin(viewer)) return true;
  return isCommunityModerator(communityId, viewer.uid);
}

async function getCommunityAccess(viewer, communityId) {
  if (!viewer || !viewer.uid) {
    return {
      canReadFeed: false,
      canPost: false,
      canModerate: false,
      membership: null,
      latestRule: null,
      acceptedLatestRule: false,
      requiresRuleAcceptance: false,
      reason: 'Unauthorized.',
    };
  }

  const membership = await getMembership(communityId, viewer.uid);
  const latestRule = await getLatestRule(communityId);
  const acceptedLatestRule = await hasAcceptedRuleVersion(
    communityId,
    viewer.uid,
    latestRule ? Number(latestRule.version) : null
  );
  const canModerate = await canModerateCommunity(viewer, communityId);

  if (canModerate) {
    return {
      canReadFeed: true,
      canPost: true,
      canModerate,
      membership,
      latestRule,
      acceptedLatestRule,
      requiresRuleAcceptance: false,
    };
  }

  if (!membership || membership.state !== 'member') {
    return {
      canReadFeed: false,
      canPost: false,
      canModerate: false,
      membership,
      latestRule,
      acceptedLatestRule,
      requiresRuleAcceptance: false,
      reason: 'Join this community first.',
    };
  }

  if (!acceptedLatestRule && latestRule) {
    return {
      canReadFeed: false,
      canPost: false,
      canModerate: false,
      membership,
      latestRule,
      acceptedLatestRule,
      requiresRuleAcceptance: true,
      reason: 'Please accept the latest community rules first.',
    };
  }

  return {
    canReadFeed: true,
    canPost: true,
    canModerate: false,
    membership,
    latestRule,
    acceptedLatestRule,
    requiresRuleAcceptance: false,
  };
}

async function getTargetDisciplineState(communityId, targetUid) {
  const targetResult = await pool.query(
    `SELECT uid, email, username, display_name, COALESCE(platform_role, 'member') AS platform_role
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [targetUid]
  );
  if (!targetResult.rows.length) {
    return null;
  }

  const target = targetResult.rows[0];
  const isModerator = await isCommunityModerator(communityId, targetUid);
  return { target, isModerator };
}

function canDisciplineTarget(viewer, targetState) {
  if (!viewer || !targetState) return false;
  const target = targetState.target;

  if (viewer.uid === target.uid) return false;
  if (viewer.platform_role === 'owner') return true;

  if (viewer.platform_role === 'admin') {
    return target.platform_role !== 'owner' && target.platform_role !== 'admin';
  }

  if (targetState.isModerator) return false;
  return target.platform_role === 'member';
}

function isReportReviewer(viewer) {
  return viewer && (viewer.platform_role === 'owner' || viewer.platform_role === 'admin');
}

router.use('/api/community', requireAuthApi);

router.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/community')) {
    return next();
  }
  try {
    await bootstrapCommunityForUser(req.user.uid);
    return next();
  } catch (error) {
    console.error('Community bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Community service is unavailable.' });
  }
});

router.get('/api/community/bootstrap', async (req, res) => {
  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const rows = await pool.query(
      `SELECT
        c.id,
        c.course_code,
        c.course_name,
        c.slug,
        c.description,
        c.created_at,
        COALESCE(cm.state, 'none') AS membership_state,
        cm.updated_at AS membership_updated_at,
        EXISTS (
          SELECT 1 FROM community_roles cr
          WHERE cr.community_id = c.id
            AND cr.user_uid = $1
            AND cr.role = 'moderator'
        ) AS is_moderator,
        (SELECT COUNT(*)::int FROM community_memberships m WHERE m.community_id = c.id AND m.state = 'member') AS members_count,
        (SELECT COUNT(*)::int FROM community_memberships m WHERE m.community_id = c.id AND m.state = 'pending') AS pending_count,
        (SELECT MAX(version)::int FROM community_rules r WHERE r.community_id = c.id) AS latest_rule_version,
        EXISTS (
          SELECT 1
          FROM community_rule_acceptances a
          WHERE a.community_id = c.id
            AND a.user_uid = $1
            AND a.version = (SELECT MAX(version) FROM community_rules r2 WHERE r2.community_id = c.id)
        ) AS accepted_latest_rule
      FROM communities c
      LEFT JOIN community_memberships cm
        ON cm.community_id = c.id
       AND cm.user_uid = $1
      ORDER BY lower(c.course_name) ASC`,
      [viewer.uid]
    );

    const communities = rows.rows.map((row) => {
      const canModerate = isOwnerOrAdmin(viewer) || row.is_moderator === true;
      const latestRuleVersion = row.latest_rule_version ? Number(row.latest_rule_version) : null;
      const requiresRuleAcceptance =
        row.membership_state === 'member' &&
        Boolean(latestRuleVersion) &&
        row.accepted_latest_rule !== true;

      return {
        id: Number(row.id),
        courseCode: row.course_code || null,
        courseName: row.course_name,
        slug: row.slug,
        description: row.description || null,
        membersCount: Number(row.members_count || 0),
        pendingCount: Number(row.pending_count || 0),
        membershipState: row.membership_state,
        latestRuleVersion,
        acceptedLatestRule: row.accepted_latest_rule === true,
        requiresRuleAcceptance,
        isMainCourseCommunity: viewer.course && viewer.course.trim() === row.course_name,
        canModerate,
      };
    });

    return res.json({
      ok: true,
      viewer: {
        uid: viewer.uid,
        displayName: viewer.display_name || viewer.username || viewer.email,
        mainCourse: viewer.course || null,
        platformRole: viewer.platform_role || 'member',
      },
      communities,
    });
  } catch (error) {
    console.error('Community bootstrap payload failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load community data.' });
  }
});

router.get('/api/community/:id', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const access = await getCommunityAccess(viewer, communityId);
    const rule = access.latestRule;
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM community_memberships WHERE community_id = $1 AND state = 'member') AS members_count,
         (SELECT COUNT(*)::int FROM community_memberships WHERE community_id = $1 AND state = 'pending') AS pending_count,
         (SELECT COUNT(*)::int FROM community_posts WHERE community_id = $1 AND status = 'active') AS posts_count`,
      [communityId]
    );

    const stats = counts.rows[0] || { members_count: 0, pending_count: 0, posts_count: 0 };

    return res.json({
      ok: true,
      community: {
        id: Number(community.id),
        courseCode: community.course_code || null,
        courseName: community.course_name,
        slug: community.slug,
        description: community.description || null,
        stats: {
          membersCount: Number(stats.members_count || 0),
          pendingCount: Number(stats.pending_count || 0),
          postsCount: Number(stats.posts_count || 0),
        },
      },
      membershipState: access.membership ? access.membership.state : 'none',
      canModerate: access.canModerate,
      requiresRuleAcceptance: access.requiresRuleAcceptance,
      latestRule: rule
        ? {
            version: Number(rule.version),
            content: rule.content,
            createdAt: rule.created_at,
            accepted: access.acceptedLatestRule,
          }
        : null,
    });
  } catch (error) {
    console.error('Community detail failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load community detail.' });
  }
});

router.get('/api/community/:id/rules', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const rulesResult = await pool.query(
      `SELECT version, content, created_at
       FROM community_rules
       WHERE community_id = $1
       ORDER BY version DESC
       LIMIT 10`,
      [communityId]
    );

    const latestRule = rulesResult.rows[0] || null;
    const acceptedLatest = latestRule
      ? await hasAcceptedRuleVersion(communityId, req.user.uid, Number(latestRule.version))
      : true;

    return res.json({
      ok: true,
      latestRule: latestRule
        ? {
            version: Number(latestRule.version),
            content: latestRule.content,
            createdAt: latestRule.created_at,
            accepted: acceptedLatest,
          }
        : null,
      rules: rulesResult.rows.map((row) => ({
        version: Number(row.version),
        content: row.content,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Community rules fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load community rules.' });
  }
});

router.post('/api/community/:id/rules', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_rules_create', 20)) return;

  const communityId = parsePositiveInt(req.params.id);
  const content = sanitizeText(req.body && req.body.content, 20000);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Rules content is required.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to set community rules.' });
    }

    const versionResult = await pool.query(
      `SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version
       FROM community_rules
       WHERE community_id = $1`,
      [communityId]
    );
    const nextVersion = Number(versionResult.rows[0].next_version || 1);

    await pool.query(
      `INSERT INTO community_rules (community_id, version, content, created_by_uid)
       VALUES ($1, $2, $3, $4)`,
      [communityId, nextVersion, content, req.user.uid]
    );

    return res.json({ ok: true, version: nextVersion });
  } catch (error) {
    console.error('Community rules create failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to save rules.' });
  }
});

router.post('/api/community/:id/rules/accept', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_rules_accept', 30)) return;

  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const latestRule = await getLatestRule(communityId);
    if (!latestRule) {
      return res.json({ ok: true, accepted: true, version: null });
    }

    const acceptedVersion = parsePositiveInt(req.body && req.body.version) || Number(latestRule.version);
    const exists = await pool.query(
      `SELECT 1 FROM community_rules WHERE community_id = $1 AND version = $2 LIMIT 1`,
      [communityId, acceptedVersion]
    );
    if (!exists.rows.length) {
      return res.status(400).json({ ok: false, message: 'Rules version does not exist.' });
    }

    await pool.query(
      `INSERT INTO community_rule_acceptances (community_id, user_uid, version)
       VALUES ($1, $2, $3)
       ON CONFLICT (community_id, user_uid, version) DO NOTHING`,
      [communityId, req.user.uid, acceptedVersion]
    );

    return res.json({ ok: true, accepted: true, version: acceptedVersion });
  } catch (error) {
    console.error('Community rules accept failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to accept rules.' });
  }
});

router.post('/api/community/:id/join', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_join', 20)) return;

  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const membership = await getMembership(communityId, req.user.uid);
    if (membership && membership.state === 'banned') {
      return res.status(403).json({ ok: false, message: 'You are banned from this community.' });
    }
    if (membership && membership.state === 'member') {
      return res.json({ ok: true, state: 'member' });
    }

    const latestRule = await getLatestRule(communityId);
    const acceptedLatest = await hasAcceptedRuleVersion(
      communityId,
      req.user.uid,
      latestRule ? Number(latestRule.version) : null
    );

    const isMainCommunity = viewer.course && viewer.course.trim() === community.course_name;
    const canModerate = await canModerateCommunity(viewer, communityId);

    if (!isMainCommunity && latestRule && !acceptedLatest) {
      return res.status(400).json({
        ok: false,
        code: 'RULES_NOT_ACCEPTED',
        message: 'Accept the latest community rules before joining.',
        latestRuleVersion: Number(latestRule.version),
      });
    }

    const nextState = isMainCommunity || canModerate ? 'member' : 'pending';

    await pool.query(
      `INSERT INTO community_memberships
        (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
       VALUES
        ($1, $2, $3, CASE WHEN $3 = 'member' THEN NOW() ELSE NULL END, NULL, NULL, NOW())
       ON CONFLICT (community_id, user_uid)
       DO UPDATE SET
         state = EXCLUDED.state,
         joined_at = CASE
           WHEN EXCLUDED.state = 'member' THEN COALESCE(community_memberships.joined_at, NOW())
           ELSE community_memberships.joined_at
         END,
         left_at = NULL,
         banned_at = NULL,
         updated_at = NOW()`,
      [communityId, req.user.uid, nextState]
    );

    return res.json({
      ok: true,
      state: nextState,
      requiresApproval: nextState === 'pending',
    });
  } catch (error) {
    console.error('Community join failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to join community.' });
  }
});

router.post('/api/community/:id/leave', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_leave', 20)) return;

  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    if (viewer.course && viewer.course.trim() === community.course_name) {
      return res.status(400).json({ ok: false, message: 'You cannot leave your main course community directly.' });
    }

    const membership = await getMembership(communityId, req.user.uid);
    if (!membership || membership.state === 'left') {
      return res.json({ ok: true, state: 'left' });
    }

    if (membership.state === 'banned') {
      return res.status(400).json({ ok: false, message: 'Banned memberships cannot leave directly.' });
    }

    await pool.query(
      `UPDATE community_memberships
       SET state = 'left', left_at = NOW(), updated_at = NOW()
       WHERE community_id = $1 AND user_uid = $2`,
      [communityId, req.user.uid]
    );

    return res.json({ ok: true, state: 'left' });
  } catch (error) {
    console.error('Community leave failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to leave community.' });
  }
});

router.get('/api/community/:id/join-requests', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const { page, pageSize, offset } = parsePagination(req, 30, 80);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to view join requests.' });
    }

    const result = await pool.query(
      `SELECT
         cm.user_uid,
         cm.updated_at,
         a.email,
         a.username,
         a.display_name AS account_display_name,
         a.course,
         p.display_name AS profile_display_name,
         p.photo_link,
         COALESCE((
           SELECT MAX(version)::int FROM community_rules r WHERE r.community_id = cm.community_id
         ), 0) AS latest_rule_version,
         EXISTS (
           SELECT 1
           FROM community_rule_acceptances ra
           WHERE ra.community_id = cm.community_id
             AND ra.user_uid = cm.user_uid
             AND ra.version = (SELECT MAX(version) FROM community_rules r2 WHERE r2.community_id = cm.community_id)
         ) AS accepted_latest_rule
       FROM community_memberships cm
       JOIN accounts a ON a.uid = cm.user_uid
       LEFT JOIN profiles p ON p.uid = cm.user_uid
       WHERE cm.community_id = $1
         AND cm.state = 'pending'
       ORDER BY cm.updated_at ASC
       LIMIT $2 OFFSET $3`,
      [communityId, pageSize, offset]
    );

    const requests = await Promise.all(
      result.rows.map(async (row) => ({
        uid: row.user_uid,
        displayName: displayNameFromRow(row),
        course: row.course || null,
        photoLink: await signPhotoIfNeeded(row.photo_link),
        requestedAt: row.updated_at,
        acceptedLatestRule: row.accepted_latest_rule === true,
        latestRuleVersion: Number(row.latest_rule_version || 0) || null,
      }))
    );

    return res.json({ ok: true, page, pageSize, requests });
  } catch (error) {
    console.error('Community join requests fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load join requests.' });
  }
});

router.post('/api/community/:id/join-requests/:uid', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_join_requests_decide', 60)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  const action = sanitizeText(req.body && req.body.action, 16).toLowerCase();

  if (!communityId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Action must be approve or reject.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to decide join requests.' });
    }

    const membership = await getMembership(communityId, targetUid);
    if (!membership || membership.state !== 'pending') {
      return res.status(404).json({ ok: false, message: 'Pending join request not found.' });
    }

    if (action === 'approve') {
      const latestRule = await getLatestRule(communityId);
      const acceptedLatest = await hasAcceptedRuleVersion(
        communityId,
        targetUid,
        latestRule ? Number(latestRule.version) : null
      );

      if (latestRule && !acceptedLatest) {
        return res.status(400).json({
          ok: false,
          message: 'User has not accepted the latest community rules.',
        });
      }

      await pool.query(
        `UPDATE community_memberships
         SET state = 'member', joined_at = COALESCE(joined_at, NOW()), left_at = NULL, banned_at = NULL, updated_at = NOW()
         WHERE community_id = $1 AND user_uid = $2`,
        [communityId, targetUid]
      );

      return res.json({ ok: true, state: 'member' });
    }

    await pool.query(
      `UPDATE community_memberships
       SET state = 'left', left_at = NOW(), updated_at = NOW()
       WHERE community_id = $1 AND user_uid = $2`,
      [communityId, targetUid]
    );

    return res.json({ ok: true, state: 'left' });
  } catch (error) {
    console.error('Community join request decision failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to process join request.' });
  }
});

router.get('/api/community/:id/feed', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const { page, pageSize, offset } = parsePagination(req, 12, 50);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const access = await getCommunityAccess(viewer, communityId);
    if (!access.canReadFeed) {
      return res.status(403).json({
        ok: false,
        message: access.reason || 'You do not have access to this community feed.',
        requiresRuleAcceptance: access.requiresRuleAcceptance,
      });
    }

    const values = [communityId, pageSize, offset, req.user.uid];
    const viewerParamIndex = 4;
    const conditions = ['p.community_id = $1'];

    if (!access.canModerate) {
      conditions.push(`p.status = 'active'`);
      if (!viewer.course || viewer.course.trim() !== community.course_name) {
        conditions.push(`(p.visibility = 'community' OR p.author_uid = $${viewerParamIndex})`);
      }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.content,
         p.visibility,
         p.status,
         p.likes_count,
         p.author_uid,
         p.created_at,
         p.updated_at,
         p.taken_down_reason,
         p.attachment_type,
         p.attachment_key,
         p.attachment_link,
         p.attachment_title,
         p.attachment_library_document_uuid,
         p.attachment_filename,
         p.attachment_mime_type,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name,
         pr.photo_link AS author_photo,
         EXISTS (
           SELECT 1
           FROM community_post_likes pl
           WHERE pl.community_id = p.community_id
             AND pl.post_id = p.id
             AND pl.user_uid = $${viewerParamIndex}
         ) AS liked,
         COALESCE((
           SELECT COUNT(*)::int FROM community_comments cc
           WHERE cc.post_id = p.id AND cc.status = 'active'
         ), 0) AS comments_count
       FROM community_posts p
       JOIN accounts a ON a.uid = p.author_uid
       LEFT JOIN profiles pr ON pr.uid = p.author_uid
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      values
    );

    const posts = await Promise.all(
      result.rows.map(async (row) => {
        const attachment = await signCommunityAttachment(
          row.attachment_type
            ? {
                type: row.attachment_type,
                key: row.attachment_key || null,
                link: row.attachment_link || null,
                title: row.attachment_title || null,
                libraryDocumentUuid: row.attachment_library_document_uuid || null,
                filename: row.attachment_filename || null,
                mimeType: row.attachment_mime_type || null,
              }
            : null
        );

        return {
          id: Number(row.id),
          title: row.title,
          content: row.content,
          visibility: row.visibility,
          status: row.status,
          likesCount: Number(row.likes_count || 0),
          liked: row.liked === true,
          commentsCount: Number(row.comments_count || 0),
          attachment,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          takenDownReason: row.taken_down_reason || null,
          author: {
            uid: row.author_uid,
            displayName: row.author_name,
            photoLink: await signPhotoIfNeeded(row.author_photo),
          },
        };
      })
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      posts,
      canModerate: access.canModerate,
      canPost: access.canPost,
    });
  } catch (error) {
    console.error('Community feed fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load community feed.' });
  }
});

router.post('/api/community/:id/posts', upload.single('file'), async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_post_create', 40)) return;

  const communityId = parsePositiveInt(req.params.id);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  const title = sanitizeText(req.body && req.body.title, 180);
  const content = sanitizeText(req.body && req.body.content, 8000);
  const visibilityRaw = sanitizeText(req.body && req.body.visibility, 40).toLowerCase();
  const visibility = visibilityRaw === 'main_course_only' ? 'main_course_only' : 'community';
  const attachmentTypeRaw = sanitizeText(req.body && req.body.attachmentType, 40).toLowerCase();
  const attachmentType = attachmentTypeRaw || 'none';
  const attachmentTitle = sanitizeText(req.body && req.body.attachmentTitle, 240) || null;
  const attachmentLink = sanitizeText(req.body && req.body.attachmentLink, 2000) || null;
  const libraryDocumentUuid = sanitizeText(req.body && req.body.libraryDocumentUuid, 120) || null;
  const file = req.file;

  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const access = await getCommunityAccess(viewer, communityId);
    if (!access.canPost) {
      return res.status(403).json({
        ok: false,
        message: access.reason || 'You cannot post in this community.',
        requiresRuleAcceptance: access.requiresRuleAcceptance,
      });
    }

    if (file && libraryDocumentUuid) {
      return res.status(400).json({
        ok: false,
        message: 'Choose either an uploaded file or an Open Library document.',
      });
    }

    let attachment = null;
    if (file) {
      const mimeType = (file.mimetype || '').toLowerCase();
      let inferredType = null;
      if (mimeType.startsWith('image/')) {
        inferredType = 'image';
      } else if (mimeType.startsWith('video/')) {
        inferredType = 'video';
      }
      if (!inferredType) {
        return res.status(400).json({
          ok: false,
          message: 'Unsupported file type. Only image and video uploads are allowed.',
        });
      }

      const uploaded = await uploadToStorage({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        prefix: 'community-posts',
      });

      attachment = {
        type: inferredType,
        key: uploaded.key,
        link: null,
        title: attachmentTitle || file.originalname || null,
        libraryDocumentUuid: null,
        filename: file.originalname || null,
        mimeType: file.mimetype || null,
      };
    } else if (libraryDocumentUuid || attachmentType === 'library_doc') {
      if (!libraryDocumentUuid) {
        return res.status(400).json({ ok: false, message: 'Library document details are required.' });
      }

      const docParams = [libraryDocumentUuid];
      const docVisibilityFilters = ['uuid::text = $1'];
      if (viewer && viewer.course) {
        docParams.push(viewer.course);
        const courseParam = docParams.length;
        docParams.push(req.user.uid);
        const uidParam = docParams.length;
        docVisibilityFilters.push(
          `(visibility = 'public' OR (visibility = 'private' AND (course = $${courseParam} OR uploader_uid = $${uidParam})))`
        );
      } else {
        docParams.push(req.user.uid);
        const uidParam = docParams.length;
        docVisibilityFilters.push(`(visibility = 'public' OR uploader_uid = $${uidParam})`);
      }

      const docResult = await pool.query(
        `SELECT uuid, title
         FROM documents
         WHERE ${docVisibilityFilters.join(' AND ')}
         LIMIT 1`,
        docParams
      );
      if (!docResult.rows.length) {
        return res.status(404).json({ ok: false, message: 'Selected Open Library document was not found.' });
      }

      attachment = {
        type: 'library_doc',
        key: null,
        link: null,
        title: attachmentTitle || docResult.rows[0].title || 'Open document',
        libraryDocumentUuid: docResult.rows[0].uuid,
        filename: null,
        mimeType: null,
      };
    } else if (attachmentType === 'link') {
      if (!attachmentLink) {
        return res.status(400).json({ ok: false, message: 'Attachment link is required.' });
      }
      attachment = {
        type: 'link',
        key: null,
        link: attachmentLink,
        title: attachmentTitle || attachmentLink,
        libraryDocumentUuid: null,
        filename: null,
        mimeType: null,
      };
    } else if (attachmentType !== 'none' && attachmentType !== '') {
      return res.status(400).json({ ok: false, message: 'Invalid attachment payload.' });
    }

    const insertResult = await pool.query(
      `INSERT INTO community_posts
        (
          community_id, author_uid, title, content, visibility,
          attachment_type, attachment_key, attachment_link, attachment_title, attachment_library_document_uuid,
          attachment_filename, attachment_mime_type, likes_count,
          status, created_at, updated_at
        )
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 'active', NOW(), NOW())
       RETURNING id, created_at`,
      [
        communityId,
        req.user.uid,
        title,
        content,
        visibility,
        attachment ? attachment.type : null,
        attachment ? attachment.key : null,
        attachment ? attachment.link : null,
        attachment ? attachment.title : null,
        attachment ? attachment.libraryDocumentUuid : null,
        attachment ? attachment.filename : null,
        attachment ? attachment.mimeType : null,
      ]
    );

    const signedAttachment = await signCommunityAttachment(attachment);
    return res.json({
      ok: true,
      post: {
        id: Number(insertResult.rows[0].id),
        title,
        content,
        visibility,
        likesCount: 0,
        liked: false,
        attachment: signedAttachment,
        createdAt: insertResult.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Community post create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create community post.' });
  }
});

router.patch('/api/community/:id/posts/:postId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_post_update', 60)) return;

  const communityId = parsePositiveInt(req.params.id);
  const postId = parsePositiveInt(req.params.postId);
  const title = sanitizeText(req.body && req.body.title, 180);
  const content = sanitizeText(req.body && req.body.content, 8000);
  const visibilityRaw = sanitizeText(req.body && req.body.visibility, 40).toLowerCase();
  const visibility =
    visibilityRaw === 'main_course_only' || visibilityRaw === 'community'
      ? visibilityRaw
      : null;

  if (!communityId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }
  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const postResult = await pool.query(
      `SELECT id, author_uid, status
       FROM community_posts
       WHERE id = $1 AND community_id = $2
       LIMIT 1`,
      [postId, communityId]
    );
    if (!postResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    const post = postResult.rows[0];
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate && post.author_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed to edit this post.' });
    }

    if (post.status !== 'active' && !canModerate) {
      return res.status(400).json({ ok: false, message: 'Taken down posts cannot be edited.' });
    }

    const result = await pool.query(
      `UPDATE community_posts
       SET title = $3,
           content = $4,
           visibility = COALESCE($5, visibility),
           updated_at = NOW()
       WHERE community_id = $1
         AND id = $2
       RETURNING id, title, content, visibility, status, updated_at`,
      [communityId, postId, title, content, visibility]
    );

    return res.json({
      ok: true,
      post: {
        id: Number(result.rows[0].id),
        title: result.rows[0].title,
        content: result.rows[0].content,
        visibility: result.rows[0].visibility,
        status: result.rows[0].status,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error('Community post update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update community post.' });
  }
});

router.delete('/api/community/:id/posts/:postId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_post_delete', 60)) return;

  const communityId = parsePositiveInt(req.params.id);
  const postId = parsePositiveInt(req.params.postId);
  if (!communityId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const postResult = await pool.query(
      `SELECT id, author_uid, attachment_type, attachment_key
       FROM community_posts
       WHERE id = $1 AND community_id = $2
       LIMIT 1`,
      [postId, communityId]
    );
    if (!postResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    const post = postResult.rows[0];
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate && post.author_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed to delete this post.' });
    }

    if (canModerate) {
      if (
        (post.attachment_type === 'image' || post.attachment_type === 'video') &&
        post.attachment_key &&
        !String(post.attachment_key).startsWith('http')
      ) {
        try {
          await deleteFromStorage(post.attachment_key);
        } catch (storageError) {
          console.error('Community attachment delete failed:', storageError);
        }
      }
      await pool.query(
        `DELETE FROM community_posts
         WHERE community_id = $1 AND id = $2`,
        [communityId, postId]
      );
    } else {
      await pool.query(
        `UPDATE community_posts
         SET status = 'taken_down',
             taken_down_by_uid = $3,
             taken_down_reason = 'Deleted by author',
             updated_at = NOW()
         WHERE community_id = $1
           AND id = $2`,
        [communityId, postId, req.user.uid]
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community post delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete community post.' });
  }
});

router.post('/api/community/:id/posts/:postId/like', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_post_like', 180)) return;

  const communityId = parsePositiveInt(req.params.id);
  const postId = parsePositiveInt(req.params.postId);
  const action = sanitizeText(req.body && req.body.action, 16).toLowerCase();

  if (!communityId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const access = await getCommunityAccess(viewer, communityId);
    if (!access.canReadFeed) {
      return res.status(403).json({
        ok: false,
        message: access.reason || 'You do not have access to this community.',
      });
    }

    const postResult = await pool.query(
      `SELECT id, status
       FROM community_posts
       WHERE community_id = $1 AND id = $2
       LIMIT 1`,
      [communityId, postId]
    );
    if (!postResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postResult.rows[0].status !== 'active' && !access.canModerate) {
      return res.status(403).json({ ok: false, message: 'Cannot like a taken down post.' });
    }

    let liked = false;
    if (action === 'unlike') {
      const unlikeResult = await pool.query(
        `DELETE FROM community_post_likes
         WHERE community_id = $1 AND post_id = $2 AND user_uid = $3`,
        [communityId, postId, req.user.uid]
      );

      if (unlikeResult.rowCount > 0) {
        await pool.query(
          `UPDATE community_posts
           SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0),
               updated_at = NOW()
           WHERE community_id = $1 AND id = $2`,
          [communityId, postId]
        );
      }
      liked = false;
    } else {
      const likeResult = await pool.query(
        `INSERT INTO community_post_likes (community_id, post_id, user_uid)
         VALUES ($1, $2, $3)
         ON CONFLICT (community_id, post_id, user_uid) DO NOTHING`,
        [communityId, postId, req.user.uid]
      );

      if (likeResult.rowCount > 0) {
        await pool.query(
          `UPDATE community_posts
           SET likes_count = COALESCE(likes_count, 0) + 1,
               updated_at = NOW()
           WHERE community_id = $1 AND id = $2`,
          [communityId, postId]
        );
      }
      liked = true;
    }

    const countResult = await pool.query(
      `SELECT likes_count
       FROM community_posts
       WHERE community_id = $1 AND id = $2
       LIMIT 1`,
      [communityId, postId]
    );

    return res.json({
      ok: true,
      liked,
      likesCount: countResult.rows[0] ? Number(countResult.rows[0].likes_count || 0) : 0,
    });
  } catch (error) {
    console.error('Community post like failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to update like.' });
  }
});

router.get('/api/community/:id/posts/:postId/comments', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const postId = parsePositiveInt(req.params.postId);
  const { page, pageSize, offset } = parsePagination(req, 30, 100);

  if (!communityId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid request.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const access = await getCommunityAccess(viewer, communityId);
    if (!access.canReadFeed) {
      return res.status(403).json({ ok: false, message: access.reason || 'Access denied.' });
    }

    const conditions = ['c.community_id = $1', 'c.post_id = $2'];
    const params = [communityId, postId, pageSize, offset];

    if (!access.canModerate) {
      conditions.push(`c.status = 'active'`);
    }

    const result = await pool.query(
      `SELECT
         c.id,
         c.author_uid,
         c.content,
         c.status,
         c.created_at,
         COALESCE(pr.display_name, a.display_name, a.username, a.email) AS author_name,
         pr.photo_link AS author_photo
       FROM community_comments c
       JOIN accounts a ON a.uid = c.author_uid
       LEFT JOIN profiles pr ON pr.uid = c.author_uid
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.created_at ASC
       LIMIT $3 OFFSET $4`,
      params
    );

    const comments = await Promise.all(
      result.rows.map(async (row) => ({
        id: Number(row.id),
        authorUid: row.author_uid,
        authorName: row.author_name,
        authorPhoto: await signPhotoIfNeeded(row.author_photo),
        content: row.content,
        status: row.status,
        createdAt: row.created_at,
      }))
    );

    return res.json({ ok: true, page, pageSize, comments, canModerate: access.canModerate });
  } catch (error) {
    console.error('Community comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load comments.' });
  }
});

router.post('/api/community/:id/posts/:postId/comments', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_comment_create', 80)) return;

  const communityId = parsePositiveInt(req.params.id);
  const postId = parsePositiveInt(req.params.postId);
  const content = sanitizeText(req.body && req.body.content, 4000);

  if (!communityId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid request.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Comment content is required.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const access = await getCommunityAccess(viewer, communityId);
    if (!access.canPost) {
      return res.status(403).json({ ok: false, message: access.reason || 'You cannot comment in this community.' });
    }

    const postCheck = await pool.query(
      `SELECT id, status
       FROM community_posts
       WHERE id = $1 AND community_id = $2
       LIMIT 1`,
      [postId, communityId]
    );
    if (!postCheck.rows.length) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    if (postCheck.rows[0].status !== 'active' && !access.canModerate) {
      return res.status(403).json({ ok: false, message: 'Cannot comment on a taken down post.' });
    }

    const result = await pool.query(
      `INSERT INTO community_comments
        (community_id, post_id, author_uid, content, status, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, 'active', NOW(), NOW())
       RETURNING id, created_at`,
      [communityId, postId, req.user.uid, content]
    );

    return res.json({
      ok: true,
      comment: {
        id: Number(result.rows[0].id),
        content,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Community comment create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to post comment.' });
  }
});

router.patch('/api/community/:id/comments/:commentId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_comment_update', 100)) return;

  const communityId = parsePositiveInt(req.params.id);
  const commentId = parsePositiveInt(req.params.commentId);
  const content = sanitizeText(req.body && req.body.content, 4000);

  if (!communityId || !commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Comment content is required.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const commentResult = await pool.query(
      `SELECT id, author_uid, status
       FROM community_comments
       WHERE id = $1 AND community_id = $2
       LIMIT 1`,
      [commentId, communityId]
    );
    if (!commentResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    const comment = commentResult.rows[0];
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate && comment.author_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed to edit this comment.' });
    }

    if (comment.status !== 'active' && !canModerate) {
      return res.status(400).json({ ok: false, message: 'Taken down comments cannot be edited.' });
    }

    const result = await pool.query(
      `UPDATE community_comments
       SET content = $3, updated_at = NOW()
       WHERE community_id = $1 AND id = $2
       RETURNING id, content, status, updated_at`,
      [communityId, commentId, content]
    );

    return res.json({
      ok: true,
      comment: {
        id: Number(result.rows[0].id),
        content: result.rows[0].content,
        status: result.rows[0].status,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error('Community comment update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update comment.' });
  }
});

router.delete('/api/community/:id/comments/:commentId', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_comment_delete', 120)) return;

  const communityId = parsePositiveInt(req.params.id);
  const commentId = parsePositiveInt(req.params.commentId);
  if (!communityId || !commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const commentResult = await pool.query(
      `SELECT id, author_uid
       FROM community_comments
       WHERE id = $1 AND community_id = $2
       LIMIT 1`,
      [commentId, communityId]
    );
    if (!commentResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    const comment = commentResult.rows[0];
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate && comment.author_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed to delete this comment.' });
    }

    if (canModerate) {
      await pool.query(
        `DELETE FROM community_comments
         WHERE community_id = $1 AND id = $2`,
        [communityId, commentId]
      );
    } else {
      await pool.query(
        `UPDATE community_comments
         SET status = 'taken_down',
             taken_down_by_uid = $3,
             taken_down_reason = 'Deleted by author',
             updated_at = NOW()
         WHERE community_id = $1
           AND id = $2`,
        [communityId, commentId, req.user.uid]
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community comment delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete comment.' });
  }
});

router.get('/api/community/:id/members', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const { page, pageSize, offset } = parsePagination(req, 30, 100);
  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const community = await getCommunity(communityId);
    if (!community) {
      return res.status(404).json({ ok: false, message: 'Community not found.' });
    }

    const access = await getCommunityAccess(viewer, communityId);
    const canModerate = access.canModerate;

    if (!canModerate && !(access.membership && access.membership.state === 'member')) {
      return res.status(403).json({ ok: false, message: 'You cannot view this member list.' });
    }

    const stateFilter = canModerate
      ? `IN ('member', 'pending', 'banned')`
      : `= 'member'`;

    const result = await pool.query(
      `SELECT
         cm.user_uid,
         cm.state,
         cm.joined_at,
         cm.updated_at,
         a.email,
         a.username,
         a.display_name AS account_display_name,
         a.course,
         COALESCE(a.platform_role, 'member') AS platform_role,
         p.display_name AS profile_display_name,
         p.photo_link,
         EXISTS (
           SELECT 1 FROM community_roles cr
           WHERE cr.community_id = cm.community_id
             AND cr.user_uid = cm.user_uid
             AND cr.role = 'moderator'
         ) AS is_moderator
       FROM community_memberships cm
       JOIN accounts a ON a.uid = cm.user_uid
       LEFT JOIN profiles p ON p.uid = cm.user_uid
       WHERE cm.community_id = $1
         AND cm.state ${stateFilter}
       ORDER BY
         CASE cm.state
           WHEN 'member' THEN 1
           WHEN 'pending' THEN 2
           WHEN 'banned' THEN 3
           ELSE 4
         END,
         lower(COALESCE(p.display_name, a.display_name, a.username, a.email)) ASC
       LIMIT $2 OFFSET $3`,
      [communityId, pageSize, offset]
    );

    const members = await Promise.all(
      result.rows.map(async (row) => ({
        uid: row.user_uid,
        displayName: displayNameFromRow(row),
        course: row.course || null,
        platformRole: row.platform_role || 'member',
        isModerator: row.is_moderator === true,
        state: row.state,
        joinedAt: row.joined_at,
        updatedAt: row.updated_at,
        photoLink: await signPhotoIfNeeded(row.photo_link),
      }))
    );

    return res.json({ ok: true, page, pageSize, members, canModerate });
  } catch (error) {
    console.error('Community members fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load community members.' });
  }
});

router.post('/api/community/:id/members/:uid/warn', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_warn_member', 40)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  const reason = sanitizeText(req.body && req.body.reason, 600);

  if (!communityId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to warn members.' });
    }

    const targetState = await getTargetDisciplineState(communityId, targetUid);
    if (!targetState) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }

    if (!canDisciplineTarget(viewer, targetState)) {
      return res.status(403).json({ ok: false, message: 'Not allowed to discipline this user.' });
    }

    await pool.query(
      `INSERT INTO community_warnings (community_id, target_uid, issued_by_uid, reason)
       VALUES ($1, $2, $3, $4)`,
      [communityId, targetUid, req.user.uid, reason || null]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community warn failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to issue warning.' });
  }
});

router.post('/api/community/:id/members/:uid/ban', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_ban_member', 30)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  const reason = sanitizeText(req.body && req.body.reason, 600);

  if (!communityId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to ban members.' });
    }

    const targetState = await getTargetDisciplineState(communityId, targetUid);
    if (!targetState) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }

    if (!canDisciplineTarget(viewer, targetState)) {
      return res.status(403).json({ ok: false, message: 'Not allowed to discipline this user.' });
    }

    await pool.query(
      `INSERT INTO community_memberships
        (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
       VALUES
        ($1, $2, 'banned', NULL, NULL, NOW(), NOW())
       ON CONFLICT (community_id, user_uid)
       DO UPDATE SET
        state = 'banned',
        banned_at = NOW(),
        updated_at = NOW()`,
      [communityId, targetUid]
    );

    await pool.query(
      `INSERT INTO community_bans (community_id, target_uid, issued_by_uid, reason, active)
       VALUES ($1, $2, $3, $4, true)`,
      [communityId, targetUid, req.user.uid, reason || null]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community ban failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to ban user.' });
  }
});

router.post('/api/community/:id/members/:uid/unban', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_unban_member', 30)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);

  if (!communityId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to unban members.' });
    }

    const targetState = await getTargetDisciplineState(communityId, targetUid);
    if (!targetState) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }

    if (!canDisciplineTarget(viewer, targetState) && viewer.platform_role !== 'owner' && viewer.platform_role !== 'admin') {
      return res.status(403).json({ ok: false, message: 'Not allowed to discipline this user.' });
    }

    await pool.query(
      `UPDATE community_memberships
       SET state = 'left', banned_at = NULL, updated_at = NOW(), left_at = NOW()
       WHERE community_id = $1 AND user_uid = $2 AND state = 'banned'`,
      [communityId, targetUid]
    );

    await pool.query(
      `UPDATE community_bans
       SET active = false, lifted_at = NOW(), lifted_by_uid = $3
       WHERE community_id = $1 AND target_uid = $2 AND active = true`,
      [communityId, targetUid, req.user.uid]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community unban failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to unban user.' });
  }
});

router.post('/api/community/:id/posts/:postId/takedown', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_takedown_post', 60)) return;

  const communityId = parsePositiveInt(req.params.id);
  const postId = parsePositiveInt(req.params.postId);
  const reason = sanitizeText(req.body && req.body.reason, 600);

  if (!communityId || !postId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to take down posts.' });
    }

    const result = await pool.query(
      `UPDATE community_posts
       SET status = 'taken_down', taken_down_by_uid = $3, taken_down_reason = $4, updated_at = NOW()
       WHERE community_id = $1 AND id = $2
       RETURNING id`,
      [communityId, postId, req.user.uid, reason || null]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to take down post.' });
  }
});

router.post('/api/community/:id/comments/:commentId/takedown', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_takedown_comment', 80)) return;

  const communityId = parsePositiveInt(req.params.id);
  const commentId = parsePositiveInt(req.params.commentId);
  const reason = sanitizeText(req.body && req.body.reason, 600);

  if (!communityId || !commentId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to take down comments.' });
    }

    const result = await pool.query(
      `UPDATE community_comments
       SET status = 'taken_down', taken_down_by_uid = $3, taken_down_reason = $4, updated_at = NOW()
       WHERE community_id = $1 AND id = $2
       RETURNING id`,
      [communityId, commentId, req.user.uid, reason || null]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community comment takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to take down comment.' });
  }
});

router.post('/api/community/:id/reports', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_report', 30)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetType = sanitizeText(req.body && req.body.targetType, 20).toLowerCase();
  const targetUid = sanitizeText(req.body && req.body.targetUid, 120) || null;
  const targetPostId = parsePositiveInt(req.body && req.body.targetPostId);
  const targetCommentId = parsePositiveInt(req.body && req.body.targetCommentId);
  const reason = sanitizeText(req.body && req.body.reason, 1000);

  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  if (!['member', 'moderator', 'post', 'comment'].includes(targetType)) {
    return res.status(400).json({ ok: false, message: 'Invalid target type.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    const access = await getCommunityAccess(viewer, communityId);
    if (!access.canReadFeed && !access.canModerate) {
      return res.status(403).json({ ok: false, message: 'You must belong to this community to report.' });
    }

    if ((targetType === 'member' || targetType === 'moderator') && !targetUid) {
      return res.status(400).json({ ok: false, message: 'targetUid is required for user reports.' });
    }

    if (targetType === 'moderator') {
      const moderatorCheck = await pool.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM community_roles
             WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'
           ) AS is_community_moderator,
           COALESCE((SELECT platform_role FROM accounts WHERE uid = $2), 'member') AS platform_role`,
        [communityId, targetUid]
      );
      const row = moderatorCheck.rows[0] || {};
      const isMod = row.is_community_moderator === true || row.platform_role === 'admin' || row.platform_role === 'owner';
      if (!isMod) {
        return res.status(400).json({ ok: false, message: 'Target user is not a moderator/admin.' });
      }
    }

    if (targetType === 'post') {
      if (!targetPostId) {
        return res.status(400).json({ ok: false, message: 'targetPostId is required for post reports.' });
      }
      const postExists = await pool.query(
        `SELECT 1 FROM community_posts WHERE id = $1 AND community_id = $2 LIMIT 1`,
        [targetPostId, communityId]
      );
      if (!postExists.rows.length) {
        return res.status(404).json({ ok: false, message: 'Target post not found.' });
      }
    }

    if (targetType === 'comment') {
      if (!targetCommentId) {
        return res.status(400).json({ ok: false, message: 'targetCommentId is required for comment reports.' });
      }
      const commentExists = await pool.query(
        `SELECT 1 FROM community_comments WHERE id = $1 AND community_id = $2 LIMIT 1`,
        [targetCommentId, communityId]
      );
      if (!commentExists.rows.length) {
        return res.status(404).json({ ok: false, message: 'Target comment not found.' });
      }
    }

    const insertReport = await pool.query(
      `INSERT INTO community_reports
        (community_id, reporter_uid, target_uid, target_type, target_post_id, target_comment_id, reason, status, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())
       RETURNING id`,
      [
        communityId,
        req.user.uid,
        targetUid,
        targetType,
        targetPostId || null,
        targetCommentId || null,
        reason || null,
      ]
    );

    const reportId = Number(insertReport.rows[0].id);
    if (targetType === 'post' && targetPostId) {
      await pool.query(
        `INSERT INTO community_post_reports
          (report_id, community_id, post_id, reporter_uid, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [reportId, communityId, targetPostId, req.user.uid, reason || null]
      );
    }
    if (targetType === 'comment' && targetCommentId) {
      await pool.query(
        `INSERT INTO community_comment_reports
          (report_id, community_id, comment_id, reporter_uid, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [reportId, communityId, targetCommentId, req.user.uid, reason || null]
      );
    }

    return res.json({ ok: true, reportId });
  } catch (error) {
    console.error('Community report create failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to submit report.' });
  }
});

router.get('/api/community/:id/reports', async (req, res) => {
  const communityId = parsePositiveInt(req.params.id);
  const status = sanitizeText(req.query.status, 32).toLowerCase();
  const { page, pageSize, offset } = parsePagination(req, 30, 100);

  if (!communityId) {
    return res.status(400).json({ ok: false, message: 'Invalid community id.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const canModerate = await canModerateCommunity(viewer, communityId);
    if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to view reports in this community.' });
    }

    const statuses = ['open', 'under_review', 'resolved_action_taken', 'resolved_no_action', 'rejected'];
    const hasStatusFilter = statuses.includes(status);
    const params = [communityId, pageSize, offset];
    const where = ['r.community_id = $1'];
    if (hasStatusFilter) {
      params.push(status);
      where.push(`r.status = $${params.length}`);
    }
    if (!isReportReviewer(viewer)) {
      where.push(`r.target_type <> 'moderator'`);
    }

    const result = await pool.query(
      `SELECT
         r.id,
         r.target_type,
         r.target_uid,
         r.target_post_id,
         r.target_comment_id,
         r.reason,
         r.status,
         r.resolution_note,
         r.created_at,
         r.updated_at,
         r.resolved_at,
         COALESCE(rpt_p.display_name, rpt_a.display_name, rpt_a.username, rpt_a.email) AS reporter_name,
         COALESCE(tgt_p.display_name, tgt_a.display_name, tgt_a.username, tgt_a.email) AS target_name
       FROM community_reports r
       JOIN accounts rpt_a ON rpt_a.uid = r.reporter_uid
       LEFT JOIN profiles rpt_p ON rpt_p.uid = r.reporter_uid
       LEFT JOIN accounts tgt_a ON tgt_a.uid = r.target_uid
       LEFT JOIN profiles tgt_p ON tgt_p.uid = r.target_uid
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE r.status
           WHEN 'open' THEN 1
           WHEN 'under_review' THEN 2
           ELSE 3
         END,
         r.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    return res.json({
      ok: true,
      page,
      pageSize,
      reports: result.rows.map((row) => ({
        id: Number(row.id),
        targetType: row.target_type,
        targetUid: row.target_uid || null,
        targetName: row.target_name || null,
        targetPostId: row.target_post_id ? Number(row.target_post_id) : null,
        targetCommentId: row.target_comment_id ? Number(row.target_comment_id) : null,
        reason: row.reason || null,
        status: row.status,
        resolutionNote: row.resolution_note || null,
        reporterName: row.reporter_name || 'Member',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        resolvedAt: row.resolved_at || null,
      })),
      canReviewModeratorReports: isReportReviewer(viewer),
    });
  } catch (error) {
    console.error('Community reports fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load community reports.' });
  }
});

router.post('/api/community/:id/reports/:reportId/resolve', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_report_resolve', 40)) return;

  const communityId = parsePositiveInt(req.params.id);
  const reportId = parsePositiveInt(req.params.reportId);
  const status = sanitizeText(req.body && req.body.status, 32).toLowerCase();
  const resolutionNote = sanitizeText(req.body && req.body.resolutionNote, 1200);
  const action = sanitizeText(req.body && req.body.action, 40).toLowerCase() || 'none';
  const actionReason = sanitizeText(req.body && req.body.actionReason, 600);
  const actionTargetUid = sanitizeText(req.body && req.body.actionTargetUid, 120);

  if (!communityId || !reportId) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  const allowedStatuses = ['under_review', 'resolved_action_taken', 'resolved_no_action', 'rejected'];
  const allowedActions = ['none', 'warn_moderator', 'suspend_moderator', 'ban_moderator'];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ ok: false, message: 'Invalid report status.' });
  }
  if (!allowedActions.includes(action)) {
    return res.status(400).json({ ok: false, message: 'Invalid resolution action.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const reportResult = await pool.query(
      `SELECT id, target_type, target_uid, status
       FROM community_reports
       WHERE id = $1 AND community_id = $2
       LIMIT 1`,
      [reportId, communityId]
    );
    if (!reportResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Report not found.' });
    }

    const report = reportResult.rows[0];
    const canModerate = await canModerateCommunity(viewer, communityId);
    const canReviewModerators = isReportReviewer(viewer);

    if (report.target_type === 'moderator') {
      if (!canReviewModerators) {
        return res.status(403).json({ ok: false, message: 'Only owner/admin can resolve moderator reports.' });
      }
    } else if (!canModerate) {
      return res.status(403).json({ ok: false, message: 'Not allowed to resolve this report.' });
    }

    if (action !== 'none' && report.target_type !== 'moderator') {
      return res.status(400).json({ ok: false, message: 'Moderator actions are only valid for moderator reports.' });
    }

    const targetUid = actionTargetUid || report.target_uid || null;

    if (action === 'warn_moderator') {
      if (!targetUid) {
        return res.status(400).json({ ok: false, message: 'A target user is required for this action.' });
      }
      await pool.query(
        `INSERT INTO community_warnings (community_id, target_uid, issued_by_uid, reason)
         VALUES ($1, $2, $3, $4)`,
        [communityId, targetUid, req.user.uid, actionReason || resolutionNote || 'Moderator warning from report resolution']
      );
    }

    if (action === 'suspend_moderator') {
      if (!targetUid) {
        return res.status(400).json({ ok: false, message: 'A target user is required for this action.' });
      }
      await pool.query(
        `DELETE FROM community_roles
         WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'`,
        [communityId, targetUid]
      );
    }

    if (action === 'ban_moderator') {
      if (!targetUid) {
        return res.status(400).json({ ok: false, message: 'A target user is required for this action.' });
      }

      await pool.query(
        `DELETE FROM community_roles
         WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'`,
        [communityId, targetUid]
      );

      await pool.query(
        `INSERT INTO community_memberships
          (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
         VALUES
          ($1, $2, 'banned', NULL, NULL, NOW(), NOW())
         ON CONFLICT (community_id, user_uid)
         DO UPDATE SET
           state = 'banned',
           banned_at = NOW(),
           left_at = NULL,
           updated_at = NOW()`,
        [communityId, targetUid]
      );

      await pool.query(
        `INSERT INTO community_bans (community_id, target_uid, issued_by_uid, reason, active)
         VALUES ($1, $2, $3, $4, true)`,
        [communityId, targetUid, req.user.uid, actionReason || resolutionNote || 'Moderator banned from report resolution']
      );
    }

    const resolvedStatus = status || (action === 'none' ? 'resolved_no_action' : 'resolved_action_taken');
    await pool.query(
      `UPDATE community_reports
       SET status = $3,
           resolution_note = $4,
           resolved_by_uid = $5,
           resolved_at = CASE
             WHEN $3 IN ('resolved_action_taken', 'resolved_no_action', 'rejected') THEN NOW()
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE community_id = $1
         AND id = $2`,
      [communityId, reportId, resolvedStatus, resolutionNote || null, req.user.uid]
    );

    return res.json({ ok: true, status: resolvedStatus });
  } catch (error) {
    console.error('Community report resolve failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to resolve report.' });
  }
});

router.post('/api/community/:id/moderators/:uid/assign', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_assign_moderator', 25)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  if (!communityId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!isOwnerOrAdmin(viewer)) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can assign moderators.' });
    }

    const target = await getViewer(targetUid);
    if (!target) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }

    await pool.query(
      `INSERT INTO community_roles (community_id, user_uid, role, assigned_by_uid)
       VALUES ($1, $2, 'moderator', $3)
       ON CONFLICT (community_id, user_uid, role) DO NOTHING`,
      [communityId, targetUid, req.user.uid]
    );

    await pool.query(
      `INSERT INTO community_memberships
        (community_id, user_uid, state, joined_at, left_at, banned_at, updated_at)
       VALUES
        ($1, $2, 'member', NOW(), NULL, NULL, NOW())
       ON CONFLICT (community_id, user_uid)
       DO UPDATE SET state = 'member', joined_at = COALESCE(community_memberships.joined_at, NOW()), left_at = NULL, banned_at = NULL, updated_at = NOW()`,
      [communityId, targetUid]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community assign moderator failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to assign moderator.' });
  }
});

router.post('/api/community/:id/moderators/:uid/remove', async (req, res) => {
  if (!enforceRateLimit(req, res, 'community_remove_moderator', 25)) return;

  const communityId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  if (!communityId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid request payload.' });
  }

  try {
    const viewer = await getViewer(req.user.uid);
    if (!isOwnerOrAdmin(viewer)) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can remove moderators.' });
    }

    await pool.query(
      `DELETE FROM community_roles
       WHERE community_id = $1 AND user_uid = $2 AND role = 'moderator'`,
      [communityId, targetUid]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Community remove moderator failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to remove moderator.' });
  }
});

router.use('/api/community', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'Attachment exceeds 50MB limit.' });
  }
  return next(err);
});

module.exports = router;
