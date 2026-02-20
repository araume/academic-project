const express = require('express');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getSignedUrl } = require('../services/storage');
const {
  ensureNotificationsReady,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../services/notificationService');

const router = express.Router();
const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);

function buildNotificationMessage(row) {
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const postTitle = typeof meta.postTitle === 'string' ? meta.postTitle : 'a post';
  const documentTitle = typeof meta.documentTitle === 'string' ? meta.documentTitle : 'a document';
  const communityName = typeof meta.communityName === 'string' ? meta.communityName : 'this community';

  if (row.type === 'following_new_post') {
    return `shared a new post: ${postTitle}`;
  }
  if (row.type === 'post_liked') {
    return `liked your post: ${postTitle}`;
  }
  if (row.type === 'post_commented') {
    return `commented on your post: ${postTitle}`;
  }
  if (row.type === 'document_liked') {
    return `liked your upload: ${documentTitle}`;
  }
  if (row.type === 'document_commented') {
    return `commented on your upload: ${documentTitle}`;
  }
  if (row.type === 'community_rules_required') {
    return `Please agree to the community rules for ${communityName} to interact.`;
  }
  return 'interacted with your content.';
}

async function signPhotoIfNeeded(photoLink) {
  if (!photoLink) return null;
  if (typeof photoLink === 'string' && photoLink.startsWith('http')) return photoLink;
  try {
    return await getSignedUrl(photoLink, SIGNED_TTL);
  } catch (error) {
    console.error('Notification actor photo signing failed:', error);
    return null;
  }
}

router.use('/api/notifications', requireAuthApi);

router.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/notifications')) {
    return next();
  }

  try {
    await ensureNotificationsReady();
    return next();
  } catch (error) {
    console.error('Notifications bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Notifications service is unavailable.' });
  }
});

router.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const unreadCount = await countUnreadNotifications(req.user.uid);
    return res.json({ ok: true, unreadCount });
  } catch (error) {
    console.error('Notifications unread count failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load notification count.' });
  }
});

router.get('/api/notifications', async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);

  try {
    const result = await listNotifications(req.user.uid, { page, pageSize });
    const notifications = await Promise.all(
      result.notifications.map(async (row) => ({
        id: Number(row.id),
        type: row.type,
        entityType: row.entity_type || null,
        entityId: row.entity_id || null,
        targetUrl: row.target_url || null,
        isRead: row.is_read === true,
        readAt: row.read_at || null,
        createdAt: row.created_at || null,
        message: buildNotificationMessage(row),
        actor: {
          uid: row.actor_uid || null,
          displayName:
            row.actor_display_name ||
            (row.type === 'community_rules_required' ? 'Community' : 'Someone'),
          photoLink: await signPhotoIfNeeded(row.actor_photo_link),
        },
      }))
    );

    return res.json({
      ok: true,
      notifications,
      unreadCount: result.unreadCount,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('Notifications fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load notifications.' });
  }
});

router.post('/api/notifications/read-all', async (req, res) => {
  try {
    const updated = await markAllNotificationsRead(req.user.uid);
    const unreadCount = await countUnreadNotifications(req.user.uid);
    return res.json({ ok: true, updated, unreadCount });
  } catch (error) {
    console.error('Notifications read-all failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to update notifications.' });
  }
});

router.post('/api/notifications/:id/read', async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ ok: false, message: 'Invalid notification id.' });
  }

  try {
    const updated = await markNotificationRead(req.user.uid, notificationId);
    if (!updated) {
      return res.status(404).json({ ok: false, message: 'Notification not found.' });
    }
    const unreadCount = await countUnreadNotifications(req.user.uid);
    return res.json({ ok: true, unreadCount });
  } catch (error) {
    console.error('Notification read failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to update notification.' });
  }
});

module.exports = router;
