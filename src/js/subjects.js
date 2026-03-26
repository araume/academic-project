const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const subjectTabs = document.getElementById('subjectTabs');
const unitsTabButton = document.getElementById('unitsTabButton');
const threadsTabButton = document.getElementById('threadsTabButton');
const subjectsList = document.getElementById('subjectsList');
const subjectSearchInput = document.getElementById('subjectSearchInput');
const toggleThreadsFilterPanelButton = document.getElementById('toggleThreadsFilterPanel');
const threadsFilterPanel = document.getElementById('threadsFilterPanel');
const threadCreatorFilterLabel = document.getElementById('threadCreatorFilterLabel');
const threadCreatorFilter = document.getElementById('threadCreatorFilter');
const threadSortFilter = document.getElementById('threadSortFilter');
const clearThreadsFiltersButton = document.getElementById('clearThreadsFilters');
const subjectCourseLabel = document.getElementById('subjectCourseLabel');
const subjectTitle = document.getElementById('subjectTitle');
const subjectDescription = document.getElementById('subjectDescription');
const subjectApprovalHint = document.getElementById('subjectApprovalHint');
const subjectPosts = document.getElementById('subjectPosts');
const openSubjectAiModalButton = document.getElementById('openSubjectAiModal');
const openSubjectModerationModalButton = document.getElementById('openSubjectModerationModal');

const openCreateUnitModalButton = document.getElementById('openCreateUnitModal');
const openCreateThreadModalButton = document.getElementById('openCreateThreadModal');
const createSubjectModal = document.getElementById('createSubjectModal');
const closeCreateSubjectModal = document.getElementById('closeCreateSubjectModal');
const createSubjectForm = document.getElementById('createSubjectForm');
const createSubjectMessage = document.getElementById('createSubjectMessage');
const createSubjectTitle = document.getElementById('createSubjectTitle');
const createSubjectKindInput = document.getElementById('createSubjectKind');
const createSubjectNameLabel = document.getElementById('createSubjectNameLabel');
const createSubjectCodeLabel = document.getElementById('createSubjectCodeLabel');
const createSubjectDescriptionLabel = document.getElementById('createSubjectDescriptionLabel');

const openCreateSubjectPostModal = document.getElementById('openCreateSubjectPostModal');
const openMySubjectPostsModalButton = document.getElementById('openMySubjectPostsModal');
const createSubjectPostModal = document.getElementById('createSubjectPostModal');
const closeCreateSubjectPostModal = document.getElementById('closeCreateSubjectPostModal');
const createSubjectPostForm = document.getElementById('createSubjectPostForm');
const createSubjectPostTitle = document.getElementById('createSubjectPostTitle');
const createSubjectPostHelper = document.getElementById('createSubjectPostHelper');
const createSubjectPostMessage = document.getElementById('createSubjectPostMessage');

const editSubjectPostModal = document.getElementById('editSubjectPostModal');
const closeEditSubjectPostModal = document.getElementById('closeEditSubjectPostModal');
const editSubjectPostForm = document.getElementById('editSubjectPostForm');
const editSubjectPostTitle = document.getElementById('editSubjectPostTitle');
const editSubjectPostHelper = document.getElementById('editSubjectPostHelper');
const editSubjectPostMessage = document.getElementById('editSubjectPostMessage');
const mySubjectPostsModal = document.getElementById('mySubjectPostsModal');
const closeMySubjectPostsModal = document.getElementById('closeMySubjectPostsModal');
const mySubjectPostsEyebrow = document.getElementById('mySubjectPostsEyebrow');
const mySubjectPostsTitle = document.getElementById('mySubjectPostsTitle');
const mySubjectPostsSubtitle = document.getElementById('mySubjectPostsSubtitle');
const mySubjectPostsMessage = document.getElementById('mySubjectPostsMessage');
const mySubjectPostsList = document.getElementById('mySubjectPostsList');

const subjectModerationModal = document.getElementById('subjectModerationModal');
const closeSubjectModerationModal = document.getElementById('closeSubjectModerationModal');
const subjectModerationEyebrow = document.getElementById('subjectModerationEyebrow');
const subjectModerationTitle = document.getElementById('subjectModerationTitle');
const subjectModerationSubtitle = document.getElementById('subjectModerationSubtitle');
const subjectModerationMessage = document.getElementById('subjectModerationMessage');
const subjectModerationMembers = document.getElementById('subjectModerationMembers');
const subjectModerationMembersCount = document.getElementById('subjectModerationMembersCount');
const subjectModerationPendingPosts = document.getElementById('subjectModerationPendingPosts');
const subjectModerationPendingCount = document.getElementById('subjectModerationPendingCount');
const subjectModerationReports = document.getElementById('subjectModerationReports');
const subjectModerationReportsCount = document.getElementById('subjectModerationReportsCount');
const openCourseSpacesModalButton = document.getElementById('openCourseSpacesModal');
const courseSpacesModal = document.getElementById('courseSpacesModal');
const closeCourseSpacesModal = document.getElementById('closeCourseSpacesModal');
const courseSpacesEyebrow = document.getElementById('courseSpacesEyebrow');
const courseSpacesTitle = document.getElementById('courseSpacesTitle');
const courseSpacesSubtitle = document.getElementById('courseSpacesSubtitle');
const courseSpacesMessage = document.getElementById('courseSpacesMessage');
const courseSpacesTableBody = document.getElementById('courseSpacesTableBody');

const subjectAiModal = document.getElementById('subjectAiModal');
const closeSubjectAiModal = document.getElementById('closeSubjectAiModal');
const subjectAiTitle = document.getElementById('subjectAiTitle');
const subjectAiSubtitle = document.getElementById('subjectAiSubtitle');
const subjectAiMessages = document.getElementById('subjectAiMessages');
const subjectAiForm = document.getElementById('subjectAiForm');
const subjectAiInput = document.getElementById('subjectAiInput');
const subjectAiMessage = document.getElementById('subjectAiMessage');

const subjectPostAiModal = document.getElementById('subjectPostAiModal');
const closeSubjectPostAiModal = document.getElementById('closeSubjectPostAiModal');
const subjectPostAiTitle = document.getElementById('subjectPostAiTitle');
const subjectPostAiSubtitle = document.getElementById('subjectPostAiSubtitle');
const subjectPostAiMessages = document.getElementById('subjectPostAiMessages');
const subjectPostAiForm = document.getElementById('subjectPostAiForm');
const subjectPostAiInput = document.getElementById('subjectPostAiInput');
const subjectPostAiMessage = document.getElementById('subjectPostAiMessage');

function parsePositiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function normalizeMySubjectPostsFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['approved', 'pending', 'rejected', 'removed'].includes(normalized)) {
    return normalized;
  }
  return 'all';
}

function readInitialSelection() {
  const params = new URLSearchParams(window.location.search);
  return {
    subjectId: parsePositiveInteger(params.get('subjectId')),
    postId: parsePositiveInteger(params.get('postId')),
    myPostsOpen: params.get('myPosts') === '1',
    myPostId: parsePositiveInteger(params.get('myPostId')),
    myPostStatus: normalizeMySubjectPostsFilter(params.get('myPostStatus')),
  };
}

const initialSelection = readInitialSelection();
const state = {
  viewerUid: '',
  viewerRole: 'member',
  threadTabLabel: 'Threads',
  canCreateUnit: false,
  canCreateThread: false,
  subjects: [],
  activeTab: 'unit',
  selectedSubjectId: initialSelection.subjectId,
  subjectSearchQuery: '',
  threadsFilterPanelOpen: false,
  threadFilters: {
    creator: 'all',
    sort: 'default',
  },
  loadingFeed: false,
  feedRequestSerial: 0,
  feedPosts: [],
  requestedPostId: initialSelection.postId,
  expandedCommentPostIds: new Set(initialSelection.postId ? [initialSelection.postId] : []),
  myPosts: {
    subjectId: null,
    posts: [],
    filterStatus: initialSelection.myPostsOpen ? initialSelection.myPostStatus : 'all',
    focusPostId: initialSelection.myPostId,
    openRequested: initialSelection.myPostsOpen,
    initializedFromUrl: false,
  },
  moderation: {
    subjectId: null,
    subject: null,
    members: [],
    pendingPosts: [],
    reports: [],
  },
  courseSpaces: {
    anchorSubjectId: null,
    courseName: '',
    spaces: [],
  },
};

let activeSubjectAiSubjectId = null;
let isSendingSubjectAi = false;
let activeSubjectPostAiContext = null;
let isSendingSubjectPostAi = false;
let activeEditSubjectPostId = null;
let initialSubjectSelectionApplied = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function apiLabel(kind, mode = 'singular', capitalize = false) {
  const normalized = String(kind || 'unit').trim().toLowerCase() === 'thread' ? 'thread' : 'unit';
  let value = normalized;
  if (mode === 'plural') value = `${normalized}s`;
  if (capitalize) value = value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function initialsFromName(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'M';
  return safe[0].toUpperCase();
}

function setAvatarContent(target, photoLink, displayName) {
  if (!target) return;
  target.innerHTML = '';
  if (photoLink) {
    const image = document.createElement('img');
    image.src = photoLink;
    image.alt = `${displayName || 'User'} profile photo`;
    target.appendChild(image);
    return;
  }
  target.textContent = initialsFromName(displayName);
}

function buildAvatarElement(photoLink, displayName, className) {
  const avatar = document.createElement('div');
  avatar.className = className;
  setAvatarContent(avatar, photoLink, displayName);
  return avatar;
}

function setNavAvatar(photoLink, displayName) {
  setAvatarContent(navAvatarLabel, photoLink, displayName);
}

function openModal(modal) {
  if (modal) modal.classList.remove('is-hidden');
}

function closeModal(modal) {
  if (modal) modal.classList.add('is-hidden');
}

function timeAgo(dateValue) {
  if (!dateValue) return 'just now';
  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function isStaffRole() {
  return ['owner', 'admin', 'depadmin', 'professor'].includes(state.viewerRole);
}

function normalizeThreadSortValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['created_desc', 'created_asc', 'posts_desc', 'posts_asc'].includes(normalized)) {
    return normalized;
  }
  return 'default';
}

function getThreadSubjects() {
  return state.subjects.filter((subject) => (subject.kind || 'unit') === 'thread');
}

function buildThreadCreatorFilterOptions() {
  if (isStaffRole()) {
    return [
      { value: 'all', label: 'All threads' },
      { value: 'mine', label: 'Threads made by me' },
      { value: 'others', label: 'Threads by other moderators' },
    ];
  }

  const creators = new Map();
  getThreadSubjects().forEach((subject) => {
    const key = subject.createdByUid || `name:${subject.creatorName || 'Moderator'}`;
    if (!creators.has(key)) {
      creators.set(key, {
        value: key,
        label: subject.creatorName || 'Moderator',
      });
    }
  });

  return [
    { value: 'all', label: 'All moderators' },
    ...Array.from(creators.values()).sort((left, right) => left.label.localeCompare(right.label)),
  ];
}

function ensureThreadFilterStateIntegrity() {
  state.threadFilters.sort = normalizeThreadSortValue(state.threadFilters.sort);
  const options = buildThreadCreatorFilterOptions();
  if (!options.some((option) => option.value === state.threadFilters.creator)) {
    state.threadFilters.creator = 'all';
  }
}

function matchesThreadCreatorFilter(subject) {
  if ((subject.kind || 'unit') !== 'thread') return true;
  const filterValue = state.threadFilters.creator || 'all';
  if (filterValue === 'all') return true;

  if (isStaffRole()) {
    if (filterValue === 'mine') {
      return Boolean(state.viewerUid) && subject.createdByUid === state.viewerUid;
    }
    if (filterValue === 'others') {
      return !state.viewerUid || subject.createdByUid !== state.viewerUid;
    }
    return true;
  }

  if (filterValue.startsWith('name:')) {
    return `name:${subject.creatorName || 'Moderator'}` === filterValue;
  }
  return subject.createdByUid === filterValue;
}

