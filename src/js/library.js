const documentGrid = document.getElementById('documentGrid');
const pagination = document.getElementById('pagination');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const courseFilter = document.getElementById('courseFilter');
const sortFilter = document.getElementById('sortFilter');
const uploaderFilterButton = document.getElementById('uploaderFilterButton');
const activeUploaderFilter = document.getElementById('activeUploaderFilter');
const activeUploaderFilterText = document.getElementById('activeUploaderFilterText');
const clearUploaderFilterButton = document.getElementById('clearUploaderFilterButton');
const uploadCourse = document.getElementById('uploadCourse');
const uploadCourseList = document.getElementById('uploadCourseList');
const uploadCoursePolicyHint = document.getElementById('uploadCoursePolicyHint');
const uploadToggle = document.getElementById('uploadToggle');
const openMyUploadsModalButton = document.getElementById('openMyUploadsModal');
const uploadModal = document.getElementById('uploadModal');
const uploadClose = document.getElementById('uploadClose');
const uploadForm = document.getElementById('uploadForm');
const uploadMessage = document.getElementById('uploadMessage');
const myUploadsModal = document.getElementById('myUploadsModal');
const myUploadsClose = document.getElementById('myUploadsClose');
const myUploadsSubtitle = document.getElementById('myUploadsSubtitle');
const myUploadsStatusFilter = document.getElementById('myUploadsStatusFilter');
const myUploadsMessage = document.getElementById('myUploadsMessage');
const myUploadsList = document.getElementById('myUploadsList');

const detailModal = document.getElementById('detailModal');
const detailClose = document.getElementById('detailClose');
const detailTitle = document.getElementById('detailTitle');
const detailMeta = document.getElementById('detailMeta');
const detailDescription = document.getElementById('detailDescription');
const detailFilename = document.getElementById('detailFilename');
const detailUploader = document.getElementById('detailUploader');
const detailDate = document.getElementById('detailDate');
const detailCourse = document.getElementById('detailCourse');
const detailSubject = document.getElementById('detailSubject');
const detailViews = document.getElementById('detailViews');
const detailPopularity = document.getElementById('detailPopularity');
const detailThumb = document.getElementById('detailThumb');
const detailOpen = document.getElementById('detailOpen');
const detailOpenMessage = document.getElementById('detailOpenMessage');
const detailLike = document.getElementById('detailLike');
const detailAskAi = document.getElementById('detailAskAi');
const detailMenuToggle = document.getElementById('detailMenuToggle');
const detailMenu = document.getElementById('detailMenu');
const detailShare = document.getElementById('detailShare');
const detailReport = document.getElementById('detailReport');
const detailEdit = document.getElementById('detailEdit');
const detailDelete = document.getElementById('detailDelete');
const editSection = document.getElementById('editSection');
const editForm = document.getElementById('editForm');
const editCancel = document.getElementById('editCancel');
const editMessage = document.getElementById('editMessage');

const commentList = document.getElementById('commentList');
const commentForm = document.getElementById('commentForm');
const commentInput = document.getElementById('commentInput');
const docAiModal = document.getElementById('docAiModal');
const docAiClose = document.getElementById('docAiClose');
const docAiTitle = document.getElementById('docAiTitle');
const docAiSubtitle = document.getElementById('docAiSubtitle');
const docAiMessages = document.getElementById('docAiMessages');
const docAiForm = document.getElementById('docAiForm');
const docAiInput = document.getElementById('docAiInput');
const docAiMessage = document.getElementById('docAiMessage');
const uploaderFilterModal = document.getElementById('uploaderFilterModal');
const uploaderFilterClose = document.getElementById('uploaderFilterClose');
const uploaderFilterSearchForm = document.getElementById('uploaderFilterSearchForm');
const uploaderFilterSearchInput = document.getElementById('uploaderFilterSearchInput');
const uploaderFilterResults = document.getElementById('uploaderFilterResults');
const uploaderFilterMessage = document.getElementById('uploaderFilterMessage');

const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

let currentDoc = null;
let lastActive = Date.now();
let isFetching = false;
let activeDocAiUuid = null;
let isSendingDocAi = false;
let isDocumentUploading = false;
let initialDocumentSelectionApplied = false;
let initialMyUploadsSelectionApplied = false;

const state = {
  page: 1,
  pageSize: 12,
  q: '',
  course: 'all',
  uploaderUid: '',
  uploaderName: '',
  sort: 'recent',
  total: 0,
  myUploads: {
    documents: [],
    filterStatus: 'all',
    focusUuid: '',
    removedDocumentUuid: '',
    openRequested: false,
  },
};

function normalizeMyUploadsFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['approved', 'pending', 'rejected', 'removed'].includes(normalized)) {
    return normalized;
  }
  return 'all';
}

function readInitialDocumentSelection() {
  const params = new URLSearchParams(window.location.search);
  const documentUuid = String(params.get('documentUuid') || '').trim();
  const uploadUuid = String(params.get('uploadUuid') || params.get('documentUuid') || '').trim();
  return {
    documentUuid,
    myUploadsOpen: params.get('myUploads') === '1',
    uploadStatus: normalizeMyUploadsFilter(params.get('uploadStatus')),
    uploadUuid,
    removedDocumentUuid: String(params.get('removedDocumentUuid') || '').trim(),
  };
}

const initialDocumentSelection = readInitialDocumentSelection();
state.myUploads.filterStatus = initialDocumentSelection.myUploadsOpen ? initialDocumentSelection.uploadStatus : 'all';
state.myUploads.focusUuid = initialDocumentSelection.myUploadsOpen ? initialDocumentSelection.uploadUuid : '';
state.myUploads.removedDocumentUuid = initialDocumentSelection.myUploadsOpen
  ? initialDocumentSelection.removedDocumentUuid
  : '';
state.myUploads.openRequested = initialDocumentSelection.myUploadsOpen;

const uploadAccessState = {
  loaded: false,
  loading: false,
  mainCourse: '',
  uploadCourses: [],
  blockedSubcourses: [],
};

