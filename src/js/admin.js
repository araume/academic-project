const pageMessage = document.getElementById('pageMessage');
const adminRoleBadge = document.getElementById('adminRoleBadge');

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const logsTableBody = document.getElementById('logsTableBody');
const logsQuery = document.getElementById('logsQuery');
const logsExecutor = document.getElementById('logsExecutor');
const logsCourse = document.getElementById('logsCourse');
const logsSort = document.getElementById('logsSort');
const refreshLogs = document.getElementById('refreshLogs');

const reportsTableBody = document.getElementById('reportsTableBody');
const reportsQuery = document.getElementById('reportsQuery');
const reportsCourse = document.getElementById('reportsCourse');
const reportsSource = document.getElementById('reportsSource');
const reportsStatus = document.getElementById('reportsStatus');
const refreshReports = document.getElementById('refreshReports');

const accountsTableBody = document.getElementById('accountsTableBody');
const accountsQuery = document.getElementById('accountsQuery');
const accountsCourse = document.getElementById('accountsCourse');
const accountsRoleFilter = document.getElementById('accountsRoleFilter');
const accountsStatusFilter = document.getElementById('accountsStatusFilter');
const refreshAccounts = document.getElementById('refreshAccounts');

const moderatorCommunity = document.getElementById('moderatorCommunity');
const moderatorTargetUid = document.getElementById('moderatorTargetUid');
const assignModerator = document.getElementById('assignModerator');
const removeModerator = document.getElementById('removeModerator');
const moderatorMessage = document.getElementById('moderatorMessage');

const contentQuery = document.getElementById('contentQuery');
const contentCourse = document.getElementById('contentCourse');
const contentStatus = document.getElementById('contentStatus');
const refreshContent = document.getElementById('refreshContent');
const contentTabButtons = document.querySelectorAll('.content-tab');
const contentTableHead = document.getElementById('contentTableHead');
const contentTableBody = document.getElementById('contentTableBody');

let viewerRole = 'member';
let currentContentTab = 'main-posts';

function escapeHtml(value) {
  const stringValue = String(value ?? '');
  return stringValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setPageMessage(text, type = 'error') {
  if (!pageMessage) return;
  pageMessage.textContent = text || '';
  pageMessage.style.color = type === 'success' ? '#2f9e68' : '#9f3f36';
}

function setInlineMessage(target, text, type = 'error') {
  if (!target) return;
  target.textContent = text || '';
  target.classList.toggle('success', type === 'success');
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function activateTab(tab) {
  tabButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
  tabPanels.forEach((panel) => panel.classList.toggle('is-active', panel.id === `panel-${tab}`));
}

function renderEmptyRow(target, columns, text = 'No records found.') {
  target.innerHTML = `<tr><td class="empty-row" colspan="${columns}">${escapeHtml(text)}</td></tr>`;
}

async function loadAdminContext() {
  const data = await apiRequest('/api/admin/me');
  if (!data.allowed) {
    window.location.href = '/home';
    return;
  }
  viewerRole = data.role || 'member';
  if (adminRoleBadge) {
    adminRoleBadge.textContent = `Role: ${viewerRole}`;
  }
}

async function loadLogs() {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '50',
  });
  if (logsQuery && logsQuery.value.trim()) params.set('q', logsQuery.value.trim());
  if (logsExecutor && logsExecutor.value.trim()) params.set('executorUid', logsExecutor.value.trim());
  if (logsCourse && logsCourse.value.trim()) params.set('course', logsCourse.value.trim());
  if (logsSort && logsSort.value) params.set('sort', logsSort.value);

  try {
    const data = await apiRequest(`/api/admin/logs?${params.toString()}`);
    if (!data.logs.length) {
      renderEmptyRow(logsTableBody, 5);
      return;
    }

    logsTableBody.innerHTML = data.logs
      .map(
        (log) => `
          <tr>
            <td>${escapeHtml(log.id)}</td>
            <td>${escapeHtml(log.actionType)}</td>
            <td>${escapeHtml(log.executor || '')}</td>
            <td>${escapeHtml(log.course || '-')}</td>
            <td>${escapeHtml(new Date(log.createdAt).toLocaleString())}</td>
          </tr>`
      )
      .join('');
  } catch (error) {
    renderEmptyRow(logsTableBody, 5, error.message);
  }
}

