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

const restrictedTableBody = document.getElementById('restrictedTableBody');
const restrictedQuery = document.getElementById('restrictedQuery');
const restrictedStatus = document.getElementById('restrictedStatus');
const restrictedSource = document.getElementById('restrictedSource');
const refreshRestricted = document.getElementById('refreshRestricted');
const purgeExpiredRestricted = document.getElementById('purgeExpiredRestricted');

const appealsTableBody = document.getElementById('appealsTableBody');
const appealsQuery = document.getElementById('appealsQuery');
const appealsStatus = document.getElementById('appealsStatus');
const appealsType = document.getElementById('appealsType');
const refreshAppeals = document.getElementById('refreshAppeals');

const customNotifyMode = document.getElementById('customNotifyMode');
const customNotifyUids = document.getElementById('customNotifyUids');
const customNotifyCourse = document.getElementById('customNotifyCourse');
const customNotifyTitle = document.getElementById('customNotifyTitle');
const customNotifyMessageBody = document.getElementById('customNotifyMessageBody');
const customNotifyIncludeSelf = document.getElementById('customNotifyIncludeSelf');
const customNotifyIncludeBanned = document.getElementById('customNotifyIncludeBanned');
const sendCustomNotification = document.getElementById('sendCustomNotification');
const customNotificationMessage = document.getElementById('customNotificationMessage');
const aiUsageDays = document.getElementById('aiUsageDays');
const refreshAiUsage = document.getElementById('refreshAiUsage');
const aiTotalCalls = document.getElementById('aiTotalCalls');
const aiOpenAiCalls = document.getElementById('aiOpenAiCalls');
const aiMcpCalls = document.getElementById('aiMcpCalls');
const aiRiskEvents = document.getElementById('aiRiskEvents');
const aiUsageTableBody = document.getElementById('aiUsageTableBody');
const aiEventsTableBody = document.getElementById('aiEventsTableBody');
const reloadAiFeatures = document.getElementById('reloadAiFeatures');
const saveAiFeatures = document.getElementById('saveAiFeatures');
const aiFeatureToggleScan = document.getElementById('aiFeatureToggleScan');
const aiFeatureToggleRoomSummary = document.getElementById('aiFeatureToggleRoomSummary');
const aiFeatureToggleMcp = document.getElementById('aiFeatureToggleMcp');
const aiFeatureToggleScanMeta = document.getElementById('aiFeatureToggleScanMeta');
const aiFeatureToggleRoomSummaryMeta = document.getElementById('aiFeatureToggleRoomSummaryMeta');
const aiFeatureToggleMcpMeta = document.getElementById('aiFeatureToggleMcpMeta');
const aiFeaturesMessage = document.getElementById('aiFeaturesMessage');

const accountsTableBody = document.getElementById('accountsTableBody');
const accountsQuery = document.getElementById('accountsQuery');
const accountsCourse = document.getElementById('accountsCourse');
const accountsRoleFilter = document.getElementById('accountsRoleFilter');
const accountsStatusFilter = document.getElementById('accountsStatusFilter');
const refreshAccounts = document.getElementById('refreshAccounts');
const professorCodesTableBody = document.getElementById('professorCodesTableBody');
const professorCodesQuery = document.getElementById('professorCodesQuery');
const professorCodesStatusFilter = document.getElementById('professorCodesStatusFilter');
const refreshProfessorCodes = document.getElementById('refreshProfessorCodes');
const professorCodeBatchCount = document.getElementById('professorCodeBatchCount');
const professorCodeLength = document.getElementById('professorCodeLength');
const professorCodeExpiresDays = document.getElementById('professorCodeExpiresDays');
const generateProfessorCodes = document.getElementById('generateProfessorCodes');
const generatedProfessorCodesOutput = document.getElementById('generatedProfessorCodesOutput');
const professorCodesMessage = document.getElementById('professorCodesMessage');

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
const aboutTitle = document.getElementById('aboutTitle');
const aboutSubtitle = document.getElementById('aboutSubtitle');
const aboutOverview = document.getElementById('aboutOverview');
const aboutHighlights = document.getElementById('aboutHighlights');
const aboutCommitments = document.getElementById('aboutCommitments');
const aboutContactEmail = document.getElementById('aboutContactEmail');
const saveAboutPage = document.getElementById('saveAboutPage');
const reloadAboutPage = document.getElementById('reloadAboutPage');
const aboutPageMessage = document.getElementById('aboutPageMessage');
const faqTitle = document.getElementById('faqTitle');
const faqSubtitle = document.getElementById('faqSubtitle');
const faqItems = document.getElementById('faqItems');
const saveFaqPage = document.getElementById('saveFaqPage');
const reloadFaqPage = document.getElementById('reloadFaqPage');
const faqPageMessage = document.getElementById('faqPageMessage');
const mobileAppTitle = document.getElementById('mobileAppTitle');
const mobileAppSubtitle = document.getElementById('mobileAppSubtitle');
const mobileAppDescription = document.getElementById('mobileAppDescription');
const mobileAppQrImageUrl = document.getElementById('mobileAppQrImageUrl');
const mobileAppQrAltText = document.getElementById('mobileAppQrAltText');
const mobileAppDownloadUrl = document.getElementById('mobileAppDownloadUrl');
const mobileAppDownloadLabel = document.getElementById('mobileAppDownloadLabel');
const saveMobileAppPage = document.getElementById('saveMobileAppPage');
const reloadMobileAppPage = document.getElementById('reloadMobileAppPage');
const mobileAppPageMessage = document.getElementById('mobileAppPageMessage');
const spacesCommunitySelect = document.getElementById('spacesCommunitySelect');
const spacesCommunityDescription = document.getElementById('spacesCommunityDescription');
const saveSpacesCommunity = document.getElementById('saveSpacesCommunity');
const reloadSpacesCommunities = document.getElementById('reloadSpacesCommunities');
const spacesCommunityMessage = document.getElementById('spacesCommunityMessage');
const spacesRoomContextLabel = document.getElementById('spacesRoomContextLabel');
const saveSpacesRoom = document.getElementById('saveSpacesRoom');
const reloadSpacesRooms = document.getElementById('reloadSpacesRooms');
const spacesRoomMessage = document.getElementById('spacesRoomMessage');

let viewerRole = 'member';
let viewerUid = '';
let currentContentTab = 'main-posts';
let cachedCommunities = [];

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

function normalizeActionTargetUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '';
  }
  return trimmed.slice(0, 512);
}

function normalizeUidListFromText(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString();
}

function formatDeadlineLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const now = Date.now();
  const diffMs = date.getTime() - now;
  if (diffMs <= 0) {
    return `Expired (${date.toLocaleString()})`;
  }
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) {
    return `${hours}h left (${date.toLocaleString()})`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d left (${date.toLocaleString()})`;
}

async function loadAdminContext() {
  const data = await apiRequest('/api/admin/me');
  if (!data.allowed) {
    window.location.href = '/home';
    return;
  }
  viewerRole = data.role || 'member';
  viewerUid = data.uid || '';
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
        (log) => {
          const targetUrl = normalizeActionTargetUrl(log.targetUrl || '');
          const actionCell = targetUrl
            ? `<a href="${escapeHtml(targetUrl)}">${escapeHtml(log.actionType)}</a>`
            : escapeHtml(log.actionType);
          return `
          <tr>
            <td>${escapeHtml(log.id)}</td>
            <td>${actionCell}</td>
            <td>${escapeHtml(log.executor || '')}</td>
            <td>${escapeHtml(log.course || '-')}</td>
            <td>${escapeHtml(new Date(log.createdAt).toLocaleString())}</td>
          </tr>`;
        }
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
      renderEmptyRow(reportsTableBody, 9);
      return;
    }

    const reportStatusOptions = [
      { value: 'open', label: 'Open' },
      { value: 'under_review', label: 'Under review' },
      { value: 'resolved_action_taken', label: 'Resolved (action taken)' },
      { value: 'resolved_no_action', label: 'Resolved (no action)' },
      { value: 'rejected', label: 'Rejected' },
    ];
    const reportActionOptionsBySource = {
      profile: [
        { value: 'none', label: 'No moderation action' },
        { value: 'ban_target_user', label: 'Ban reported user' },
      ],
      community: [
        { value: 'none', label: 'No moderation action' },
        { value: 'take_down_community_post', label: 'Restrict community post' },
        { value: 'take_down_community_comment', label: 'Restrict community comment' },
        { value: 'ban_target_user', label: 'Ban reported user' },
      ],
      main_post: [
        { value: 'none', label: 'No moderation action' },
        { value: 'delete_main_post', label: 'Restrict main post' },
        { value: 'ban_target_user', label: 'Ban reported user' },
      ],
      library_document: [
        { value: 'none', label: 'No moderation action' },
        { value: 'delete_library_document', label: 'Restrict document' },
        { value: 'ban_target_user', label: 'Ban reported user' },
      ],
      chat_message: [
        { value: 'none', label: 'No moderation action' },
        { value: 'delete_chat_message', label: 'Delete chat message' },
        { value: 'ban_target_user', label: 'Ban reported user' },
      ],
    };

    const buildOptionMarkup = (options, selected) =>
      options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}" ${option.value === selected ? 'selected' : ''}>${escapeHtml(
              option.label
            )}</option>`
        )
        .join('');

    reportsTableBody.innerHTML = data.reports
      .map((item) => {
        const categoryLabel =
          item.category === 'other'
            ? item.customReason || 'Other'
            : item.category
              ? item.category.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
              : '-';
        const reasonText = item.reason || item.details || '';
        const statusOptions = buildOptionMarkup(reportStatusOptions, item.status || 'open');
        let sourceActions = reportActionOptionsBySource[item.source] || reportActionOptionsBySource.profile;
        if (item.source === 'community' && item.targetType !== 'post') {
          sourceActions = sourceActions.filter((option) => option.value !== 'take_down_community_post');
        }
        if (item.source === 'community' && item.targetType !== 'comment') {
          sourceActions = sourceActions.filter((option) => option.value !== 'take_down_community_comment');
        }
        const selectedAction = item.moderationAction || 'none';
        const actionOptions = buildOptionMarkup(sourceActions, selectedAction);
        const reportKey = escapeHtml(item.id);
        return `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.source)}</td>
            <td>${escapeHtml(item.targetName || item.targetId || '-')}</td>
            <td>${escapeHtml(item.reporterName || '-')}</td>
            <td>${escapeHtml(categoryLabel)}</td>
            <td>
              <select class="small-select" data-report-status="${reportKey}">
                ${statusOptions}
              </select>
            </td>
            <td>${escapeHtml(reasonText || '-')}</td>
            <td>
              <div class="row-actions">
                <select class="small-select" data-report-action="${reportKey}">
                  ${actionOptions}
                </select>
                <button class="secondary-button" data-action="apply-report-action" data-report-id="${reportKey}">Apply</button>
              </div>
            </td>
            <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td>
          </tr>`;
      })
      .join('');
  } catch (error) {
    renderEmptyRow(reportsTableBody, 9, error.message);
  }
}

async function loadRestrictedContents() {
  if (!restrictedTableBody) return;
  const params = new URLSearchParams({
    page: '1',
    pageSize: '80',
  });
  if (restrictedQuery && restrictedQuery.value.trim()) params.set('q', restrictedQuery.value.trim());
  if (restrictedStatus && restrictedStatus.value) params.set('status', restrictedStatus.value);
  if (restrictedSource && restrictedSource.value) params.set('source', restrictedSource.value);

  try {
    const data = await apiRequest(`/api/admin/restricted-contents?${params.toString()}`);
    const rows = Array.isArray(data.items) ? data.items : [];
    if (!rows.length) {
      renderEmptyRow(restrictedTableBody, 8);
      return;
    }

    restrictedTableBody.innerHTML = rows
      .map((item) => {
        const actionButtons = [];
        if (item.status === 'restricted') {
          actionButtons.push(
            `<button class="secondary-button" data-action="restore-restricted" data-id="${escapeHtml(item.id)}">Restore</button>`
          );
          actionButtons.push(
            `<button class="danger-button" data-action="purge-restricted" data-id="${escapeHtml(item.id)}">Purge</button>`
          );
        } else if (item.status === 'restored') {
          actionButtons.push(
            `<button class="danger-button" data-action="purge-restricted" data-id="${escapeHtml(item.id)}">Purge</button>`
          );
        }

        return `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.source)}</td>
            <td>${escapeHtml(item.targetType || '-')}<br /><small>${escapeHtml(item.targetId || '-')}</small></td>
            <td>${escapeHtml(item.status)}</td>
            <td>${escapeHtml(formatDateTime(item.hiddenAt))}</td>
            <td>${escapeHtml(formatDeadlineLabel(item.restoreDeadlineAt))}</td>
            <td>${escapeHtml(item.reason || '-')}</td>
            <td><div class="row-actions">${actionButtons.join('') || '<span>-</span>'}</div></td>
          </tr>`;
      })
      .join('');
  } catch (error) {
    renderEmptyRow(restrictedTableBody, 8, error.message);
  }
}