function normalizeCourseName(value) {
  return String(value || '').trim().toLowerCase();
}

function syncDocumentLocation(documentUuid) {
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  const url = new URL(window.location.href);
  if (documentUuid) {
    url.searchParams.set('documentUuid', String(documentUuid));
  } else {
    url.searchParams.delete('documentUuid');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function syncMyUploadsLocation({ open = false, status = 'all', uploadUuid = '', removedDocumentUuid = '' } = {}) {
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  const url = new URL(window.location.href);
  if (open) {
    url.searchParams.set('myUploads', '1');
    const normalizedStatus = normalizeMyUploadsFilter(status);
    if (normalizedStatus === 'all') {
      url.searchParams.delete('uploadStatus');
    } else {
      url.searchParams.set('uploadStatus', normalizedStatus);
    }
    if (uploadUuid) {
      url.searchParams.set('uploadUuid', uploadUuid);
    } else {
      url.searchParams.delete('uploadUuid');
    }
    if (removedDocumentUuid) {
      url.searchParams.set('removedDocumentUuid', removedDocumentUuid);
    } else {
      url.searchParams.delete('removedDocumentUuid');
    }
  } else {
    url.searchParams.delete('myUploads');
    url.searchParams.delete('uploadStatus');
    url.searchParams.delete('uploadUuid');
    url.searchParams.delete('removedDocumentUuid');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function findUploadCoursePolicy(courseName) {
  const normalized = normalizeCourseName(courseName);
  if (!normalized) return null;
  return uploadAccessState.uploadCourses.find(
    (item) => normalizeCourseName(item.courseName) === normalized
  ) || null;
}

function buildUploadCoursePolicyHint(courseName) {
  const policy = findUploadCoursePolicy(courseName);
  if (policy) {
    return policy.approvalRequired
      ? 'Joined subcourse upload selected. This document will stay pending until the assigned DepAdmin approves it.'
      : 'Your main course is selected. Uploads here are published immediately.';
  }

  const normalizedCourse = normalizeCourseName(courseName);
  if (normalizedCourse) {
    const blockedMatch = uploadAccessState.blockedSubcourses.find(
      (item) => normalizeCourseName(item.courseName) === normalizedCourse
    );
    if (blockedMatch) {
      return blockedMatch.message || 'This joined subcourse cannot accept uploads until a DepAdmin is assigned.';
    }
    return 'You can upload only to your main course or to joined subcourses that already have an assigned DepAdmin.';
  }

  if (!uploadAccessState.uploadCourses.length) {
    return 'Set your main course first. Joined subcourses without an assigned DepAdmin cannot receive uploads.';
  }

  const blockedNames = uploadAccessState.blockedSubcourses
    .map((item) => String(item.courseName || '').trim())
    .filter(Boolean);

  const baseHint = 'Direct uploads are limited to your main course. Joined subcourses require DepAdmin approval.';
  if (!blockedNames.length) {
    return baseHint;
  }
  return `${baseHint} Unavailable joined subcourses: ${blockedNames.join(', ')}.`;
}

function renderUploadCoursePolicyHint(courseName = uploadCourse ? uploadCourse.value : '') {
  if (!uploadCoursePolicyHint) return;
  uploadCoursePolicyHint.textContent = buildUploadCoursePolicyHint(courseName);
}

function populateUploadCourseList(uploadCourses) {
  if (!uploadCourseList) return;
  clearElement(uploadCourseList);
  uploadCourses.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.courseName || '';
    uploadCourseList.appendChild(option);
  });
}

function applyUploadAccessState(data) {
  uploadAccessState.loaded = true;
  uploadAccessState.mainCourse = String(data.mainCourse || '').trim();
  uploadAccessState.uploadCourses = Array.isArray(data.uploadCourses) ? data.uploadCourses : [];
  uploadAccessState.blockedSubcourses = Array.isArray(data.blockedSubcourses) ? data.blockedSubcourses : [];
  populateUploadCourseList(uploadAccessState.uploadCourses);
  if (uploadCourse && !findUploadCoursePolicy(uploadCourse.value) && uploadAccessState.mainCourse) {
    uploadCourse.value = uploadAccessState.mainCourse;
  }
  renderUploadCoursePolicyHint();
}

async function loadUploadAccess(force = false) {
  if (uploadAccessState.loading) return;
  if (uploadAccessState.loaded && !force) {
    renderUploadCoursePolicyHint();
    return;
  }

  uploadAccessState.loading = true;
  try {
    const response = await fetch('/api/library/upload-access');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load upload access.');
    }
    applyUploadAccessState(data);
  } catch (_error) {
    renderUploadCoursePolicyHint();
  } finally {
    uploadAccessState.loading = false;
  }
}

function initialsFromName(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'M';
  return safe[0].toUpperCase();
}

function setNavAvatar(photoLink, displayName) {
  if (!navAvatarLabel) return;
  navAvatarLabel.innerHTML = '';
  if (photoLink) {
    const image = document.createElement('img');
    image.src = photoLink;
    image.alt = `${displayName || 'User'} profile photo`;
    navAvatarLabel.appendChild(image);
    return;
  }
  navAvatarLabel.textContent = initialsFromName(displayName);
}

function updateActiveUploaderFilterUI() {
  if (!activeUploaderFilter || !activeUploaderFilterText) return;
  const hasFilter = Boolean(state.uploaderUid);
  activeUploaderFilter.classList.toggle('is-hidden', !hasFilter);
  if (hasFilter) {
    activeUploaderFilterText.textContent = `Filtering uploads by: ${state.uploaderName || 'Selected uploader'}`;
  }
}

async function loadNavAvatar() {
  try {
    const response = await fetch('/api/profile');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      return;
    }
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (error) {
    // keep fallback initials
  }
}

function markActive() {
  lastActive = Date.now();
}

['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) => {
  document.addEventListener(evt, markActive);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    markActive();
    fetchDocuments();
  }
});

function getFileExtension(name) {
  const parts = name.split('.');
  if (parts.length < 2) {
    return 'FILE';
  }
  return parts.pop().toUpperCase();
}