async function loadReports() {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '50',
  });
  if (reportsQuery && reportsQuery.value.trim()) params.set('q', reportsQuery.value.trim());
  if (reportsCourse && reportsCourse.value.trim()) params.set('course', reportsCourse.value.trim());
  if (reportsSource && reportsSource.value) params.set('source', reportsSource.value);
  if (reportsStatus && reportsStatus.value) params.set('status', reportsStatus.value);

  try {
    const data = await apiRequest(`/api/admin/reports?${params.toString()}`);
    if (!data.reports.length) {
      renderEmptyRow(reportsTableBody, 7);
      return;
    }

    reportsTableBody.innerHTML = data.reports
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.source)}</td>
            <td>${escapeHtml(item.targetName || item.targetId || '-')}</td>
            <td>${escapeHtml(item.reporterName || '-')}</td>
            <td>${escapeHtml(item.status || 'open')}</td>
            <td>${escapeHtml(item.reason || '-')}</td>
            <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
          </tr>`
      )
      .join('');
  } catch (error) {
    renderEmptyRow(reportsTableBody, 7, error.message);
  }
}

function buildRoleControl(uid, role) {
  if (viewerRole !== 'owner') {
    return `<span>${escapeHtml(role)}</span>`;
  }
  return `
    <div class="row-actions">
      <select class="small-select" data-role-select="${escapeHtml(uid)}">
        <option value="member" ${role === 'member' ? 'selected' : ''}>member</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>admin</option>
      </select>
      <button class="secondary-button" data-action="save-role" data-uid="${escapeHtml(uid)}">Save role</button>
    </div>
  `;
}

function buildBanControl(uid, status, userType) {
  const isBanned = status === 'banned';
  const canToggle =
    viewerRole === 'owner' || (viewerRole === 'admin' && userType === 'member');
  if (!canToggle || uid === '') {
    return '';
  }
  return `
    <button class="${isBanned ? 'secondary-button' : 'danger-button'}" data-action="toggle-ban" data-uid="${escapeHtml(
      uid
    )}" data-banned="${isBanned ? 'true' : 'false'}">
      ${isBanned ? 'Unban' : 'Ban'}
    </button>
  `;
}

async function loadAccounts() {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '60',
  });
  if (accountsQuery && accountsQuery.value.trim()) params.set('q', accountsQuery.value.trim());
  if (accountsCourse && accountsCourse.value.trim()) params.set('course', accountsCourse.value.trim());
  if (accountsRoleFilter && accountsRoleFilter.value) params.set('role', accountsRoleFilter.value);
  if (accountsStatusFilter && accountsStatusFilter.value) params.set('status', accountsStatusFilter.value);

  try {
    const data = await apiRequest(`/api/admin/accounts?${params.toString()}`);
    if (!data.accounts.length) {
      renderEmptyRow(accountsTableBody, 9);
      return;
    }

    accountsTableBody.innerHTML = data.accounts
      .map((account) => {
        const roleControl = buildRoleControl(account.uid, account.userType);
        const banControl = buildBanControl(account.uid, account.status, account.userType);
        return `
          <tr>
            <td>${escapeHtml(account.uid)}</td>
            <td>${escapeHtml(account.username || '-')}</td>
            <td>${escapeHtml(account.displayName || '-')}</td>
            <td>${escapeHtml(account.email || '-')}</td>
            <td>${roleControl}</td>
            <td>${escapeHtml(account.recoveryEmail || '-')}</td>
            <td>${escapeHtml(account.status)}</td>
            <td>${escapeHtml(new Date(account.dateRegistered).toLocaleString())}</td>
            <td><div class="row-actions">${banControl}</div></td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    renderEmptyRow(accountsTableBody, 9, error.message);
  }
}

async function loadCommunities() {
  if (!moderatorCommunity) return;
  try {
    const data = await apiRequest('/api/admin/communities');
    moderatorCommunity.innerHTML = '<option value="">Select community</option>';
    data.communities.forEach((community) => {
      const option = document.createElement('option');
      option.value = String(community.id);
      option.textContent = community.courseName;
      moderatorCommunity.appendChild(option);
    });
  } catch (error) {
    moderatorCommunity.innerHTML = '<option value="">Unable to load communities</option>';
  }
}

