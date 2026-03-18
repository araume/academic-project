const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const departmentCourseFilter = document.getElementById('departmentCourseFilter');
const departmentAssignments = document.getElementById('departmentAssignments');
const departmentMessage = document.getElementById('departmentMessage');

const documentsList = document.getElementById('documentsList');
const homePostsList = document.getElementById('homePostsList');
const unitPostsList = document.getElementById('unitPostsList');

const documentsCount = document.getElementById('documentsCount');
const homePostsCount = document.getElementById('homePostsCount');
const unitPostsCount = document.getElementById('unitPostsCount');

const state = {
  assignments: [],
  selectedCourse: '',
  loading: false,
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initialsFromName(name) {
  const safe = String(name || '').trim();
  return safe ? safe[0].toUpperCase() : 'D';
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

function closeProfileMenuOnOutsideClick(event) {
  if (!profileMenu || !profileToggle) return;
  if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
    profileMenu.classList.add('is-hidden');
  }
}

function formatDate(value) {
  if (!value) return 'Unknown date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';
  return parsed.toLocaleString();
}

function truncateText(value, max = 280) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function setMessage(text) {
  if (!departmentMessage) return;
  departmentMessage.textContent = text || '';
}

function renderEmptyState(container, text) {
  if (!container) return;
  container.innerHTML = `<p class="empty-state">${escapeHtml(text)}</p>`;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function updateCounts(documents, homePosts, unitPosts) {
  if (documentsCount) documentsCount.textContent = String(documents.length);
  if (homePostsCount) homePostsCount.textContent = String(homePosts.length);
  if (unitPostsCount) unitPostsCount.textContent = String(unitPosts.length);
}

function populateCourseFilter(assignments) {
  if (!departmentCourseFilter) return;
  const previous = state.selectedCourse;
  departmentCourseFilter.innerHTML = '<option value="">All assigned departments</option>';
  assignments.forEach((assignment) => {
    const option = document.createElement('option');
    option.value = assignment.courseName || '';
    option.textContent = assignment.courseName || 'Assigned department';
    departmentCourseFilter.appendChild(option);
  });
  departmentCourseFilter.value = previous || '';
}

function renderAssignments(assignments) {
  if (!departmentAssignments) return;
  departmentAssignments.innerHTML = '';
  if (!assignments.length) {
    departmentAssignments.innerHTML = '<span class="assignment-pill">No assigned departments</span>';
    return;
  }
  assignments.forEach((assignment) => {
    const pill = document.createElement('span');
    pill.className = 'assignment-pill';
    pill.textContent = assignment.courseName || 'Assigned department';
    departmentAssignments.appendChild(pill);
  });
}

function buildDocumentCard(item) {
  const article = document.createElement('article');
  article.className = 'moderation-card';
  article.innerHTML = `
    <div class="moderation-meta">
      <span class="meta-pill is-pending">Pending approval</span>
      <span class="meta-pill">${escapeHtml(item.source === 'vault' ? 'File Vault' : 'Open Library')}</span>
      <span class="meta-pill">${escapeHtml(item.visibility || 'public')}</span>
    </div>
    <div>
      <h3>${escapeHtml(item.title || 'Untitled document')}</h3>
      <p class="moderation-copy">${escapeHtml(item.course || 'No course')} • ${escapeHtml(item.subject || 'No subject')}</p>
      <p class="moderation-copy">Uploader: ${escapeHtml(item.uploaderName || 'Member')}</p>
      <p class="moderation-copy">Submitted: ${escapeHtml(formatDate(item.approvalRequestedAt || item.uploadedAt))}</p>
      <p class="moderation-copy">${escapeHtml(item.filename || '')}</p>
    </div>
    <div class="moderation-actions">
      <label>
        <span>Rejection note</span>
        <textarea rows="3" placeholder="Optional note for the uploader..."></textarea>
      </label>
      <div class="moderation-actions-row">
        <button type="button" class="primary-action" data-action="approve">Approve</button>
        <button type="button" class="danger-action" data-action="reject">Reject</button>
      </div>
    </div>
  `;

  const noteInput = article.querySelector('textarea');
  const approveButton = article.querySelector('[data-action="approve"]');
  const rejectButton = article.querySelector('[data-action="reject"]');

  async function runDocumentAction(action) {
    const note = noteInput ? noteInput.value.trim() : '';
    approveButton.disabled = true;
    rejectButton.disabled = true;
    setMessage('');
    try {
      await apiRequest(`/api/department/documents/${encodeURIComponent(item.uuid)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      await loadDashboard();
    } catch (error) {
      setMessage(error.message || 'Unable to update document approval.');
    } finally {
      approveButton.disabled = false;
      rejectButton.disabled = false;
    }
  }

  approveButton.addEventListener('click', () => runDocumentAction('approve'));
  rejectButton.addEventListener('click', () => runDocumentAction('reject'));
  return article;
}

function buildModerationCard(item, type) {
  const article = document.createElement('article');
  article.className = 'moderation-card';
  const createdAt = formatDate(item.createdAt);
  const course = escapeHtml(item.course || 'No course');
  const subject = type === 'unit' ? escapeHtml(item.subjectName || 'No unit') : escapeHtml(item.visibility || 'public');
  const uploaderLabel = type === 'unit' ? 'Author' : 'Uploader';
  const uploaderName = escapeHtml(item.uploaderName || item.authorUid || 'Member');
  article.innerHTML = `
    <div class="moderation-meta">
      <span class="meta-pill">${course}</span>
      <span class="meta-pill">${subject}</span>
    </div>
    <div>
      <h3>${escapeHtml(item.title || 'Untitled post')}</h3>
      <p class="moderation-copy">${truncateText(item.content || '', 340)}</p>
      <p class="moderation-copy">${uploaderLabel}: ${uploaderName}</p>
      <p class="moderation-copy">Created: ${escapeHtml(createdAt)}</p>
    </div>
    <div class="moderation-actions">
      <label>
        <span>Takedown reason</span>
        <textarea rows="3" placeholder="Optional moderation note..."></textarea>
      </label>
      <div class="moderation-actions-row">
        <button type="button" class="danger-action" data-action="takedown">Take down</button>
      </div>
    </div>
  `;

  const reasonInput = article.querySelector('textarea');
  const takedownButton = article.querySelector('[data-action="takedown"]');
  takedownButton.addEventListener('click', async () => {
    takedownButton.disabled = true;
    setMessage('');
    try {
      await apiRequest(
        type === 'unit'
          ? `/api/department/unit-posts/${encodeURIComponent(item.id)}/takedown`
          : `/api/department/home-posts/${encodeURIComponent(item.id)}/takedown`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reasonInput ? reasonInput.value.trim() : '' }),
        }
      );
      await loadDashboard();
    } catch (error) {
      setMessage(error.message || 'Unable to take down content.');
    } finally {
      takedownButton.disabled = false;
    }
  });

  return article;
}

function renderDocumentList(documents) {
  if (!documentsList) return;
  if (!documents.length) {
    renderEmptyState(documentsList, 'No pending document approvals for this department.');
    return;
  }
  documentsList.innerHTML = '';
  documents.forEach((item) => {
    documentsList.appendChild(buildDocumentCard(item));
  });
}

function renderHomePosts(homePosts) {
  if (!homePostsList) return;
  if (!homePosts.length) {
    renderEmptyState(homePostsList, 'No active course-exclusive home posts found.');
    return;
  }
  homePostsList.innerHTML = '';
  homePosts.forEach((item) => {
    homePostsList.appendChild(buildModerationCard(item, 'home'));
  });
}

function renderUnitPosts(unitPosts) {
  if (!unitPostsList) return;
  if (!unitPosts.length) {
    renderEmptyState(unitPostsList, 'No active unit posts found for this department.');
    return;
  }
  unitPostsList.innerHTML = '';
  unitPosts.forEach((item) => {
    unitPostsList.appendChild(buildModerationCard(item, 'unit'));
  });
}

function renderLoadingState() {
  renderEmptyState(documentsList, 'Loading pending document approvals...');
  renderEmptyState(homePostsList, 'Loading course-exclusive home posts...');
  renderEmptyState(unitPostsList, 'Loading unit posts...');
}

async function loadDashboard() {
  if (state.loading) return;
  state.loading = true;
  renderLoadingState();

  try {
    const params = new URLSearchParams();
    if (state.selectedCourse) {
      params.set('course', state.selectedCourse);
    }
    const url = `/api/department/dashboard${params.toString() ? `?${params.toString()}` : ''}`;
    const data = await apiRequest(url);
    state.assignments = Array.isArray(data.assignments) ? data.assignments : [];
    if (data.selectedCourse !== undefined) {
      state.selectedCourse = data.selectedCourse || '';
    }
    populateCourseFilter(state.assignments);
    renderAssignments(state.assignments);

    const documents = Array.isArray(data.documents) ? data.documents : [];
    const homePosts = Array.isArray(data.homePosts) ? data.homePosts : [];
    const unitPosts = Array.isArray(data.unitPosts) ? data.unitPosts : [];

    updateCounts(documents, homePosts, unitPosts);
    renderDocumentList(documents);
    renderHomePosts(homePosts);
    renderUnitPosts(unitPosts);
    setMessage('');
  } catch (error) {
    updateCounts([], [], []);
    renderEmptyState(documentsList, 'Unable to load pending document approvals.');
    renderEmptyState(homePostsList, 'Unable to load course-exclusive home posts.');
    renderEmptyState(unitPostsList, 'Unable to load unit posts.');
    setMessage(error.message || 'Unable to load department management data.');
  } finally {
    state.loading = false;
  }
}

async function loadNavAvatar() {
  try {
    const data = await apiRequest('/api/profile');
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (_error) {
    // keep fallback avatar
  }
}

if (profileToggle && profileMenu) {
  profileToggle.addEventListener('click', () => {
    profileMenu.classList.toggle('is-hidden');
  });
  document.addEventListener('click', closeProfileMenuOnOutsideClick);
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (_error) {
      // best effort logout
    }
    window.location.href = '/login';
  });
}

if (departmentCourseFilter) {
  departmentCourseFilter.addEventListener('change', async () => {
    state.selectedCourse = departmentCourseFilter.value || '';
    await loadDashboard();
  });
}

loadNavAvatar();
loadDashboard();