function compareThreadSubjects(left, right) {
  const sortMode = normalizeThreadSortValue(state.threadFilters.sort);
  if (sortMode === 'default') return 0;

  const leftCreated = left && left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightCreated = right && right.createdAt ? new Date(right.createdAt).getTime() : 0;
  const leftPosts = Number(left && left.postsCount ? left.postsCount : 0);
  const rightPosts = Number(right && right.postsCount ? right.postsCount : 0);

  if (sortMode === 'created_desc' && leftCreated !== rightCreated) return rightCreated - leftCreated;
  if (sortMode === 'created_asc' && leftCreated !== rightCreated) return leftCreated - rightCreated;
  if (sortMode === 'posts_desc' && leftPosts !== rightPosts) return rightPosts - leftPosts;
  if (sortMode === 'posts_asc' && leftPosts !== rightPosts) return leftPosts - rightPosts;

  return String(left.subjectName || '').localeCompare(String(right.subjectName || ''));
}

function hasActiveThreadFilters() {
  return state.threadFilters.creator !== 'all' || normalizeThreadSortValue(state.threadFilters.sort) !== 'default';
}

function subjectNeedsApprovalNotice(subject) {
  if (!subject) return '';
  if (subject.canModerate) {
    return `You can approve student posts, review reports, and manage student access for this ${apiLabel(subject.kind)}.`;
  }
  return `Student posts in this ${apiLabel(subject.kind)} stay pending until a professor or DepAdmin approves them.`;
}

function getSelectedSubject() {
  return state.subjects.find((item) => item.id === state.selectedSubjectId) || null;
}