async function loadAppeals() {
  if (!appealsTableBody) return;
  const params = new URLSearchParams({
    page: '1',
    pageSize: '80',
  });
  if (appealsQuery && appealsQuery.value.trim()) params.set('q', appealsQuery.value.trim());
  if (appealsStatus && appealsStatus.value) params.set('status', appealsStatus.value);
  if (appealsType && appealsType.value) params.set('type', appealsType.value);

  try {
    const data = await apiRequest(`/api/admin/appeals?${params.toString()}`);
    const rows = Array.isArray(data.appeals) ? data.appeals : [];
    if (!rows.length) {
      renderEmptyRow(appealsTableBody, 8);
      return;
    }

    appealsTableBody.innerHTML = rows
      .map((item) => {
        const isClosed = ['accepted', 'denied', 'withdrawn'].includes(item.status);
        const actionCell = isClosed
          ? '<span>-</span>'
          : `<div class="row-actions">
               <select class="small-select" data-appeal-status="${escapeHtml(item.id)}">
                 <option value="under_review" ${item.status === 'under_review' ? 'selected' : ''}>Under review</option>
                 <option value="accepted">Accept</option>
                 <option value="denied">Deny</option>
               </select>
               <button class="secondary-button" data-action="resolve-appeal" data-id="${escapeHtml(item.id)}">Apply</button>
             </div>`;
        const resolutionText = item.resolutionNote || (item.resolvedByName ? `Resolved by ${item.resolvedByName}` : '-');
        return `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.appellantName || item.appellantUid || '-')}</td>
            <td>${escapeHtml(item.type)}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>${escapeHtml(item.message || '-')}</td>
            <td>${escapeHtml(resolutionText)}</td>
            <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            <td>${actionCell}</td>
          </tr>`;
      })
      .join('');
  } catch (error) {
    renderEmptyRow(appealsTableBody, 8, error.message);
  }
}

async function sendCustomNotificationRequest() {
  if (!sendCustomNotification) return;
  setInlineMessage(customNotificationMessage, '');

  const mode = customNotifyMode ? customNotifyMode.value : 'uids';
  const uids = normalizeUidListFromText(customNotifyUids ? customNotifyUids.value : '');
  const payload = {
    mode,
    uids,
    course: customNotifyCourse ? customNotifyCourse.value.trim() : '',
    title: customNotifyTitle ? customNotifyTitle.value.trim() : '',
    message: customNotifyMessageBody ? customNotifyMessageBody.value.trim() : '',
    includeSelf: Boolean(customNotifyIncludeSelf && customNotifyIncludeSelf.checked),
    includeBanned: Boolean(customNotifyIncludeBanned && customNotifyIncludeBanned.checked),
  };

  if (!payload.title || !payload.message) {
    setInlineMessage(customNotificationMessage, 'Title and message are required.');
    return;
  }
  if (mode === 'uids' && !uids.length) {
    setInlineMessage(customNotificationMessage, 'Provide at least one UID for user-targeted notifications.');
    return;
  }
  if (mode === 'course' && !payload.course) {
    setInlineMessage(customNotificationMessage, 'Course is required when mode is set to course.');
    return;
  }

  try {
    const data = await apiRequest('/api/admin/notifications/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setInlineMessage(
      customNotificationMessage,
      `Sent to ${Number(data.inserted || 0)} recipient(s).`,
      'success'
    );
    setPageMessage('Custom notifications sent.', 'success');
  } catch (error) {
    setInlineMessage(customNotificationMessage, error.message);
  }
}

function renderAiUsageSummary(dailyUsage, events) {
  if (!aiTotalCalls || !aiOpenAiCalls || !aiMcpCalls || !aiRiskEvents) return;
  let totalCalls = 0;
  let openAiCalls = 0;
  let mcpCalls = 0;
  (dailyUsage || []).forEach((row) => {
    const calls = Number(row.call_count || 0) || 0;
    totalCalls += calls;
    if (row.provider === 'mcp') {
      mcpCalls += calls;
    } else {
      openAiCalls += calls;
    }
  });
  const risky = (events || []).filter((event) => event.status === 'blocked' || event.status === 'error').length;
  aiTotalCalls.textContent = formatNumber(totalCalls);
  aiOpenAiCalls.textContent = formatNumber(openAiCalls);
  aiMcpCalls.textContent = formatNumber(mcpCalls);
  aiRiskEvents.textContent = formatNumber(risky);
}