function renderThumb(container, doc) {
  container.innerHTML = '';
  if (doc.thumbnail_link) {
    const img = document.createElement('img');
    img.src = doc.thumbnail_link;
    img.alt = doc.title;
    container.appendChild(img);
    return;
  }
  container.textContent = getFileExtension(doc.filename || '');
}

function updateDocumentAvailabilityUI(doc) {
  const available = Boolean(doc && doc.link);
  if (detailOpen) {
    detailOpen.disabled = !available;
    detailOpen.title = available ? '' : 'Document file is unavailable in storage.';
  }
  if (detailOpenMessage) {
    detailOpenMessage.textContent = available
      ? ''
      : 'Document file is unavailable. It may have been removed or is still processing.';
  }
}

function toggleMenu(show) {
  if (!detailMenu) {
    return;
  }
  detailMenu.classList.toggle('is-hidden', !show);
}

async function fetchDocuments() {
  if (isFetching) {
    return;
  }
  isFetching = true;
  try {
    const params = new URLSearchParams({
      q: state.q,
      course: state.course,
      sort: state.sort,
      page: state.page,
      pageSize: state.pageSize,
    });
    if (state.uploaderUid) {
      params.set('uploaderUid', state.uploaderUid);
    }
    const response = await fetch(`/api/library/documents?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load documents.');
    }
    state.total = data.total || 0;
    renderDocuments(data.documents || []);
    renderPagination();
  } catch (error) {
    documentGrid.innerHTML = `<p>${error.message}</p>`;
  } finally {
    isFetching = false;
  }
}

function renderDocuments(documents) {
  documentGrid.innerHTML = '';
  if (!documents.length) {
    documentGrid.innerHTML = '<p>No documents found.</p>';
    return;
  }
  documents.forEach((doc) => {
    const card = document.createElement('article');
    card.className = 'doc-card';
    card.dataset.uuid = doc.uuid;

    const thumb = document.createElement('div');
    thumb.className = 'doc-thumb';
    renderThumb(thumb, doc);

    const meta = document.createElement('div');
    meta.className = 'doc-meta';
    const approvalStatus = String(doc.upload_approval_status || 'approved').toLowerCase();
    const ownerStatusLine =
      doc.is_owner && approvalStatus !== 'approved'
        ? `<p>${approvalStatus === 'pending' ? 'Pending DepAdmin approval' : 'Rejected for selected subcourse'}</p>`
        : '';
    meta.innerHTML = `
      <h4>${doc.title}</h4>
      <p>${doc.uploader_name || 'Unknown uploader'}</p>
      ${ownerStatusLine}
    `;

    const stats = document.createElement('div');
    stats.className = 'doc-stats';
    const date = new Date(doc.uploaddate).toLocaleDateString();
    stats.innerHTML = `<span>${doc.popularity} likes</span><span>${date}</span>`;

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(stats);
    card.addEventListener('click', () => openDetail(doc));
    documentGrid.appendChild(card);
  });
}

function renderPagination() {
  pagination.innerHTML = '';
  const totalPages = Math.max(Math.ceil(state.total / state.pageSize), 1);

  const prev = document.createElement('button');
  prev.textContent = 'Prev';
  prev.disabled = state.page <= 1;
  prev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      fetchDocuments();
    }
  });

  const next = document.createElement('button');
  next.textContent = 'Next';
  next.disabled = state.page >= totalPages;
  next.addEventListener('click', () => {
    if (state.page < totalPages) {
      state.page += 1;
      fetchDocuments();
    }
  });

  const label = document.createElement('span');
  label.textContent = `Page ${state.page} of ${totalPages}`;

  pagination.appendChild(prev);
  pagination.appendChild(label);
  pagination.appendChild(next);
}

async function openDetail(doc) {
  currentDoc = doc;
  syncDocumentLocation(doc && doc.uuid ? doc.uuid : null);
  updateDocumentAvailabilityUI(doc);
  detailTitle.textContent = doc.title;
  const approvalStatus = String(doc.upload_approval_status || 'approved').toLowerCase();
  detailMeta.textContent =
    doc.is_owner && approvalStatus !== 'approved'
      ? `${doc.course} • ${doc.subject} • ${approvalStatus === 'pending' ? 'Pending approval' : 'Rejected'}`
      : `${doc.course} • ${doc.subject}`;
  detailDescription.textContent = doc.description || 'No description provided.';
  detailFilename.textContent = doc.filename;
  detailUploader.textContent = doc.uploader_name || 'Unknown';
  detailDate.textContent = new Date(doc.uploaddate).toLocaleString();
  detailCourse.textContent = doc.course;
  detailSubject.textContent = doc.subject;
  detailViews.textContent = doc.views;
  detailPopularity.textContent = doc.popularity;
  detailLike.textContent = doc.liked ? 'Unlike' : 'Like';
  if (detailAskAi) {
    const aiAllowed = doc.aiallowed !== false;
    detailAskAi.disabled = !aiAllowed;
    detailAskAi.textContent = aiAllowed ? 'Ask AI' : 'AI disabled';
    detailAskAi.title = aiAllowed ? '' : 'Uploader disabled AI for this document.';
  }
  renderThumb(detailThumb, doc);

  if (detailEdit && detailDelete && detailReport) {
    const isOwner = doc.is_owner;
    detailEdit.classList.toggle('is-hidden', !isOwner);
    detailDelete.classList.toggle('is-hidden', !isOwner);
    detailReport.classList.toggle('is-hidden', isOwner);
  }

  if (editSection) {
    editSection.classList.add('is-hidden');
  }

  detailModal.classList.remove('is-hidden');
  await loadComments(doc.uuid);
}

function closeDetailModal() {
  currentDoc = null;
  if (editSection) {
    editSection.classList.add('is-hidden');
  }
  closeModal(detailModal);
  syncDocumentLocation(null);
}

function documentApprovalStatusTone(doc) {
  const status = String(doc && doc.approvalStatus ? doc.approvalStatus : doc && doc.upload_approval_status ? doc.upload_approval_status : 'approved').toLowerCase();
  if (status === 'pending') return { label: 'Pending approval', modifier: 'is-warning' };
  if (status === 'rejected') return { label: 'Rejected', modifier: 'is-danger' };
  if (status === 'removed') return { label: 'Removed', modifier: 'is-danger' };
  return { label: 'Approved', modifier: 'is-accent' };
}

function createDocumentStatusBadge(text, modifier = '') {
  const badge = document.createElement('span');
  badge.className = `my-upload-badge${modifier ? ` ${modifier}` : ''}`;
  badge.textContent = text;
  return badge;
}

function highlightMyUpload(uuid) {
  if (!uuid) return;
  const card = document.getElementById(`my-upload-doc-${uuid}`);
  if (!card) return;
  card.classList.add('is-highlighted');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => card.classList.remove('is-highlighted'), 2400);
}

function renderMyUploads() {
  if (!myUploadsList) return;
  if (myUploadsMessage) {
    myUploadsMessage.textContent = '';
  }
  const filterStatus = normalizeMyUploadsFilter(state.myUploads.filterStatus);
  const documents = Array.isArray(state.myUploads.documents) ? state.myUploads.documents : [];
  const visibleDocuments = filterStatus === 'all'
    ? documents
    : documents.filter((doc) => String(doc.approvalStatus || 'approved').toLowerCase() === filterStatus);

  myUploadsList.innerHTML = '';

  if (myUploadsSubtitle) {
    myUploadsSubtitle.textContent = filterStatus === 'all'
      ? 'Review your approved, pending, and rejected library uploads here.'
      : `Showing your ${filterStatus} Open Library uploads.`;
  }

  if (!visibleDocuments.length) {
    const empty = document.createElement('p');
    empty.className = 'detail-description';
    if (filterStatus === 'removed') {
      empty.textContent = 'Removed uploads are no longer available in your library list.';
    } else if (filterStatus === 'all') {
      empty.textContent = 'You have not uploaded any Open Library documents yet.';
    } else {
      empty.textContent = `You have no ${filterStatus} Open Library uploads.`;
    }
    myUploadsList.appendChild(empty);
    if (myUploadsMessage && state.myUploads.removedDocumentUuid && filterStatus === 'removed') {
      myUploadsMessage.textContent = 'One of your uploads was removed by moderation and is no longer available.';
    }
    return;
  }

  visibleDocuments.forEach((doc) => {
    const article = document.createElement('article');
    article.className = 'my-upload-card';
    article.id = `my-upload-doc-${doc.uuid}`;

    const head = document.createElement('div');
    head.className = 'my-upload-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'my-upload-title-wrap';
    const title = document.createElement('h4');
    title.textContent = doc.title || 'Untitled document';
    const meta = document.createElement('p');
    meta.className = 'my-upload-meta';
    meta.textContent = `${doc.course || 'No course'} • ${doc.subject || 'No subject'} • Uploaded ${new Date(doc.uploadedAt || Date.now()).toLocaleString()}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    head.appendChild(titleWrap);

    const badges = document.createElement('div');
    badges.className = 'my-upload-badges';
    const tone = documentApprovalStatusTone(doc);
    badges.appendChild(createDocumentStatusBadge(tone.label, tone.modifier));
    badges.appendChild(createDocumentStatusBadge(doc.visibility || 'public'));
    head.appendChild(badges);
    article.appendChild(head);

    if (doc.description) {
      const description = document.createElement('p');
      description.className = 'my-upload-description';
      description.textContent = doc.description;
      article.appendChild(description);
    }

    const utility = document.createElement('div');
    utility.className = 'my-upload-utility-row';
    utility.appendChild(createDocumentStatusBadge(doc.filename || 'Unknown file'));
    utility.appendChild(createDocumentStatusBadge(`${Number(doc.popularity || 0)} likes`));
    utility.appendChild(createDocumentStatusBadge(`${Number(doc.views || 0)} views`));
    article.appendChild(utility);

    if (String(doc.approvalStatus || 'approved').toLowerCase() === 'pending') {
      const pending = document.createElement('p');
      pending.className = 'my-upload-status-copy';
      pending.textContent = `Submitted ${new Date(doc.approvalRequestedAt || doc.uploadedAt || Date.now()).toLocaleString()} and hidden until approval.`;
      article.appendChild(pending);
    }
    if (String(doc.approvalStatus || 'approved').toLowerCase() === 'rejected') {
      const rejected = document.createElement('p');
      rejected.className = 'my-upload-status-copy is-danger';
      rejected.textContent = doc.rejectionNote
        ? `Rejected: ${doc.rejectionNote}`
        : 'Rejected by the assigned DepAdmin for the selected subcourse.';
      article.appendChild(rejected);
    }

    const actions = document.createElement('div');
    actions.className = 'my-upload-actions';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'ghost-button';
    openButton.textContent = 'Open details';
    openButton.addEventListener('click', async () => {
      try {
        state.myUploads.focusUuid = doc.uuid;
        syncMyUploadsLocation({
          open: true,
          status: state.myUploads.filterStatus,
          uploadUuid: state.myUploads.focusUuid,
          removedDocumentUuid: state.myUploads.removedDocumentUuid,
        });
        closeMyUploadsManager();
        await openDocumentFromNotification(doc.uuid);
      } catch (error) {
        if (myUploadsMessage) myUploadsMessage.textContent = error.message || 'Unable to open document details.';
      }
    });
    actions.appendChild(openButton);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = String(doc.approvalStatus || 'approved').toLowerCase() === 'pending' ? 'ghost-button' : 'primary-button';
    deleteButton.textContent = String(doc.approvalStatus || 'approved').toLowerCase() === 'pending' ? 'Cancel pending' : 'Delete upload';
    deleteButton.addEventListener('click', async () => {
      try {
        await removeMyUpload(doc);
      } catch (error) {
        if (myUploadsMessage) myUploadsMessage.textContent = error.message || 'Unable to remove upload.';
      }
    });
    actions.appendChild(deleteButton);

    article.appendChild(actions);
    myUploadsList.appendChild(article);
  });

  if (state.myUploads.focusUuid) {
    highlightMyUpload(state.myUploads.focusUuid);
  }
}

