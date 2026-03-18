const pool = require('../db/pool');
const { hasAdminPrivileges } = require('./roleAccess');

let ensureDepartmentWorkflowReadyPromise = null;

function normalizeCourseName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function dedupeCourseNames(values) {
  const unique = new Map();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const normalized = normalizeCourseName(trimmed);
    if (!normalized || unique.has(normalized)) return;
    unique.set(normalized, trimmed);
  });
  return Array.from(unique.values());
}

function sameCourse(left, right) {
  const normalizedLeft = normalizeCourseName(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeCourseName(right);
}

function normalizeDocumentApprovalStatus(value, fallback = 'approved') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'approved' || normalized === 'pending' || normalized === 'rejected') {
    return normalized;
  }
  return fallback;
}

function isDocumentApprovedRow(document) {
  return normalizeDocumentApprovalStatus(document && document.upload_approval_status, 'approved') === 'approved';
}

async function ensureDepartmentWorkflowReady(client = pool) {
  if (!ensureDepartmentWorkflowReadyPromise) {
    ensureDepartmentWorkflowReadyPromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS course_dep_admin_assignments (
          id BIGSERIAL PRIMARY KEY,
          course_code TEXT,
          course_name TEXT NOT NULL UNIQUE,
          depadmin_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
          assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS course_dep_admin_assignments_depadmin_uid_idx
          ON course_dep_admin_assignments(depadmin_uid, updated_at DESC);

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_approval_status TEXT NOT NULL DEFAULT 'approved';

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_approval_required BOOLEAN NOT NULL DEFAULT false;

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_approval_requested_at TIMESTAMPTZ;

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_approved_at TIMESTAMPTZ;

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_approved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_rejected_at TIMESTAMPTZ;

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_rejected_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;

        ALTER TABLE documents
          ADD COLUMN IF NOT EXISTS upload_rejection_note TEXT;

        ALTER TABLE documents
          DROP CONSTRAINT IF EXISTS documents_upload_approval_status_check;

        ALTER TABLE documents
          ADD CONSTRAINT documents_upload_approval_status_check
            CHECK (upload_approval_status IN ('approved', 'pending', 'rejected'));

        CREATE INDEX IF NOT EXISTS documents_upload_approval_status_course_idx
          ON documents(upload_approval_status, course, uploaddate DESC);
      `);
    })().catch((error) => {
      ensureDepartmentWorkflowReadyPromise = null;
      throw error;
    });
  }

  await ensureDepartmentWorkflowReadyPromise;
}

async function loadUserCourseAccess(uid, client = pool) {
  if (!uid) {
    return { mainCourse: '', subCourses: [], accessibleCourses: [] };
  }

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

  if (!result.rows.length) {
    return { mainCourse: '', subCourses: [], accessibleCourses: [] };
  }

  const row = result.rows[0];
  const mainCourse = dedupeCourseNames([row.main_course, row.account_course])[0] || '';
  const subCourses = dedupeCourseNames(Array.isArray(row.sub_courses) ? row.sub_courses : [])
    .filter((courseName) => !sameCourse(courseName, mainCourse));
  const accessibleCourses = dedupeCourseNames([mainCourse, ...subCourses]);

  return {
    mainCourse,
    subCourses,
    accessibleCourses,
  };
}

async function loadDepartmentAssignmentForCourse(courseName, client = pool) {
  await ensureDepartmentWorkflowReady(client);
  if (!courseName) return null;
  const result = await client.query(
    `SELECT id, course_code, course_name, depadmin_uid
     FROM course_dep_admin_assignments
     WHERE lower(course_name) = lower($1)
     LIMIT 1`,
    [courseName]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    courseCode: row.course_code || null,
    courseName: row.course_name || courseName,
    depadminUid: row.depadmin_uid || null,
  };
}

async function loadAssignedDepartmentCourses(uid, client = pool) {
  await ensureDepartmentWorkflowReady(client);
  if (!uid) return [];
  const result = await client.query(
    `SELECT id, course_code, course_name, depadmin_uid
     FROM course_dep_admin_assignments
     WHERE depadmin_uid = $1
     ORDER BY lower(course_name) ASC, id ASC`,
    [uid]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    courseCode: row.course_code || null,
    courseName: row.course_name || '',
    depadminUid: row.depadmin_uid || null,
  }));
}

async function listDocumentUploadCoursePoliciesForUser(uid, client = pool) {
  await ensureDepartmentWorkflowReady(client);
  const access = await loadUserCourseAccess(uid, client);

  const uploadCourses = [];
  if (access.mainCourse) {
    uploadCourses.push({
      courseName: access.mainCourse,
      accessLevel: 'main',
      approvalRequired: false,
      depadminUid: null,
      message: 'Uploads to your own course are published immediately.',
    });
  }

  const subcoursePolicies = await Promise.all(
    access.subCourses.map(async (courseName) => {
      const assignment = await loadDepartmentAssignmentForCourse(courseName, client);
      if (assignment && assignment.depadminUid) {
        return {
          available: true,
          courseName: assignment.courseName || courseName,
          accessLevel: 'subcourse',
          approvalRequired: true,
          depadminUid: assignment.depadminUid,
          message: 'Uploads to this joined subcourse stay pending until its DepAdmin approves them.',
        };
      }

      return {
        available: false,
        courseName,
        accessLevel: 'subcourse',
        approvalRequired: true,
        depadminUid: null,
        reason: 'missing_depadmin',
        message: 'This joined subcourse cannot accept uploads until an assigned DepAdmin is available.',
      };
    })
  );

  const uploadCourseMap = new Map(
    uploadCourses.map((item) => [normalizeCourseName(item.courseName), item])
  );
  const blockedSubcourses = [];

  subcoursePolicies.forEach((item) => {
    const normalized = normalizeCourseName(item.courseName);
    if (!normalized) return;
    if (item.available) {
      if (!uploadCourseMap.has(normalized)) {
        uploadCourseMap.set(normalized, item);
      }
      return;
    }
    blockedSubcourses.push(item);
  });

  return {
    mainCourse: access.mainCourse,
    subCourses: access.subCourses,
    accessibleCourses: access.accessibleCourses,
    uploadCourses: Array.from(uploadCourseMap.values()),
    blockedSubcourses,
  };
}

async function resolveDocumentCoursePolicyForUser(uid, requestedCourse, client = pool) {
  await ensureDepartmentWorkflowReady(client);

  const trimmedCourse = typeof requestedCourse === 'string' ? requestedCourse.trim() : '';
  if (!trimmedCourse) {
    return { ok: false, message: 'Course is required.', reason: 'missing_course' };
  }

  const access = await loadUserCourseAccess(uid, client);
  const mainMatch = access.mainCourse && sameCourse(access.mainCourse, trimmedCourse) ? access.mainCourse : '';
  if (mainMatch) {
    return {
      ok: true,
      courseName: mainMatch,
      accessLevel: 'main',
      approvalStatus: 'approved',
      approvalRequired: false,
      depadminUid: null,
      courseAccess: access,
    };
  }

  const subMatch = access.subCourses.find((courseName) => sameCourse(courseName, trimmedCourse)) || '';
  if (!subMatch) {
    return {
      ok: false,
      message: 'You can only upload documents directly to your main course. Joined subcourses require DepAdmin approval.',
      reason: 'outside_course_access',
      courseAccess: access,
    };
  }

  const assignment = await loadDepartmentAssignmentForCourse(subMatch, client);
  if (!assignment || !assignment.depadminUid) {
    return {
      ok: false,
      message: 'This joined subcourse does not have an assigned DepAdmin yet.',
      reason: 'missing_depadmin',
      courseAccess: access,
    };
  }

  return {
    ok: true,
    courseName: assignment.courseName || subMatch,
    accessLevel: 'subcourse',
    approvalStatus: 'pending',
    approvalRequired: true,
    depadminUid: assignment.depadminUid,
    courseAccess: access,
  };
}

function canUserAccessLibraryDocumentRow(document, user, courseAccess, { allowOwnerPending = true } = {}) {
  if (!document || !user) return false;
  if (document.is_restricted === true) return false;
  if (hasAdminPrivileges(user)) return true;

  const uploaderUid = document.uploader_uid || document.uploaderUid || '';
  const isOwner = Boolean(uploaderUid && user.uid && uploaderUid === user.uid);
  if (isOwner) {
    return allowOwnerPending || isDocumentApprovedRow(document);
  }

  if (!isDocumentApprovedRow(document)) {
    return false;
  }

  const source = typeof document.source === 'string' ? document.source.trim().toLowerCase() : 'library';
  const visibility = typeof document.visibility === 'string' ? document.visibility.trim().toLowerCase() : 'public';
  if (source === 'vault' && visibility === 'private') {
    return false;
  }
  if (visibility === 'public') {
    return true;
  }

  const accessibleCourses = dedupeCourseNames(
    courseAccess && Array.isArray(courseAccess.accessibleCourses)
      ? courseAccess.accessibleCourses
      : [user.course || '']
  );
  if (!accessibleCourses.some((courseName) => sameCourse(courseName, document.course))) {
    return false;
  }

  return visibility === 'private' || visibility === 'course_exclusive';
}

module.exports = {
  normalizeCourseName,
  dedupeCourseNames,
  sameCourse,
  normalizeDocumentApprovalStatus,
  isDocumentApprovedRow,
  ensureDepartmentWorkflowReady,
  loadUserCourseAccess,
  loadDepartmentAssignmentForCourse,
  loadAssignedDepartmentCourses,
  listDocumentUploadCoursePoliciesForUser,
  resolveDocumentCoursePolicyForUser,
  canUserAccessLibraryDocumentRow,
};
