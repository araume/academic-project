const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const { uploadToDrive, deleteFromDrive } = require('../services/gdrive');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use('/api/library', requireAuthApi);

router.get('/api/library/courses', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT course_code, course_name FROM courses ORDER BY course_name ASC'
    );
    return res.json({ ok: true, courses: result.rows });
  } catch (error) {
    console.error('Courses fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load courses.' });
  }
});

router.get('/api/library/documents', async (req, res) => {
  const q = (req.query.q || '').trim();
  const course = (req.query.course || '').trim();
  const sort = (req.query.sort || 'recent').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);
  const userCourse = req.user && req.user.course ? req.user.course : null;
  const userUid = req.user && req.user.uid ? req.user.uid : null;

  const filters = [];
  const countValues = [];

  if (q) {
    countValues.push(`%${q}%`);
    filters.push(
      `(d.title ILIKE $${countValues.length} OR d.description ILIKE $${countValues.length} OR d.filename ILIKE $${countValues.length} OR d.subject ILIKE $${countValues.length})`
    );
  }

  if (course && course !== 'all') {
    countValues.push(course);
    filters.push(`d.course = $${countValues.length}`);
  }

  if (userCourse && userUid) {
    countValues.push(userCourse);
    const courseParam = countValues.length;
    countValues.push(userUid);
    const uidParam = countValues.length;
    filters.push(
      `(d.visibility = 'public' OR (d.visibility = 'private' AND (d.course = $${courseParam} OR d.uploader_uid = $${uidParam})))`
    );
  } else if (userUid) {
    countValues.push(userUid);
    filters.push(`(d.visibility = 'public' OR d.uploader_uid = $${countValues.length})`);
  } else {
    filters.push(`d.visibility = 'public'`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  let orderBy = 'd.uploaddate DESC';
  if (sort === 'oldest') {
    orderBy = 'd.uploaddate ASC';
  } else if (sort === 'popularity') {
    orderBy = 'd.popularity DESC';
  } else if (sort === 'views') {
    orderBy = 'd.views DESC';
  } else if (sort === 'az') {
    orderBy = 'd.title ASC';
  } else if (sort === 'za') {
    orderBy = 'd.title DESC';
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM documents d ${whereClause}`,
      countValues
    );
    const total = countResult.rows[0] ? countResult.rows[0].total : 0;

    const listValues = [...countValues];
    const likeUid = userUid || '';
    listValues.push(likeUid);
    const likedParamIndex = listValues.length;
    listValues.push(pageSize, (page - 1) * pageSize);
    const limitParamIndex = listValues.length - 1;
    const offsetParamIndex = listValues.length;

    const listQuery = `
      SELECT
        d.uuid, d.title, d.description, d.filename, d.uploader_uid, d.uploaddate, d.course,
        d.subject, d.views, d.popularity, d.visibility, d.aiallowed, d.link, d.thumbnail_link,
        COALESCE(a.display_name, a.username, a.email) AS uploader_name,
        CASE WHEN l.id IS NULL THEN false ELSE true END AS liked,
        CASE WHEN d.uploader_uid = $${likedParamIndex} THEN true ELSE false END AS is_owner
      FROM documents d
      LEFT JOIN accounts a ON d.uploader_uid = a.uid
      LEFT JOIN document_likes l ON l.document_uuid = d.uuid AND l.user_uid = $${likedParamIndex}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `;

    const listResult = await pool.query(listQuery, listValues);
    return res.json({
      ok: true,
      total,
      page,
      pageSize,
      documents: listResult.rows,
    });
  } catch (error) {
    console.error('Document fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load documents.' });
  }
});

router.get('/api/library/documents/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  try {
    const userCourse = req.user && req.user.course ? req.user.course : null;
    const userUid = req.user && req.user.uid ? req.user.uid : null;
    const filters = ['d.uuid = $1'];
    const values = [uuid];

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

    const query = `
      SELECT
        d.uuid, d.title, d.description, d.filename, d.uploader_uid, d.uploaddate, d.course,
        d.subject, d.views, d.popularity, d.visibility, d.aiallowed, d.link, d.thumbnail_link,
        COALESCE(a.display_name, a.username, a.email) AS uploader_name
      FROM documents d
      LEFT JOIN accounts a ON d.uploader_uid = a.uid
      WHERE ${filters.join(' AND ')}
      LIMIT 1
    `;
    const result = await pool.query(query, values);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }
    return res.json({ ok: true, document: result.rows[0] });
  } catch (error) {
    console.error('Document fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load document.' });
  }
});

router.post(
  '/api/library/documents',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res) => {
    const {
      title,
      description,
      course,
      subject,
      visibility,
      aiallowed,
    } = req.body || {};

    const file = req.files && req.files.file ? req.files.file[0] : null;
    const thumbnail = req.files && req.files.thumbnail ? req.files.thumbnail[0] : null;

    if (!req.user || !req.user.uid) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    if (!title || !course || !subject || !visibility || !file) {
      return res.status(400).json({ ok: false, message: 'Missing required fields.' });
    }

    try {
      const uuid = crypto.randomUUID();
      const folderId = process.env.GDRIVE_FOLDER_ID || null;
      const visibilityValue = visibility === 'private' ? 'private' : 'public';
      const isPublic = visibilityValue === 'public';

      const uploadedFile = await uploadToDrive({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        folderId,
        makePublic: isPublic,
      });

      let thumbnailLink = null;
      if (thumbnail) {
        const uploadedThumb = await uploadToDrive({
          buffer: thumbnail.buffer,
          filename: thumbnail.originalname,
          mimeType: thumbnail.mimetype,
          folderId,
          makePublic: isPublic,
        });
        thumbnailLink = uploadedThumb.webViewLink || uploadedThumb.webContentLink || null;
      }

      const insertQuery = `
        INSERT INTO documents
          (uuid, title, description, filename, uploader_uid, course, subject, visibility, aiallowed, link, thumbnail_link)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING uuid, title, description, filename, uploader_uid, uploaddate, course, subject,
                  views, popularity, visibility, aiallowed, link, thumbnail_link
      `;
      const aiAllowedValue = aiallowed === 'true' || aiallowed === true || aiallowed === 'on';
      const insertValues = [
        uuid,
        title.trim(),
        description ? description.trim() : '',
        file.originalname,
        req.user.uid,
        course.trim(),
        subject.trim(),
        visibilityValue,
        aiAllowedValue,
        uploadedFile.webViewLink || uploadedFile.webContentLink,
        thumbnailLink,
      ];

      const result = await pool.query(insertQuery, insertValues);
      return res.json({ ok: true, document: result.rows[0] });
    } catch (error) {
      console.error('Document upload failed:', error);
      return res.status(500).json({ ok: false, message: 'Upload failed.' });
    }
  }
);

router.post('/api/library/documents/:uuid/view', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  try {
    const result = await pool.query(
      'UPDATE documents SET views = views + 1 WHERE uuid = $1 RETURNING views',
      [uuid]
    );
    return res.json({ ok: true, views: result.rows[0] ? result.rows[0].views : 0 });
  } catch (error) {
    console.error('View update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update views.' });
  }
});

router.patch('/api/library/documents/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const { title, description, course, subject } = req.body || {};
  const updates = [];
  const values = [];

  if (title) {
    values.push(title.trim());
    updates.push(`title = $${values.length}`);
  }
  if (description !== undefined) {
    values.push(description.trim());
    updates.push(`description = $${values.length}`);
  }
  if (course) {
    values.push(course.trim());
    updates.push(`course = $${values.length}`);
  }
  if (subject) {
    values.push(subject.trim());
    updates.push(`subject = $${values.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No fields to update.' });
  }

  try {
    const ownerCheck = await pool.query(
      'SELECT uploader_uid FROM documents WHERE uuid = $1',
      [uuid]
    );
    if (!ownerCheck.rows[0] || ownerCheck.rows[0].uploader_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    values.push(uuid);
    const updateQuery = `
      UPDATE documents
      SET ${updates.join(', ')}
      WHERE uuid = $${values.length}
      RETURNING uuid, title, description, course, subject
    `;
    const result = await pool.query(updateQuery, values);
    return res.json({ ok: true, document: result.rows[0] });
  } catch (error) {
    console.error('Document update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update document.' });
  }
});

router.delete('/api/library/documents/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const docResult = await pool.query(
      'SELECT link, thumbnail_link, uploader_uid FROM documents WHERE uuid = $1',
      [uuid]
    );
    const doc = docResult.rows[0];
    if (!doc || doc.uploader_uid !== req.user.uid) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }

    const deleteResult = await pool.query(
      'DELETE FROM documents WHERE uuid = $1 AND uploader_uid = $2 RETURNING uuid',
      [uuid, req.user.uid]
    );
    if (!deleteResult.rowCount) {
      return res.status(404).json({ ok: false, message: 'Document not found.' });
    }

    const linksToDelete = [doc.link, doc.thumbnail_link].filter(Boolean);
    const ids = linksToDelete
      .map((link) => {
        const match = link.match(/[-\\w]{25,}/);
        return match ? match[0] : null;
      })
      .filter(Boolean);

    for (const fileId of ids) {
      try {
        await deleteFromDrive(fileId);
      } catch (error) {
        console.error('Drive delete failed:', error);
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Document delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete document.' });
  }
});

