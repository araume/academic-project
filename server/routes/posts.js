const express = require('express');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const { uploadToDrive } = require('../services/gdrive');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use('/api/posts', requireAuthApi);

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

    const response = posts.map((post) => ({
      id: post._id.toString(),
      title: post.title,
      content: post.content,
      course: post.course,
      visibility: post.visibility,
      attachment: post.attachment || null,
      uploadDate: post.uploadDate,
      uploader: post.uploader,
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      liked: likedSet.has(post._id.toString()),
      bookmarked: bookmarkSet.has(post._id.toString()),
      isOwner: post.uploaderUid === userUid,
    }));

    return res.json({ ok: true, total, page, pageSize, posts: response });
  } catch (error) {
    console.error('Posts fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load posts.' });
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
    if (attachmentType && attachmentType !== 'none') {
      if ((attachmentType === 'image' || attachmentType === 'video') && file) {
        const folderId = process.env.GDRIVE_POSTS_FOLDER_ID || process.env.GDRIVE_FOLDER_ID || null;
        const uploaded = await uploadToDrive({
          buffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
          folderId,
          makePublic: visibilityValue === 'public',
        });
        attachment = {
          type: attachmentType,
          link: uploaded.webViewLink || uploaded.webContentLink,
          filename: file.originalname,
          mimeType: file.mimetype,
        };
      } else if (attachmentType === 'library_doc') {
        if (!attachmentLink || !libraryDocumentUuid) {
          return res.status(400).json({ ok: false, message: 'Library document details required.' });
        }
        attachment = {
          type: 'library_doc',
          link: attachmentLink,
          libraryDocumentUuid,
          title: attachmentTitle || null,
        };
      } else if (attachmentType === 'link') {
        if (!attachmentLink) {
          return res.status(400).json({ ok: false, message: 'Attachment link required.' });
        }
        attachment = {
          type: 'link',
          link: attachmentLink,
          title: attachmentTitle || null,
        };
      }
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
    return res.json({
      ok: true,
      post: { id: result.insertedId.toString(), ...postDoc },
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
        await postsCollection.updateOne({ _id: postId }, { $inc: { likesCount: 1 } });
      }
    }

    const post = await postsCollection.findOne({ _id: postId });
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
    const comment = {
      postId,
      userUid: req.user.uid,
      displayName: req.user.displayName || req.user.username || req.user.email,
      content: content.trim(),
      createdAt: new Date(),
    };
    const result = await db.collection('post_comments').insertOne(comment);
    await db.collection('posts').updateOne({ _id: postId }, { $inc: { commentsCount: 1 } });
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
