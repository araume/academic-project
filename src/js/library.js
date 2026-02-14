const documentGrid = document.getElementById('documentGrid');
const pagination = document.getElementById('pagination');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const courseFilter = document.getElementById('courseFilter');
const sortFilter = document.getElementById('sortFilter');
const uploadCourse = document.getElementById('uploadCourse');
const uploadToggle = document.getElementById('uploadToggle');
const uploadModal = document.getElementById('uploadModal');
const uploadClose = document.getElementById('uploadClose');
const uploadForm = document.getElementById('uploadForm');
const uploadMessage = document.getElementById('uploadMessage');

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
const detailLike = document.getElementById('detailLike');
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

const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

let currentDoc = null;
let lastActive = Date.now();
let isFetching = false;

const state = {
  page: 1,
  pageSize: 12,
  q: '',
  course: 'all',
  sort: 'recent',
  total: 0,
};

function initialsFromName(name) {
  const words = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return 'ME';
  return words.map((word) => word[0].toUpperCase()).join('');
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
    meta.innerHTML = `
      <h4>${doc.title}</h4>
      <p>${doc.uploader_name || 'Unknown uploader'}</p>
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
  detailTitle.textContent = doc.title;
  detailMeta.textContent = `${doc.course} • ${doc.subject}`;
  detailDescription.textContent = doc.description || 'No description provided.';
  detailFilename.textContent = doc.filename;
  detailUploader.textContent = doc.uploader_name || 'Unknown';
  detailDate.textContent = new Date(doc.uploaddate).toLocaleString();
  detailCourse.textContent = doc.course;
  detailSubject.textContent = doc.subject;
  detailViews.textContent = doc.views;
  detailPopularity.textContent = doc.popularity;
  detailLike.textContent = doc.liked ? 'Unlike' : 'Like';
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
  window.open(currentDoc.link, '_blank');
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
    data.courses.forEach((course) => {
      const option = document.createElement('option');
      option.value = course.course_name;
      option.textContent = course.course_name;
      courseFilter.appendChild(option);
      if (uploadCourse) {
        const uploadOption = document.createElement('option');
        uploadOption.value = course.course_name;
        uploadOption.textContent = course.course_name;
        uploadCourse.appendChild(uploadOption);
      }
    });
  } catch (error) {
    // Silent failure; user can still type the course manually.
  }
}

function openModal(modal) {
  modal.classList.remove('is-hidden');
}

function closeModal(modal) {
  modal.classList.add('is-hidden');
}

if (uploadToggle) {
  uploadToggle.addEventListener('click', () => openModal(uploadModal));
}

if (uploadClose) {
  uploadClose.addEventListener('click', () => closeModal(uploadModal));
}

if (detailClose) {
  detailClose.addEventListener('click', () => closeModal(detailModal));
}

if (detailLike) {
  detailLike.addEventListener('click', toggleLike);
}

if (detailOpen) {
  detailOpen.addEventListener('click', openDocument);
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
  detailReport.addEventListener('click', () => {
    alert('Report submitted. Thank you.');
    toggleMenu(false);
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
      closeModal(detailModal);
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

if (uploadForm) {
  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    uploadMessage.textContent = '';

    const formData = new FormData(uploadForm);
    const isPrivate = formData.get('visibility') === 'private';
    formData.set('visibility', isPrivate ? 'private' : 'public');

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
      fetchDocuments();
    } catch (error) {
      uploadMessage.textContent = error.message;
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

loadCourses();
fetchDocuments();
loadNavAvatar();