function syncSubjectLocation(subjectId, postId = null) {
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  const url = new URL(window.location.href);
  if (subjectId) {
    url.searchParams.set('subjectId', String(subjectId));
  } else {
    url.searchParams.delete('subjectId');
  }
  if (postId) {
    url.searchParams.set('postId', String(postId));
  } else {
    url.searchParams.delete('postId');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function syncMySubjectPostsLocation({ open = false, postId = null, status = 'all' } = {}) {
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  const url = new URL(window.location.href);
  if (open) {
    url.searchParams.set('myPosts', '1');
    const normalizedStatus = normalizeMySubjectPostsFilter(status);
    if (normalizedStatus === 'all') {
      url.searchParams.delete('myPostStatus');
    } else {
      url.searchParams.set('myPostStatus', normalizedStatus);
    }
    if (postId) {
      url.searchParams.set('myPostId', String(postId));
    } else {
      url.searchParams.delete('myPostId');
    }
  } else {
    url.searchParams.delete('myPosts');
    url.searchParams.delete('myPostStatus');
    url.searchParams.delete('myPostId');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function highlightSubjectPost(postId) {
  if (!postId) return;
  const card = document.getElementById(`subject-post-${postId}`);
  if (!card) return;
  card.classList.add('is-highlighted');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => card.classList.remove('is-highlighted'), 2400);
}

function renderThreadFilterControls() {
  const isThreadTab = state.activeTab === 'thread';
  ensureThreadFilterStateIntegrity();

  if (toggleThreadsFilterPanelButton) {
    toggleThreadsFilterPanelButton.classList.toggle('is-hidden', !isThreadTab);
    toggleThreadsFilterPanelButton.textContent = hasActiveThreadFilters() ? 'Filters active' : 'Filters';
  }
  if (threadsFilterPanel) {
    threadsFilterPanel.classList.toggle('is-hidden', !isThreadTab || !state.threadsFilterPanelOpen);
  }
  if (!isThreadTab) return;

  if (threadCreatorFilterLabel) {
    threadCreatorFilterLabel.textContent = isStaffRole() ? 'Show' : 'Threads made by';
  }
  if (threadCreatorFilter) {
    const options = buildThreadCreatorFilterOptions();
    threadCreatorFilter.innerHTML = options
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join('');
    threadCreatorFilter.value = state.threadFilters.creator;
  }
  if (threadSortFilter) {
    threadSortFilter.value = normalizeThreadSortValue(state.threadFilters.sort);
  }
}

function getVisibleSubjects() {
  const query = String(state.subjectSearchQuery || '').trim().toLowerCase();
  const visible = state.subjects.filter((subject) => {
    if ((subject.kind || 'unit') !== state.activeTab) return false;
    if (state.activeTab === 'thread' && !matchesThreadCreatorFilter(subject)) return false;
    if (!query) return true;
    return [
      subject.subjectName,
      subject.subjectCode,
      subject.courseName,
      subject.creatorName,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  if (state.activeTab === 'thread' && normalizeThreadSortValue(state.threadFilters.sort) !== 'default') {
    return [...visible].sort(compareThreadSubjects);
  }
  return visible;
}

function ensureTabSelectionIntegrity() {
  const visible = getVisibleSubjects();
  const selected = getSelectedSubject();
  if (selected && visible.some((subject) => Number(subject.id) === Number(selected.id))) {
    return;
  }
  if (visible.length) {
    state.selectedSubjectId = visible[0].id;
    return;
  }

  const hasAnySubjectsInActiveTab = state.subjects.some((item) => (item.kind || 'unit') === state.activeTab);
  const shouldAutoFallback = !selected
    && !String(state.subjectSearchQuery || '').trim()
    && (state.activeTab !== 'thread' || !hasActiveThreadFilters());

  if (!hasAnySubjectsInActiveTab && shouldAutoFallback) {
    const fallbackTab = ['unit', 'thread'].find((tab) => (
      tab !== state.activeTab && state.subjects.some((item) => (item.kind || 'unit') === tab)
    ));
    if (fallbackTab) {
      state.activeTab = fallbackTab;
      const nextVisible = getVisibleSubjects();
      state.selectedSubjectId = nextVisible[0] ? nextVisible[0].id : null;
      return;
    }
  }

  if (hasAnySubjectsInActiveTab) {
    state.selectedSubjectId = null;
    return;
  }

  const fallbackTab = ['unit', 'thread'].find((tab) => state.subjects.some((item) => (item.kind || 'unit') === tab));
  if (fallbackTab && fallbackTab !== state.activeTab) {
    state.activeTab = fallbackTab;
    const nextVisible = getVisibleSubjects();
    state.selectedSubjectId = nextVisible[0] ? nextVisible[0].id : null;
    return;
  }
  state.selectedSubjectId = null;
}

function setCreateButtonsVisibility() {
  if (openCreateUnitModalButton) {
    openCreateUnitModalButton.classList.toggle('is-hidden', !state.canCreateUnit);
  }
  if (openCreateThreadModalButton) {
    openCreateThreadModalButton.classList.toggle('is-hidden', !state.canCreateThread);
  }
}

function renderTabLabels() {
  if (unitsTabButton) unitsTabButton.classList.toggle('is-active', state.activeTab === 'unit');
  if (threadsTabButton) {
    threadsTabButton.textContent = state.threadTabLabel || 'Threads';
    threadsTabButton.classList.toggle('is-active', state.activeTab === 'thread');
  }
}

function setSubjectFeedHeader(subject) {
  if (
    mySubjectPostsModal
    && !mySubjectPostsModal.classList.contains('is-hidden')
    && state.myPosts.subjectId
    && (!subject || Number(state.myPosts.subjectId) !== Number(subject.id))
  ) {
    closeMySubjectPostsManager();
  }

  if (!subject) {
    if (subjectCourseLabel) subjectCourseLabel.textContent = 'Select a unit';
    if (subjectTitle) subjectTitle.textContent = 'Unit feed';
    if (subjectDescription) subjectDescription.textContent = 'Choose a unit or thread on the left to load posts.';
    if (subjectApprovalHint) subjectApprovalHint.textContent = '';
    if (openCreateSubjectPostModal) {
      openCreateSubjectPostModal.disabled = true;
      openCreateSubjectPostModal.textContent = 'New post';
    }
    if (openMySubjectPostsModalButton) {
      openMySubjectPostsModalButton.disabled = true;
      openMySubjectPostsModalButton.textContent = 'My posts';
    }
    if (openSubjectAiModalButton) {
      openSubjectAiModalButton.disabled = true;
      openSubjectAiModalButton.textContent = 'Unit AI';
    }
    if (openSubjectModerationModalButton) {
      openSubjectModerationModalButton.classList.add('is-hidden');
    }
    return;
  }

  const singular = apiLabel(subject.kind);
  const capitalized = apiLabel(subject.kind, 'singular', true);
  if (subjectCourseLabel) subjectCourseLabel.textContent = subject.courseName || `${capitalized} course`;
  if (subjectTitle) subjectTitle.textContent = `${subject.subjectName || `Untitled ${singular}`} feed`;
  if (subjectDescription) {
    const creatorLine = subject.kind === 'thread' && subject.creatorName ? ` Started by ${subject.creatorName}.` : '';
    subjectDescription.textContent = (subject.description || `No ${singular} description yet.`) + creatorLine;
  }
  if (subjectApprovalHint) subjectApprovalHint.textContent = subjectNeedsApprovalNotice(subject);
  if (openCreateSubjectPostModal) {
    openCreateSubjectPostModal.disabled = false;
    openCreateSubjectPostModal.textContent = `New ${singular} post`;
  }
  if (openMySubjectPostsModalButton) {
    openMySubjectPostsModalButton.disabled = false;
    openMySubjectPostsModalButton.textContent = 'My posts';
  }
  if (openSubjectAiModalButton) {
    openSubjectAiModalButton.disabled = false;
    openSubjectAiModalButton.textContent = `${capitalized} AI`;
  }
  if (openSubjectModerationModalButton) {
    openSubjectModerationModalButton.classList.toggle('is-hidden', subject.canModerate !== true);
  }
}

function closeAllSubjectPostMenus() {
  document.querySelectorAll('.subject-post-menu').forEach((menu) => menu.classList.add('is-hidden'));
}

function createSubjectListMeta(subject) {
  const lines = [];
  if (subject.subjectCode) lines.push(subject.subjectCode);
  if (subject.kind === 'thread' && subject.creatorName) lines.push(`By ${subject.creatorName}`);
  lines.push(`${Number(subject.postsCount || 0)} posts`);
  return lines.join(' · ');
}

function renderSubjects() {
  if (!subjectsList) return;
  const visibleSubjects = getVisibleSubjects();
  subjectsList.innerHTML = '';
  if (!visibleSubjects.length) {
    subjectsList.innerHTML = `<p class="subject-empty">No ${escapeHtml(apiLabel(state.activeTab, 'plural'))} match your current view.</p>`;
    return;
  }

  visibleSubjects.forEach((subject) => {
    const shell = document.createElement('div');
    shell.className = 'subject-item-shell';
    if (subject.canModerate) shell.classList.add('has-moderation');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `subject-item${subject.id === state.selectedSubjectId ? ' is-active' : ''}`;
    const subjectLabel = subject.kind === 'thread' ? 'Thread' : 'Official unit';
    const pendingCount = Number(subject.pendingPostsCount || 0);
    button.innerHTML = `
      <div class="subject-item-head">
        <span class="subject-item-label">${escapeHtml(subjectLabel)}</span>
        ${subject.canModerate && pendingCount > 0 ? `<span class="subject-item-pending">${escapeHtml(`${pendingCount} pending`)}</span>` : ''}
      </div>
      <h3>${escapeHtml(subject.subjectName || `Untitled ${apiLabel(subject.kind)}`)}</h3>
      <p>${escapeHtml(createSubjectListMeta(subject))}</p>
    `;
    button.addEventListener('click', async () => {
      if (state.selectedSubjectId === subject.id) return;
      state.selectedSubjectId = subject.id;
      state.requestedPostId = null;
      renderSubjects();
      setSubjectFeedHeader(subject);
      syncSubjectLocation(subject.id);
      await fetchAndRenderSubjectFeed(subject.id);
    });
    shell.appendChild(button);

    if (subject.canModerate) {
      const moderateButton = document.createElement('button');
      moderateButton.type = 'button';
      moderateButton.className = 'subject-item-moderate';
      moderateButton.textContent = 'Manage';
      moderateButton.setAttribute('aria-label', `Manage ${subject.subjectName || apiLabel(subject.kind)}`);
      moderateButton.addEventListener('click', async () => {
        state.selectedSubjectId = subject.id;
        renderSubjects();
        setSubjectFeedHeader(subject);
        syncSubjectLocation(subject.id, state.requestedPostId);
        await fetchAndRenderSubjectFeed(subject.id);
        await openSubjectModeration(subject);
      });
      shell.appendChild(moderateButton);
    }

    subjectsList.appendChild(shell);
  });
}

async function refreshSidebarSelection(emptyMessage) {
  ensureThreadFilterStateIntegrity();
  ensureTabSelectionIntegrity();
  renderTabLabels();
  renderThreadFilterControls();
  renderSubjects();
  const selected = getSelectedSubject();
  setSubjectFeedHeader(selected);
  if (selected) {
    await fetchAndRenderSubjectFeed(selected.id);
  } else if (subjectPosts) {
    subjectPosts.innerHTML = `<p class="subject-empty">${escapeHtml(emptyMessage)}</p>`;
    syncSubjectLocation(null);
  }
}

function createSubjectPostBadge(text, modifier = '') {
  const badge = document.createElement('span');
  badge.className = `subject-post-badge${modifier ? ` ${modifier}` : ''}`;
  badge.textContent = text;
  return badge;
}

function approvalBadgeForPost(post) {
  const approvalStatus = String(post.approvalStatus || 'approved').toLowerCase();
  if (approvalStatus === 'approved') {
    return null;
  }
  if (approvalStatus === 'pending') {
    return createSubjectPostBadge('Pending approval', 'is-warning');
  }
  return createSubjectPostBadge('Rejected', 'is-danger');
}

function createSubjectPostActionButton({ action, icon, label, active = false, disabled = false }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.className = `subject-post-action${active ? ' is-active' : ''}`;
  button.disabled = disabled;

  const iconImage = document.createElement('img');
  iconImage.src = icon;
  iconImage.alt = '';
  button.appendChild(iconImage);

  const text = document.createElement('span');
  text.textContent = label;
  button.appendChild(text);
  return button;
}

function subjectPostUrl(subjectId, postId) {
  return `${window.location.origin}/subjects?subjectId=${encodeURIComponent(subjectId)}&postId=${encodeURIComponent(postId)}`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const result = window.prompt('Copy this link:', text);
  return result !== null;
}

async function collectReportPayload() {
  if (typeof window.showReportDialog === 'function') {
    return window.showReportDialog({
      title: 'Report post',
      subtitle: 'Select the reason and add optional details.',
    });
  }

  const reason = window.prompt('Report reason:', '');
  if (reason === null) return null;
  const trimmed = reason.trim();
  return {
    category: 'other',
    customReason: trimmed || 'Other',
    details: null,
    reason: trimmed || 'Other',
  };
}

function updatePostInState(postId, updater) {
  const index = state.feedPosts.findIndex((item) => item.id === postId);
  if (index === -1) return null;
  updater(state.feedPosts[index]);
  return state.feedPosts[index];
}

function replaceSubjectPostCard(postId) {
  const existing = document.getElementById(`subject-post-${postId}`);
  const index = state.feedPosts.findIndex((item) => item.id === postId);
  if (!existing || index === -1) return;
  existing.replaceWith(renderSubjectPostCard(state.feedPosts[index], index));
}

function setSubjectPostCommentsExpanded(postId, expanded) {
  if (!postId) return;
  if (expanded) {
    state.expandedCommentPostIds.add(postId);
  } else {
    state.expandedCommentPostIds.delete(postId);
  }
}

function openSubjectPostDiscussion(post) {
  const commentCount = Array.isArray(post.comments) ? post.comments.length : 0;
  const shouldExpand = commentCount > 2 && !state.expandedCommentPostIds.has(post.id);
  if (shouldExpand) {
    setSubjectPostCommentsExpanded(post.id, true);
    replaceSubjectPostCard(post.id);
  }
  const card = document.getElementById(`subject-post-${post.id}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = card.querySelector('input[name="content"]');
  if (input) input.focus();
}

function currentSubjectPostLabel() {
  const subject = getSelectedSubject();
  return subject ? apiLabel(subject.kind) : 'unit';
}

async function toggleSubjectPostLike(post) {
  const subject = getSelectedSubject();
  if (!subject) return;
  const action = post.liked ? 'unlike' : 'like';
  const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to update like.');
  }
  updatePostInState(post.id, (target) => {
    target.liked = Boolean(data.liked);
    target.likesCount = Number(data.likesCount || 0);
  });
  replaceSubjectPostCard(post.id);
}

async function toggleSubjectPostBookmark(post) {
  const subject = getSelectedSubject();
  if (!subject) return;
  const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: post.bookmarked ? 'remove' : 'add' }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to update bookmark.');
  }
  updatePostInState(post.id, (target) => {
    target.bookmarked = Boolean(data.bookmarked);
  });
  replaceSubjectPostCard(post.id);
}

async function shareSubjectPost(post) {
  const subject = getSelectedSubject();
  if (!subject) return;
  const shareUrl = subjectPostUrl(subject.id, post.id);
  try {
    await copyTextToClipboard(shareUrl);
    window.alert('Post link copied.');
  } catch (_error) {
    window.prompt('Copy this link:', shareUrl);
  }
}

async function reportSubjectPost(post) {
  const subject = getSelectedSubject();
  if (!subject) return;
  const payload = await collectReportPayload();
  if (!payload) return;
  const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to submit report.');
  }
  window.alert('Report submitted.');
}

function resetEditSubjectPostState() {
  activeEditSubjectPostId = null;
  if (editSubjectPostForm) editSubjectPostForm.reset();
  if (editSubjectPostMessage) editSubjectPostMessage.textContent = '';
}

function closeEditSubjectPostDialog() {
  closeModal(editSubjectPostModal);
  resetEditSubjectPostState();
}

function openEditSubjectPostDialog(post) {
  const subject = getSelectedSubject();
  if (!subject || !post || !editSubjectPostForm) return;
  activeEditSubjectPostId = post.id;
  if (editSubjectPostTitle) {
    editSubjectPostTitle.textContent = `Edit ${apiLabel(subject.kind)} post`;
  }
  if (editSubjectPostHelper) {
    editSubjectPostHelper.textContent = isStaffRole()
      ? `Changes in this ${apiLabel(subject.kind)} go live immediately.`
      : `Student edits in this ${apiLabel(subject.kind)} return to the moderation queue before they reappear.`;
  }
  editSubjectPostForm.elements.title.value = post.title || '';
  editSubjectPostForm.elements.content.value = post.content || '';
  editSubjectPostForm.elements.attachmentLibraryDocumentUuid.value = post.attachment?.uuid || '';
  if (editSubjectPostMessage) editSubjectPostMessage.textContent = '';
  openModal(editSubjectPostModal);
}

async function deleteSubjectPost(post) {
  const subject = getSelectedSubject();
  if (!subject || !post) return;
  if (!window.confirm(`Delete this ${apiLabel(subject.kind)} post?`)) return;
  const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}`, {
    method: 'DELETE',
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to delete post.');
  }
  state.requestedPostId = null;
  setSubjectPostCommentsExpanded(post.id, false);
  const refreshTasks = [
    fetchAndRenderSubjectFeed(subject.id),
    loadSubjectsBootstrap(),
  ];
  if (mySubjectPostsModal && !mySubjectPostsModal.classList.contains('is-hidden') && Number(state.myPosts.subjectId) === Number(subject.id)) {
    refreshTasks.push(loadMySubjectPosts(subject.id));
  }
  await Promise.all(refreshTasks);
}

function getMySubjectPostsModalSubject() {
  if (!state.myPosts.subjectId) return getSelectedSubject();
  return state.subjects.find((item) => Number(item.id) === Number(state.myPosts.subjectId)) || getSelectedSubject();
}

function approvalToneForPost(post) {
  if (String(post && post.status ? post.status : 'active').toLowerCase() === 'removed') {
    return { label: 'Removed', modifier: 'is-danger' };
  }
  const status = String(post && post.approvalStatus ? post.approvalStatus : 'approved').toLowerCase();
  if (status === 'pending') return { label: 'Pending approval', modifier: 'is-warning' };
  if (status === 'rejected') return { label: 'Rejected', modifier: 'is-danger' };
  return { label: 'Posted', modifier: 'is-accent' };
}

function highlightMySubjectPost(postId) {
  if (!postId) return;
  const card = document.getElementById(`my-subject-post-${postId}`);
  if (!card) return;
  card.classList.add('is-highlighted');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => card.classList.remove('is-highlighted'), 2400);
}

function renderMySubjectPosts() {
  if (!mySubjectPostsList) return;
  const subject = getMySubjectPostsModalSubject();
  const posts = Array.isArray(state.myPosts.posts) ? state.myPosts.posts : [];
  const filterStatus = normalizeMySubjectPostsFilter(state.myPosts.filterStatus);
  const visiblePosts = filterStatus === 'all'
    ? posts
    : posts.filter((post) => {
        if (filterStatus === 'removed') {
          return String(post.status || 'active').toLowerCase() === 'removed';
        }
        return String(post.status || 'active').toLowerCase() !== 'removed'
          && String(post.approvalStatus || 'approved').toLowerCase() === filterStatus;
      });
  mySubjectPostsList.innerHTML = '';

  if (!visiblePosts.length) {
    const filteredMessage = filterStatus === 'all'
      ? `You have no posts in this ${escapeHtml(apiLabel(subject?.kind))} yet.`
      : `You have no ${escapeHtml(filterStatus)} posts in this ${escapeHtml(apiLabel(subject?.kind))}.`;
    mySubjectPostsList.innerHTML = `<p class="subject-empty">${filteredMessage}</p>`;
    return;
  }

  visiblePosts.forEach((post) => {
    const article = document.createElement('article');
    article.className = 'my-subject-post-card';
    article.id = `my-subject-post-${post.id}`;

    const head = document.createElement('div');
    head.className = 'my-subject-post-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'my-subject-post-title-wrap';

    const title = document.createElement('h4');
    title.textContent = post.title || 'Untitled post';
    titleWrap.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'my-subject-post-meta';
    const removedStatus = String(post.status || 'active').toLowerCase() === 'removed';
    meta.textContent = removedStatus
      ? `Created ${formatDateTime(post.createdAt)} · Removed ${formatDateTime(post.removedAt || post.updatedAt)}`
      : `Created ${formatDateTime(post.createdAt)}${post.updatedAt && post.updatedAt !== post.createdAt ? ` · Updated ${formatDateTime(post.updatedAt)}` : ''}`;
    titleWrap.appendChild(meta);
    head.appendChild(titleWrap);

    const badgeWrap = document.createElement('div');
    badgeWrap.className = 'my-subject-post-badges';
    const tone = approvalToneForPost(post);
    badgeWrap.appendChild(createSubjectPostBadge(tone.label, tone.modifier));
    head.appendChild(badgeWrap);
    article.appendChild(head);

    const body = document.createElement('p');
    body.className = 'my-subject-post-body';
    body.textContent = post.content || '';
    article.appendChild(body);

    const utilityRow = document.createElement('div');
    utilityRow.className = 'subject-post-utility-row';
    utilityRow.appendChild(createSubjectPostBadge(`${Number(post.likesCount || 0)} likes`));
    utilityRow.appendChild(createSubjectPostBadge(`${Number(post.commentsCount || 0)} comments`));
    const attachment = buildSubjectPostAttachment(post);
    if (attachment) utilityRow.appendChild(attachment);
    article.appendChild(utilityRow);

    const approvalStatus = String(post.approvalStatus || 'approved').toLowerCase();
    if (removedStatus) {
      const removed = document.createElement('p');
      removed.className = 'subject-post-status-copy is-danger';
      removed.textContent = post.removalReason
        ? `Removed by moderation: ${post.removalReason}`
        : 'Removed by moderation for this unit/thread.';
      article.appendChild(removed);
    } else if (approvalStatus === 'pending') {
      const pending = document.createElement('p');
      pending.className = 'subject-post-status-copy';
      pending.textContent = `Submitted ${timeAgo(post.approvalRequestedAt || post.createdAt)} and hidden until approval.`;
      article.appendChild(pending);
    }
    if (approvalStatus === 'rejected') {
      const rejection = document.createElement('p');
      rejection.className = 'subject-post-status-copy is-danger';
      rejection.textContent = post.rejectionNote
        ? `Rejected: ${post.rejectionNote}`
        : 'Rejected by the moderators for this unit/thread.';
      article.appendChild(rejection);
    }

    const actions = document.createElement('div');
    actions.className = 'my-subject-post-actions';
    if (!removedStatus) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = approvalStatus === 'pending' ? 'ghost-button' : 'danger-button';
      deleteButton.textContent = approvalStatus === 'pending' ? 'Cancel pending' : 'Delete post';
      deleteButton.addEventListener('click', async () => {
        try {
          await removeMySubjectPost(post);
        } catch (error) {
          if (mySubjectPostsMessage) mySubjectPostsMessage.textContent = error.message || 'Unable to remove your post.';
        }
      });
      actions.appendChild(deleteButton);
      article.appendChild(actions);
    }

    mySubjectPostsList.appendChild(article);
  });

  if (state.myPosts.focusPostId) {
    highlightMySubjectPost(state.myPosts.focusPostId);
  }
}

async function loadMySubjectPosts(subjectId) {
  if (!subjectId) return;
  state.myPosts.subjectId = subjectId;
  if (mySubjectPostsMessage) mySubjectPostsMessage.textContent = '';
  if (mySubjectPostsList) {
    mySubjectPostsList.innerHTML = '<p class="subject-empty">Loading your posts...</p>';
  }

  const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/my-posts`);
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to load your posts.');
  }

  state.myPosts.posts = Array.isArray(data.posts) ? data.posts : [];
  const subject = data.subject || getMySubjectPostsModalSubject() || {};
  const kind = subject.kind || 'unit';
  if (mySubjectPostsEyebrow) {
    mySubjectPostsEyebrow.textContent = `${apiLabel(kind, 'plural', true)}`;
  }
  if (mySubjectPostsTitle) {
    mySubjectPostsTitle.textContent = `My posts in ${subject.subjectName || `this ${apiLabel(kind)}`}`;
  }
  if (mySubjectPostsSubtitle) {
    const filterStatus = normalizeMySubjectPostsFilter(state.myPosts.filterStatus);
    mySubjectPostsSubtitle.textContent = filterStatus === 'all'
      ? `Review your posted, pending, rejected, and removed submissions for this ${apiLabel(kind)} and remove them when needed.`
      : `Showing your ${filterStatus} submissions for this ${apiLabel(kind)}.`;
  }
  renderMySubjectPosts();
}

async function openMySubjectPostsManager(options = {}) {
  const subject = getSelectedSubject();
  if (!subject) return;
  state.myPosts.filterStatus = normalizeMySubjectPostsFilter(
    Object.prototype.hasOwnProperty.call(options, 'filterStatus') ? options.filterStatus : state.myPosts.filterStatus
  );
  state.myPosts.focusPostId = Object.prototype.hasOwnProperty.call(options, 'focusPostId')
    ? options.focusPostId
    : state.myPosts.focusPostId;
  syncMySubjectPostsLocation({
    open: true,
    status: state.myPosts.filterStatus,
    postId: state.myPosts.focusPostId,
  });
  openModal(mySubjectPostsModal);
  try {
    await loadMySubjectPosts(subject.id);
  } catch (error) {
    if (mySubjectPostsMessage) mySubjectPostsMessage.textContent = error.message || 'Unable to load your posts.';
  }
}

function closeMySubjectPostsManager() {
  state.myPosts.filterStatus = 'all';
  state.myPosts.focusPostId = null;
  closeModal(mySubjectPostsModal);
  syncMySubjectPostsLocation({ open: false });
}

async function applyInitialMyPostsSelection() {
  if (state.myPosts.initializedFromUrl) return;
  state.myPosts.initializedFromUrl = true;
  if (!state.myPosts.openRequested) return;
  const subject = getSelectedSubject();
  if (!subject || (initialSelection.subjectId && Number(subject.id) !== Number(initialSelection.subjectId))) {
    state.myPosts.openRequested = false;
    syncMySubjectPostsLocation({ open: false });
    return;
  }
  try {
    await openMySubjectPostsManager({
      filterStatus: state.myPosts.filterStatus,
      focusPostId: state.myPosts.focusPostId,
    });
  } finally {
    state.myPosts.openRequested = false;
  }
}

async function removeMySubjectPost(post) {
  const subject = getMySubjectPostsModalSubject();
  const subjectId = state.myPosts.subjectId || (subject ? subject.id : null);
  if (!subject || !subjectId || !post) return;

  const approvalStatus = String(post.approvalStatus || 'approved').toLowerCase();
  const confirmText = approvalStatus === 'pending'
    ? `Cancel this pending ${apiLabel(subject.kind)} post?`
    : `Delete this ${apiLabel(subject.kind)} post?`;
  if (!window.confirm(confirmText)) return;

  const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/posts/${encodeURIComponent(post.id)}`, {
    method: 'DELETE',
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to remove your post.');
  }

  if (state.requestedPostId === post.id) {
    state.requestedPostId = null;
  }
  if (Number(state.myPosts.focusPostId) === Number(post.id)) {
    state.myPosts.focusPostId = null;
    syncMySubjectPostsLocation({
      open: true,
      status: state.myPosts.filterStatus,
      postId: null,
    });
  }
  setSubjectPostCommentsExpanded(post.id, false);
  if (mySubjectPostsMessage) {
    mySubjectPostsMessage.textContent = approvalStatus === 'pending'
      ? 'Pending post canceled.'
      : 'Post deleted.';
  }

  await Promise.all([
    loadMySubjectPosts(subjectId),
    fetchAndRenderSubjectFeed(subjectId),
    loadSubjectsBootstrap(),
  ]);
}

function buildSubjectPostAttachment(post) {
  if (!post.attachment || !post.attachment.link) return null;
  const attachment = document.createElement('a');
  attachment.className = 'subject-post-attachment';
  attachment.href = post.attachment.link;
  attachment.target = '_blank';
  attachment.rel = 'noopener noreferrer';

  const icon = document.createElement('img');
  icon.src = '/assets/document.svg';
  icon.alt = '';
  attachment.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = post.attachment.title || 'Open Library document';
  attachment.appendChild(text);
  return attachment;
}

function buildSubjectCommentsSection(post) {
  const commentsWrap = document.createElement('section');
  commentsWrap.className = 'subject-post-comments';

  const approvalStatus = String(post.approvalStatus || 'approved').toLowerCase();
  if (approvalStatus !== 'approved') {
    const pendingMessage = document.createElement('p');
    pendingMessage.className = 'subject-post-comments-empty';
    pendingMessage.textContent = approvalStatus === 'rejected'
      ? `This post is currently rejected and hidden from the public ${currentSubjectPostLabel()} feed.`
      : `Discussion opens once this post is approved for the public ${currentSubjectPostLabel()} feed.`;
    commentsWrap.appendChild(pendingMessage);
    return commentsWrap;
  }

  const commentsHead = document.createElement('div');
  commentsHead.className = 'subject-post-comments-head';
  commentsHead.innerHTML = `
    <h5>Discussion</h5>
    <span>${Number(post.commentsCount || 0)} comments</span>
  `;
  commentsWrap.appendChild(commentsHead);

  const commentsList = document.createElement('div');
  commentsList.className = 'subject-comments';
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const hasOverflow = comments.length > 2;
  const isExpanded = state.expandedCommentPostIds.has(post.id);
  const visibleComments = hasOverflow && !isExpanded ? comments.slice(-2) : comments;

  if (hasOverflow) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'subject-comments-toggle';
    toggle.textContent = isExpanded ? 'Show fewer comments' : `Show all ${comments.length} comments`;
    toggle.addEventListener('click', () => {
      setSubjectPostCommentsExpanded(post.id, !isExpanded);
      replaceSubjectPostCard(post.id);
    });
    commentsWrap.appendChild(toggle);
  }

  if (!visibleComments.length) {
    const empty = document.createElement('p');
    empty.className = 'subject-post-comments-empty';
    empty.textContent = 'No discussion yet. Start the thread.';
    commentsList.appendChild(empty);
  } else {
    visibleComments.forEach((comment) => {
      const commentItem = document.createElement('article');
      commentItem.className = 'subject-comment';
      const commentMeta = document.createElement('div');
      commentMeta.className = 'subject-comment-meta';
      commentMeta.innerHTML = `
        <strong>${escapeHtml(comment.authorName || 'Member')}</strong>
        <span>${escapeHtml(timeAgo(comment.createdAt))}</span>
      `;
      const content = document.createElement('p');
      content.textContent = comment.content || '';
      commentItem.appendChild(commentMeta);
      commentItem.appendChild(content);
      commentsList.appendChild(commentItem);
    });
  }
  commentsWrap.appendChild(commentsList);

  const commentForm = document.createElement('form');
  commentForm.className = 'subject-comment-form';
  commentForm.innerHTML = `
    <input type="text" name="content" placeholder="Write a comment..." required />
    <button type="submit" class="primary-button">Send</button>
  `;
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const subject = getSelectedSubject();
    if (!subject) return;
    const input = commentForm.elements.content;
    const content = String(input.value || '').trim();
    if (!content) return;

    const submitButton = commentForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    try {
      const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to submit comment.');
      }
      input.value = '';
      state.requestedPostId = post.id;
      setSubjectPostCommentsExpanded(post.id, true);
      syncSubjectLocation(subject.id, post.id);
      await fetchAndRenderSubjectFeed(subject.id);
      highlightSubjectPost(post.id);
    } catch (error) {
      window.alert(error.message || 'Unable to submit comment.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Send';
      }
    }
  });

  commentsWrap.appendChild(commentForm);
  return commentsWrap;
}

function renderSubjectPostCard(post, index) {
  const article = document.createElement('article');
  article.id = `subject-post-${post.id}`;
  article.className = `subject-post-card${index % 2 ? ' alt' : ''}`;

  const header = document.createElement('div');
  header.className = 'subject-post-header';

  const authorWrap = document.createElement('div');
  authorWrap.className = 'subject-post-author-wrap';
  authorWrap.appendChild(buildAvatarElement(post.author?.photoLink, post.author?.displayName, 'subject-post-avatar'));

  const meta = document.createElement('div');
  meta.className = 'subject-post-meta';
  meta.innerHTML = `
    <div class="subject-post-author-row">
      <h3>${escapeHtml(post.author?.displayName || 'Member')}</h3>
      <p>${escapeHtml(timeAgo(post.createdAt))}</p>
    </div>
    <p class="subject-post-subline">${escapeHtml(post.updatedAt && post.updatedAt !== post.createdAt ? `Updated ${timeAgo(post.updatedAt)}` : 'Live in this feed')}</p>
  `;
  authorWrap.appendChild(meta);

  const menuWrap = document.createElement('div');
  menuWrap.className = 'subject-post-menu-wrap';
  const canReport = String(post.approvalStatus || 'approved').toLowerCase() === 'approved' && !post.isOwner;
  menuWrap.innerHTML = `
    <button type="button" class="subject-post-menu-button" aria-label="Post actions">
      <img src="/assets/ellipsis.svg" alt="" />
    </button>
    <div class="subject-post-menu is-hidden">
      <button type="button" data-action="bookmark">${post.bookmarked ? 'Remove bookmark' : 'Bookmark post'}</button>
      <button type="button" data-action="share">Share link</button>
      ${canReport ? '<button type="button" data-action="report">Report post</button>' : ''}
      ${post.isOwner ? '<button type="button" data-action="edit">Edit post</button>' : ''}
      ${post.isOwner ? '<button type="button" class="is-danger" data-action="delete">Delete post</button>' : ''}
    </div>
  `;

  header.appendChild(authorWrap);
  header.appendChild(menuWrap);
  article.appendChild(header);

  const title = document.createElement('h4');
  title.className = 'subject-post-title';
  title.textContent = post.title || 'Untitled post';
  article.appendChild(title);

  const body = document.createElement('p');
  body.className = 'subject-post-body';
  body.textContent = post.content || '';
  article.appendChild(body);

  const utilityRow = document.createElement('div');
  utilityRow.className = 'subject-post-utility-row';
  const approvalBadge = approvalBadgeForPost(post);
  if (approvalBadge) utilityRow.appendChild(approvalBadge);
  utilityRow.appendChild(createSubjectPostBadge(`${Number(post.likesCount || 0)} likes`));
  utilityRow.appendChild(createSubjectPostBadge(`${Number(post.commentsCount || 0)} comments`));
  if (post.bookmarked) utilityRow.appendChild(createSubjectPostBadge('Bookmarked', 'is-accent'));
  if (post.canModerate && String(post.approvalStatus || '').toLowerCase() !== 'approved') {
    utilityRow.appendChild(createSubjectPostBadge('Visible to moderators', 'is-warning'));
  }
  const attachment = buildSubjectPostAttachment(post);
  if (attachment) utilityRow.appendChild(attachment);
  article.appendChild(utilityRow);

  if (String(post.approvalStatus || 'approved').toLowerCase() === 'rejected' && post.rejectionNote) {
    const rejection = document.createElement('p');
    rejection.className = 'subject-post-status-copy is-danger';
    rejection.textContent = `Rejection note: ${post.rejectionNote}`;
    article.appendChild(rejection);
  }
  if (String(post.approvalStatus || 'approved').toLowerCase() === 'pending') {
    const pending = document.createElement('p');
    pending.className = 'subject-post-status-copy';
    pending.textContent = `Submitted ${timeAgo(post.approvalRequestedAt || post.createdAt)} and waiting for professor/DepAdmin approval.`;
    article.appendChild(pending);
  }

  const isApproved = String(post.approvalStatus || 'approved').toLowerCase() === 'approved';
  const actions = document.createElement('div');
  actions.className = 'subject-post-actions';
  const likeButton = createSubjectPostActionButton({
    action: 'like',
    icon: '/assets/heart.svg',
    label: `${Number(post.likesCount || 0)} Like`,
    active: Boolean(post.liked),
    disabled: !isApproved,
  });
  const discussionButton = createSubjectPostActionButton({
    action: 'comments',
    icon: '/assets/comment-discussion.svg',
    label: 'Discussion',
    disabled: !isApproved,
  });
  const askAiButton = createSubjectPostActionButton({
    action: 'ask-ai',
    icon: '/assets/AI-star.svg',
    label: 'Ask AI',
  });
  actions.appendChild(likeButton);
  actions.appendChild(discussionButton);
  actions.appendChild(askAiButton);
  article.appendChild(actions);
  article.appendChild(buildSubjectCommentsSection(post));

  const menuButton = menuWrap.querySelector('.subject-post-menu-button');
  const menu = menuWrap.querySelector('.subject-post-menu');
  if (menuButton && menu) {
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const willShow = menu.classList.contains('is-hidden');
      closeAllSubjectPostMenus();
      menu.classList.toggle('is-hidden', !willShow);
    });
    menu.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        menu.classList.add('is-hidden');
        try {
          if (button.dataset.action === 'bookmark') {
            await toggleSubjectPostBookmark(post);
          } else if (button.dataset.action === 'share') {
            await shareSubjectPost(post);
          } else if (button.dataset.action === 'report') {
            await reportSubjectPost(post);
          } else if (button.dataset.action === 'edit') {
            openEditSubjectPostDialog(post);
          } else if (button.dataset.action === 'delete') {
            await deleteSubjectPost(post);
          }
        } catch (error) {
          window.alert(error.message || 'Unable to complete post action.');
        }
      });
    });
  }

  actions.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        if (button.dataset.action === 'like') {
          await toggleSubjectPostLike(post);
        } else if (button.dataset.action === 'comments') {
          openSubjectPostDiscussion(post);
        } else if (button.dataset.action === 'ask-ai') {
          await openSubjectPostAiChatModal(post);
        }
      } catch (error) {
        window.alert(error.message || 'Unable to complete post action.');
      }
    });
  });

  return article;
}