async function loadMyUploads() {
  if (!myUploadsList) return;
  if (myUploadsMessage) {
    myUploadsMessage.textContent = '';
  }
  myUploadsList.innerHTML = '<p class="detail-description">Loading your uploads...</p>';
  const response = await fetch('/api/library/my-documents');
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to load your uploads.');
  }
  state.myUploads.documents = Array.isArray(data.documents) ? data.documents : [];
  renderMyUploads();
}

async function openMyUploadsManager(options = {}) {
  if (detailModal && !detailModal.classList.contains('is-hidden')) {
    closeDetailModal();
  } else {
    syncDocumentLocation(null);
  }
  state.myUploads.filterStatus = normalizeMyUploadsFilter(
    Object.prototype.hasOwnProperty.call(options, 'filterStatus') ? options.filterStatus : state.myUploads.filterStatus
  );
  state.myUploads.focusUuid = Object.prototype.hasOwnProperty.call(options, 'focusUuid')
    ? String(options.focusUuid || '').trim()
    : state.myUploads.focusUuid;
  state.myUploads.removedDocumentUuid = Object.prototype.hasOwnProperty.call(options, 'removedDocumentUuid')
    ? String(options.removedDocumentUuid || '').trim()
    : state.myUploads.removedDocumentUuid;
  if (myUploadsStatusFilter) {
    myUploadsStatusFilter.value = state.myUploads.filterStatus;
  }
  syncMyUploadsLocation({
    open: true,
    status: state.myUploads.filterStatus,
    uploadUuid: state.myUploads.focusUuid,
    removedDocumentUuid: state.myUploads.removedDocumentUuid,
  });
  openModal(myUploadsModal);
  await loadMyUploads();
}

