const SEARCHABLE_THRESHOLD = 8;
const DEFAULT_SUSPENSION_HOURS = 72;

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
const reportedUnitPostsBody = document.getElementById('reportedUnitPostsBody');

const documentsCount = document.getElementById('documentsCount');
const homePostsCount = document.getElementById('homePostsCount');
const unitPostsCount = document.getElementById('unitPostsCount');
const reportedUnitPostsCount = document.getElementById('reportedUnitPostsCount');

const documentsSearchWrap = document.getElementById('documentsSearchWrap');
const documentsSearchInput = document.getElementById('documentsSearchInput');
const homePostsSearchWrap = document.getElementById('homePostsSearchWrap');
const homePostsSearchInput = document.getElementById('homePostsSearchInput');
const unitPostsSearchWrap = document.getElementById('unitPostsSearchWrap');
const unitPostsSearchInput = document.getElementById('unitPostsSearchInput');
const reportsSearchWrap = document.getElementById('reportsSearchWrap');
const reportsSearchInput = document.getElementById('reportsSearchInput');
const reportsSourceFilter = document.getElementById('reportsSourceFilter');
const reportsStatusFilter = document.getElementById('reportsStatusFilter');

const REPORT_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved_no_action', label: 'Resolved with no action' },
  { value: 'rejected', label: 'Rejected' },
];