function renderPostList(posts) {
  if (!subjectPosts) return;
  state.feedPosts = Array.isArray(posts) ? posts : [];
  const visiblePostIds = new Set(state.feedPosts.map((item) => item.id));
  Array.from(state.expandedCommentPostIds).forEach((postId) => {
    if (!visiblePostIds.has(postId)) state.expandedCommentPostIds.delete(postId);
  });
  if (state.requestedPostId && visiblePostIds.has(state.requestedPostId)) {
    state.expandedCommentPostIds.add(state.requestedPostId);
  }
  subjectPosts.innerHTML = '';
  if (!state.feedPosts.length) {
    const selected = getSelectedSubject();
    const emptyMessage = selected && selected.canModerate !== true
      ? `No posts are visible yet for this ${apiLabel(selected?.kind)}. Use My posts to review your pending or rejected submissions.`
      : `No posts yet for this ${apiLabel(selected?.kind)}.`;
    subjectPosts.innerHTML = `<p class="subject-empty">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  state.feedPosts.forEach((post, index) => {
    subjectPosts.appendChild(renderSubjectPostCard(post, index));
  });
  if (state.requestedPostId) {
    window.requestAnimationFrame(() => highlightSubjectPost(state.requestedPostId));
  }
}

function appendAiBubble(container, role, text, { pending = false } = {}) {
  if (!container) return null;
  const empty = container.querySelector('.subject-ai-empty');
  if (empty) empty.remove();
  const bubble = document.createElement('div');
  bubble.className = `subject-ai-bubble ${role}${pending ? ' pending' : ''}`;
  bubble.textContent = text || '';
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function renderAiMessages(container, messages, emptyText) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(messages) || !messages.length) {
    const empty = document.createElement('p');
    empty.className = 'subject-ai-empty';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  messages.forEach((message) => {
    appendAiBubble(container, message.role === 'user' ? 'user' : 'assistant', message.content || '');
  });
}

function renderSubjectAiMessages(messages) {
  const subject = getSelectedSubject();
  renderAiMessages(
    subjectAiMessages,
    messages,
    `Ask about this ${apiLabel(subject?.kind)}, its topics, or the recent discussion around it.`
  );
}

function resetSubjectAiState() {
  activeSubjectAiSubjectId = null;
  isSendingSubjectAi = false;
  if (subjectAiInput) {
    subjectAiInput.value = '';
    subjectAiInput.disabled = false;
  }
  if (subjectAiMessage) subjectAiMessage.textContent = '';
  renderSubjectAiMessages([]);
}

function closeSubjectAiChatModal() {
  closeModal(subjectAiModal);
  resetSubjectAiState();
}

async function openSubjectAiChatModal(subject) {
  if (!subject || !subjectAiModal) return;
  activeSubjectAiSubjectId = subject.id;
  const capitalized = apiLabel(subject.kind, 'singular', true);
  if (subjectAiTitle) subjectAiTitle.textContent = `${capitalized} AI: ${subject.subjectName || `Untitled ${apiLabel(subject.kind)}`}`;
  if (subjectAiSubtitle) subjectAiSubtitle.textContent = `Loading ${apiLabel(subject.kind)} context...`;
  if (subjectAiMessage) subjectAiMessage.textContent = '';
  renderSubjectAiMessages([]);
  openModal(subjectAiModal);

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/ask-ai/bootstrap`);
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load AI conversation.');
    }
    if (subjectAiSubtitle) {
      subjectAiSubtitle.textContent = `Focus: ${data.context?.summary || `${capitalized} context ready.`}`;
    }
    renderSubjectAiMessages(data.messages || []);
    if (subjectAiInput) subjectAiInput.focus();
  } catch (error) {
    if (subjectAiSubtitle) {
      subjectAiSubtitle.textContent = `${capitalized} context could not be loaded.`;
    }
    if (subjectAiMessage) {
      subjectAiMessage.textContent = error.message || 'Unable to load AI conversation.';
    }
  }
}