function closeMyUploadsManager() {
  closeModal(myUploadsModal);
  state.myUploads.filterStatus = 'all';
  state.myUploads.focusUuid = '';
  state.myUploads.removedDocumentUuid = '';
  syncMyUploadsLocation({ open: false });
}

async function removeMyUpload(doc) {
  if (!doc || !doc.uuid) return;
  const approvalStatus = String(doc.approvalStatus || 'approved').toLowerCase();
  const confirmText = approvalStatus === 'pending'
    ? 'Cancel this pending upload?'
    : 'Delete this upload?';
  if (!window.confirm(confirmText)) return;
  const response = await fetch(`/api/library/documents/${encodeURIComponent(doc.uuid)}`, {
    method: 'DELETE',
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to remove upload.');
  }
  if (currentDoc && currentDoc.uuid === doc.uuid) {
    closeDetailModal();
  }
  if (state.myUploads.focusUuid === doc.uuid) {
    state.myUploads.focusUuid = '';
  }
  syncMyUploadsLocation({
    open: true,
    status: state.myUploads.filterStatus,
    uploadUuid: state.myUploads.focusUuid,
    removedDocumentUuid: state.myUploads.removedDocumentUuid,
  });
  if (myUploadsMessage) {
    myUploadsMessage.textContent = approvalStatus === 'pending' ? 'Pending upload canceled.' : 'Upload deleted.';
  }
  await Promise.all([loadMyUploads(), fetchDocuments()]);
}

async function openDocumentFromNotification(uuid) {
  const safeUuid = String(uuid || '').trim();
  if (!safeUuid) return;
  const response = await fetch(`/api/library/documents/${encodeURIComponent(safeUuid)}`);
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok || !data.document) {
    throw new Error(data.message || 'Unable to load the document from this notification.');
  }
  await openDetail(data.document);
}

async function applyInitialDocumentSelection() {
  if (initialDocumentSelectionApplied) return;
  initialDocumentSelectionApplied = true;
  if (state.myUploads.openRequested || (myUploadsModal && !myUploadsModal.classList.contains('is-hidden'))) return;
  if (!initialDocumentSelection.documentUuid) return;
  try {
    await openDocumentFromNotification(initialDocumentSelection.documentUuid);
  } catch (_error) {
    syncDocumentLocation(null);
  }
}

async function applyInitialMyUploadsSelection() {
  if (initialMyUploadsSelectionApplied) return;
  initialMyUploadsSelectionApplied = true;
  if (!state.myUploads.openRequested) return;
  try {
    await openMyUploadsManager({
      filterStatus: state.myUploads.filterStatus,
      focusUuid: state.myUploads.focusUuid,
      removedDocumentUuid: state.myUploads.removedDocumentUuid,
    });
  } finally {
    state.myUploads.openRequested = false;
  }
}

