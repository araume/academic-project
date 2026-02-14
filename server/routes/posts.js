const express = require('express');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const pool = require('../db/pool');
const { uploadToStorage, deleteFromStorage, getSignedUrl } = require('../services/storage');
const {
  createNotification,
  createNotificationsForRecipients,
  isBlockedEitherDirection,
} = require('../services/notificationService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use('/api/posts', requireAuthApi);
router.use('/api/home', requireAuthApi);

function buildVisibilityFilter(user) {
  const userCourse = user && user.course;
  const userUid = user && user.uid;
  const filter = {
    $or: [{ visibility: 'public' }],
  };
  if (userCourse) {
    filter.$or.push({ visibility: 'private', course: userCourse });
  }
  if (userUid) {
    filter.$or.push({ uploaderUid: userUid });
  }
  return filter;
}

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);

async function signAttachment(attachment) {
  if (!attachment) return null;
  if (attachment.type === 'image' || attachment.type === 'video') {
    if (attachment.key && !attachment.key.startsWith('http')) {
      const url = await getSignedUrl(attachment.key, SIGNED_TTL);
      return { ...attachment, link: url };
    }
  }
  return attachment;
}

async function signIfNeeded(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http')) return value;
  try {
    return await getSignedUrl(value, SIGNED_TTL);
  } catch (error) {
    console.error('Sidecard signing failed:', error);
    return null;
  }
}

async function loadUploaderProfiles(uids) {
  if (!uids.length) {
    return new Map();
  }

  try {
    const result = await pool.query(
      'SELECT uid, display_name, photo_link FROM profiles WHERE uid = ANY($1::text[])',
      [uids]
    );

    const entries = await Promise.all(
      result.rows.map(async (row) => {
        let photoLink = row.photo_link || null;
        if (photoLink && !photoLink.startsWith('http')) {
          photoLink = await getSignedUrl(photoLink, SIGNED_TTL);
        }
        return [
          row.uid,
          {
            displayName: row.display_name || null,
            photoLink,
          },
        ];
      })
    );
    return new Map(entries);
  } catch (error) {
    console.error('Uploader profiles fetch failed:', error);
    return new Map();
  }
}