async function sendSubjectAiMessage(event) {
  event.preventDefault();
  if (isSendingSubjectAi || !activeSubjectAiSubjectId || !subjectAiInput) return;
  const content = subjectAiInput.value.trim();
  if (!content) return;

  isSendingSubjectAi = true;
  if (subjectAiMessage) subjectAiMessage.textContent = '';
  subjectAiInput.value = '';
  subjectAiInput.disabled = true;
  appendAiBubble(subjectAiMessages, 'user', content);
  const pendingBubble = appendAiBubble(subjectAiMessages, 'assistant', 'Thinking...', { pending: true });

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(activeSubjectAiSubjectId)}/ask-ai/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to send message.');
    }
    if (pendingBubble) {
      pendingBubble.classList.remove('pending');
      pendingBubble.textContent = data.message?.content || 'No response generated.';
    }
  } catch (error) {
    if (pendingBubble) pendingBubble.remove();
    if (subjectAiMessage) subjectAiMessage.textContent = error.message || 'Unable to send message.';
  } finally {
    isSendingSubjectAi = false;
    subjectAiInput.disabled = false;
    subjectAiInput.focus();
  }
}

function renderSubjectPostAiMessages(messages) {
  renderAiMessages(subjectPostAiMessages, messages, 'Ask about this post, its arguments, or the surrounding discussion.');
}

function resetSubjectPostAiState() {
  activeSubjectPostAiContext = null;
  isSendingSubjectPostAi = false;
  if (subjectPostAiInput) {
    subjectPostAiInput.value = '';
    subjectPostAiInput.disabled = false;
  }
  if (subjectPostAiMessage) subjectPostAiMessage.textContent = '';
  renderSubjectPostAiMessages([]);
}

function closeSubjectPostAiChatModal() {
  closeModal(subjectPostAiModal);
  resetSubjectPostAiState();
}