async function loadComments(documentUuid) {
  commentList.innerHTML = '';
  try {
    const response = await fetch(`/api/library/comments?documentUuid=${documentUuid}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load comments.');
    }
    if (!data.comments.length) {
      commentList.innerHTML = '<p>No comments yet.</p>';
      return;
    }
    data.comments.forEach((comment) => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      const time = new Date(comment.createdAt).toLocaleString();
      const name = comment.displayName || 'Member';
      item.innerHTML = `<p>${comment.content}</p><span>${name} • ${time}</span>`;
      commentList.appendChild(item);
    });
  } catch (error) {
    commentList.innerHTML = `<p>${error.message}</p>`;
  }
}

async function toggleLike() {
  if (!currentDoc) {
    return;
  }
  const action = currentDoc.liked ? 'unlike' : 'like';
  const response = await fetch('/api/library/like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentUuid: currentDoc.uuid, action }),
  });
  const data = await response.json();
  if (response.ok && data.ok) {
    currentDoc.liked = !currentDoc.liked;
    currentDoc.popularity = data.popularity;
    detailPopularity.textContent = currentDoc.popularity;
    detailLike.textContent = currentDoc.liked ? 'Unlike' : 'Like';
    fetchDocuments();
  }
}

async function openDocument() {
  if (!currentDoc) {
    return;
  }
  if (!currentDoc.link) {
    updateDocumentAvailabilityUI(currentDoc);
    return;
  }
  if (detailOpenMessage) {
    detailOpenMessage.textContent = '';
  }
  try {
    const response = await fetch(`/api/library/documents/${currentDoc.uuid}/view`, { method: 'POST' });
    const data = await response.json();
    if (response.ok && data.ok) {
      currentDoc.views = data.views;
      detailViews.textContent = currentDoc.views;
    }
  } catch (error) {
    // ignore view update errors
  }
  window.open(currentDoc.link, '_blank', 'noopener,noreferrer');
}

async function submitEdit(event) {
  event.preventDefault();
  if (!currentDoc) {
    return;
  }
  const formData = new FormData(editForm);
  const payload = {
    title: formData.get('title'),
    description: formData.get('description'),
    course: formData.get('course'),
    subject: formData.get('subject'),
  };
  editMessage.textContent = '';
  try {
    const response = await fetch(`/api/library/documents/${currentDoc.uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Update failed.');
    }
    currentDoc.title = data.document.title;
    currentDoc.description = data.document.description;
    currentDoc.course = data.document.course;
    currentDoc.subject = data.document.subject;
    currentDoc.upload_approval_status = data.document.upload_approval_status || currentDoc.upload_approval_status || 'approved';
    if (data.message) {
      editMessage.textContent = data.message;
    }
    openDetail(currentDoc);
    editSection.classList.add('is-hidden');
    fetchDocuments();
  } catch (error) {
    editMessage.textContent = error.message;
  }
}

async function submitComment(event) {
  event.preventDefault();
  if (!currentDoc || !commentInput.value.trim()) {
    return;
  }
  const content = commentInput.value.trim();
  const response = await fetch('/api/library/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentUuid: currentDoc.uuid, content }),
  });
  const data = await response.json();
  if (response.ok && data.ok) {
    commentInput.value = '';
    await loadComments(currentDoc.uuid);
  }
}

async function loadCourses() {
  try {
    const response = await fetch('/api/library/courses');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load courses.');
    }
    if (courseFilter) {
      courseFilter.innerHTML = '<option value="all">All courses</option>';
      data.courses.forEach((course) => {
        const option = document.createElement('option');
        option.value = course.course_name;
        option.textContent = course.course_name;
        courseFilter.appendChild(option);
      });
    }
  } catch (error) {
    // Silent failure; user can still type the course manually.
  }
}

function renderUploaderResults(uploaders) {
  if (!uploaderFilterResults) return;
  clearElement(uploaderFilterResults);
  if (!Array.isArray(uploaders) || !uploaders.length) {
    const empty = document.createElement('p');
    empty.className = 'doc-ai-empty';
    empty.textContent = 'No matching uploaders found.';
    uploaderFilterResults.appendChild(empty);
    return;
  }

  uploaders.forEach((uploader) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'uploader-row';
    row.dataset.uid = uploader.uid || '';

    const avatar = document.createElement('div');
    avatar.className = 'uploader-avatar';
    if (uploader.photoLink) {
      const image = document.createElement('img');
      image.src = uploader.photoLink;
      image.alt = `${uploader.displayName || 'Member'} profile photo`;
      avatar.appendChild(image);
    } else {
      avatar.textContent = initialsFromName(uploader.displayName || 'Member');
    }

    const meta = document.createElement('div');
    meta.className = 'uploader-main';
    const name = document.createElement('strong');
    name.textContent = uploader.displayName || 'Member';
    const count = document.createElement('span');
    count.textContent = `${uploader.uploadCount || 0} upload${uploader.uploadCount === 1 ? '' : 's'}`;
    meta.appendChild(name);
    meta.appendChild(count);

    row.appendChild(avatar);
    row.appendChild(meta);
    row.addEventListener('click', () => {
      state.uploaderUid = uploader.uid || '';
      state.uploaderName = uploader.displayName || 'Member';
      state.page = 1;
      updateActiveUploaderFilterUI();
      closeModal(uploaderFilterModal);
      fetchDocuments();
    });
    uploaderFilterResults.appendChild(row);
  });
}