async function loadAiUsage() {
  if (!aiUsageTableBody || !aiEventsTableBody) return;
  const days = aiUsageDays && aiUsageDays.value ? aiUsageDays.value : '14';
  try {
    const data = await apiRequest(`/api/admin/ai-usage?days=${encodeURIComponent(days)}`);
    const dailyUsage = Array.isArray(data.dailyUsage) ? data.dailyUsage : [];
    const recentEvents = Array.isArray(data.recentEvents) ? data.recentEvents : [];
    renderAiUsageSummary(dailyUsage, recentEvents);

    if (!dailyUsage.length) {
      renderEmptyRow(aiUsageTableBody, 7);
    } else {
      aiUsageTableBody.innerHTML = dailyUsage
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.usage_date || '-')}</td>
              <td>${escapeHtml(row.uid || '-')}</td>
              <td>${escapeHtml(row.provider || '-')}</td>
              <td>${escapeHtml(row.metric_key || '-')}</td>
              <td>${escapeHtml(formatNumber(row.call_count))}</td>
              <td>${escapeHtml(formatNumber(row.input_chars))}</td>
              <td>${escapeHtml(formatNumber(row.output_chars))}</td>
            </tr>`
        )
        .join('');
    }

    if (!recentEvents.length) {
      renderEmptyRow(aiEventsTableBody, 7);
      return;
    }
    aiEventsTableBody.innerHTML = recentEvents
      .map((event) => {
        const scope = event.scope_id ? `${event.scope_type}:${event.scope_id}` : (event.scope_type || '-');
        const statusClass = event.status === 'success' ? 'success' : event.status === 'blocked' ? 'blocked' : 'error';
        return `
          <tr>
            <td>${escapeHtml(formatDateTime(event.created_at))}</td>
            <td>${escapeHtml(event.actor_uid || '-')}</td>
            <td>${escapeHtml(event.provider || '-')}</td>
            <td>${escapeHtml(event.event_type || '-')}</td>
            <td>${escapeHtml(scope)}</td>
            <td><span class="status-pill ${statusClass}">${escapeHtml(event.status || '-')}</span></td>
            <td>${escapeHtml(event.latency_ms == null ? '-' : formatNumber(event.latency_ms))}</td>
          </tr>`;
      })
      .join('');
  } catch (error) {
    renderAiUsageSummary([], []);
    renderEmptyRow(aiUsageTableBody, 7, error.message);
    renderEmptyRow(aiEventsTableBody, 7, error.message);
  }
}

const aiFeatureToggleConfig = {
  ai_scan: {
    input: aiFeatureToggleScan,
    meta: aiFeatureToggleScanMeta,
  },
  room_ai_summary: {
    input: aiFeatureToggleRoomSummary,
    meta: aiFeatureToggleRoomSummaryMeta,
  },
  gcloud_mcp: {
    input: aiFeatureToggleMcp,
    meta: aiFeatureToggleMcpMeta,
  },
};

function setAiFeatureControlsDisabled(disabled) {
  [reloadAiFeatures, saveAiFeatures].forEach((element) => {
    if (element) element.disabled = disabled;
  });
  Object.values(aiFeatureToggleConfig).forEach((config) => {
    if (config.input) {
      config.input.disabled = disabled;
    }
  });
}

function renderAiFeatureStates(features) {
  const featureMap = new Map((features || []).map((feature) => [feature.key, feature]));
  Object.entries(aiFeatureToggleConfig).forEach(([key, config]) => {
    const feature = featureMap.get(key);
    if (config.input) {
      config.input.checked = feature ? feature.enabled === true : false;
    }
    if (config.meta) {
      if (!feature) {
        config.meta.textContent = 'No data.';
      } else {
        const source = feature.source === 'admin_override' ? 'Admin override' : 'Environment default';
        const defaultLabel = feature.defaultEnabled ? 'enabled' : 'disabled';
        config.meta.textContent = `${source} • Env default: ${defaultLabel}`;
      }
    }
  });
}

async function loadAiFeatureStates() {
  if (!aiFeaturesMessage) return;
  setInlineMessage(aiFeaturesMessage, '');
  setAiFeatureControlsDisabled(true);
  try {
    const data = await apiRequest('/api/admin/ai-features');
    renderAiFeatureStates(Array.isArray(data.features) ? data.features : []);
  } catch (error) {
    setInlineMessage(aiFeaturesMessage, error.message);
  } finally {
    setAiFeatureControlsDisabled(false);
  }
}

async function saveAiFeatureStates() {
  if (!aiFeaturesMessage) return;
  setInlineMessage(aiFeaturesMessage, '');
  const features = Object.entries(aiFeatureToggleConfig).map(([key, config]) => ({
    key,
    enabled: Boolean(config.input && config.input.checked),
  }));
  setAiFeatureControlsDisabled(true);
  try {
    const data = await apiRequest('/api/admin/ai-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
    });
    renderAiFeatureStates(Array.isArray(data.features) ? data.features : []);
    setInlineMessage(aiFeaturesMessage, 'AI feature toggles saved.', 'success');
  } catch (error) {
    setInlineMessage(aiFeaturesMessage, error.message);
  } finally {
    setAiFeatureControlsDisabled(false);
  }
}

function buildRoleControl(uid, role) {
  const normalizedRole = role || 'member';
  if (viewerRole !== 'owner') {
    return `<span>${escapeHtml(formatRoleLabel(normalizedRole))}</span>`;
  }
  return `
    <div class="row-actions">
      <select class="small-select" data-role-select="${escapeHtml(uid)}">
        <option value="member" ${normalizedRole === 'member' ? 'selected' : ''}>student</option>
        <option value="professor" ${normalizedRole === 'professor' ? 'selected' : ''}>professor</option>
        <option value="admin" ${normalizedRole === 'admin' ? 'selected' : ''}>admin</option>
      </select>
      <button class="secondary-button" data-action="save-role" data-uid="${escapeHtml(uid)}">Save role</button>
    </div>
  `;
}

function formatRoleLabel(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner') return 'Owner';
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'professor') return 'Professor';
  return 'Student';
}

function buildEmailVerificationPill(isVerified) {
  if (isVerified) {
    return '<span class="status-pill email-verified">Verified</span>';
  }
  return '<span class="status-pill email-pending">Pending</span>';
}

function normalizeIdVerificationStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'approved' || status === 'rejected') return status;
  return 'pending';
}

function buildIdVerificationPill(status) {
  const normalized = normalizeIdVerificationStatus(status);
  if (normalized === 'approved') {
    return '<span class="status-pill verification-approved">Approved</span>';
  }
  if (normalized === 'rejected') {
    return '<span class="status-pill verification-rejected">Rejected</span>';
  }
  return '<span class="status-pill verification-pending">Pending</span>';
}

function buildIdVerificationControl(account) {
  const status = normalizeIdVerificationStatus(account && account.idVerificationStatus);
  const note = account && account.idVerificationNote ? String(account.idVerificationNote).trim() : '';
  const reviewerName = account && account.idVerifiedByName ? String(account.idVerifiedByName).trim() : '';
  const reviewedAt = account && account.idVerifiedAt ? formatDateTime(account.idVerifiedAt) : '';
  const canReview = ['owner', 'admin', 'professor'].includes(viewerRole) && account && account.uid && account.uid !== viewerUid;

  const lines = [buildIdVerificationPill(status)];
  if (reviewerName || reviewedAt) {
    lines.push(`<small class="meta-note">By ${escapeHtml(reviewerName || account.idVerifiedByUid || 'Unknown')} • ${escapeHtml(reviewedAt || '-')}</small>`);
  }
  if (note) {
    lines.push(`<small class="meta-note">${escapeHtml(note)}</small>`);
  }
  if (canReview && status !== 'approved') {
    lines.push(
      `<div class="row-actions">
        <button class="secondary-button" data-action="review-id-verification" data-uid="${escapeHtml(account.uid)}" data-status="approved">Approve</button>
        <button class="danger-button" data-action="review-id-verification" data-uid="${escapeHtml(account.uid)}" data-status="rejected">Reject</button>
      </div>`
    );
  } else if (canReview && status === 'approved') {
    lines.push(
      `<div class="row-actions">
        <button class="danger-button" data-action="review-id-verification" data-uid="${escapeHtml(account.uid)}" data-status="rejected">Reject</button>
      </div>`
    );
  }
  return `<div class="stacked-cell">${lines.join('')}</div>`;
}

function buildAccountStatusPill(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'banned') {
    return '<span class="status-pill error">Banned</span>';
  }
  if (normalized === 'verified') {
    return '<span class="status-pill success">Verified</span>';
  }
  if (normalized === 'verification-rejected') {
    return '<span class="status-pill verification-rejected">ID rejected</span>';
  }
  if (normalized === 'verification-pending') {
    return '<span class="status-pill verification-pending">ID pending</span>';
  }
  return '<span class="status-pill email-pending">Email pending</span>';
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

function buildDeleteControl(uid, userType) {
  if (!uid || uid === viewerUid || userType === 'owner') {
    return '';
  }
  const canDelete =
    viewerRole === 'owner' || (viewerRole === 'admin' && userType === 'member');
  if (!canDelete) {
    return '';
  }
  return `<button class="danger-button" data-action="delete-account" data-uid="${escapeHtml(uid)}">Delete account</button>`;
}

function buildTransferOwnershipControl(uid, userType, status) {
  if (viewerRole !== 'owner') return '';
  if (!uid || uid === viewerUid || userType === 'owner') return '';
  if (status === 'banned') return '';
  return `<button class="secondary-button" data-action="transfer-ownership" data-uid="${escapeHtml(uid)}">Transfer owner</button>`;
}

function formatProfessorCodeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'available') return 'Available';
  if (normalized === 'consumed') return 'Consumed';
  if (normalized === 'revoked') return 'Revoked';
  if (normalized === 'expired') return 'Expired';
  return '-';
}

function buildProfessorCodeActionControl(item) {
  if (!item || !item.id) return '<span>-</span>';
  if (item.status === 'available') {
    return `<button class="danger-button" data-action="revoke-professor-code" data-id="${escapeHtml(item.id)}">Revoke</button>`;
  }
  if (item.status === 'revoked') {
    return `<button class="secondary-button" data-action="reactivate-professor-code" data-id="${escapeHtml(item.id)}">Reactivate</button>`;
  }
  return '<span>-</span>';
}

async function loadProfessorCodes() {
  if (!professorCodesTableBody) return;
  const params = new URLSearchParams({
    page: '1',
    pageSize: '80',
  });
  if (professorCodesQuery && professorCodesQuery.value.trim()) params.set('q', professorCodesQuery.value.trim());
  if (professorCodesStatusFilter && professorCodesStatusFilter.value) {
    params.set('status', professorCodesStatusFilter.value);
  }

  try {
    const data = await apiRequest(`/api/admin/professor-codes?${params.toString()}`);
    const rows = Array.isArray(data.codes) ? data.codes : [];
    if (!rows.length) {
      renderEmptyRow(professorCodesTableBody, 9);
      return;
    }

    professorCodesTableBody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(formatProfessorCodeStatus(item.status))}</td>
            <td>${escapeHtml(item.source || '-')}</td>
            <td>${escapeHtml(item.createdByName || item.createdByUid || '-')}</td>
            <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            <td>${escapeHtml(formatDateTime(item.expiresAt))}</td>
            <td>${escapeHtml(item.consumedByName || item.consumedByUid || '-')}</td>
            <td>${escapeHtml(formatDateTime(item.consumedAt))}</td>
            <td><div class="row-actions">${buildProfessorCodeActionControl(item)}</div></td>
          </tr>`
      )
      .join('');
  } catch (error) {
    renderEmptyRow(professorCodesTableBody, 9, error.message);
  }
}