async function handleModeratorAction(action) {
  setInlineMessage(moderatorMessage, '');
  const communityId = moderatorCommunity ? moderatorCommunity.value : '';
  const targetUid = moderatorTargetUid ? moderatorTargetUid.value.trim() : '';
  if (!communityId || !targetUid) {
    setInlineMessage(moderatorMessage, 'Community and target UID are required.');
    return;
  }

  try {
    const data = await apiRequest(`/api/admin/communities/${encodeURIComponent(communityId)}/moderators/${encodeURIComponent(targetUid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setInlineMessage(moderatorMessage, data.message || 'Moderator role updated.', 'success');
  } catch (error) {
    setInlineMessage(moderatorMessage, error.message);
  }
}

function setContentHeaders(tab) {
  const headers = {
    'main-posts': '<tr><th>ID</th><th>Title</th><th>Course</th><th>Uploader</th><th>Date</th><th>Actions</th></tr>',
    'main-comments':
      '<tr><th>ID</th><th>Post</th><th>Content</th><th>Author</th><th>Date</th><th>Actions</th></tr>',
    'community-posts':
      '<tr><th>ID</th><th>Title</th><th>Course</th><th>Status</th><th>Author</th><th>Date</th><th>Actions</th></tr>',
    'community-comments':
      '<tr><th>ID</th><th>Post</th><th>Course</th><th>Status</th><th>Author</th><th>Date</th><th>Actions</th></tr>',
    'library-documents':
      '<tr><th>UUID</th><th>Title</th><th>Course</th><th>Uploader</th><th>Date</th><th>Actions</th></tr>',
  };
  contentTableHead.innerHTML = headers[tab] || '';
}

async function loadContent() {
  const q = contentQuery ? contentQuery.value.trim() : '';
  const course = contentCourse ? contentCourse.value.trim() : '';
  const status = contentStatus ? contentStatus.value : '';
  let endpoint = '';
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (q) params.set('q', q);
  if (course) params.set('course', course);

  if (currentContentTab === 'main-posts') {
    endpoint = '/api/admin/content/main-posts';
  } else if (currentContentTab === 'main-comments') {
    endpoint = '/api/admin/content/main-comments';
  } else if (currentContentTab === 'community-posts') {
    endpoint = '/api/admin/content/community-posts';
    if (status) params.set('status', status);
  } else if (currentContentTab === 'community-comments') {
    endpoint = '/api/admin/content/community-comments';
    if (status) params.set('status', status);
  } else if (currentContentTab === 'library-documents') {
    endpoint = '/api/admin/content/library-documents';
  }

  try {
    const data = await apiRequest(`${endpoint}?${params.toString()}`);
    let rows = [];

    if (currentContentTab === 'main-posts') {
      rows = data.posts || [];
      if (!rows.length) {
        renderEmptyRow(contentTableBody, 6);
        return;
      }
      contentTableBody.innerHTML = rows
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.course || '-')}</td>
              <td>${escapeHtml(item.uploaderName || '-')}</td>
              <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
              <td><button class="danger-button" data-action="delete-main-post" data-id="${escapeHtml(item.id)}">Delete</button></td>
            </tr>`
        )
        .join('');
      return;
    }

    if (currentContentTab === 'main-comments') {
      rows = data.comments || [];
      if (!rows.length) {
        renderEmptyRow(contentTableBody, 6);
        return;
      }
      contentTableBody.innerHTML = rows
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.postTitle)}</td>
              <td>${escapeHtml(item.content)}</td>
              <td>${escapeHtml(item.authorName || '-')}</td>
              <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
              <td><button class="danger-button" data-action="delete-main-comment" data-id="${escapeHtml(item.id)}">Delete</button></td>
            </tr>`
        )
        .join('');
      return;
    }

    if (currentContentTab === 'community-posts') {
      rows = data.posts || [];
      if (!rows.length) {
        renderEmptyRow(contentTableBody, 7);
        return;
      }
      contentTableBody.innerHTML = rows
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.course || '-')}</td>
              <td>${escapeHtml(item.status)}</td>
              <td>${escapeHtml(item.authorName || '-')}</td>
              <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
              <td>
                ${
                  item.status === 'taken_down'
                    ? '<span>Taken down</span>'
                    : `<button class="danger-button" data-action="takedown-community-post" data-id="${escapeHtml(
                        item.id
                      )}">Take down</button>`
                }
              </td>
            </tr>`
        )
        .join('');
      return;
    }

    if (currentContentTab === 'community-comments') {
      rows = data.comments || [];
      if (!rows.length) {
        renderEmptyRow(contentTableBody, 7);
        return;
      }
      contentTableBody.innerHTML = rows
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.postTitle)}</td>
              <td>${escapeHtml(item.course || '-')}</td>
              <td>${escapeHtml(item.status)}</td>
              <td>${escapeHtml(item.authorName || '-')}</td>
              <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
              <td>
                ${
                  item.status === 'taken_down'
                    ? '<span>Taken down</span>'
                    : `<button class="danger-button" data-action="takedown-community-comment" data-id="${escapeHtml(
                        item.id
                      )}">Take down</button>`
                }
              </td>
            </tr>`
        )
        .join('');
      return;
    }

    rows = data.documents || [];
    if (!rows.length) {
      renderEmptyRow(contentTableBody, 6);
      return;
    }
    contentTableBody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.uuid)}</td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.course || '-')}</td>
            <td>${escapeHtml(item.uploaderName || '-')}</td>
            <td>${escapeHtml(new Date(item.uploadedAt).toLocaleString())}</td>
            <td><button class="danger-button" data-action="delete-library-document" data-id="${escapeHtml(
              item.uuid
            )}">Delete</button></td>
          </tr>`
      )
      .join('');
  } catch (error) {
    renderEmptyRow(contentTableBody, 7, error.message);
  }
}

accountsTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const uid = button.dataset.uid;
  const action = button.dataset.action;
  if (!uid) return;

  if (action === 'save-role') {
    const select = Array.from(accountsTableBody.querySelectorAll('select[data-role-select]')).find(
      (item) => item.dataset.roleSelect === uid
    );
    const role = select ? select.value : '';
    if (!role) return;
    try {
      await apiRequest(`/api/admin/accounts/${encodeURIComponent(uid)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      setPageMessage('Role updated.', 'success');
      loadAccounts();
    } catch (error) {
      setPageMessage(error.message);
    }
    return;
  }

  if (action === 'toggle-ban') {
    const currentlyBanned = button.dataset.banned === 'true';
    const shouldBan = !currentlyBanned;
    let reason = '';
    if (shouldBan) {
      reason = window.prompt('Ban reason (optional):', '') || '';
    }
    try {
      await apiRequest(`/api/admin/accounts/${encodeURIComponent(uid)}/ban`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: shouldBan, reason }),
      });
      setPageMessage(shouldBan ? 'Account banned.' : 'Account unbanned.', 'success');
      loadAccounts();
    } catch (error) {
      setPageMessage(error.message);
    }
  }
});

contentTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  try {
    if (action === 'delete-main-post') {
      if (!window.confirm('Delete this main feed post?')) return;
      await apiRequest(`/api/admin/content/main-posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } else if (action === 'delete-main-comment') {
      if (!window.confirm('Delete this main feed comment?')) return;
      await apiRequest(`/api/admin/content/main-comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } else if (action === 'takedown-community-post') {
      const reason = window.prompt('Reason for takedown (optional):', '') || '';
      await apiRequest(`/api/admin/content/community-posts/${encodeURIComponent(id)}/takedown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    } else if (action === 'takedown-community-comment') {
      const reason = window.prompt('Reason for takedown (optional):', '') || '';
      await apiRequest(`/api/admin/content/community-comments/${encodeURIComponent(id)}/takedown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    } else if (action === 'delete-library-document') {
      if (!window.confirm('Delete this library document?')) return;
      await apiRequest(`/api/admin/content/library-documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }

    setPageMessage('Content action completed.', 'success');
    loadContent();
  } catch (error) {
    setPageMessage(error.message);
  }
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activateTab(button.dataset.tab);
  });
});

contentTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    contentTabButtons.forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    currentContentTab = button.dataset.contentTab;
    setContentHeaders(currentContentTab);
    loadContent();
  });
});

if (refreshLogs) refreshLogs.addEventListener('click', loadLogs);
if (refreshReports) refreshReports.addEventListener('click', loadReports);
if (refreshAccounts) refreshAccounts.addEventListener('click', loadAccounts);
if (refreshContent) refreshContent.addEventListener('click', loadContent);

if (assignModerator) {
  assignModerator.addEventListener('click', () => handleModeratorAction('assign'));
}

if (removeModerator) {
  removeModerator.addEventListener('click', () => handleModeratorAction('remove'));
}

async function init() {
  try {
    await loadAdminContext();
    await Promise.all([loadCommunities(), loadLogs(), loadReports(), loadAccounts()]);
    setContentHeaders(currentContentTab);
    await loadContent();
  } catch (error) {
    setPageMessage(error.message);
    setTimeout(() => {
      window.location.href = '/home';
    }, 800);
  }
}

init();