async function openSubjectPostAiChatModal(post) {
  const subject = getSelectedSubject();
  if (!subject || !post || !subjectPostAiModal) return;
  activeSubjectPostAiContext = { subjectId: subject.id, postId: post.id };
  if (subjectPostAiTitle) {
    subjectPostAiTitle.textContent = `Ask AI: ${post.title || `${apiLabel(subject.kind, 'singular', true)} post`}`;
  }
  if (subjectPostAiSubtitle) {
    subjectPostAiSubtitle.textContent = 'Loading post context...';
  }
  if (subjectPostAiMessage) subjectPostAiMessage.textContent = '';
  renderSubjectPostAiMessages([]);
  openModal(subjectPostAiModal);

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}/ask-ai/bootstrap`);
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load post AI conversation.');
    }
    if (subjectPostAiSubtitle) {
      subjectPostAiSubtitle.textContent = `${apiLabel(subject.kind, 'singular', true)}: ${data.context?.subjectTitle || subject.subjectName || 'Selected space'} | Focus: ${data.context?.summary || 'Post context ready.'}`;
    }
    renderSubjectPostAiMessages(data.messages || []);
    if (subjectPostAiInput) subjectPostAiInput.focus();
  } catch (error) {
    if (subjectPostAiSubtitle) subjectPostAiSubtitle.textContent = 'Post context could not be loaded.';
    if (subjectPostAiMessage) subjectPostAiMessage.textContent = error.message || 'Unable to load post AI conversation.';
  }
}

async function sendSubjectPostAiMessage(event) {
  event.preventDefault();
  if (isSendingSubjectPostAi || !activeSubjectPostAiContext || !subjectPostAiInput) return;
  const content = subjectPostAiInput.value.trim();
  if (!content) return;

  isSendingSubjectPostAi = true;
  if (subjectPostAiMessage) subjectPostAiMessage.textContent = '';
  subjectPostAiInput.value = '';
  subjectPostAiInput.disabled = true;
  appendAiBubble(subjectPostAiMessages, 'user', content);
  const pendingBubble = appendAiBubble(subjectPostAiMessages, 'assistant', 'Thinking...', { pending: true });

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(activeSubjectPostAiContext.subjectId)}/posts/${encodeURIComponent(activeSubjectPostAiContext.postId)}/ask-ai/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to send message.');
    }
    if (pendingBubble) {
      pendingBubble.classList.remove('pending');
      pendingBubble.textContent = data.message?.content || 'No response generated.';
    }
  } catch (error) {
    if (pendingBubble) pendingBubble.remove();
    if (subjectPostAiMessage) subjectPostAiMessage.textContent = error.message || 'Unable to send message.';
  } finally {
    isSendingSubjectPostAi = false;
    subjectPostAiInput.disabled = false;
    subjectPostAiInput.focus();
  }
}

function updateSubjectMetadata(subjectId, subjectUpdate) {
  if (!subjectId || !subjectUpdate) return;
  const target = state.subjects.find((item) => Number(item.id) === Number(subjectId));
  if (!target) return;
  target.kind = subjectUpdate.kind || target.kind || 'unit';
  target.subjectName = subjectUpdate.subjectName || target.subjectName || '';
  target.courseName = subjectUpdate.courseName || target.courseName || '';
  target.description = subjectUpdate.description || target.description || '';
  target.canModerate = subjectUpdate.canModerate === true;
  target.viewerCanPostWithoutApproval = subjectUpdate.viewerCanPostWithoutApproval === true;
}

async function fetchAndRenderSubjectFeed(subjectId) {
  if (!subjectId || !subjectPosts) return;
  const requestSerial = state.feedRequestSerial + 1;
  state.feedRequestSerial = requestSerial;
  state.loadingFeed = true;
  subjectPosts.innerHTML = '<p class="subject-empty">Loading feed...</p>';
  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/feed?page=1&pageSize=50`);
    const data = await response.json().catch(() => ({ ok: false }));
    if (requestSerial !== state.feedRequestSerial) return;
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load feed.');
    }
    updateSubjectMetadata(subjectId, data.subject || null);
    const selected = getSelectedSubject();
    if (selected && Number(selected.id) === Number(subjectId)) {
      setSubjectFeedHeader(selected);
    }
    renderPostList(data.posts || []);
    syncSubjectLocation(subjectId, state.requestedPostId);
  } catch (error) {
    if (requestSerial !== state.feedRequestSerial) return;
    subjectPosts.innerHTML = `<p class="subject-empty">${escapeHtml(error.message || 'Unable to load feed.')}</p>`;
  } finally {
    if (requestSerial === state.feedRequestSerial) {
      state.loadingFeed = false;
    }
  }
}

async function loadSubjectsBootstrap() {
  try {
    const response = await fetch('/api/subjects/bootstrap');
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load units.');
    }
    state.subjects = Array.isArray(data.subjects) ? data.subjects : [];
    state.viewerUid = data.viewerUid || '';
    state.viewerRole = data.viewerRole || 'member';
    state.canCreateUnit = Boolean(data.canCreateUnit);
    state.canCreateThread = Boolean(data.canCreateThread);
    state.threadTabLabel = data.threadTabLabel || 'Threads';
    if (!initialSubjectSelectionApplied && initialSelection.subjectId) {
      const requestedSubject = state.subjects.find((item) => Number(item.id) === Number(initialSelection.subjectId));
      if (requestedSubject) {
        state.activeTab = requestedSubject.kind === 'thread' ? 'thread' : 'unit';
      }
      initialSubjectSelectionApplied = true;
    }
    setCreateButtonsVisibility();
    await refreshSidebarSelection('No units or threads are available yet.');
  } catch (error) {
    if (subjectsList) {
      subjectsList.innerHTML = `<p class="subject-empty">${escapeHtml(error.message)}</p>`;
    }
    if (subjectPosts) {
      subjectPosts.innerHTML = '<p class="subject-empty">Unable to load the feed.</p>';
    }
  }
}

function configureCreateSubjectModal(kind) {
  const singular = apiLabel(kind);
  const capitalized = apiLabel(kind, 'singular', true);
  if (createSubjectKindInput) createSubjectKindInput.value = kind;
  if (createSubjectTitle) createSubjectTitle.textContent = `Create ${singular}`;
  if (createSubjectNameLabel) createSubjectNameLabel.textContent = `${capitalized} name`;
  if (createSubjectCodeLabel) createSubjectCodeLabel.textContent = `${capitalized} code (optional)`;
  if (createSubjectDescriptionLabel) createSubjectDescriptionLabel.textContent = `${capitalized} description`;
  if (createSubjectMessage) createSubjectMessage.textContent = '';
  openModal(createSubjectModal);
}

function prepareCreatePostModal() {
  const subject = getSelectedSubject();
  if (!subject) return;
  const singular = apiLabel(subject.kind);
  if (createSubjectPostTitle) createSubjectPostTitle.textContent = `Create ${singular} post`;
  if (createSubjectPostHelper) {
    createSubjectPostHelper.textContent = subject.canModerate
      ? `Posts from course staff publish immediately in this ${singular}.`
      : `Student posts in this ${singular} stay pending until a professor or DepAdmin approves them.`;
  }
  if (createSubjectPostMessage) createSubjectPostMessage.textContent = '';
  openModal(createSubjectPostModal);
}

async function openSubjectModeration(subject) {
  if (!subject || subject.canModerate !== true) return;
  state.moderation.subjectId = subject.id;
  state.moderation.subject = subject;
  if (subjectModerationEyebrow) subjectModerationEyebrow.textContent = `${apiLabel(subject.kind, 'singular', true)} moderation`;
  if (subjectModerationTitle) subjectModerationTitle.textContent = `${subject.subjectName || `Untitled ${apiLabel(subject.kind)}`} moderation`;
  if (subjectModerationSubtitle) {
    subjectModerationSubtitle.textContent = `Review student membership, approve queued posts, and act on reported ${apiLabel(subject.kind)} content.`;
  }
  if (subjectModerationMessage) subjectModerationMessage.textContent = '';
  if (openCourseSpacesModalButton) {
    openCourseSpacesModalButton.classList.add('is-hidden');
  }
  if (subjectModerationMembers) subjectModerationMembers.innerHTML = '<p class="subject-empty">Loading members...</p>';
  if (subjectModerationPendingPosts) subjectModerationPendingPosts.innerHTML = '<p class="subject-empty">Loading post requests...</p>';
  if (subjectModerationReports) subjectModerationReports.innerHTML = '<p class="subject-empty">Loading reports...</p>';
  openModal(subjectModerationModal);
  await loadSubjectModeration(subject.id);
}

function renderModerationEmpty(target, text) {
  if (!target) return;
  target.innerHTML = `<p class="subject-empty">${escapeHtml(text)}</p>`;
}

async function performMemberModerationAction(subjectId, memberUid, action) {
  let endpoint = '';
  const payload = {};
  if (action === 'warn') {
    endpoint = `/api/subjects/${encodeURIComponent(subjectId)}/members/${encodeURIComponent(memberUid)}/warn`;
    payload.reason = window.prompt('Warning reason (optional):', '') || '';
  } else if (action === 'suspend') {
    endpoint = `/api/subjects/${encodeURIComponent(subjectId)}/members/${encodeURIComponent(memberUid)}/suspend`;
    payload.reason = window.prompt('Suspension reason (optional):', '') || '';
    const hoursRaw = window.prompt('Suspend duration in hours (1-8760):', '72');
    if (hoursRaw === null) return;
    const hours = Number(hoursRaw);
    if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
      window.alert('Enter a whole number between 1 and 8760.');
      return;
    }
    payload.durationHours = hours;
  } else if (action === 'restore') {
    endpoint = `/api/subjects/${encodeURIComponent(subjectId)}/members/${encodeURIComponent(memberUid)}/restore`;
  } else if (action === 'ban-request') {
    endpoint = `/api/subjects/${encodeURIComponent(subjectId)}/members/${encodeURIComponent(memberUid)}/ban-request`;
    payload.reason = window.prompt('Ban request reason:', '') || '';
    payload.note = window.prompt('Admin note (optional):', '') || '';
  }
  if (!endpoint) return;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to complete moderation action.');
  }
  if (subjectModerationMessage) subjectModerationMessage.textContent = data.message || 'Moderation action applied.';
  await loadSubjectModeration(subjectId);
}

async function handlePendingPostAction(subjectId, postId, action) {
  const endpoint = action === 'approve'
    ? `/api/subjects/${encodeURIComponent(subjectId)}/posts/${encodeURIComponent(postId)}/approve`
    : `/api/subjects/${encodeURIComponent(subjectId)}/posts/${encodeURIComponent(postId)}/reject`;
  const payload = {};
  if (action === 'reject') {
    payload.note = window.prompt('Rejection note (optional):', '') || '';
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to update post approval.');
  }
  if (subjectModerationMessage) subjectModerationMessage.textContent = data.message || 'Moderation action applied.';
  if (action === 'approve' && ['depadmin', 'professor'].includes(state.viewerRole)) {
    closeModal(subjectModerationModal);
  }
  await Promise.all([loadSubjectModeration(subjectId), fetchAndRenderSubjectFeed(subjectId), loadSubjectsBootstrap()]);
}

async function handleReportModerationAction(subjectId, report) {
  const statusSelect = document.querySelector(`select[data-report-status="${report.sourceType}:${report.id}"]`);
  const actionSelect = document.querySelector(`select[data-report-action="${report.sourceType}:${report.id}"]`);
  const status = statusSelect ? statusSelect.value : 'open';
  const moderationAction = actionSelect ? actionSelect.value : 'none';
  const payload = { status, moderationAction };
  payload.note = window.prompt('Moderation note (optional):', '') || '';
  if (moderationAction === 'suspend_target_user') {
    const hoursRaw = window.prompt('Suspend duration in hours (1-8760):', '72');
    if (hoursRaw === null) return;
    const hours = Number(hoursRaw);
    if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
      window.alert('Enter a whole number between 1 and 8760.');
      return;
    }
    payload.durationHours = hours;
  }

  const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/reports/${encodeURIComponent(report.sourceType)}/${encodeURIComponent(report.id)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to apply moderation action.');
  }
  if (subjectModerationMessage) subjectModerationMessage.textContent = data.message || 'Moderation action applied.';
  await Promise.all([loadSubjectModeration(subjectId), fetchAndRenderSubjectFeed(subjectId), loadSubjectsBootstrap()]);
}