async function loadExcludedAuthorUids(viewerUid) {
  if (!viewerUid) return [];
  try {
    const blockedResult = await pool.query(
      `SELECT blocked_uid AS uid
       FROM blocked_users
       WHERE blocker_uid = $1
       UNION
       SELECT blocker_uid AS uid
       FROM blocked_users
       WHERE blocked_uid = $1`,
      [viewerUid]
    );
    const hiddenResult = await pool.query(
      `SELECT hidden_uid AS uid
       FROM hidden_post_authors
       WHERE user_uid = $1`,
      [viewerUid]
    );

    const excluded = new Set();
    blockedResult.rows.forEach((row) => {
      if (row && row.uid) excluded.add(row.uid);
    });
    hiddenResult.rows.forEach((row) => {
      if (row && row.uid) excluded.add(row.uid);
    });
    excluded.delete(viewerUid);
    return [...excluded];
  } catch (error) {
    if (error && error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

function parseSidecardLimit(value, fallback = 5, max = 10) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function summarizeContent(value, max = 140) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

router.get('/api/home/sidecards', async (req, res) => {
  const limit = parseSidecardLimit(req.query.limit, 5, 10);
  const userUid = req.user && req.user.uid ? req.user.uid : null;
  const userCourse = req.user && req.user.course ? String(req.user.course).trim() : '';
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  try {
    const [trendingDiscussions, courseMaterials, suggestedRooms] = await Promise.all([
      (async () => {
        try {
          const db = await getMongoDb();
          const postsCollection = db.collection('posts');
          const filter = {
            ...buildVisibilityFilter(req.user),
            uploadDate: { $gte: since },
          };

          const excludedAuthors = await loadExcludedAuthorUids(userUid);
          if (excludedAuthors.length) {
            filter.uploaderUid = { $nin: excludedAuthors };
          }

          const posts = await postsCollection
            .find(filter)
            .sort({ likesCount: -1, uploadDate: -1 })
            .limit(limit)
            .toArray();

          const uploaderUids = [...new Set(posts.map((post) => post.uploaderUid).filter(Boolean))];
          const uploaderProfiles = await loadUploaderProfiles(uploaderUids);

          return posts.map((post) => {
            const profile = uploaderProfiles.get(post.uploaderUid);
            return {
              id: post._id.toString(),
              title: post.title || 'Untitled post',
              excerpt: summarizeContent(post.content, 120),
              course: post.course || null,
              likesCount: Number(post.likesCount || 0),
              commentsCount: Number(post.commentsCount || 0),
              uploadDate: post.uploadDate || null,
              uploader: {
                uid: post.uploaderUid || null,
                displayName: profile?.displayName || post.uploader?.displayName || 'Member',
                photoLink: profile?.photoLink || post.uploader?.photoLink || null,
              },
            };
          });
        } catch (error) {
          console.error('Home sidecards trending fetch failed:', error);
          return [];
        }
      })(),
      (async () => {
        const filters = [];
        const values = [];
        if (userCourse && userUid) {
          values.push(userCourse);
          const courseParam = values.length;
          values.push(userUid);
          const uidParam = values.length;
          filters.push(
            `(d.visibility = 'public' OR (d.visibility = 'private' AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
          );
        } else if (userUid) {
          values.push(userUid);
          filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${values.length})`);
        } else {
          filters.push(`d.visibility = 'public'`);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        values.push(limit);
        try {
          const result = await pool.query(
            `SELECT
              d.uuid,
              d.title,
              d.course,
              d.subject,
              d.uploaddate,
              d.link,
              d.thumbnail_link,
              COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
             FROM documents d
             LEFT JOIN accounts a ON a.uid = d.uploader_uid
             LEFT JOIN profiles p ON p.uid = d.uploader_uid
             ${whereClause}
             ORDER BY d.uploaddate DESC
             LIMIT $${values.length}`,
            values
          );

          return Promise.all(
            result.rows.map(async (row) => ({
              uuid: row.uuid,
              title: row.title || 'Untitled document',
              course: row.course || null,
              subject: row.subject || null,
              uploadDate: row.uploaddate || null,
              uploaderName: row.uploader_name || 'Member',
              link: await signIfNeeded(row.link),
              thumbnailLink: await signIfNeeded(row.thumbnail_link),
            }))
          );
        } catch (error) {
          console.error('Home sidecards materials fetch failed:', error);
          return [];
        }
      })(),
      (async () => {
        const values = [];
        const filters = [`r.state = 'live'`, `(r.visibility = 'public'`];

        if (userCourse) {
          values.push(userCourse);
          filters[1] += ` OR (r.visibility = 'course_exclusive' AND r.course_name = $${values.length})`;
        }
        filters[1] += `)`;

        values.push(limit);
        try {
          const result = await pool.query(
            `SELECT
              r.id,
              r.meet_id,
              r.meet_name,
              r.visibility,
              r.course_name,
              r.started_at,
              r.created_at,
              COALESCE(p.display_name, a.display_name, a.username, a.email) AS creator_name,
              p.photo_link AS creator_photo_link,
              COALESCE((
                SELECT COUNT(*)::int
                FROM room_participants rp
                WHERE rp.room_id = r.id
                  AND rp.status = 'active'
              ), 0) AS active_participants
             FROM rooms r
             JOIN accounts a ON a.uid = r.creator_uid
             LEFT JOIN profiles p ON p.uid = r.creator_uid
             WHERE ${filters.join(' AND ')}
             ORDER BY r.started_at DESC NULLS LAST, r.created_at DESC
             LIMIT $${values.length}`,
            values
          );

          return Promise.all(
            result.rows.map(async (row) => ({
              id: Number(row.id),
              meetId: row.meet_id,
              meetName: row.meet_name,
              visibility: row.visibility,
              courseName: row.course_name || null,
              startedAt: row.started_at || null,
              activeParticipants: Number(row.active_participants || 0),
              creator: {
                displayName: row.creator_name || 'Member',
                photoLink: row.creator_photo_link ? await signIfNeeded(row.creator_photo_link) : null,
              },
            }))
          );
        } catch (error) {
          console.error('Home sidecards rooms fetch failed:', error);
          return [];
        }
      })(),
    ]);

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      sidecards: {
        trendingDiscussions,
        courseMaterials,
        suggestedRooms,
      },
    });
  } catch (error) {
    console.error('Home sidecards fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load home sidecards.' });
  }
});

router.get('/api/posts', async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 50);
  const course = (req.query.course || '').trim();

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');
    const likesCollection = db.collection('post_likes');
    const bookmarksCollection = db.collection('post_bookmarks');

    const filter = buildVisibilityFilter(req.user);
    const excludedAuthors = await loadExcludedAuthorUids(req.user.uid);
    if (excludedAuthors.length) {
      filter.uploaderUid = { $nin: excludedAuthors };
    }
    if (course && course !== 'all') {
      filter.course = course;
    }

    const total = await postsCollection.countDocuments(filter);
    const posts = await postsCollection
      .find(filter)
      .sort({ uploadDate: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    const uploaderUids = [...new Set(posts.map((post) => post.uploaderUid).filter(Boolean))];
    const uploaderProfiles = await loadUploaderProfiles(uploaderUids);

    const postIds = posts.map((post) => post._id);
    const userUid = req.user.uid;
    const liked = await likesCollection
      .find({ postId: { $in: postIds }, userUid })
      .toArray();
    const bookmarked = await bookmarksCollection
      .find({ postId: { $in: postIds }, userUid })
      .toArray();

    const likedSet = new Set(liked.map((item) => item.postId.toString()));
    const bookmarkSet = new Set(bookmarked.map((item) => item.postId.toString()));

    const response = await Promise.all(
      posts.map(async (post) => {
        const profile = uploaderProfiles.get(post.uploaderUid);
        return {
          id: post._id.toString(),
          title: post.title,
          content: post.content,
          course: post.course,
          visibility: post.visibility,
          attachment: await signAttachment(post.attachment || null),
          uploadDate: post.uploadDate,
          uploader: {
            ...(post.uploader || {}),
            uid: post.uploaderUid || post.uploader?.uid || null,
            displayName: profile?.displayName || post.uploader?.displayName || 'Member',
            photoLink: profile?.photoLink || post.uploader?.photoLink || null,
          },
          likesCount: post.likesCount || 0,
          commentsCount: post.commentsCount || 0,
          liked: likedSet.has(post._id.toString()),
          bookmarked: bookmarkSet.has(post._id.toString()),
          isOwner: post.uploaderUid === userUid,
        };
      })
    );

    return res.json({ ok: true, total, page, pageSize, posts: response });
  } catch (error) {
    console.error('Posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load posts.' });
  }
});