async function generateProfessorCodesBatch() {
  if (!generateProfessorCodes) return;
  setInlineMessage(professorCodesMessage, '');

  const count = professorCodeBatchCount ? Number(professorCodeBatchCount.value) : 1;
  const length = professorCodeLength ? Number(professorCodeLength.value) : 10;
  const expiresInDays = professorCodeExpiresDays ? Number(professorCodeExpiresDays.value) : NaN;
  const payload = {
    count,
    length,
  };
  if (Number.isInteger(expiresInDays) && expiresInDays > 0) {
    payload.expiresInDays = expiresInDays;
  }

  generateProfessorCodes.disabled = true;
  const originalLabel = generateProfessorCodes.textContent;
  generateProfessorCodes.textContent = 'Generating...';
  try {
    const data = await apiRequest('/api/admin/professor-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const created = Array.isArray(data.created) ? data.created : [];
    if (generatedProfessorCodesOutput) {
      generatedProfessorCodesOutput.value = created.map((item) => item.code).join('\n');
    }
    setInlineMessage(
      professorCodesMessage,
      data.message || `Generated ${created.length} code${created.length === 1 ? '' : 's'}.`,
      'success'
    );
    setPageMessage('Professor code(s) generated.', 'success');
    await loadProfessorCodes();
  } catch (error) {
    setInlineMessage(professorCodesMessage, error.message);
  } finally {
    generateProfessorCodes.disabled = false;
    generateProfessorCodes.textContent = originalLabel;
  }
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
      renderEmptyRow(accountsTableBody, 13);
      return;
    }

    accountsTableBody.innerHTML = data.accounts
      .map((account) => {
        const roleControl = buildRoleControl(account.uid, account.userType);
        const banControl = buildBanControl(account.uid, account.status, account.userType);
        const deleteControl = buildDeleteControl(account.uid, account.userType);
        const transferOwnershipControl = buildTransferOwnershipControl(account.uid, account.userType, account.status);
        const idVerificationControl = buildIdVerificationControl(account);
        const emailVerificationPill = buildEmailVerificationPill(account.emailVerified === true);
        const accountStatusPill = buildAccountStatusPill(account.status);
        const actions = [banControl, deleteControl, transferOwnershipControl].filter(Boolean).join('');
        return `
          <tr>
            <td>${escapeHtml(account.uid)}</td>
            <td>${escapeHtml(account.username || '-')}</td>
            <td>${escapeHtml(account.displayName || '-')}</td>
            <td>${escapeHtml(account.email || '-')}</td>
            <td>${emailVerificationPill}</td>
            <td>${roleControl}</td>
            <td>${escapeHtml(account.course || '-')}</td>
            <td>${escapeHtml(account.studentNumber || '-')}</td>
            <td>${idVerificationControl}</td>
            <td>${escapeHtml(account.recoveryEmail || '-')}</td>
            <td>${accountStatusPill}</td>
            <td>${escapeHtml(formatDateTime(account.dateRegistered))}</td>
            <td><div class="row-actions">${actions || '<span>-</span>'}</div></td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    renderEmptyRow(accountsTableBody, 13, error.message);
  }
}

async function loadCommunities() {
  if (!moderatorCommunity && !spacesCommunitySelect) return;
  try {
    const data = await apiRequest('/api/admin/communities');
    cachedCommunities = Array.isArray(data.communities) ? data.communities : [];

    if (moderatorCommunity) {
      moderatorCommunity.innerHTML = '<option value="">Select community</option>';
      cachedCommunities.forEach((community) => {
        const option = document.createElement('option');
        option.value = String(community.id);
        option.textContent = community.courseName;
        moderatorCommunity.appendChild(option);
      });
    }

    if (spacesCommunitySelect) {
      spacesCommunitySelect.innerHTML = '<option value="">Select community</option>';
      cachedCommunities.forEach((community) => {
        const option = document.createElement('option');
        option.value = String(community.id);
        option.textContent = community.courseName;
        spacesCommunitySelect.appendChild(option);
      });
    }

    syncCommunityEditorSelection();
  } catch (error) {
    cachedCommunities = [];
    if (moderatorCommunity) {
      moderatorCommunity.innerHTML = '<option value="">Unable to load communities</option>';
    }
    if (spacesCommunitySelect) {
      spacesCommunitySelect.innerHTML = '<option value="">Unable to load communities</option>';
    }
  }
}

function findCommunityById(id) {
  const numericId = Number(id);
  if (!numericId) return null;
  return cachedCommunities.find((item) => Number(item.id) === numericId) || null;
}

function syncCommunityEditorSelection() {
  if (!spacesCommunitySelect || !spacesCommunityDescription) return;
  const selected = findCommunityById(spacesCommunitySelect.value);
  if (!selected) {
    spacesCommunityDescription.value = '';
    spacesCommunityDescription.disabled = true;
    return;
  }
  spacesCommunityDescription.disabled = false;
  spacesCommunityDescription.value = selected.description || '';
}

async function saveCommunityEditor() {
  if (!spacesCommunitySelect || !spacesCommunityDescription) return;
  setInlineMessage(spacesCommunityMessage, '');
  const communityId = Number(spacesCommunitySelect.value);
  if (!communityId) {
    setInlineMessage(spacesCommunityMessage, 'Select a community first.');
    return;
  }
  try {
    const payload = { description: spacesCommunityDescription.value };
    const data = await apiRequest(`/api/admin/communities/${communityId}/details`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const updated = data.community || null;
    if (updated) {
      cachedCommunities = cachedCommunities.map((item) =>
        Number(item.id) === Number(updated.id) ? { ...item, description: updated.description || '' } : item
      );
    }
    setInlineMessage(spacesCommunityMessage, 'Community description updated.', 'success');
    setPageMessage('Community settings saved.', 'success');
  } catch (error) {
    setInlineMessage(spacesCommunityMessage, error.message);
  }
}

async function loadRoomContextLabelEditor() {
  if (!spacesRoomContextLabel) return;
  setInlineMessage(spacesRoomMessage, '');
  try {
    const data = await apiRequest('/api/admin/site-pages/rooms');
    const page = data.page || {};
    const body = page.body || {};
    spacesRoomContextLabel.value = body.courseContextLabel || 'Course context';
    setInlineMessage(spacesRoomMessage, '');
  } catch (error) {
    setInlineMessage(spacesRoomMessage, error.message);
  }
}

async function saveRoomContextLabelEditor() {
  if (!spacesRoomContextLabel) return;
  setInlineMessage(spacesRoomMessage, '');
  try {
    await apiRequest('/api/admin/site-pages/rooms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Rooms settings',
        subtitle: 'Configurable labels for Rooms UI',
        body: {
          courseContextLabel: spacesRoomContextLabel.value,
        },
      }),
    });
    setInlineMessage(spacesRoomMessage, 'Room context label updated.', 'success');
    setPageMessage('Rooms settings saved.', 'success');
    await loadRoomContextLabelEditor();
  } catch (error) {
    setInlineMessage(spacesRoomMessage, error.message);
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

function toLinesText(values) {
  if (!Array.isArray(values)) return '';
  return values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

function parseLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatFaqItems(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items
    .map((item) => {
      const question = String(item?.question || '').trim();
      const answer = String(item?.answer || '').trim();
      if (!question || !answer) return '';
      return `${question} | ${answer}`;
    })
    .filter(Boolean)
    .join('\n');
}

function parseFaqItems(raw) {
  const lines = parseLines(raw);
  const parsed = [];
  lines.forEach((line) => {
    const separatorIndex = line.indexOf('|');
    if (separatorIndex < 1) return;
    const question = line.slice(0, separatorIndex).trim();
    const answer = line.slice(separatorIndex + 1).trim();
    if (!question || !answer) return;
    parsed.push({ question, answer });
  });
  return parsed;
}

async function loadAboutPageEditor() {
  if (!aboutTitle) return;
  try {
    setInlineMessage(aboutPageMessage, '');
    const data = await apiRequest('/api/admin/site-pages/about');
    const page = data.page || {};
    const body = page.body || {};
    aboutTitle.value = page.title || '';
    aboutSubtitle.value = page.subtitle || '';
    aboutOverview.value = body.overview || '';
    aboutHighlights.value = toLinesText(body.highlights || []);
    aboutCommitments.value = toLinesText(body.commitments || []);
    aboutContactEmail.value = body.contactEmail || '';
  } catch (error) {
    setInlineMessage(aboutPageMessage, error.message);
  }
}

async function loadFaqPageEditor() {
  if (!faqTitle) return;
  try {
    setInlineMessage(faqPageMessage, '');
    const data = await apiRequest('/api/admin/site-pages/faq');
    const page = data.page || {};
    const body = page.body || {};
    faqTitle.value = page.title || '';
    faqSubtitle.value = page.subtitle || '';
    faqItems.value = formatFaqItems(body.items || []);
  } catch (error) {
    setInlineMessage(faqPageMessage, error.message);
  }
}

async function saveAboutPageEditor() {
  if (!aboutTitle) return;
  try {
    setInlineMessage(aboutPageMessage, '');
    const payload = {
      title: aboutTitle.value,
      subtitle: aboutSubtitle.value,
      body: {
        overview: aboutOverview.value,
        highlights: parseLines(aboutHighlights.value),
        commitments: parseLines(aboutCommitments.value),
        contactEmail: aboutContactEmail.value,
      },
    };
    await apiRequest('/api/admin/site-pages/about', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setInlineMessage(aboutPageMessage, 'About page updated.', 'success');
    setPageMessage('Site page content updated.', 'success');
    await loadAboutPageEditor();
  } catch (error) {
    setInlineMessage(aboutPageMessage, error.message);
  }
}

async function saveFaqPageEditor() {
  if (!faqTitle) return;
  try {
    setInlineMessage(faqPageMessage, '');
    const items = parseFaqItems(faqItems.value);
    if (!items.length) {
      setInlineMessage(faqPageMessage, 'Add at least one FAQ item using: Question | Answer');
      return;
    }
    const payload = {
      title: faqTitle.value,
      subtitle: faqSubtitle.value,
      body: {
        items,
      },
    };
    await apiRequest('/api/admin/site-pages/faq', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setInlineMessage(faqPageMessage, 'FAQ page updated.', 'success');
    setPageMessage('Site page content updated.', 'success');
    await loadFaqPageEditor();
  } catch (error) {
    setInlineMessage(faqPageMessage, error.message);
  }
}

async function loadMobileAppPageEditor() {
  if (!mobileAppTitle) return;
  try {
    setInlineMessage(mobileAppPageMessage, '');
    const data = await apiRequest('/api/admin/site-pages/mobile-app');
    const page = data.page || {};
    const body = page.body || {};
    mobileAppTitle.value = page.title || '';
    mobileAppSubtitle.value = page.subtitle || '';
    mobileAppDescription.value = body.description || '';
    mobileAppQrImageUrl.value = body.qrImageUrl || '';
    mobileAppQrAltText.value = body.qrAltText || '';
    mobileAppDownloadUrl.value = body.downloadUrl || '';
    mobileAppDownloadLabel.value = body.downloadLabel || '';
  } catch (error) {
    setInlineMessage(mobileAppPageMessage, error.message);
  }
}

async function saveMobileAppPageEditor() {
  if (!mobileAppTitle) return;
  try {
    setInlineMessage(mobileAppPageMessage, '');
    const payload = {
      title: mobileAppTitle.value,
      subtitle: mobileAppSubtitle.value,
      body: {
        description: mobileAppDescription.value,
        qrImageUrl: mobileAppQrImageUrl.value,
        qrAltText: mobileAppQrAltText.value,
        downloadUrl: mobileAppDownloadUrl.value,
        downloadLabel: mobileAppDownloadLabel.value,
      },
    };
    await apiRequest('/api/admin/site-pages/mobile-app', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setInlineMessage(mobileAppPageMessage, 'Mobile app modal content updated.', 'success');
    setPageMessage('Site page content updated.', 'success');
    await loadMobileAppPageEditor();
  } catch (error) {
    setInlineMessage(mobileAppPageMessage, error.message);
  }
}

if (reportsTableBody) {
  reportsTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="apply-report-action"][data-report-id]');
    if (!button) return;
    const reportId = button.dataset.reportId;
    if (!reportId) return;

    const statusSelect = Array.from(reportsTableBody.querySelectorAll('select[data-report-status]')).find(
      (item) => item.dataset.reportStatus === reportId
    );
    const actionSelect = Array.from(reportsTableBody.querySelectorAll('select[data-report-action]')).find(
      (item) => item.dataset.reportAction === reportId
    );
    const status = statusSelect ? statusSelect.value : 'open';
    const moderationAction = actionSelect ? actionSelect.value : 'none';
    const note = window.prompt('Resolution note (optional):', '') || '';

    try {
      await apiRequest('/api/admin/reports/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          status,
          moderationAction,
          note,
        }),
      });
      setPageMessage('Report action applied.', 'success');
      await Promise.all([loadReports(), loadContent(), loadAccounts()]);
    } catch (error) {
      setPageMessage(error.message);
    }
  });
}

if (restrictedTableBody) {
  restrictedTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!action || !id) return;

    try {
      if (action === 'restore-restricted') {
        if (!window.confirm('Restore this restricted content?')) return;
        await apiRequest(`/api/admin/restricted-contents/${encodeURIComponent(id)}/restore`, {
          method: 'POST',
        });
        setPageMessage('Restricted content restored.', 'success');
        await Promise.all([loadRestrictedContents(), loadContent()]);
        return;
      }

      if (action === 'purge-restricted') {
        if (!window.confirm('Purge this content permanently? This cannot be undone.')) return;
        await apiRequest(`/api/admin/restricted-contents/${encodeURIComponent(id)}/purge`, {
          method: 'POST',
        });
        setPageMessage('Restricted content purged.', 'success');
        await Promise.all([loadRestrictedContents(), loadContent()]);
      }
    } catch (error) {
      setPageMessage(error.message);
    }
  });
}

if (appealsTableBody) {
  appealsTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="resolve-appeal"][data-id]');
    if (!button) return;
    const id = button.dataset.id;
    if (!id) return;
    const select = Array.from(appealsTableBody.querySelectorAll('select[data-appeal-status]')).find(
      (item) => item.dataset.appealStatus === id
    );
    const status = select ? select.value : '';
    if (!status) return;
    const note = window.prompt('Resolution note (optional):', '') || '';

    try {
      await apiRequest(`/api/admin/appeals/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      setPageMessage('Appeal updated.', 'success');
      await Promise.all([loadAppeals(), loadAccounts()]);
    } catch (error) {
      setPageMessage(error.message);
    }
  });
}