function renderModerationMembers(subjectId, members) {
  if (!subjectModerationMembers) return;
  if (subjectModerationMembersCount) subjectModerationMembersCount.textContent = String(members.length);
  if (!members.length) {
    renderModerationEmpty(subjectModerationMembers, 'No registered students yet.');
    return;
  }

  subjectModerationMembers.innerHTML = '';
  members.forEach((member) => {
    const article = document.createElement('article');
    article.className = 'subject-moderation-card';

    const head = document.createElement('div');
    head.className = 'subject-moderation-card-head';
    head.appendChild(buildAvatarElement(member.photoLink, member.displayName, 'subject-post-avatar'));

    const meta = document.createElement('div');
    meta.className = 'subject-moderation-card-meta';
    meta.innerHTML = `
      <strong>${escapeHtml(member.displayName || 'Member')}</strong>
      <span>${escapeHtml(member.state)}</span>
      <span>Warnings: ${Number(member.warningCount || 0)} · Open ban requests: ${Number(member.openBanRequests || 0)}</span>
    `;
    head.appendChild(meta);
    article.appendChild(head);

    const detail = document.createElement('p');
    detail.className = 'subject-moderation-detail';
    detail.textContent = member.state === 'suspended' && member.suspendedUntil
      ? `Suspended until ${formatDateTime(member.suspendedUntil)}${member.suspendedReason ? ` · ${member.suspendedReason}` : ''}`
      : `Joined ${formatDateTime(member.joinedAt)}`;
    article.appendChild(detail);

    const actions = document.createElement('div');
    actions.className = 'subject-moderation-actions';
    const warnButton = document.createElement('button');
    warnButton.type = 'button';
    warnButton.className = 'secondary-button';
    warnButton.textContent = 'Warn';
    warnButton.addEventListener('click', async () => {
      try {
        await performMemberModerationAction(subjectId, member.uid, 'warn');
      } catch (error) {
        if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to issue warning.';
      }
    });
    actions.appendChild(warnButton);

    const suspendButton = document.createElement('button');
    suspendButton.type = 'button';
    suspendButton.className = member.state === 'suspended' ? 'secondary-button' : 'danger-button';
    suspendButton.textContent = member.state === 'suspended' ? 'Restore' : 'Suspend';
    suspendButton.addEventListener('click', async () => {
      try {
        await performMemberModerationAction(subjectId, member.uid, member.state === 'suspended' ? 'restore' : 'suspend');
      } catch (error) {
        if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to update suspension.';
      }
    });
    actions.appendChild(suspendButton);

    const banRequestButton = document.createElement('button');
    banRequestButton.type = 'button';
    banRequestButton.className = 'ghost-button';
    banRequestButton.textContent = 'Request ban';
    banRequestButton.addEventListener('click', async () => {
      try {
        await performMemberModerationAction(subjectId, member.uid, 'ban-request');
      } catch (error) {
        if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to submit ban request.';
      }
    });
    actions.appendChild(banRequestButton);

    article.appendChild(actions);
    subjectModerationMembers.appendChild(article);
  });
}

function renderModerationPendingPosts(subjectId, pendingPosts) {
  if (!subjectModerationPendingPosts) return;
  if (subjectModerationPendingCount) subjectModerationPendingCount.textContent = String(pendingPosts.length);
  if (!pendingPosts.length) {
    renderModerationEmpty(subjectModerationPendingPosts, 'No pending post requests.');
    return;
  }

  subjectModerationPendingPosts.innerHTML = '';
  pendingPosts.forEach((post) => {
    const article = document.createElement('article');
    article.className = 'subject-moderation-card';
    article.innerHTML = `
      <div class="subject-moderation-card-head">
        <div class="subject-moderation-card-meta">
          <strong>${escapeHtml(post.title || 'Untitled post')}</strong>
          <span>${escapeHtml(post.authorName || 'Member')} · ${escapeHtml(formatDateTime(post.approvalRequestedAt || post.createdAt))}</span>
        </div>
      </div>
      <p class="subject-moderation-detail">${escapeHtml(post.content || '')}</p>
    `;
    if (post.attachment?.link) {
      const attachment = document.createElement('a');
      attachment.href = post.attachment.link;
      attachment.target = '_blank';
      attachment.rel = 'noopener noreferrer';
      attachment.className = 'subject-post-attachment';
      attachment.innerHTML = `<img src="/assets/document.svg" alt="" /><span>${escapeHtml(post.attachment.title || 'Attached document')}</span>`;
      article.appendChild(attachment);
    }
    const actions = document.createElement('div');
    actions.className = 'subject-moderation-actions';
    const approveButton = document.createElement('button');
    approveButton.type = 'button';
    approveButton.className = 'primary-button';
    approveButton.textContent = 'Approve';
    approveButton.addEventListener('click', async () => {
      try {
        await handlePendingPostAction(subjectId, post.id, 'approve');
      } catch (error) {
        if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to approve post.';
      }
    });
    actions.appendChild(approveButton);

    const rejectButton = document.createElement('button');
    rejectButton.type = 'button';
    rejectButton.className = 'danger-button';
    rejectButton.textContent = 'Reject';
    rejectButton.addEventListener('click', async () => {
      try {
        await handlePendingPostAction(subjectId, post.id, 'reject');
      } catch (error) {
        if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to reject post.';
      }
    });
    actions.appendChild(rejectButton);

    article.appendChild(actions);
    subjectModerationPendingPosts.appendChild(article);
  });
}

function buildReportActionOptions(selected) {
  const options = [
    { value: 'none', label: 'No action' },
    { value: 'take_down_subject_post', label: 'Take down post' },
    { value: 'warn_target_user', label: 'Warn student' },
    { value: 'suspend_target_user', label: 'Suspend student' },
    { value: 'request_ban_target_user', label: 'Request ban' },
  ];
  return options
    .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
}

function buildReportStatusOptions(selected) {
  const options = [
    { value: 'open', label: 'Open' },
    { value: 'under_review', label: 'Under review' },
    { value: 'resolved_no_action', label: 'Resolved (no action)' },
    { value: 'rejected', label: 'Rejected' },
  ];
  return options
    .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
}

function renderModerationReports(subjectId, reports) {
  if (!subjectModerationReports) return;
  if (subjectModerationReportsCount) subjectModerationReportsCount.textContent = String(reports.length);
  if (!reports.length) {
    renderModerationEmpty(subjectModerationReports, 'No open reports.');
    return;
  }

  subjectModerationReports.innerHTML = '';
  reports.forEach((report) => {
    const key = `${report.sourceType}:${report.id}`;
    const article = document.createElement('article');
    article.className = 'subject-moderation-card';
    const reportSummary = report.sourceType === 'ai'
      ? `AI report · Risk ${report.riskLevel || 'unknown'}${report.riskScore !== null && report.riskScore !== undefined ? ` (${report.riskScore})` : ''}`
      : `Manual report · ${report.reporterName || 'Member'}`;
    const reasonText = report.sourceType === 'ai'
      ? report.summary || (Array.isArray(report.flags) ? report.flags.join(', ') : '')
      : report.reason || report.details || report.customReason || '';
    article.innerHTML = `
      <div class="subject-moderation-card-head">
        <div class="subject-moderation-card-meta">
          <strong>${escapeHtml(report.title || 'Untitled post')}</strong>
          <span>${escapeHtml(reportSummary)}</span>
          <span>${escapeHtml(report.authorName || 'Member')} · ${escapeHtml(formatDateTime(report.createdAt))}</span>
        </div>
      </div>
      <p class="subject-moderation-detail">${escapeHtml(reasonText || 'No report summary provided.')}</p>
      <div class="subject-report-actions-row">
        <select class="small-select" data-report-status="${escapeHtml(key)}">
          ${buildReportStatusOptions(report.status || 'open')}
        </select>
        <select class="small-select" data-report-action="${escapeHtml(key)}">
          ${buildReportActionOptions(report.moderationAction || 'none')}
        </select>
        <button type="button" class="secondary-button" data-report-apply="${escapeHtml(key)}">Apply</button>
      </div>
    `;
    const button = article.querySelector('button[data-report-apply]');
    button.addEventListener('click', async () => {
      try {
        await handleReportModerationAction(subjectId, report);
      } catch (error) {
        if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to apply moderation action.';
      }
    });
    subjectModerationReports.appendChild(article);
  });
}

function renderCourseSpacesTable() {
  if (!courseSpacesTableBody) return;
  const spaces = Array.isArray(state.courseSpaces.spaces) ? state.courseSpaces.spaces : [];
  if (!spaces.length) {
    courseSpacesTableBody.innerHTML = '<tr><td colspan="5" class="course-spaces-empty-cell subject-empty">No active units or threads found for this course.</td></tr>';
    return;
  }

  courseSpacesTableBody.innerHTML = spaces
    .map((space) => {
      const label = apiLabel(space.kind, 'singular', true);
      const currentTag = Number(space.id) === Number(state.moderation.subjectId) ? ' <span class="course-spaces-current-tag">Current</span>' : '';
      return `
        <tr>
          <td><span class="course-spaces-kind">${escapeHtml(label)}</span></td>
          <td>
            <div class="course-spaces-name">
              <span>${escapeHtml(space.subjectName || `Untitled ${apiLabel(space.kind)}`)}</span>${currentTag}
            </div>
          </td>
          <td>${escapeHtml(space.creatorName || 'System')}</td>
          <td>${escapeHtml(formatDateTime(space.createdAt))}</td>
          <td class="course-spaces-action-cell">
            <button
              type="button"
              class="danger-button course-spaces-delete-button"
              data-course-space-delete="${escapeHtml(space.id)}"
            >Delete</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function loadCourseSpacesManager(anchorSubjectId) {
  if (!anchorSubjectId) return;
  state.courseSpaces.anchorSubjectId = anchorSubjectId;
  if (courseSpacesMessage) courseSpacesMessage.textContent = '';
  if (courseSpacesTableBody) {
    courseSpacesTableBody.innerHTML = '<tr><td colspan="5" class="subject-empty">Loading course spaces...</td></tr>';
  }

  const response = await fetch(`/api/subjects/${encodeURIComponent(anchorSubjectId)}/course-spaces`);
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to load course spaces.');
  }

  state.courseSpaces.courseName = data.courseName || '';
  state.courseSpaces.spaces = Array.isArray(data.spaces) ? data.spaces : [];
  if (courseSpacesEyebrow) courseSpacesEyebrow.textContent = state.courseSpaces.courseName || 'Course spaces';
  if (courseSpacesTitle) courseSpacesTitle.textContent = `${state.courseSpaces.courseName || 'Course'} units and threads`;
  if (courseSpacesSubtitle) {
    courseSpacesSubtitle.textContent = 'Review active spaces in this course and remove obsolete units or threads when needed.';
  }
  renderCourseSpacesTable();
}

async function openCourseSpacesManager() {
  const anchorSubjectId = state.moderation.subjectId;
  if (!anchorSubjectId) return;
  if (courseSpacesMessage) courseSpacesMessage.textContent = '';
  openModal(courseSpacesModal);
  try {
    await loadCourseSpacesManager(anchorSubjectId);
  } catch (error) {
    if (courseSpacesMessage) courseSpacesMessage.textContent = error.message || 'Unable to load course spaces.';
  }
}

async function deleteCourseSpace(spaceId) {
  const anchorSubjectId = state.courseSpaces.anchorSubjectId || state.moderation.subjectId;
  if (!anchorSubjectId || !spaceId) return;
  const target = (state.courseSpaces.spaces || []).find((item) => Number(item.id) === Number(spaceId));
  const label = target ? `${apiLabel(target.kind)} "${target.subjectName || 'Untitled'}"` : 'this unit/thread';
  if (!window.confirm(`Delete ${label}? This hides it from the course list.`)) return;

  const response = await fetch(
    `/api/subjects/${encodeURIComponent(anchorSubjectId)}/course-spaces/${encodeURIComponent(spaceId)}`,
    { method: 'DELETE' }
  );
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to delete unit/thread.');
  }

  const deletedCurrentModeration = Number(spaceId) === Number(state.moderation.subjectId);
  if (courseSpacesMessage) courseSpacesMessage.textContent = data.message || 'Unit/thread deleted.';
  if (subjectModerationMessage) subjectModerationMessage.textContent = data.message || 'Unit/thread deleted.';

  await loadSubjectsBootstrap();

  if (deletedCurrentModeration) {
    closeModal(courseSpacesModal);
    closeModal(subjectModerationModal);
    state.moderation.subjectId = null;
    state.moderation.subject = null;
    return;
  }

  await Promise.all([
    loadCourseSpacesManager(anchorSubjectId),
    loadSubjectModeration(anchorSubjectId),
  ]);
}

async function loadSubjectModeration(subjectId) {
  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/moderation`);
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load moderation panel.');
    }
    state.moderation.subjectId = subjectId;
    state.moderation.subject = data.subject || null;
    state.moderation.members = Array.isArray(data.members) ? data.members : [];
    state.moderation.pendingPosts = Array.isArray(data.pendingPosts) ? data.pendingPosts : [];
    state.moderation.reports = Array.isArray(data.reports) ? data.reports : [];
    if (openCourseSpacesModalButton) {
      openCourseSpacesModalButton.classList.toggle('is-hidden', !(data.subject && data.subject.canManageCourseSpaces === true));
    }
    renderModerationMembers(subjectId, state.moderation.members);
    renderModerationPendingPosts(subjectId, state.moderation.pendingPosts);
    renderModerationReports(subjectId, state.moderation.reports);
  } catch (error) {
    if (subjectModerationMessage) subjectModerationMessage.textContent = error.message || 'Unable to load moderation panel.';
    renderModerationEmpty(subjectModerationMembers, 'Unable to load students.');
    renderModerationEmpty(subjectModerationPendingPosts, 'Unable to load post requests.');
    renderModerationEmpty(subjectModerationReports, 'Unable to load reports.');
  }
}