async function searchUploaders() {
  if (!uploaderFilterResults) return;
  const query = uploaderFilterSearchInput ? uploaderFilterSearchInput.value.trim() : '';
  if (uploaderFilterMessage) {
    uploaderFilterMessage.textContent = '';
  }
  try {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    const response = await fetch(`/api/library/uploaders?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load uploaders.');
    }
    renderUploaderResults(data.uploaders || []);
  } catch (error) {
    renderUploaderResults([]);
    if (uploaderFilterMessage) {
      uploaderFilterMessage.textContent = error.message;
    }
  }
}

function openModal(modal) {
  modal.classList.remove('is-hidden');
}

function closeModal(modal) {
  modal.classList.add('is-hidden');
}

function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function appendDocAiBubble(role, text, { pending = false } = {}) {
  if (!docAiMessages) return null;
  const empty = docAiMessages.querySelector('.doc-ai-empty');
  if (empty) empty.remove();
  const bubble = document.createElement('div');
  bubble.className = `doc-ai-bubble ${role}${pending ? ' pending' : ''}`;
  bubble.textContent = text || '';
  docAiMessages.appendChild(bubble);
  docAiMessages.scrollTop = docAiMessages.scrollHeight;
  return bubble;
}

function renderDocAiMessages(messages) {
  if (!docAiMessages) return;
  clearElement(docAiMessages);
  if (!Array.isArray(messages) || !messages.length) {
    const empty = document.createElement('p');
    empty.className = 'doc-ai-empty';
    empty.textContent = 'Start by asking a question about this document.';
    docAiMessages.appendChild(empty);
    return;
  }
  messages.forEach((message) => {
    appendDocAiBubble(message.role === 'user' ? 'user' : 'assistant', message.content || '');
  });
}

function resetDocAiState() {
  activeDocAiUuid = null;
  isSendingDocAi = false;
  if (docAiInput) {
    docAiInput.value = '';
    docAiInput.disabled = false;
  }
  if (docAiMessage) {
    docAiMessage.textContent = '';
  }
  renderDocAiMessages([]);
}

function closeDocAiModal() {
  if (!docAiModal) return;
  closeModal(docAiModal);
  resetDocAiState();
}

async function openDocAiModal(doc) {
  if (!doc || !doc.uuid || !docAiModal) return;
  if (doc.aiallowed === false) {
    alert('AI is disabled for this document by the uploader.');
    return;
  }
  activeDocAiUuid = doc.uuid;
  if (docAiMessage) docAiMessage.textContent = '';
  if (docAiTitle) {
    docAiTitle.textContent = `Ask AI: ${doc.title || 'Untitled document'}`;
  }
  if (docAiSubtitle) {
    docAiSubtitle.textContent = 'Loading document context...';
  }
  renderDocAiMessages([]);
  openModal(docAiModal);

  try {
    const response = await fetch(`/api/library/documents/${encodeURIComponent(doc.uuid)}/ask-ai/bootstrap`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load document AI conversation.');
    }
    if (docAiSubtitle) {
      const summary = data.context && data.context.summary ? data.context.summary : 'Document context ready.';
      docAiSubtitle.textContent = `Context: ${summary}`;
    }
    renderDocAiMessages(data.messages || []);
  } catch (error) {
    if (docAiSubtitle) {
      docAiSubtitle.textContent = 'Document context could not be loaded.';
    }
    if (docAiMessage) {
      docAiMessage.textContent = error.message || 'Unable to load document AI conversation.';
    }
  }
}

async function sendDocAiMessage(event) {
  event.preventDefault();
  if (isSendingDocAi || !activeDocAiUuid || !docAiInput) return;
  const content = docAiInput.value.trim();
  if (!content) return;
  isSendingDocAi = true;
  if (docAiMessage) docAiMessage.textContent = '';
  docAiInput.value = '';
  docAiInput.disabled = true;
  const userBubble = appendDocAiBubble('user', content);
  const pendingBubble = appendDocAiBubble('assistant', 'Thinking...', { pending: true });

  try {
    const response = await fetch(`/api/library/documents/${encodeURIComponent(activeDocAiUuid)}/ask-ai/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to send message.');
    }
    if (pendingBubble) {
      pendingBubble.classList.remove('pending');
      pendingBubble.textContent = data.message && data.message.content
        ? data.message.content
        : 'No response generated.';
    }
  } catch (error) {
    if (pendingBubble) pendingBubble.remove();
    if (!userBubble || !userBubble.parentElement) {
      appendDocAiBubble('user', content);
    }
    if (docAiMessage) {
      docAiMessage.textContent = error.message || 'Unable to send message.';
    }
  } finally {
    isSendingDocAi = false;
    docAiInput.disabled = false;
    docAiInput.focus();
    if (docAiMessages) {
      docAiMessages.scrollTop = docAiMessages.scrollHeight;
    }
  }
}

if (uploadToggle) {
  uploadToggle.addEventListener('click', async () => {
    await loadUploadAccess(true);
    if (uploadForm) {
      uploadForm.reset();
    }
    if (uploadMessage) {
      uploadMessage.textContent = '';
    }
    if (uploadCourse && uploadAccessState.mainCourse) {
      uploadCourse.value = uploadAccessState.mainCourse;
    }
    renderUploadCoursePolicyHint();
    openModal(uploadModal);
  });
}

if (openMyUploadsModalButton) {
  openMyUploadsModalButton.addEventListener('click', async () => {
    try {
      await openMyUploadsManager({ filterStatus: 'all', focusUuid: '', removedDocumentUuid: '' });
    } catch (error) {
      if (myUploadsMessage) {
        myUploadsMessage.textContent = error.message || 'Unable to load your uploads.';
      }
    }
  });
}

if (uploadClose) {
  uploadClose.addEventListener('click', () => closeModal(uploadModal));
}

if (myUploadsClose) {
  myUploadsClose.addEventListener('click', () => closeMyUploadsManager());
}

if (myUploadsModal) {
  myUploadsModal.addEventListener('click', (event) => {
    if (event.target === myUploadsModal) {
      closeMyUploadsManager();
    }
  });
}

if (myUploadsStatusFilter) {
  myUploadsStatusFilter.addEventListener('change', () => {
    state.myUploads.filterStatus = normalizeMyUploadsFilter(myUploadsStatusFilter.value);
    if (state.myUploads.filterStatus !== 'removed') {
      state.myUploads.removedDocumentUuid = '';
    }
    syncMyUploadsLocation({
      open: true,
      status: state.myUploads.filterStatus,
      uploadUuid: state.myUploads.focusUuid,
      removedDocumentUuid: state.myUploads.removedDocumentUuid,
    });
    renderMyUploads();
  });
}

if (uploadCourse) {
  uploadCourse.addEventListener('input', () => renderUploadCoursePolicyHint());
  uploadCourse.addEventListener('change', () => renderUploadCoursePolicyHint());
}

if (detailClose) {
  detailClose.addEventListener('click', () => closeDetailModal());
}

if (detailLike) {
  detailLike.addEventListener('click', toggleLike);
}

if (detailOpen) {
  detailOpen.addEventListener('click', openDocument);
}

if (detailAskAi) {
  detailAskAi.addEventListener('click', async () => {
    if (!currentDoc) return;
    await openDocAiModal(currentDoc);
  });
}

if (detailMenuToggle) {
  detailMenuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu(detailMenu.classList.contains('is-hidden'));
  });
}

if (detailShare) {
  detailShare.addEventListener('click', async () => {
    if (!currentDoc) {
      return;
    }
    const link = currentDoc.link;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
      alert('Link copied to clipboard.');
    } catch (error) {
      prompt('Copy this link:', link);
    }
    toggleMenu(false);
  });
}