if (professorCodesTableBody) {
  professorCodesTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!action || !id) return;

    try {
      if (action === 'revoke-professor-code') {
        if (!window.confirm('Revoke this professor code? It will no longer be usable.')) return;
        await apiRequest(`/api/admin/professor-codes/${encodeURIComponent(id)}/revoke`, {
          method: 'POST',
        });
        setPageMessage('Professor code revoked.', 'success');
        await loadProfessorCodes();
        return;
      }

      if (action === 'reactivate-professor-code') {
        await apiRequest(`/api/admin/professor-codes/${encodeURIComponent(id)}/reactivate`, {
          method: 'POST',
        });
        setPageMessage('Professor code reactivated.', 'success');
        await loadProfessorCodes();
      }
    } catch (error) {
      setPageMessage(error.message);
    }
  });
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

  if (action === 'review-id-verification') {
    const targetStatus = String(button.dataset.status || '').trim().toLowerCase();
    if (!['approved', 'rejected'].includes(targetStatus)) {
      setPageMessage('Invalid verification decision payload.');
      return;
    }
    if (targetStatus === 'rejected') {
      const confirmed = window.confirm('Reject this student ID verification?');
      if (!confirmed) return;
    }
    const notePrompt =
      targetStatus === 'approved'
        ? 'Approval note (optional):'
        : 'Rejection reason (optional):';
    const note = window.prompt(notePrompt, '') || '';

    try {
      await apiRequest(`/api/id-verification/${encodeURIComponent(uid)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          note,
        }),
      });
      setPageMessage(
        targetStatus === 'approved'
          ? 'Student ID verification approved.'
          : 'Student ID verification rejected.',
        'success'
      );
      await loadAccounts();
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
    return;
  }

  if (action === 'delete-account') {
    const confirmed = window.confirm(
      'Delete this account permanently? This cannot be undone and removes associated user data.'
    );
    if (!confirmed) return;

    const finalCheck = window.prompt('Type DELETE to confirm:', '');
    if (finalCheck !== 'DELETE') {
      setPageMessage('Account deletion cancelled.');
      return;
    }

    try {
      await apiRequest(`/api/admin/accounts/${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
      setPageMessage('Account deleted.', 'success');
      loadAccounts();
    } catch (error) {
      setPageMessage(error.message);
    }
    return;
  }

  if (action === 'transfer-ownership') {
    if (viewerRole !== 'owner') {
      setPageMessage('Only owner can transfer ownership.');
      return;
    }

    const confirmed = window.confirm(
      'Transfer ownership to this account? Your account will be downgraded to admin.'
    );
    if (!confirmed) return;

    const finalCheck = window.prompt('Type TRANSFER to confirm ownership transfer:', '');
    if (finalCheck !== 'TRANSFER') {
      setPageMessage('Ownership transfer cancelled.');
      return;
    }

    try {
      await apiRequest(`/api/admin/accounts/${encodeURIComponent(uid)}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferToken: finalCheck }),
      });
      setPageMessage('Ownership transferred. Refreshing account list...', 'success');
      await loadAdminContext();
      await loadAccounts();
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
if (refreshRestricted) refreshRestricted.addEventListener('click', loadRestrictedContents);
if (refreshAppeals) refreshAppeals.addEventListener('click', loadAppeals);
if (refreshAccounts) refreshAccounts.addEventListener('click', loadAccounts);
if (refreshProfessorCodes) refreshProfessorCodes.addEventListener('click', loadProfessorCodes);
if (refreshContent) refreshContent.addEventListener('click', loadContent);
if (refreshAiUsage) refreshAiUsage.addEventListener('click', loadAiUsage);
if (aiUsageDays) aiUsageDays.addEventListener('change', loadAiUsage);
if (reloadAiFeatures) reloadAiFeatures.addEventListener('click', loadAiFeatureStates);
if (saveAiFeatures) {
  saveAiFeatures.addEventListener('click', () => {
    saveAiFeatureStates();
  });
}
if (generateProfessorCodes) generateProfessorCodes.addEventListener('click', generateProfessorCodesBatch);

if (purgeExpiredRestricted) {
  purgeExpiredRestricted.addEventListener('click', async () => {
    if (!window.confirm('Purge all expired restricted items now?')) return;
    try {
      const result = await apiRequest('/api/admin/restricted-contents/purge-expired', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 300 }),
      });
      setPageMessage(
        `Expired purge complete. Processed ${Number(result.processed || 0)}, purged ${Number(result.purged || 0)}.`,
        'success'
      );
      await Promise.all([loadRestrictedContents(), loadContent()]);
    } catch (error) {
      setPageMessage(error.message);
    }
  });
}

if (sendCustomNotification) {
  sendCustomNotification.addEventListener('click', sendCustomNotificationRequest);
}

if (assignModerator) {
  assignModerator.addEventListener('click', () => handleModeratorAction('assign'));
}

if (removeModerator) {
  removeModerator.addEventListener('click', () => handleModeratorAction('remove'));
}

if (saveAboutPage) {
  saveAboutPage.addEventListener('click', saveAboutPageEditor);
}

if (reloadAboutPage) {
  reloadAboutPage.addEventListener('click', loadAboutPageEditor);
}

if (saveFaqPage) {
  saveFaqPage.addEventListener('click', saveFaqPageEditor);
}

if (reloadFaqPage) {
  reloadFaqPage.addEventListener('click', loadFaqPageEditor);
}

if (saveMobileAppPage) {
  saveMobileAppPage.addEventListener('click', saveMobileAppPageEditor);
}

if (reloadMobileAppPage) {
  reloadMobileAppPage.addEventListener('click', loadMobileAppPageEditor);
}

if (spacesCommunitySelect) {
  spacesCommunitySelect.addEventListener('change', () => {
    setInlineMessage(spacesCommunityMessage, '');
    syncCommunityEditorSelection();
  });
}

if (saveSpacesCommunity) {
  saveSpacesCommunity.addEventListener('click', saveCommunityEditor);
}

if (reloadSpacesCommunities) {
  reloadSpacesCommunities.addEventListener('click', async () => {
    setInlineMessage(spacesCommunityMessage, '');
    await loadCommunities();
  });
}

if (saveSpacesRoom) {
  saveSpacesRoom.addEventListener('click', saveRoomContextLabelEditor);
}

if (reloadSpacesRooms) {
  reloadSpacesRooms.addEventListener('click', async () => {
    setInlineMessage(spacesRoomMessage, '');
    await loadRoomContextLabelEditor();
  });
}

async function init() {
  try {
    await loadAdminContext();
    await Promise.all([
      loadCommunities(),
      loadLogs(),
      loadReports(),
      loadRestrictedContents(),
      loadAppeals(),
      loadAccounts(),
      loadProfessorCodes(),
      loadAboutPageEditor(),
      loadFaqPageEditor(),
      loadMobileAppPageEditor(),
      loadRoomContextLabelEditor(),
      loadAiFeatureStates(),
      loadAiUsage(),
    ]);
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