router.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');
    const likesCollection = db.collection('post_likes');
    const bookmarksCollection = db.collection('post_bookmarks');
    const postId = new ObjectId(id);

    const filter = {
      ...buildVisibilityFilter(req.user),
      _id: postId,
    };
    const excludedAuthors = await loadExcludedAuthorUids(req.user.uid);
    if (excludedAuthors.length) {
      filter.uploaderUid = { $nin: excludedAuthors };
    }

    const post = await postsCollection.findOne(filter);
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }

    const uploaderProfiles = await loadUploaderProfiles(post.uploaderUid ? [post.uploaderUid] : []);
    const profile = uploaderProfiles.get(post.uploaderUid);
    const [likedResult, bookmarkedResult] = await Promise.all([
      likesCollection.findOne({ postId, userUid: req.user.uid }),
      bookmarksCollection.findOne({ postId, userUid: req.user.uid }),
    ]);

    return res.json({
      ok: true,
      post: {
        id: post._id.toString(),
        title: post.title,
        content: post.content,
        course: post.course,
        visibility: post.visibility,
        attachment: await signAttachment(post.attachment || null),
        uploadDate: post.uploadDate,
        uploader: {
          ...(post.uploader || {}),
          uid: post.uploaderUid || post.uploader?.uid || null,
          displayName: profile?.displayName || post.uploader?.displayName || 'Member',
          photoLink: profile?.photoLink || post.uploader?.photoLink || null,
        },
        likesCount: Number(post.likesCount || 0),
        commentsCount: Number(post.commentsCount || 0),
        liked: Boolean(likedResult),
        bookmarked: Boolean(bookmarkedResult),
        isOwner: post.uploaderUid === req.user.uid,
      },
    });
  } catch (error) {
    console.error('Post fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load post.' });
  }
});