const state = {
  assignments: [],
  selectedCourse: '',
  loading: false,
  documents: [],
  homePosts: [],
  unitPosts: [],
  reportedUnitPosts: [],
  search: {
    documents: '',
    homePosts: '',
    unitPosts: '',
    reports: '',
  },
  reportFilters: {
    source: 'all',
    status: 'all',
  },
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function sameCourseName(left, right) {
  return normalizeSearchValue(left) && normalizeSearchValue(left) === normalizeSearchValue(right);
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

function formatRiskScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}/100` : 'No score';
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

function renderTableEmptyState(text) {
  if (!reportedUnitPostsBody) return;
  reportedUnitPostsBody.innerHTML = `
    <tr>
      <td colspan="3">
        <div class="table-empty-state">${escapeHtml(text)}</div>
      </td>
    </tr>
  `;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function hasSearchOrFilter(value) {
  return Boolean(normalizeSearchValue(value));
}

function setSearchVisibility(wrapper, itemCount, currentValue) {
  if (!wrapper) return;
  wrapper.hidden = itemCount < SEARCHABLE_THRESHOLD && !hasSearchOrFilter(currentValue);
}

function setCountValue(element, totalCount, filteredCount, isFiltered) {
  if (!element) return;
  element.textContent = isFiltered ? `${filteredCount}/${totalCount}` : String(totalCount);
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
    if (state.selectedCourse && sameCourseName(assignment.courseName, state.selectedCourse)) {
      pill.classList.add('is-active');
    }
    pill.textContent = assignment.courseName || 'Assigned department';
    departmentAssignments.appendChild(pill);
  });
}

function matchesSearch(query, values) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

function filterDocuments(items) {
  return items.filter((item) =>
    matchesSearch(state.search.documents, [
      item.title,
      item.filename,
      item.course,
      item.subject,
      item.visibility,
      item.source,
      item.uploaderName,
    ])
  );
}

function filterHomePosts(items) {
  return items.filter((item) =>
    matchesSearch(state.search.homePosts, [
      item.title,
      item.content,
      item.course,
      item.visibility,
      item.uploaderName,
    ])
  );
}

function filterUnitPosts(items) {
  return items.filter((item) =>
    matchesSearch(state.search.unitPosts, [
      item.title,
      item.content,
      item.course,
      item.subjectName,
      item.authorName,
      item.authorUid,
    ])
  );
}

function filterReportedUnitPosts(items) {
  return items.filter((item) => {
    if (state.reportFilters.source !== 'all' && item.sourceType !== state.reportFilters.source) {
      return false;
    }
    if (state.reportFilters.status !== 'all' && item.status !== state.reportFilters.status) {
      return false;
    }
    return matchesSearch(state.search.reports, [
      item.title,
      item.content,
      item.course,
      item.subjectName,
      item.authorName,
      item.reason,
      item.reporterName,
      item.category,
      item.customReason,
      item.details,
      item.summary,
      Array.isArray(item.flags) ? item.flags.join(' ') : '',
      item.riskLevel,
      item.reportSourceLabel,
    ]);
  });
}

function getStatusLabel(status) {
  switch (status) {
    case 'under_review':
      return 'Under review';
    case 'resolved_action_taken':
      return 'Resolved with action';
    case 'resolved_no_action':
      return 'Resolved with no action';
    case 'rejected':
      return 'Rejected';
    case 'open':
    default:
      return 'Open';
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'under_review':
      return 'is-under-review';
    case 'resolved_action_taken':
      return 'is-resolved-action';
    case 'resolved_no_action':
      return 'is-resolved-no-action';
    case 'rejected':
      return 'is-rejected';
    case 'open':
    default:
      return 'is-open';
  }
}

function getRiskLevelClass(level) {
  switch (normalizeSearchValue(level)) {
    case 'critical':
      return 'is-critical';
    case 'high':
      return 'is-high';
    case 'medium':
      return 'is-medium';
    case 'low':
      return 'is-low';
    default:
      return 'is-neutral';
  }
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
      <p class="moderation-copy">${escapeHtml(item.course || 'No course')} • ${escapeHtml(item.subject || 'No unit')}</p>
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
      const result = await apiRequest(`/api/department/documents/${encodeURIComponent(item.uuid)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      await loadDashboard();
      setMessage(result.message || 'Document approval updated.');
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
  const subjectOrVisibility = type === 'unit' ? item.subjectName || 'No unit' : item.visibility || 'public';
  const actorLabel = type === 'unit' ? 'Author' : 'Uploader';
  const actorName = type === 'unit' ? item.authorName || item.authorUid || 'Member' : item.uploaderName || 'Member';

  article.innerHTML = `
    <div class="moderation-meta">
      <span class="meta-pill">${escapeHtml(item.course || 'No course')}</span>
      <span class="meta-pill">${escapeHtml(subjectOrVisibility)}</span>
      <span class="meta-pill">${escapeHtml(`${Number(item.likesCount || 0)} likes`)}</span>
      <span class="meta-pill">${escapeHtml(`${Number(item.commentsCount || 0)} comments`)}</span>
    </div>
    <div>
      <h3>${escapeHtml(item.title || 'Untitled post')}</h3>
      <p class="moderation-copy">${escapeHtml(truncateText(item.content || '', 340))}</p>
      <p class="moderation-copy">${escapeHtml(actorLabel)}: ${escapeHtml(actorName)}</p>
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
      const result = await apiRequest(
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
      setMessage(result.message || 'Content taken down.');
    } catch (error) {
      setMessage(error.message || 'Unable to take down content.');
    } finally {
      takedownButton.disabled = false;
    }
  });

  return article;
}

function renderDocumentList(items) {
  if (!documentsList) return;
  if (!items.length) {
    renderEmptyState(
      documentsList,
      hasSearchOrFilter(state.search.documents)
        ? 'No pending uploads match this search.'
        : 'No pending document approvals for this department.'
    );
    return;
  }
  documentsList.innerHTML = '';
  items.forEach((item) => {
    documentsList.appendChild(buildDocumentCard(item));
  });
}

function renderHomePosts(items) {
  if (!homePostsList) return;
  if (!items.length) {
    renderEmptyState(
      homePostsList,
      hasSearchOrFilter(state.search.homePosts)
        ? 'No course-exclusive home posts match this search.'
        : 'No active course-exclusive home posts found.'
    );
    return;
  }
  homePostsList.innerHTML = '';
  items.forEach((item) => {
    homePostsList.appendChild(buildModerationCard(item, 'home'));
  });
}

function renderUnitPosts(items) {
  if (!unitPostsList) return;
  if (!items.length) {
    renderEmptyState(
      unitPostsList,
      hasSearchOrFilter(state.search.unitPosts)
        ? 'No unit posts match this search.'
        : 'No active unit posts found for this department.'
    );
    return;
  }
  unitPostsList.innerHTML = '';
  items.forEach((item) => {
    unitPostsList.appendChild(buildModerationCard(item, 'unit'));
  });
}

function buildActionOptions(item) {
  if (item.sourceType === 'ai') {
    return [
      { value: 'none', label: 'No direct action' },
      { value: 'take_down_target', label: 'Take down unit post' },
      { value: 'suspend_target_user', label: 'Suspend author' },
    ];
  }
  return [
    { value: 'none', label: 'No direct action' },
    { value: 'take_down_subject_post', label: 'Take down unit post' },
    { value: 'suspend_target_user', label: 'Suspend author' },
  ];
}

function buildReportRow(item) {
  const row = document.createElement('tr');
  row.className = item.sourceType === 'ai' ? 'report-row is-ai-row' : 'report-row is-manual-row';

  const actionOptions = buildActionOptions(item)
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('');
  const statusOptions = REPORT_STATUS_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.value)}"${option.value === item.status ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
  ).join('');

  const detailMarkup =
    item.sourceType === 'ai'
      ? `
        <div class="report-facts">
          <span class="meta-pill ${escapeHtml(getRiskLevelClass(item.riskLevel))}">${escapeHtml((item.riskLevel || 'unknown').toUpperCase())}</span>
          <span class="meta-pill">Score ${escapeHtml(formatRiskScore(item.riskScore))}</span>
          <span class="meta-pill">${escapeHtml(item.recommendedAction || 'review')}</span>
        </div>
        <p class="report-copy">AI summary: ${escapeHtml(truncateText(item.summary || 'No summary provided.', 240))}</p>
        ${Array.isArray(item.flags) && item.flags.length ? `<p class="report-copy">Flags: ${escapeHtml(item.flags.join(', '))}</p>` : ''}
      `
      : `
        <div class="report-facts">
          <span class="meta-pill">Reporter: ${escapeHtml(item.reporterName || 'Member')}</span>
          ${item.category ? `<span class="meta-pill">${escapeHtml(item.category)}</span>` : ''}
          ${item.customReason ? `<span class="meta-pill">${escapeHtml(item.customReason)}</span>` : ''}
        </div>
        <p class="report-copy">Reason: ${escapeHtml(item.reason || 'No reason provided.')}</p>
        ${item.details ? `<p class="report-copy">Details: ${escapeHtml(truncateText(item.details, 220))}</p>` : ''}
      `;

  row.innerHTML = `
    <td>
      <div class="report-cell">
        <div class="report-pill-row">
          <span class="source-chip ${item.sourceType === 'ai' ? 'is-ai' : 'is-manual'}">${escapeHtml(item.reportSourceLabel || 'Report')}</span>
          <span class="status-chip ${escapeHtml(getStatusClass(item.status))}">${escapeHtml(getStatusLabel(item.status))}</span>
        </div>
        <h3 class="report-title">${escapeHtml(item.title || 'Untitled unit post')}</h3>
        <p class="report-copy">${escapeHtml(truncateText(item.content || '', 220))}</p>
        <p class="report-copy">Author: ${escapeHtml(item.authorName || item.authorUid || 'Member')}</p>
        <p class="report-copy">${escapeHtml(item.course || 'No course')} • ${escapeHtml(item.subjectName || 'No unit')}</p>
        <p class="report-copy">Reported: ${escapeHtml(formatDate(item.createdAt))}</p>
      </div>
    </td>
    <td>
      <div class="report-cell">
        ${detailMarkup}
      </div>
    </td>
    <td>
      <div class="report-cell">
        <div class="report-form-grid">
          <label class="field-inline">
            <span>Review status</span>
            <select data-role="status">${statusOptions}</select>
          </label>
          <label class="field-inline">
            <span>Action</span>
            <select data-role="action">${actionOptions}</select>
          </label>
          <label class="field-inline is-compact" data-role="durationWrap" hidden>
            <span>Suspend for hours</span>
            <input data-role="duration" type="number" min="1" max="8760" value="${DEFAULT_SUSPENSION_HOURS}" />
          </label>
          <label class="field-inline field-inline-wide">
            <span>Moderator note</span>
            <textarea data-role="note" rows="3" placeholder="Optional note for this report..."></textarea>
          </label>
        </div>
        <p class="form-hint" data-role="hint">Use status changes when the report still needs review. Taking action automatically resolves it.</p>
        <div class="moderation-actions-row">
          <button type="button" class="primary-action" data-role="apply">Apply action</button>
        </div>
      </div>
    </td>
  `;

  const statusSelect = row.querySelector('[data-role="status"]');
  const actionSelect = row.querySelector('[data-role="action"]');
  const durationWrap = row.querySelector('[data-role="durationWrap"]');
  const durationInput = row.querySelector('[data-role="duration"]');
  const noteInput = row.querySelector('[data-role="note"]');
  const hint = row.querySelector('[data-role="hint"]');
  const applyButton = row.querySelector('[data-role="apply"]');

  function syncReportFormState() {
    const selectedAction = actionSelect.value || 'none';
    const isTakingAction = selectedAction !== 'none';
    statusSelect.disabled = isTakingAction;
    durationWrap.hidden = selectedAction !== 'suspend_target_user';
    hint.textContent = isTakingAction
      ? 'This action will resolve the report immediately. DepAdmins cannot issue bans from this panel.'
      : 'Use status changes when the report still needs review. Taking action automatically resolves it.';
  }

  actionSelect.addEventListener('change', syncReportFormState);
  syncReportFormState();

  applyButton.addEventListener('click', async () => {
    applyButton.disabled = true;
    actionSelect.disabled = true;
    statusSelect.disabled = true;
    if (durationInput) durationInput.disabled = true;
    if (noteInput) noteInput.disabled = true;
    setMessage('');

    try {
      const endpoint =
        item.sourceType === 'ai'
          ? `/api/department/unit-post-ai-reports/${encodeURIComponent(item.id)}/action`
          : `/api/department/unit-post-reports/${encodeURIComponent(item.id)}/action`;
      const payload = {
        status: statusSelect.value || 'open',
        moderationAction: actionSelect.value || 'none',
        note: noteInput ? noteInput.value.trim() : '',
        suspendDurationHours: durationInput ? Number(durationInput.value || DEFAULT_SUSPENSION_HOURS) : DEFAULT_SUSPENSION_HOURS,
      };
      const result = await apiRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await loadDashboard();
      setMessage(result.message || 'Report updated.');
    } catch (error) {
      setMessage(error.message || 'Unable to update report.');
    } finally {
      applyButton.disabled = false;
      actionSelect.disabled = false;
      if (durationInput) durationInput.disabled = false;
      if (noteInput) noteInput.disabled = false;
      syncReportFormState();
    }
  });

  return row;
}

function renderReportedUnitPosts(items) {
  if (!reportedUnitPostsBody) return;
  if (!items.length) {
    const hasFilters =
      hasSearchOrFilter(state.search.reports) || state.reportFilters.source !== 'all' || state.reportFilters.status !== 'all';
    renderTableEmptyState(
      hasFilters
        ? 'No reported unit posts match the current search or filters.'
        : 'No reported unit posts are waiting for department moderation.'
    );
    return;
  }

  reportedUnitPostsBody.innerHTML = '';
  items.forEach((item) => {
    reportedUnitPostsBody.appendChild(buildReportRow(item));
  });
}

function renderLoadingState() {
  renderEmptyState(documentsList, 'Loading pending document approvals...');
  renderEmptyState(homePostsList, 'Loading course-exclusive home posts...');
  renderEmptyState(unitPostsList, 'Loading unit posts...');
  renderTableEmptyState('Loading reported unit posts...');
}

function renderDashboard() {
  const filteredDocuments = filterDocuments(state.documents);
  const filteredHomePosts = filterHomePosts(state.homePosts);
  const filteredUnitPosts = filterUnitPosts(state.unitPosts);
  const filteredReports = filterReportedUnitPosts(state.reportedUnitPosts);

  setSearchVisibility(documentsSearchWrap, state.documents.length, state.search.documents);
  setSearchVisibility(homePostsSearchWrap, state.homePosts.length, state.search.homePosts);
  setSearchVisibility(unitPostsSearchWrap, state.unitPosts.length, state.search.unitPosts);
  setSearchVisibility(reportsSearchWrap, state.reportedUnitPosts.length, state.search.reports);

  setCountValue(documentsCount, state.documents.length, filteredDocuments.length, hasSearchOrFilter(state.search.documents));
  setCountValue(homePostsCount, state.homePosts.length, filteredHomePosts.length, hasSearchOrFilter(state.search.homePosts));
  setCountValue(unitPostsCount, state.unitPosts.length, filteredUnitPosts.length, hasSearchOrFilter(state.search.unitPosts));
  setCountValue(
    reportedUnitPostsCount,
    state.reportedUnitPosts.length,
    filteredReports.length,
    hasSearchOrFilter(state.search.reports) || state.reportFilters.source !== 'all' || state.reportFilters.status !== 'all'
  );

  if (reportsSourceFilter) reportsSourceFilter.disabled = state.reportedUnitPosts.length === 0;
  if (reportsStatusFilter) reportsStatusFilter.disabled = state.reportedUnitPosts.length === 0;

  renderAssignments(state.assignments);
  renderDocumentList(filteredDocuments);
  renderHomePosts(filteredHomePosts);
  renderUnitPosts(filteredUnitPosts);
  renderReportedUnitPosts(filteredReports);
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
    state.documents = Array.isArray(data.documents) ? data.documents : [];
    state.homePosts = Array.isArray(data.homePosts) ? data.homePosts : [];
    state.unitPosts = Array.isArray(data.unitPosts) ? data.unitPosts : [];
    state.reportedUnitPosts = Array.isArray(data.reportedUnitPosts) ? data.reportedUnitPosts : [];

    populateCourseFilter(state.assignments);
    renderDashboard();
    setMessage('');
  } catch (error) {
    state.documents = [];
    state.homePosts = [];
    state.unitPosts = [];
    state.reportedUnitPosts = [];
    setCountValue(documentsCount, 0, 0, false);
    setCountValue(homePostsCount, 0, 0, false);
    setCountValue(unitPostsCount, 0, 0, false);
    setCountValue(reportedUnitPostsCount, 0, 0, false);
    renderEmptyState(documentsList, 'Unable to load pending document approvals.');
    renderEmptyState(homePostsList, 'Unable to load course-exclusive home posts.');
    renderEmptyState(unitPostsList, 'Unable to load unit posts.');
    renderTableEmptyState('Unable to load reported unit posts.');
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

function bindSearchInput(input, key) {
  if (!input) return;
  input.addEventListener('input', () => {
    state.search[key] = input.value || '';
    renderDashboard();
  });
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

bindSearchInput(documentsSearchInput, 'documents');
bindSearchInput(homePostsSearchInput, 'homePosts');
bindSearchInput(unitPostsSearchInput, 'unitPosts');
bindSearchInput(reportsSearchInput, 'reports');

if (reportsSourceFilter) {
  reportsSourceFilter.addEventListener('change', () => {
    state.reportFilters.source = reportsSourceFilter.value || 'all';
    renderDashboard();
  });
}

if (reportsStatusFilter) {
  reportsStatusFilter.addEventListener('change', () => {
    state.reportFilters.status = reportsStatusFilter.value || 'all';
    renderDashboard();
  });
}

loadNavAvatar();
loadDashboard();