router.post('/api/library/like', async (req, res) => {
  const { documentUuid, action } = req.body || {};
  if (!documentUuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }
  const userUid = req.user && req.user.uid;
  if (!userUid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    if (action === 'unlike') {
      const del = await pool.query(
        'DELETE FROM document_likes WHERE document_uuid = $1 AND user_uid = $2 RETURNING id',
        [documentUuid, userUid]
      );
      if (del.rowCount) {
        await pool.query(
          'UPDATE documents SET popularity = GREATEST(popularity - 1, 0) WHERE uuid = $1',
          [documentUuid]
        );
      }
    } else {
      const ins = await pool.query(
        'INSERT INTO document_likes (document_uuid, user_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [documentUuid, userUid]
      );
      if (ins.rowCount) {
        await pool.query(
          'UPDATE documents SET popularity = popularity + 1 WHERE uuid = $1',
          [documentUuid]
        );
      }
    }

    const popularity = await pool.query(
      'SELECT popularity FROM documents WHERE uuid = $1',
      [documentUuid]
    );

    return res.json({
      ok: true,
      popularity: popularity.rows[0] ? popularity.rows[0].popularity : 0,
    });
  } catch (error) {
    console.error('Like update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update like.' });
  }
});

router.get('/api/library/comments', async (req, res) => {
  const documentUuid = (req.query.documentUuid || '').trim();
  if (!documentUuid) {
    return res.status(400).json({ ok: false, message: 'Missing document id.' });
  }

  try {
    const db = await getMongoDb();
    const comments = await db
      .collection('doccomment')
      .find({ documentUuid })
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray();
    return res.json({ ok: true, comments });
  } catch (error) {
    console.error('Comment fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load comments.' });
  }
});

router.post('/api/library/comments', async (req, res) => {
  const { documentUuid, content } = req.body || {};
  if (!documentUuid || !content) {
    return res.status(400).json({ ok: false, message: 'Missing comment data.' });
  }
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const db = await getMongoDb();
    const comment = {
      documentUuid,
      userUid: req.user.uid,
      displayName: req.user.displayName || req.user.username || req.user.email,
      content,
      createdAt: new Date(),
    };
    const result = await db.collection('doccomment').insertOne(comment);
    return res.json({ ok: true, comment: { ...comment, _id: result.insertedId } });
  } catch (error) {
    console.error('Comment create failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to add comment.' });
  }
});

router.use('/api/library', (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'File exceeds 50MB limit.' });
  }
  return next(err);
});

module.exports = router;