router.post('/api/posts', upload.single('file'), async (req, res) => {
  const {
    title,
    content,
    course,
    visibility,
    attachmentType,
    attachmentLink,
    attachmentTitle,
    libraryDocumentUuid,
  } = req.body || {};
  const file = req.file;

  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }

  const visibilityValue = visibility === 'public' ? 'public' : 'private';
  if (visibilityValue === 'private' && !course) {
    return res.status(400).json({ ok: false, message: 'Course is required for private posts.' });
  }

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');

    let attachment = null;
    const requestedType = (attachmentType || '').trim();

    if (file && libraryDocumentUuid) {
      return res.status(400).json({
        ok: false,
        message: 'Choose either an uploaded file or an Open Library document.',
      });
    }

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
        prefix: 'posts',
      });
      attachment = {
        type: inferredType,
        key: uploaded.key,
        filename: file.originalname,
        mimeType: file.mimetype,
      };
    } else if (libraryDocumentUuid || requestedType === 'library_doc') {
      if (!libraryDocumentUuid) {
        return res.status(400).json({ ok: false, message: 'Library document details required.' });
      }
      attachment = {
        type: 'library_doc',
        libraryDocumentUuid,
        title: attachmentTitle || null,
      };
    } else if (requestedType === 'link') {
      if (!attachmentLink) {
        return res.status(400).json({ ok: false, message: 'Attachment link required.' });
      }
      attachment = {
        type: 'link',
        link: attachmentLink,
        title: attachmentTitle || null,
      };
    } else if (requestedType && requestedType !== 'none') {
      return res.status(400).json({ ok: false, message: 'Invalid attachment payload.' });
    }

    const now = new Date();
    const postDoc = {
      title: title.trim(),
      content: content.trim(),
      course: course ? course.trim() : null,
      visibility: visibilityValue,
      attachment,
      uploadDate: now,
      uploaderUid: req.user.uid,
      uploader: {
        uid: req.user.uid,
        displayName: req.user.displayName || req.user.username || req.user.email,
      },
      likesCount: 0,
      commentsCount: 0,
    };

    const result = await postsCollection.insertOne(postDoc);
    const postId = result.insertedId.toString();

    try {
      const followersResult = await pool.query(
        `SELECT f.follower_uid AS uid
         FROM follows f
         WHERE f.target_uid = $1
           AND f.follower_uid <> $1
           AND NOT EXISTS (
             SELECT 1
             FROM blocked_users bu
             WHERE (bu.blocker_uid = f.follower_uid AND bu.blocked_uid = $1)
                OR (bu.blocker_uid = $1 AND bu.blocked_uid = f.follower_uid)
           )`,
        [req.user.uid]
      );
      const followerUids = followersResult.rows.map((row) => row.uid).filter(Boolean);
      if (followerUids.length) {
        await createNotificationsForRecipients({
          recipientUids: followerUids,
          actorUid: req.user.uid,
          type: 'following_new_post',
          entityType: 'post',
          entityId: postId,
          targetUrl: `/home?post=${encodeURIComponent(postId)}`,
          meta: {
            postTitle: postDoc.title,
          },
        });
      }
    } catch (error) {
      console.error('Post follower notifications failed:', error);
    }

    return res.json({
      ok: true,
      post: { id: postId, ...postDoc },
    });
  } catch (error) {
    console.error('Post create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create post.' });
  }
});

router.patch('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, course, visibility } = req.body || {};

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  const updates = {};
  if (title) updates.title = title.trim();
  if (content) updates.content = content.trim();
  if (course) updates.course = course.trim();
  if (visibility) updates.visibility = visibility === 'public' ? 'public' : 'private';

  if (!Object.keys(updates).length) {
    return res.status(400).json({ ok: false, message: 'No fields to update.' });
  }

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');
    const postId = new ObjectId(id);
    const post = await postsCollection.findOne({ _id: postId });
    if (!post || post.uploaderUid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    await postsCollection.updateOne({ _id: postId }, { $set: updates });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Post update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update post.' });
  }
});

router.delete('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');
    const postId = new ObjectId(id);
    const post = await postsCollection.findOne({ _id: postId });
    if (!post || post.uploaderUid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    if (post.attachment && (post.attachment.type === 'image' || post.attachment.type === 'video')) {
      const key = post.attachment.key || null;
      if (key && !key.startsWith('http')) {
        try {
          await deleteFromStorage(key);
        } catch (error) {
          console.error('Storage delete failed:', error);
        }
      }
    }

    await postsCollection.deleteOne({ _id: postId });
    await db.collection('post_likes').deleteMany({ postId });
    await db.collection('post_comments').deleteMany({ postId });
    await db.collection('post_bookmarks').deleteMany({ postId });
    await db.collection('post_reports').deleteMany({ postId });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Post delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete post.' });
  }
});