async function loadCurrentProfile() {
  try {
    const response = await fetch('/api/profile');
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) return;
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (_error) {
    // keep fallback avatar
  }
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
  if (!event.target.closest('.subject-post-menu-wrap')) {
    closeAllSubjectPostMenus();
  }
});

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (_error) {
      // best effort
    }
    window.location.href = '/login';
  });
}

if (subjectTabs) {
  subjectTabs.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    const nextTab = button.dataset.tab === 'thread' ? 'thread' : 'unit';
    if (state.activeTab === nextTab) return;
    state.activeTab = nextTab;
    state.selectedSubjectId = null;
    state.requestedPostId = null;
    await refreshSidebarSelection(`No ${apiLabel(nextTab, 'plural')} are available in this view.`);
  });
}

if (subjectSearchInput) {
  subjectSearchInput.addEventListener('input', async () => {
    state.subjectSearchQuery = subjectSearchInput.value || '';
    await refreshSidebarSelection(`No ${apiLabel(state.activeTab, 'plural')} match your search.`);
  });
}

if (toggleThreadsFilterPanelButton) {
  toggleThreadsFilterPanelButton.addEventListener('click', () => {
    state.threadsFilterPanelOpen = !state.threadsFilterPanelOpen;
    renderThreadFilterControls();
  });
}

if (threadCreatorFilter) {
  threadCreatorFilter.addEventListener('change', async () => {
    state.threadFilters.creator = threadCreatorFilter.value || 'all';
    await refreshSidebarSelection('No threads match the current filters.');
  });
}

if (threadSortFilter) {
  threadSortFilter.addEventListener('change', async () => {
    state.threadFilters.sort = normalizeThreadSortValue(threadSortFilter.value);
    await refreshSidebarSelection('No threads match the current filters.');
  });
}

if (clearThreadsFiltersButton) {
  clearThreadsFiltersButton.addEventListener('click', async () => {
    state.threadFilters.creator = 'all';
    state.threadFilters.sort = 'default';
    await refreshSidebarSelection('No threads match the current filters.');
  });
}

if (openCreateUnitModalButton) {
  openCreateUnitModalButton.addEventListener('click', () => configureCreateSubjectModal('unit'));
}

if (openCreateThreadModalButton) {
  openCreateThreadModalButton.addEventListener('click', () => configureCreateSubjectModal('thread'));
}

if (closeCreateSubjectModal) {
  closeCreateSubjectModal.addEventListener('click', () => closeModal(createSubjectModal));
}

if (createSubjectModal) {
  createSubjectModal.addEventListener('click', (event) => {
    if (event.target === createSubjectModal) closeModal(createSubjectModal);
  });
}

if (createSubjectForm) {
  createSubjectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (createSubjectMessage) createSubjectMessage.textContent = '';
    const formData = new FormData(createSubjectForm);
    const payload = {
      kind: formData.get('kind'),
      subjectName: formData.get('subjectName'),
      subjectCode: formData.get('subjectCode'),
      courseName: formData.get('courseName'),
      description: formData.get('description'),
    };

    try {
      const response = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to create item.');
      }
      closeModal(createSubjectModal);
      createSubjectForm.reset();
      state.activeTab = payload.kind === 'thread' ? 'thread' : 'unit';
      await loadSubjectsBootstrap();
      if (data.subject && data.subject.id) {
        state.selectedSubjectId = Number(data.subject.id);
        await fetchAndRenderSubjectFeed(state.selectedSubjectId);
      }
    } catch (error) {
      if (createSubjectMessage) createSubjectMessage.textContent = error.message || 'Unable to create item.';
    }
  });
}

if (openCreateSubjectPostModal) {
  openCreateSubjectPostModal.addEventListener('click', () => {
    const subject = getSelectedSubject();
    if (!subject) return;
    prepareCreatePostModal();
  });
}

if (closeCreateSubjectPostModal) {
  closeCreateSubjectPostModal.addEventListener('click', () => closeModal(createSubjectPostModal));
}

if (createSubjectPostModal) {
  createSubjectPostModal.addEventListener('click', (event) => {
    if (event.target === createSubjectPostModal) closeModal(createSubjectPostModal);
  });
}

if (createSubjectPostForm) {
  createSubjectPostForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const subject = getSelectedSubject();
    if (!subject) return;
    if (createSubjectPostMessage) createSubjectPostMessage.textContent = '';
    const formData = new FormData(createSubjectPostForm);
    const payload = {
      title: formData.get('title'),
      content: formData.get('content'),
      attachmentLibraryDocumentUuid: formData.get('attachmentLibraryDocumentUuid'),
    };
    const submitButton = createSubjectPostForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Posting...';
    }

    try {
      const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to create post.');
      }
      closeModal(createSubjectPostModal);
      createSubjectPostForm.reset();
      const createdApprovalStatus = String(data.post?.approvalStatus || 'approved').toLowerCase();
      const createdPostIsVisible = createdApprovalStatus === 'approved';
      state.requestedPostId = createdPostIsVisible && data.post?.id ? Number(data.post.id) : null;
      syncSubjectLocation(subject.id, state.requestedPostId);
      const refreshTasks = [fetchAndRenderSubjectFeed(subject.id), loadSubjectsBootstrap()];
      if (mySubjectPostsModal && !mySubjectPostsModal.classList.contains('is-hidden') && Number(state.myPosts.subjectId) === Number(subject.id)) {
        refreshTasks.push(loadMySubjectPosts(subject.id));
      }
      await Promise.all(refreshTasks);
      if (!createdPostIsVisible && data.message) {
        window.alert(data.message);
      }
    } catch (error) {
      if (createSubjectPostMessage) createSubjectPostMessage.textContent = error.message || 'Unable to create post.';
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Post';
      }
    }
  });
}

if (closeEditSubjectPostModal) {
  closeEditSubjectPostModal.addEventListener('click', () => closeEditSubjectPostDialog());
}

if (editSubjectPostModal) {
  editSubjectPostModal.addEventListener('click', (event) => {
    if (event.target === editSubjectPostModal) closeEditSubjectPostDialog();
  });
}

if (editSubjectPostForm) {
  editSubjectPostForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const subject = getSelectedSubject();
    if (!subject || !activeEditSubjectPostId) return;
    if (editSubjectPostMessage) editSubjectPostMessage.textContent = '';

    const formData = new FormData(editSubjectPostForm);
    const payload = {
      title: formData.get('title'),
      content: formData.get('content'),
      attachmentLibraryDocumentUuid: formData.get('attachmentLibraryDocumentUuid'),
    };
    const submitButton = editSubjectPostForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    try {
      const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(activeEditSubjectPostId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to update post.');
      }
      const editedPostId = activeEditSubjectPostId;
      const editedApprovalStatus = String(data.post?.approvalStatus || 'approved').toLowerCase();
      closeEditSubjectPostDialog();
      state.requestedPostId = editedApprovalStatus === 'approved' ? editedPostId : null;
      syncSubjectLocation(subject.id, state.requestedPostId);
      const refreshTasks = [fetchAndRenderSubjectFeed(subject.id), loadSubjectsBootstrap()];
      if (mySubjectPostsModal && !mySubjectPostsModal.classList.contains('is-hidden') && Number(state.myPosts.subjectId) === Number(subject.id)) {
        refreshTasks.push(loadMySubjectPosts(subject.id));
      }
      await Promise.all(refreshTasks);
      window.alert(data.message || 'Post updated.');
    } catch (error) {
      if (editSubjectPostMessage) editSubjectPostMessage.textContent = error.message || 'Unable to update post.';
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Save changes';
      }
    }
  });
}

if (openSubjectModerationModalButton) {
  openSubjectModerationModalButton.addEventListener('click', async () => {
    const subject = getSelectedSubject();
    if (!subject || subject.canModerate !== true) return;
    await openSubjectModeration(subject);
  });
}

if (openMySubjectPostsModalButton) {
  openMySubjectPostsModalButton.addEventListener('click', async () => {
    try {
      await openMySubjectPostsManager({ filterStatus: 'all', focusPostId: null });
    } catch (error) {
      if (mySubjectPostsMessage) mySubjectPostsMessage.textContent = error.message || 'Unable to load your posts.';
    }
  });
}

if (closeMySubjectPostsModal) {
  closeMySubjectPostsModal.addEventListener('click', () => closeMySubjectPostsManager());
}

if (mySubjectPostsModal) {
  mySubjectPostsModal.addEventListener('click', (event) => {
    if (event.target === mySubjectPostsModal) closeMySubjectPostsManager();
  });
}

if (closeSubjectModerationModal) {
  closeSubjectModerationModal.addEventListener('click', () => closeModal(subjectModerationModal));
}

if (subjectModerationModal) {
  subjectModerationModal.addEventListener('click', (event) => {
    if (event.target === subjectModerationModal) closeModal(subjectModerationModal);
  });
}

if (openCourseSpacesModalButton) {
  openCourseSpacesModalButton.addEventListener('click', async () => {
    try {
      await openCourseSpacesManager();
    } catch (error) {
      if (courseSpacesMessage) courseSpacesMessage.textContent = error.message || 'Unable to load course spaces.';
    }
  });
}

if (closeCourseSpacesModal) {
  closeCourseSpacesModal.addEventListener('click', () => closeModal(courseSpacesModal));
}

if (courseSpacesModal) {
  courseSpacesModal.addEventListener('click', (event) => {
    if (event.target === courseSpacesModal) closeModal(courseSpacesModal);
  });
}

if (courseSpacesTableBody) {
  courseSpacesTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-course-space-delete]');
    if (!button) return;
    try {
      await deleteCourseSpace(button.dataset.courseSpaceDelete);
    } catch (error) {
      if (courseSpacesMessage) courseSpacesMessage.textContent = error.message || 'Unable to delete unit/thread.';
    }
  });
}

if (openSubjectAiModalButton) {
  openSubjectAiModalButton.addEventListener('click', async () => {
    const subject = getSelectedSubject();
    if (!subject) return;
    await openSubjectAiChatModal(subject);
  });
}

if (closeSubjectAiModal) {
  closeSubjectAiModal.addEventListener('click', () => closeSubjectAiChatModal());
}

if (closeSubjectPostAiModal) {
  closeSubjectPostAiModal.addEventListener('click', () => closeSubjectPostAiChatModal());
}

if (subjectAiModal) {
  subjectAiModal.addEventListener('click', (event) => {
    if (event.target === subjectAiModal) closeSubjectAiChatModal();
  });
}

if (subjectPostAiModal) {
  subjectPostAiModal.addEventListener('click', (event) => {
    if (event.target === subjectPostAiModal) closeSubjectPostAiChatModal();
  });
}

if (subjectAiForm) {
  subjectAiForm.addEventListener('submit', sendSubjectAiMessage);
}

if (subjectPostAiForm) {
  subjectPostAiForm.addEventListener('submit', sendSubjectPostAiMessage);
}

async function initSubjectsPage() {
  await Promise.all([loadCurrentProfile(), loadSubjectsBootstrap()]);
  await applyInitialMyPostsSelection();
}

initSubjectsPage();
