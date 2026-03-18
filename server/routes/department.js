const express = require('express');
const { ObjectId } = require('mongodb');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const { getPlatformRole } = require('../services/roleAccess');
const { createNotification } = require('../services/notificationService');
const {
  ensureDepartmentWorkflowReady,
  loadAssignedDepartmentCourses,
  sameCourse,
  normalizeDocumentApprovalStatus,
} = require('../services/departmentAccess');

const router = express.Router();

function sanitizeText(value, maxLen = 400) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadDisplayNamesByUid(uids, client = pool) {
  const unique = Array.from(new Set((Array.isArray(uids) ? uids : []).filter(Boolean)));
  if (!unique.length) return new Map();
  const result = await client.query(
    `SELECT a.uid, COALESCE(p.display_name, a.display_name, a.username, a.email) AS display_name
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = ANY($1::text[])`,
    [unique]
  );
  return new Map(result.rows.map((row) => [row.uid, row.display_name || row.uid]));
}

async function loadDepartmentViewer(uid, client = pool) {
  const result = await client.query(
    `SELECT uid, COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
     FROM accounts
     WHERE uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

function getManagedCourseNames(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .map((item) => item && item.courseName ? item.courseName : '')
    .filter(Boolean);
}

function resolveDepartmentCourseFilter(assignments, requestedCourse) {
  const managedCourses = getManagedCourseNames(assignments);
  const trimmedRequested = sanitizeText(requestedCourse, 160);
  if (!trimmedRequested) {
    return {
      selectedCourse: '',
      courses: managedCourses,
    };
  }
  const matched = managedCourses.find((courseName) => sameCourse(courseName, trimmedRequested)) || '';
  if (!matched) return null;
  return {
    selectedCourse: matched,
    courses: [matched],
  };
}

async function takeDownDepartmentHomePost(postIdValue, actorUid, reason) {
  if (!postIdValue || !ObjectId.isValid(postIdValue)) return null;
  const postId = new ObjectId(postIdValue);
  const db = await getMongoDb();
  const postsCollection = db.collection('posts');
  const post = await postsCollection.findOne(
    { _id: postId },
    { projection: { _id: 1, title: 1, uploaderUid: 1, course: 1, moderationStatus: 1 } }
  );
  if (!post) return null;
  await postsCollection.updateOne(
    { _id: postId },
    {
      $set: {
        moderationStatus: 'restricted',
        restrictedAt: new Date(),
        restrictedByUid: sanitizeText(actorUid, 120) || null,
        restrictedReason: sanitizeText(reason, 1000) || 'Taken down by department moderation',
      },
    }
  );
  return post;
}

async function takeDownDepartmentUnitPost(postId, actorUid, reason, client = pool) {
  const numericPostId = parsePositiveInt(postId);
  if (!numericPostId) return null;
  const result = await client.query(
    `UPDATE subject_posts
     SET status = 'taken_down',
         taken_down_by_uid = $2,
         taken_down_reason = $3,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'active'
     RETURNING id, subject_id, author_uid, title`,
    [numericPostId, sanitizeText(actorUid, 120) || null, sanitizeText(reason, 1000) || 'Taken down by department moderation']
  );
  return result.rows[0] || null;
}

router.use('/api/department', requireAuthApi);

router.use('/api/department', async (req, res, next) => {
  try {
    await ensureDepartmentWorkflowReady();
    const viewer = await loadDepartmentViewer(req.user && req.user.uid ? req.user.uid : '');
    if (!viewer) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    if (viewer.is_banned === true) {
      return res.status(403).json({ ok: false, message: 'Account is banned.' });
    }
    const role = getPlatformRole(viewer);
    if (!(role === 'depadmin' || role === 'admin' || role === 'owner')) {
      return res.status(403).json({ ok: false, message: 'Department management access required.' });
    }
    const assignments = await loadAssignedDepartmentCourses(viewer.uid);
    if (!assignments.length) {
      return res.status(403).json({ ok: false, message: 'No department assignments found for this account.' });
    }
    req.departmentViewer = viewer;
    req.departmentAssignments = assignments;
    return next();
  } catch (error) {
    console.error('Department guard failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to authorize department access.' });
  }
});

router.get('/api/department/dashboard', async (req, res) => {
  const resolvedFilter = resolveDepartmentCourseFilter(req.departmentAssignments, req.query.course);
  if (!resolvedFilter) {
    return res.status(400).json({ ok: false, message: 'Requested course is not assigned to this DepAdmin.' });
  }

  const { courses, selectedCourse } = resolvedFilter;
  const db = await getMongoDb();

  try {
    const [documentsResult, unitPostsResult] = await Promise.all([
      pool.query(
        `SELECT
           d.uuid,
           d.title,
           d.filename,
           d.course,
           d.subject,
           d.visibility,
           d.source,
           d.uploaddate,
           d.upload_approval_status,
           d.upload_approval_requested_at,
           d.upload_rejection_note,
           d.uploader_uid,
           COALESCE(p.display_name, a.display_name, a.username, a.email) AS uploader_name
         FROM documents d
         JOIN accounts a ON a.uid = d.uploader_uid
         LEFT JOIN profiles p ON p.uid = a.uid
         WHERE lower(d.course) = ANY($1::text[])
           AND COALESCE(d.upload_approval_status, 'approved') = 'pending'
         ORDER BY COALESCE(d.upload_approval_requested_at, d.uploaddate) ASC
         LIMIT 200`,
        [courses.map((courseName) => courseName.toLowerCase())]
      ),
      pool.query(
        `SELECT
           sp.id,
           sp.subject_id,
           sp.title,
           sp.content,
           sp.comments_count,
           sp.likes_count,
           sp.created_at,
           sp.author_uid,
           s.subject_name,
           s.course_name
         FROM subject_posts sp
         JOIN subjects s ON s.id = sp.subject_id
         WHERE sp.status = 'active'
           AND s.is_active = true
           AND lower(s.course_name) = ANY($1::text[])
         ORDER BY sp.created_at DESC
         LIMIT 200`,
        [courses.map((courseName) => courseName.toLowerCase())]
      ),
    ]);

    const homePosts = await db
      .collection('posts')
      .find({
        course: { $in: courses },
        visibility: { $in: ['private', 'course_exclusive'] },
        moderationStatus: { $ne: 'restricted' },
      })
      .sort({ uploadDate: -1 })
      .limit(200)
      .toArray();

    const homeNames = await loadDisplayNamesByUid(homePosts.map((post) => post.uploaderUid).filter(Boolean));

    return res.json({
      ok: true,
      assignments: req.departmentAssignments.map((assignment) => ({
        id: assignment.id,
        courseCode: assignment.courseCode || null,
        courseName: assignment.courseName || '',
      })),
      selectedCourse,
      documents: documentsResult.rows.map((row) => ({
        uuid: row.uuid,
        title: row.title || '',
        filename: row.filename || '',
        course: row.course || '',
        subject: row.subject || '',
        visibility: row.visibility || 'public',
        source: row.source || 'library',
        approvalStatus: normalizeDocumentApprovalStatus(row.upload_approval_status, 'approved'),
        approvalRequestedAt: row.upload_approval_requested_at || row.uploaddate || null,
        rejectionNote: row.upload_rejection_note || null,
        uploaderUid: row.uploader_uid || null,
        uploaderName: row.uploader_name || 'Member',
        uploadedAt: row.uploaddate || null,
      })),
      unitPosts: unitPostsResult.rows.map((row) => ({
        id: Number(row.id),
        subjectId: Number(row.subject_id),
        title: row.title || '',
        content: row.content || '',
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        authorUid: row.author_uid || null,
        course: row.course_name || '',
        subjectName: row.subject_name || '',
        createdAt: row.created_at || null,
      })),
      homePosts: homePosts.map((post) => ({
        id: String(post._id),
        title: post.title || '',
        content: post.content || '',
        course: post.course || '',
        visibility: post.visibility || 'public',
        uploaderUid: post.uploaderUid || null,
        uploaderName: homeNames.get(post.uploaderUid) || post.uploader?.displayName || 'Member',
        likesCount: Number(post.likesCount || 0),
        commentsCount: Number(post.commentsCount || 0),
        createdAt: post.uploadDate || null,
      })),
    });
  } catch (error) {
    console.error('Department dashboard fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load department dashboard.' });
  }
});

router.post('/api/department/documents/:uuid/approve', async (req, res) => {
  const uuid = sanitizeText(req.params.uuid, 120);
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Invalid document id.' });
  }

  try {
    const allowedCourses = getManagedCourseNames(req.departmentAssignments).map((courseName) => courseName.toLowerCase());
    const result = await pool.query(
      `UPDATE documents
       SET upload_approval_status = 'approved',
           upload_approval_required = true,
           upload_approved_at = NOW(),
           upload_approved_by_uid = $2,
           upload_rejected_at = NULL,
           upload_rejected_by_uid = NULL,
           upload_rejection_note = NULL
       WHERE uuid::text = $1
         AND lower(course) = ANY($3::text[])
         AND COALESCE(upload_approval_status, 'approved') = 'pending'
       RETURNING uuid::text AS uuid, title, uploader_uid, course`,
      [uuid, req.departmentViewer.uid, allowedCourses]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Pending document approval request not found.' });
    }
    const row = result.rows[0];
    if (row.uploader_uid && row.uploader_uid !== req.departmentViewer.uid) {
      createNotification({
        recipientUid: row.uploader_uid,
        actorUid: req.departmentViewer.uid,
        type: 'document_upload_approved',
        entityType: 'document',
        entityId: row.uuid,
        targetUrl: '/open-library',
        meta: {
          documentUuid: row.uuid,
          documentTitle: row.title || 'Untitled document',
          course: row.course || '',
        },
      }).catch((error) => {
        console.error('Department approval notification failed:', error);
      });
    }
    return res.json({ ok: true, message: 'Document approved.' });
  } catch (error) {
    console.error('Department document approval failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to approve document.' });
  }
});

router.post('/api/department/documents/:uuid/reject', async (req, res) => {
  const uuid = sanitizeText(req.params.uuid, 120);
  const note = sanitizeText(req.body && req.body.note, 1000);
  if (!uuid) {
    return res.status(400).json({ ok: false, message: 'Invalid document id.' });
  }

  try {
    const allowedCourses = getManagedCourseNames(req.departmentAssignments).map((courseName) => courseName.toLowerCase());
    const result = await pool.query(
      `UPDATE documents
       SET upload_approval_status = 'rejected',
           upload_approval_required = true,
           upload_rejected_at = NOW(),
           upload_rejected_by_uid = $2,
           upload_rejection_note = $3,
           upload_approved_at = NULL,
           upload_approved_by_uid = NULL
       WHERE uuid::text = $1
         AND lower(course) = ANY($4::text[])
         AND COALESCE(upload_approval_status, 'approved') = 'pending'
       RETURNING uuid::text AS uuid, title, uploader_uid, course`,
      [uuid, req.departmentViewer.uid, note || null, allowedCourses]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Pending document approval request not found.' });
    }
    const row = result.rows[0];
    if (row.uploader_uid && row.uploader_uid !== req.departmentViewer.uid) {
      createNotification({
        recipientUid: row.uploader_uid,
        actorUid: req.departmentViewer.uid,
        type: 'document_upload_rejected',
        entityType: 'document',
        entityId: row.uuid,
        targetUrl: '/personal',
        meta: {
          documentUuid: row.uuid,
          documentTitle: row.title || 'Untitled document',
          course: row.course || '',
          note: note || '',
        },
      }).catch((error) => {
        console.error('Department rejection notification failed:', error);
      });
    }
    return res.json({ ok: true, message: 'Document rejected.' });
  } catch (error) {
    console.error('Department document rejection failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reject document.' });
  }
});

router.post('/api/department/home-posts/:id/takedown', async (req, res) => {
  const postId = sanitizeText(req.params.id, 80);
  const reason = sanitizeText(req.body && req.body.reason, 1000);
  if (!ObjectId.isValid(postId)) {
    return res.status(400).json({ ok: false, message: 'Invalid post id.' });
  }

  try {
    const db = await getMongoDb();
    const postsCollection = db.collection('posts');
    const existing = await postsCollection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { course: 1 } }
    );
    if (!existing) {
      return res.status(404).json({ ok: false, message: 'Home post not found.' });
    }
    const allowed = getManagedCourseNames(req.departmentAssignments).some((courseName) =>
      sameCourse(courseName, existing.course)
    );
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'This home post is outside your assigned department.' });
    }
    const post = await takeDownDepartmentHomePost(postId, req.departmentViewer.uid, reason);
    if (!post) {
      return res.status(404).json({ ok: false, message: 'Home post not found.' });
    }
    return res.json({ ok: true, message: 'Home post taken down.' });
  } catch (error) {
    console.error('Department home post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down home post.' });
  }
});

router.post('/api/department/unit-posts/:id/takedown', async (req, res) => {
  const postId = parsePositiveInt(req.params.id);
  const reason = sanitizeText(req.body && req.body.reason, 1000);
  if (!postId) {
    return res.status(400).json({ ok: false, message: 'Invalid unit post id.' });
  }

  try {
    const courseCheck = await pool.query(
      `SELECT s.course_name
       FROM subject_posts sp
       JOIN subjects s ON s.id = sp.subject_id
       WHERE sp.id = $1
       LIMIT 1`,
      [postId]
    );
    if (!courseCheck.rows.length) {
      return res.status(404).json({ ok: false, message: 'Unit post not found.' });
    }
    const allowed = getManagedCourseNames(req.departmentAssignments).some((courseName) =>
      sameCourse(courseName, courseCheck.rows[0].course_name)
    );
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'This unit post is outside your assigned department.' });
    }
    const takenDown = await takeDownDepartmentUnitPost(postId, req.departmentViewer.uid, reason);
    if (!takenDown) {
      return res.status(404).json({ ok: false, message: 'Unit post not found.' });
    }
    return res.json({ ok: true, message: 'Unit post taken down.' });
  } catch (error) {
    console.error('Department unit post takedown failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to take down unit post.' });
  }
});

module.exports = router;