router.post('/api/posts/:id/like', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {};
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postId = new ObjectId(id);
    const likesCollection = db.collection('post_likes');
    const postsCollection = db.collection('posts');
    const postForRecipient = await postsCollection.findOne(
      { _id: postId },
      { projection: { uploaderUid: 1, title: 1 } }
    );
    if (!postForRecipient) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    let shouldNotifyLike = false;

    if (action === 'unlike') {
      const result = await likesCollection.deleteOne({ postId, userUid: req.user.uid });
      if (result.deletedCount) {
        await postsCollection.updateOne({ _id: postId }, { $inc: { likesCount: -1 } });
      }
    } else {
      const insert = await likesCollection.updateOne(
        { postId, userUid: req.user.uid },
        { $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      if (insert.upsertedCount) {
        shouldNotifyLike = true;
        await postsCollection.updateOne({ _id: postId }, { $inc: { likesCount: 1 } });
      }
    }

    const post = await postsCollection.findOne({ _id: postId });

    if (shouldNotifyLike && postForRecipient.uploaderUid && postForRecipient.uploaderUid !== req.user.uid) {
      try {
        const blocked = await isBlockedEitherDirection(req.user.uid, postForRecipient.uploaderUid);
        if (!blocked) {
          await createNotification({
            recipientUid: postForRecipient.uploaderUid,
            actorUid: req.user.uid,
            type: 'post_liked',
            entityType: 'post',
            entityId: id,
            targetUrl: `/home?post=${encodeURIComponent(id)}`,
            meta: {
              postTitle: postForRecipient.title || 'Untitled post',
            },
          });
        }
      } catch (error) {
        console.error('Post like notification failed:', error);
      }
    }

    return res.json({ ok: true, likesCount: post ? post.likesCount : 0 });
  } catch (error) {
    console.error('Post like failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update like.' });
  }
});

router.get('/api/posts/:id/comments', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postId = new ObjectId(id);
    const comments = await db
      .collection('post_comments')
      .find({ postId })
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray();
    return res.json({ ok: true, comments });
  } catch (error) {
    console.error('Post comments fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load comments.' });
  }
});

router.post('/api/posts/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body || {};
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Comment content required.' });
  }

  try {
    const db = await getMongoDb();
    const postId = new ObjectId(id);
    const post = await db
      .collection('posts')
      .findOne({ _id: postId }, { projection: { uploaderUid: 1, title: 1 } });
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Post not found.' });
    }
    const comment = {
      postId,
      userUid: req.user.uid,
      displayName: req.user.displayName || req.user.username || req.user.email,
      content: content.trim(),
      createdAt: new Date(),
    };
    const result = await db.collection('post_comments').insertOne(comment);
    await db.collection('posts').updateOne({ _id: postId }, { $inc: { commentsCount: 1 } });

    if (post.uploaderUid && post.uploaderUid !== req.user.uid) {
      try {
        const blocked = await isBlockedEitherDirection(req.user.uid, post.uploaderUid);
        if (!blocked) {
          await createNotification({
            recipientUid: post.uploaderUid,
            actorUid: req.user.uid,
            type: 'post_commented',
            entityType: 'post',
            entityId: id,
            targetUrl: `/home?post=${encodeURIComponent(id)}`,
            meta: {
              postTitle: post.title || 'Untitled post',
            },
          });
        }
      } catch (error) {
        console.error('Post comment notification failed:', error);
      }
    }

    return res.json({ ok: true, comment: { ...comment, _id: result.insertedId } });
  } catch (error) {
    console.error('Post comment failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to add comment.' });
  }
});

router.post('/api/posts/:id/bookmark', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {};
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postId = new ObjectId(id);
    const collection = db.collection('post_bookmarks');

    if (action === 'remove') {
      await collection.deleteOne({ postId, userUid: req.user.uid });
    } else {
      await collection.updateOne(
        { postId, userUid: req.user.uid },
        { $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Bookmark update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update bookmark.' });
  }
});

router.post('/api/posts/:id/report', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postId = new ObjectId(id);
    await db.collection('post_reports').insertOne({
      postId,
      userUid: req.user.uid,
      reason: reason ? reason.trim() : null,
      createdAt: new Date(),
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Report failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to report post.' });
  }
});

router.use('/api/posts', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'File exceeds 50MB limit.' });
  }
  return next(err);
});

module.exports = router;