if (detailReport) {
  detailReport.addEventListener('click', async () => {
    if (!currentDoc) return;
    try {
      const reportPayload =
        typeof window.showReportDialog === 'function'
          ? await window.showReportDialog({
              title: 'Report document',
              subtitle: 'Select a reason and include optional details.',
            })
          : (() => {
              const reason = window.prompt('Report reason:', '');
              if (reason === null) return null;
              const text = reason.trim();
              return {
                category: 'other',
                customReason: text || 'Other',
                details: null,
                reason: text || 'Other',
              };
            })();
      if (!reportPayload) return;

      const response = await fetch(`/api/library/documents/${currentDoc.uuid}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        alert(data.message || 'Unable to submit report.');
        return;
      }

      alert('Report submitted. Thank you.');
    } catch (error) {
      alert(error.message || 'Unable to submit report.');
    } finally {
      toggleMenu(false);
    }
  });
}

if (detailEdit) {
  detailEdit.addEventListener('click', () => {
    if (!currentDoc || !editSection) {
      return;
    }
    editSection.classList.remove('is-hidden');
    editForm.elements.title.value = currentDoc.title;
    editForm.elements.description.value = currentDoc.description || '';
    editForm.elements.course.value = currentDoc.course;
    editForm.elements.subject.value = currentDoc.subject;
    toggleMenu(false);
  });
}

if (detailDelete) {
  detailDelete.addEventListener('click', async () => {
    if (!currentDoc) {
      return;
    }
    if (!confirm('Delete this document?')) {
      return;
    }
    const response = await fetch(`/api/library/documents/${currentDoc.uuid}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (response.ok && data.ok) {
      closeDetailModal();
      fetchDocuments();
    }
  });
}

if (editForm) {
  editForm.addEventListener('submit', submitEdit);
}

if (editCancel) {
  editCancel.addEventListener('click', () => {
    if (editSection) {
      editSection.classList.add('is-hidden');
    }
  });
}

if (commentForm) {
  commentForm.addEventListener('submit', submitComment);
}

if (docAiClose) {
  docAiClose.addEventListener('click', closeDocAiModal);
}

if (docAiForm) {
  docAiForm.addEventListener('submit', sendDocAiMessage);
}

if (uploadForm) {
  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isDocumentUploading) {
      return;
    }
    isDocumentUploading = true;
    uploadMessage.textContent = '';

    const formData = new FormData(uploadForm);
    const rawVisibility = String(formData.get('visibility') || '').trim().toLowerCase();
    const visibility =
      rawVisibility === 'private' || rawVisibility === 'course_exclusive'
        ? rawVisibility
        : 'public';
    formData.set('visibility', visibility);
    const selectedCourse = String(formData.get('course') || '').trim();
    if (uploadAccessState.loaded && selectedCourse && !findUploadCoursePolicy(selectedCourse)) {
      uploadMessage.textContent = buildUploadCoursePolicyHint(selectedCourse);
      isDocumentUploading = false;
      return;
    }
    const submitButton = uploadForm.querySelector('button[type="submit"]');
    const originalSubmitLabel = submitButton ? submitButton.textContent : 'Upload';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Uploading...';
    }

    try {
      const response = await fetch('/api/library/documents', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Upload failed.');
      }
      uploadForm.reset();
      closeModal(uploadModal);
      if (data.message && String(data.document && data.document.upload_approval_status || '').toLowerCase() === 'pending') {
        alert(data.message);
      }
      fetchDocuments();
    } catch (error) {
      uploadMessage.textContent = error.message;
    } finally {
      isDocumentUploading = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalSubmitLabel;
      }
    }
  });
}

if (searchForm) {
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = searchInput.value.trim();
    state.page = 1;
    fetchDocuments();
  });
}

if (courseFilter) {
  courseFilter.addEventListener('change', () => {
    state.course = courseFilter.value;
    state.page = 1;
    fetchDocuments();
  });
}

if (sortFilter) {
  sortFilter.addEventListener('change', () => {
    state.sort = sortFilter.value;
    state.page = 1;
    fetchDocuments();
  });
}

if (uploaderFilterButton && uploaderFilterModal) {
  uploaderFilterButton.addEventListener('click', async () => {
    openModal(uploaderFilterModal);
    await searchUploaders();
    if (uploaderFilterSearchInput) {
      uploaderFilterSearchInput.focus();
    }
  });
}

if (uploaderFilterClose && uploaderFilterModal) {
  uploaderFilterClose.addEventListener('click', () => closeModal(uploaderFilterModal));
}

if (uploaderFilterSearchForm) {
  uploaderFilterSearchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await searchUploaders();
  });
}

if (clearUploaderFilterButton) {
  clearUploaderFilterButton.addEventListener('click', () => {
    state.uploaderUid = '';
    state.uploaderName = '';
    state.page = 1;
    updateActiveUploaderFilterUI();
    fetchDocuments();
  });
}

if (profileToggle && profileMenu) {
  profileToggle.addEventListener('click', () => {
    profileMenu.classList.toggle('is-hidden');
  });

  document.addEventListener('click', (event) => {
    if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
      profileMenu.classList.add('is-hidden');
    }
  });
}

document.addEventListener('click', (event) => {
  if (
    detailMenu &&
    detailMenuToggle &&
    !detailMenu.contains(event.target) &&
    !detailMenuToggle.contains(event.target)
  ) {
    detailMenu.classList.add('is-hidden');
  }
});

if (docAiModal) {
  docAiModal.addEventListener('click', (event) => {
    if (event.target === docAiModal) {
      closeDocAiModal();
    }
  });
}

if (uploaderFilterModal) {
  uploaderFilterModal.addEventListener('click', (event) => {
    if (event.target === uploaderFilterModal) {
      closeModal(uploaderFilterModal);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
      // best effort logout
    }
    window.location.href = '/login';
  });
}

setInterval(() => {
  if (Date.now() - lastActive < 30000) {
    fetchDocuments();
  }
}, 10000);

async function initLibraryPage() {
  loadCourses();
  loadUploadAccess();
  updateActiveUploaderFilterUI();
  await Promise.all([fetchDocuments(), loadNavAvatar()]);
  await applyInitialMyUploadsSelection();
  await applyInitialDocumentSelection();
}

initLibraryPage();
