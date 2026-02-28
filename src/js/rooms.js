const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const contextCount = document.getElementById('contextCount');
const contextList = document.getElementById('contextList');
const selectedContextType = document.getElementById('selectedContextType');
const selectedContextName = document.getElementById('selectedContextName');
const workspaceHint = document.getElementById('workspaceHint');
const workspaceMessage = document.getElementById('workspaceMessage');

const stateFilter = document.getElementById('stateFilter');
const mineOnlyToggle = document.getElementById('mineOnlyToggle');
const meetSearchForm = document.getElementById('meetSearchForm');
const meetIdSearchInput = document.getElementById('meetIdSearchInput');
const meetIdSearchPasswordInput = document.getElementById('meetIdSearchPasswordInput');
const searchMeetIdButton = document.getElementById('searchMeetIdButton');
const meetSearchResult = document.getElementById('meetSearchResult');
const refreshRoomsButton = document.getElementById('refreshRoomsButton');
const openCreateRoomButton = document.getElementById('openCreateRoomButton');
const roomsList = document.getElementById('roomsList');
const roomsMain = document.getElementById('roomsMain');
const workspaceCard = document.getElementById('workspaceCard');

const requestsCard = document.getElementById('requestsCard');
const pendingRequestCount = document.getElementById('pendingRequestCount');
const requestList = document.getElementById('requestList');

const roomModal = document.getElementById('roomModal');
const roomModalClose = document.getElementById('roomModalClose');
const roomModalTitle = document.getElementById('roomModalTitle');
const roomForm = document.getElementById('roomForm');
const meetNameInput = document.getElementById('meetNameInput');
const meetIdPreview = document.getElementById('meetIdPreview');
const visibilityInput = document.getElementById('visibilityInput');
const courseContextLabel = document.getElementById('courseContextLabel');
const communityInput = document.getElementById('communityInput');
const passwordField = document.getElementById('passwordField');
const meetPasswordInput = document.getElementById('meetPasswordInput');
const maxParticipantsInput = document.getElementById('maxParticipantsInput');
const scheduledAtInput = document.getElementById('scheduledAtInput');
const allowMicInput = document.getElementById('allowMicInput');
const allowVideoInput = document.getElementById('allowVideoInput');
const allowScreenShareInput = document.getElementById('allowScreenShareInput');
const submitRoomButton = document.getElementById('submitRoomButton');
const roomFormMessage = document.getElementById('roomFormMessage');
const inviteResult = document.getElementById('inviteResult');
const inviteResultLink = document.getElementById('inviteResultLink');
const callPanelCard = document.getElementById('callPanelCard');
const callPanelStatus = document.getElementById('callPanelStatus');
const callFrameWrap = document.getElementById('callFrameWrap');
const callFrame = document.getElementById('callFrame');
const callPlaceholder = document.getElementById('callPlaceholder');
const leaveCallButton = document.getElementById('leaveCallButton');
const openCallTab = document.getElementById('openCallTab');

const initialSearchParams = new URLSearchParams(window.location.search);
const inviteTokenFromUrl = (initialSearchParams.get('invite') || '').trim();
const inviteRoomMeetIdFromUrl = (initialSearchParams.get('room') || '').trim().toUpperCase();
const ROOMS_PREJOIN_KEY = 'rooms-prejoin';
const CALL_HEARTBEAT_MS = 4000;

const state = {
  viewer: null,
  availableCommunities: [],
  requestHostCommunities: [],
  contexts: [],
  selectedContextKey: 'public',
  rooms: [],
  pendingRequests: [],
  searchedRoom: null,
  currentCall: null,
  callHeartbeatTimer: null,
  callHeartbeatInFlight: false,
};

function consumePrejoinedRoom() {
  try {
    const raw = sessionStorage.getItem(ROOMS_PREJOIN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ROOMS_PREJOIN_KEY);
    const parsed = JSON.parse(raw);
    const createdAt = Number(parsed && parsed.createdAt) || 0;
    if (!createdAt || Date.now() - createdAt > 5 * 60 * 1000) return null;
    if (!parsed.joinUrl || typeof parsed.joinUrl !== 'string') return null;
    return {
      roomId: parsed.roomId ? Number(parsed.roomId) : null,
      meetId: parsed.meetId ? String(parsed.meetId) : '',
      meetName: parsed.meetName ? String(parsed.meetName) : 'Live room',
      joinUrl: parsed.joinUrl,
    };
  } catch (error) {
    try {
      sessionStorage.removeItem(ROOMS_PREJOIN_KEY);
    } catch (cleanupError) {
      // ignore storage cleanup failures
    }
    return null;
  }
}

function initialsFromName(name) {
  const safe = (name || '').trim();
  if (!safe) return 'M';
  return safe[0].toUpperCase();
}

function setNavAvatar(photoLink, displayName) {
  if (!navAvatarLabel) return;
  navAvatarLabel.innerHTML = '';

  if (photoLink) {
    const img = document.createElement('img');
    img.src = photoLink;
    img.alt = displayName || 'Profile';
    navAvatarLabel.appendChild(img);
    return;
  }

  navAvatarLabel.textContent = initialsFromName(displayName);
}

function closeMenuOnOutsideClick(event) {
  if (!profileMenu || !profileToggle) return;
  if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
    profileMenu.classList.add('is-hidden');
  }
}

if (profileToggle && profileMenu) {
  profileToggle.addEventListener('click', () => {
    profileMenu.classList.toggle('is-hidden');
  });
  document.addEventListener('click', closeMenuOnOutsideClick);
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

function showMessage(target, text, type = 'error') {
  if (!target) return;
  target.textContent = text || '';
  target.classList.toggle('success', type === 'success');
}

function renderEmpty(target, text) {
  target.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'empty-state';
  node.textContent = text;
  target.appendChild(node);
}

function formatDateTime(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString();
}

function formatStateLabel(stateValue) {
  if (!stateValue) return 'Unknown';
  if (stateValue === 'course_exclusive') return 'Course-exclusive';
  return stateValue.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMeetId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function selectedContext() {
  return state.contexts.find((context) => context.key === state.selectedContextKey) || state.contexts[0] || null;
}

function isViewerRoomCreator(room) {
  if (!room || !room.creator || !room.creator.uid || !state.viewer || !state.viewer.uid) return false;
  return String(room.creator.uid).trim().toLowerCase() === String(state.viewer.uid).trim().toLowerCase();
}

function applyCallUrlOverrides(joinUrl) {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    const hashValue = url.hash ? url.hash.replace(/^#/, '') : '';
    const hashParams = new URLSearchParams(hashValue);
    if (!hashParams.has('config.prejoinPageEnabled')) {
      hashParams.set('config.prejoinPageEnabled', 'false');
    }
    if (!hashParams.has('config.disableDeepLinking')) {
      hashParams.set('config.disableDeepLinking', 'true');
    }
    if (!hashParams.has('config.enableClosePage')) {
      hashParams.set('config.enableClosePage', 'false');
    }
    if (!hashParams.has('interfaceConfig.SHOW_PROMOTIONAL_CLOSE_PAGE')) {
      hashParams.set('interfaceConfig.SHOW_PROMOTIONAL_CLOSE_PAGE', 'false');
    }
    url.hash = hashParams.toString() ? `#${hashParams.toString()}` : '';
    return url.toString();
  } catch (error) {
    return joinUrl;
  }
}

function stopCallHeartbeat() {
  if (state.callHeartbeatTimer) {
    window.clearInterval(state.callHeartbeatTimer);
    state.callHeartbeatTimer = null;
  }
  state.callHeartbeatInFlight = false;
}

async function syncCurrentCallSession() {
  const currentCall = state.currentCall;
  if (!currentCall || !currentCall.roomId || state.callHeartbeatInFlight) return;

  state.callHeartbeatInFlight = true;
  try {
    const data = await apiRequest(`/api/rooms/${currentCall.roomId}/session`);
    if (!state.currentCall || Number(state.currentCall.roomId) !== Number(currentCall.roomId)) {
      return;
    }
    const roomState = data && data.room ? String(data.room.state || '') : '';
    const participantStatus = data && data.participant ? String(data.participant.status || 'none') : 'none';
    if (roomState !== 'live') {
      await closeCallPanel({ notifyServer: false });
      showMessage(workspaceMessage, 'This room has ended. All participants were removed from the call.', 'success');
      await loadRooms();
      return;
    }
    if (participantStatus !== 'active') {
      await closeCallPanel({ notifyServer: false });
      showMessage(workspaceMessage, 'You are no longer in this call.', 'success');
      await loadRooms();
    }
  } catch (error) {
    const message = error && error.message ? String(error.message).toLowerCase() : '';
    if (message.includes('room not found') || message.includes('not allowed') || message.includes('unauthorized')) {
      await closeCallPanel({ notifyServer: false });
      showMessage(workspaceMessage, 'Call session is no longer available.');
      await loadRooms();
    }
  } finally {
    state.callHeartbeatInFlight = false;
  }
}

function startCallHeartbeat() {
  stopCallHeartbeat();
  if (!state.currentCall || !state.currentCall.roomId) return;
  state.callHeartbeatTimer = window.setInterval(() => {
    syncCurrentCallSession();
  }, CALL_HEARTBEAT_MS);
  syncCurrentCallSession();
}

function handleCallWindowMessage(event) {
  if (!state.currentCall) return;

  let expectedOrigin = '';
  try {
    expectedOrigin = new URL(state.currentCall.joinUrl).origin;
  } catch (error) {
    expectedOrigin = '';
  }
  if (!expectedOrigin || event.origin !== expectedOrigin) return;

  const payload = event && event.data ? event.data : null;
  if (!payload || typeof payload !== 'object') return;

  const eventName = String(
    payload.name ||
      payload.event ||
      payload.type ||
      payload.action ||
      (payload.data && payload.data.event) ||
      ''
  ).toLowerCase();

  if (
    eventName.includes('videoconferenceleft') ||
    eventName.includes('video_conference_left') ||
    eventName.includes('readytoclose') ||
    eventName.includes('conferenceleft')
  ) {
    closeCallPanel({ notifyServer: true }).then(() => {
      showMessage(workspaceMessage, 'You left the call.', 'success');
      loadRooms();
    });
  }
}

function openCallPanel(joinUrl, room) {
  if (!joinUrl || !callFrame || !callFrameWrap || !callPlaceholder || !callPanelStatus) return;
  if (callPanelCard) {
    callPanelCard.classList.remove('is-hidden');
  }
  if (roomsMain) {
    roomsMain.classList.add('is-call-active');
  }
  if (workspaceCard) {
    workspaceCard.classList.add('is-hidden');
  }
  const embedUrl = applyCallUrlOverrides(joinUrl);
  callFrame.src = embedUrl;
  callFrameWrap.classList.remove('is-hidden');
  callPlaceholder.classList.add('is-hidden');
  if (leaveCallButton) {
    leaveCallButton.classList.remove('is-hidden');
  }
  if (openCallTab) {
    openCallTab.href = joinUrl;
    openCallTab.classList.remove('is-hidden');
  }
  state.currentCall = {
    roomId: room && room.id ? Number(room.id) : null,
    meetId: room && room.meetId ? String(room.meetId) : '',
    joinUrl: embedUrl,
  };
  startCallHeartbeat();
  const roomLabel = room && room.meetName ? room.meetName : 'room';
  callPanelStatus.textContent = `Connected to ${roomLabel}.`;
}

async function closeCallPanel(options = {}) {
  const notifyServer = options && options.notifyServer !== false;
  const previousCall = state.currentCall;
  stopCallHeartbeat();

  if (callPanelCard) {
    callPanelCard.classList.add('is-hidden');
  }
  if (roomsMain) {
    roomsMain.classList.remove('is-call-active');
  }
  if (workspaceCard) {
    workspaceCard.classList.remove('is-hidden');
  }
  if (callFrame) {
    callFrame.src = 'about:blank';
  }
  if (callFrameWrap) {
    callFrameWrap.classList.add('is-hidden');
  }
  if (callPlaceholder) {
    callPlaceholder.classList.remove('is-hidden');
  }
  if (leaveCallButton) {
    leaveCallButton.classList.add('is-hidden');
  }
  if (openCallTab) {
    openCallTab.classList.add('is-hidden');
    openCallTab.href = '#';
  }
  if (callPanelStatus) {
    callPanelStatus.textContent = 'Join a room to start the call on this page.';
  }
  state.currentCall = null;

  if (notifyServer && previousCall && previousCall.roomId) {
    try {
      await apiRequest(`/api/rooms/${previousCall.roomId}/leave`, { method: 'POST' });
    } catch (error) {
      // Best effort: local call panel should still close even if leave sync fails.
    }
  }
}

function closeRoomModal() {
  if (roomModal) {
    roomModal.classList.add('is-hidden');
  }
}

function openRoomModal() {
  if (roomModal) {
    roomModal.classList.remove('is-hidden');
  }
}

function togglePrivateField() {
  if (!visibilityInput || !passwordField) return;
  const isPrivate = visibilityInput.value === 'private';
  passwordField.classList.toggle('is-hidden', !isPrivate);
  if (!isPrivate && meetPasswordInput) {
    meetPasswordInput.value = '';
  }
}

function resetRoomForm() {
  if (!roomForm) return;
  roomForm.reset();
  if (meetIdPreview) {
    meetIdPreview.value = 'Generated automatically on submit';
  }
  if (maxParticipantsInput) {
    maxParticipantsInput.value = '25';
  }
  if (allowMicInput) {
    allowMicInput.checked = true;
  }
  if (allowVideoInput) {
    allowVideoInput.checked = true;
  }
  if (allowScreenShareInput) {
    allowScreenShareInput.checked = false;
  }
  if (scheduledAtInput) {
    scheduledAtInput.value = '';
  }
  if (inviteResult && inviteResultLink) {
    inviteResult.classList.add('is-hidden');
    inviteResultLink.href = '#';
    inviteResultLink.textContent = '';
  }
  showMessage(roomFormMessage, '');
  togglePrivateField();
}

function buildPayloadFromForm() {
  const scheduledRaw = scheduledAtInput ? scheduledAtInput.value : '';
  return {
    meet_name: meetNameInput ? meetNameInput.value.trim() : '',
    visibility: visibilityInput ? visibilityInput.value : 'public',
    community_id: communityInput && communityInput.value ? Number(communityInput.value) : null,
    meet_password: meetPasswordInput ? meetPasswordInput.value : '',
    max_participants: maxParticipantsInput ? Number(maxParticipantsInput.value) : 25,
    scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
    allow_mic: allowMicInput ? allowMicInput.checked : true,
    allow_video: allowVideoInput ? allowVideoInput.checked : true,
    allow_screen_share: allowScreenShareInput ? allowScreenShareInput.checked : false,
  };
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

async function loadRoomsContentSettings() {
  if (!courseContextLabel) return;
  try {
    const data = await apiRequest('/api/site-pages/rooms');
    const body = data && data.page && data.page.body ? data.page.body : {};
    const label = typeof body.courseContextLabel === 'string' ? body.courseContextLabel.trim() : '';
    courseContextLabel.textContent = label || 'Course context';
  } catch (error) {
    courseContextLabel.textContent = 'Course context';
  }
}

function contextForRoomDefaults() {
  const context = selectedContext();
  if (!context) return;
  if (context.type === 'public') {
    visibilityInput.value = 'public';
    communityInput.value = '';
    return;
  }
  visibilityInput.value = 'course_exclusive';
  communityInput.value = String(context.communityId);
}

function syncVisibilityOptions(restrictPublicForDirectCreate = false) {
  if (!visibilityInput || !state.viewer) return;
  const canUsePublicDirect = state.viewer.platformRole === 'owner' || state.viewer.platformRole === 'admin';
  const allowPublic = !restrictPublicForDirectCreate || canUsePublicDirect;
  Array.from(visibilityInput.options).forEach((option) => {
    if (option.value === 'public') {
      option.disabled = !allowPublic;
    }
  });

  if (!allowPublic && visibilityInput.value === 'public') {
    visibilityInput.value = 'course_exclusive';
  }
}

function renderContexts() {
  if (!contextList) return;
  contextList.innerHTML = '';

  if (contextCount) {
    contextCount.textContent = String(state.contexts.length);
  }

  state.contexts.forEach((context) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-item';
    if (state.selectedContextKey === context.key) {
      button.classList.add('is-active');
    }

    const title = document.createElement('h3');
    title.textContent = context.title;

    const description = document.createElement('p');
    description.textContent = context.subtitle;

    button.appendChild(title);
    button.appendChild(description);
    button.addEventListener('click', () => {
      state.selectedContextKey = context.key;
      renderContexts();
      applyContextToWorkspace();
      loadRooms();
      if (state.viewer && state.viewer.canReviewRequests) {
        loadPendingRequests();
      }
    });

    contextList.appendChild(button);
  });
}

function applyContextToWorkspace() {
  const context = selectedContext();
  if (!context) return;
  selectedContextType.textContent = context.label;
  selectedContextName.textContent = context.title;
  workspaceHint.textContent = context.subtitle;

  const canCreateHere = context.canCreate;
  openCreateRoomButton.textContent = canCreateHere ? 'Create room' : 'Request room';
}

async function loadBootstrap() {
  const data = await apiRequest('/api/rooms/bootstrap');
  state.viewer = data.viewer;
  state.availableCommunities = data.communities || [];
  state.requestHostCommunities = data.requestHostCommunities || [];
  setNavAvatar(data.viewer.photoLink, data.viewer.displayName);

  const contexts = [
    {
      key: 'public',
      type: 'public',
      label: 'Public',
      title: 'Public Rooms',
      subtitle: 'Rooms available to all members across courses.',
      canCreate: data.viewer.canCreatePublicRooms,
      communityId: null,
    },
  ];

  (data.communities || []).forEach((community) => {
    contexts.push({
      key: `community:${community.id}`,
      type: 'community',
      label: community.courseCode || 'Course',
      title: community.courseName,
      subtitle:
        community.membershipState === 'member'
          ? 'Course room space for members.'
          : community.isModerator
            ? 'Moderator context for this course.'
            : 'Course context',
      canCreate: community.canCreateHere === true,
      communityId: community.id,
    });
  });

  state.contexts = contexts;
  if (!state.contexts.some((context) => context.key === state.selectedContextKey)) {
    state.selectedContextKey = state.contexts[0] ? state.contexts[0].key : 'public';
  }

  renderContexts();
  applyContextToWorkspace();
  populateCommunitySelect(state.availableCommunities, { emptyLabel: 'No specific course' });
  syncVisibilityOptions(false);

  if (state.viewer.canReviewRequests) {
    requestsCard.classList.remove('is-hidden');
    if (pendingRequestCount) {
      pendingRequestCount.textContent = String(data.pendingRequestsToReview || 0);
    }
  } else {
    requestsCard.classList.add('is-hidden');
  }
}

function populateCommunitySelect(communities, options = {}) {
  if (!communityInput) return;
  const emptyLabel = typeof options.emptyLabel === 'string' ? options.emptyLabel : 'No specific course';
  communityInput.innerHTML = `<option value="">${emptyLabel}</option>`;
  const safeCommunities = Array.isArray(communities) ? communities : [];
  if (!safeCommunities.length) {
    const none = document.createElement('option');
    none.value = '';
    none.disabled = true;
    none.textContent = 'No eligible courses available';
    communityInput.appendChild(none);
    return;
  }
  safeCommunities.forEach((community) => {
    const option = document.createElement('option');
    option.value = String(community.id);
    const code = community.courseCode ? `${community.courseCode} - ` : '';
    option.textContent = `${code}${community.courseName}`;
    communityInput.appendChild(option);
  });
}

function roomHostAvatar(room) {
  const host = room.creator || {};
  if (host.photoLink) {
    return `<span class="room-host-avatar"><img src="${escapeHtml(host.photoLink)}" alt="${escapeHtml(host.displayName || 'Host')}" /></span>`;
  }
  return `<span class="room-host-avatar">${escapeHtml(initialsFromName(host.displayName || 'Host'))}</span>`;
}

function clearMeetSearchResult() {
  state.searchedRoom = null;
  if (!meetSearchResult) return;
  meetSearchResult.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'meet-search-empty';
  node.textContent = 'Search by Meet ID to show a room result here.';
  meetSearchResult.appendChild(node);
}

function renderMeetSearchEmpty(message) {
  if (!meetSearchResult) return;
  state.searchedRoom = null;
  meetSearchResult.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'meet-search-empty';
  node.textContent = message || 'No room found.';
  meetSearchResult.appendChild(node);
}

function renderMeetSearchResult(room) {
  if (!meetSearchResult || !room) return;
  state.searchedRoom = room;
  meetSearchResult.innerHTML = '';

  const card = document.createElement('article');
  card.className = 'meet-search-card';
  const safeMeetName = escapeHtml(room.meetName || 'Untitled room');
  const safeMeetId = escapeHtml(room.meetId || '');
  const safeCreatorName = escapeHtml((room.creator && room.creator.displayName) || 'Member');
  const safeCourseName = room.courseName ? escapeHtml(room.courseName) : '';
  card.innerHTML = `
    <div class="meet-search-result-head">
      <div>
        <h3>${safeMeetName}</h3>
        <p class="meet-search-meta">Meet ID: ${safeMeetId} • Max ${room.maxParticipants} participants</p>
      </div>
      <div class="room-badges">
        <span class="badge state-${room.state}">${formatStateLabel(room.state)}</span>
        <span class="badge visibility-${room.visibility}">${formatStateLabel(room.visibility)}</span>
      </div>
    </div>
    <div class="room-host">
      ${roomHostAvatar(room)}
      <span>Host: ${safeCreatorName}</span>
    </div>
    <p class="meet-search-meta">
      ${room.courseName ? `Course: ${safeCourseName} • ` : ''}
      Scheduled: ${formatDateTime(room.scheduledAt)}
    </p>
    <div class="meet-search-actions"></div>
  `;

  const actions = card.querySelector('.meet-search-actions');
  const canManage = room.canManage || isViewerRoomCreator(room);
  const canJoinLive = room.state === 'live';
  const canStartAndJoin = room.state === 'scheduled' && canManage;
  if (canJoinLive || canStartAndJoin) {
    const joinButton = document.createElement('button');
    joinButton.type = 'button';
    joinButton.className = 'primary';
    joinButton.textContent = canStartAndJoin ? 'Start & join' : 'Join call';
    joinButton.addEventListener('click', () => handleJoinSearchedRoom(room));
    actions.appendChild(joinButton);
  } else if (room.state === 'scheduled') {
    const waitingButton = document.createElement('button');
    waitingButton.type = 'button';
    waitingButton.textContent = 'Waiting for host';
    waitingButton.disabled = true;
    actions.appendChild(waitingButton);
  } else {
    const unavailableButton = document.createElement('button');
    unavailableButton.type = 'button';
    unavailableButton.textContent = 'Unavailable';
    unavailableButton.disabled = true;
    actions.appendChild(unavailableButton);
  }

  meetSearchResult.appendChild(card);
}

function renderRooms() {
  if (!roomsList) return;
  roomsList.innerHTML = '';
  if (!state.rooms.length) {
    renderEmpty(roomsList, 'No rooms found for this context.');
    return;
  }

  state.rooms.forEach((room) => {
    const item = document.createElement('article');
    item.className = 'room-item';
    const safeMeetName = escapeHtml(room.meetName);
    const safeMeetId = escapeHtml(room.meetId);
    const safeCreatorName = escapeHtml((room.creator && room.creator.displayName) || 'Member');
    const safeCourseName = room.courseName ? escapeHtml(room.courseName) : '';
    item.innerHTML = `
      <div class="room-top">
        <div>
          <h3>${safeMeetName}</h3>
          <p class="room-meta">Meet ID: ${safeMeetId} • Max ${room.maxParticipants} participants</p>
        </div>
        <div class="room-badges">
          <span class="badge state-${room.state}">${formatStateLabel(room.state)}</span>
          <span class="badge visibility-${room.visibility}">${formatStateLabel(room.visibility)}</span>
        </div>
      </div>
      <div class="room-host">
        ${roomHostAvatar(room)}
        <span>Host: ${safeCreatorName}</span>
      </div>
      <p class="room-meta">
        ${room.courseName ? `Course: ${safeCourseName} • ` : ''}
        Scheduled: ${formatDateTime(room.scheduledAt)}
      </p>
      <div class="room-actions"></div>
    `;

    const actions = item.querySelector('.room-actions');
    const canManage = room.canManage || isViewerRoomCreator(room);
    const canJoinLive = room.state === 'live';
    const canStartAndJoin = room.state === 'scheduled' && canManage;
    if (canJoinLive || canStartAndJoin) {
      const joinButton = document.createElement('button');
      joinButton.type = 'button';
      joinButton.textContent = canStartAndJoin ? 'Start & join' : 'Join call';
      joinButton.className = 'primary';
      joinButton.addEventListener('click', () => handleJoinRoom(room));
      actions.appendChild(joinButton);
    } else if (room.state === 'scheduled') {
      const waitingButton = document.createElement('button');
      waitingButton.type = 'button';
      waitingButton.textContent = 'Waiting for host';
      waitingButton.disabled = true;
      actions.appendChild(waitingButton);
    }

    if (canManage) {
      if (room.state !== 'live' && room.state !== 'ended' && room.state !== 'canceled') {
        const startButton = document.createElement('button');
        startButton.type = 'button';
        startButton.textContent = 'Start';
        startButton.addEventListener('click', () => handleRoomStateChange(room.id, 'start'));
        actions.appendChild(startButton);
      }
      if (room.state !== 'ended' && room.state !== 'canceled') {
        const endButton = document.createElement('button');
        endButton.type = 'button';
        endButton.textContent = 'End';
        endButton.addEventListener('click', () => handleRoomStateChange(room.id, 'end'));
        actions.appendChild(endButton);
      }
    }

    if (!actions.children.length) {
      actions.remove();
    }

    roomsList.appendChild(item);
  });
}

async function loadRooms() {
  const context = selectedContext();
  if (!context) return;

  const params = new URLSearchParams({
    page: '1',
    pageSize: '30',
  });

  if (context.type === 'public') {
    params.set('context', 'public');
  } else if (context.type === 'community') {
    params.set('context', 'community');
    params.set('communityId', String(context.communityId));
  }

  const stateValue = stateFilter ? stateFilter.value : '';
  if (stateValue) {
    params.set('state', stateValue);
  }
  if (mineOnlyToggle && mineOnlyToggle.checked) {
    params.set('mine', 'true');
  }

  roomsList.innerHTML = '<p>Loading rooms...</p>';
  try {
    const data = await apiRequest(`/api/rooms?${params.toString()}`);
    state.rooms = data.rooms || [];
    renderRooms();
    showMessage(workspaceMessage, '');
  } catch (error) {
    state.rooms = [];
    renderEmpty(roomsList, error.message || 'Failed to load rooms.');
  }
}

async function handleSearchRoomByMeetId(event) {
  event.preventDefault();
  const meetId = normalizeMeetId(meetIdSearchInput ? meetIdSearchInput.value : '');
  if (meetIdSearchInput) {
    meetIdSearchInput.value = meetId;
  }
  if (!meetId) {
    renderMeetSearchEmpty('Enter a Meet ID to search.');
    showMessage(workspaceMessage, 'Enter a Meet ID to search.');
    return;
  }

  if (searchMeetIdButton) {
    searchMeetIdButton.disabled = true;
  }

  showMessage(workspaceMessage, 'Searching room...');
  try {
    const data = await apiRequest(`/api/rooms/search?meetId=${encodeURIComponent(meetId)}`);
    const room = data && data.room ? data.room : null;
    if (!room) {
      renderMeetSearchEmpty('Room not found.');
      showMessage(workspaceMessage, 'Room not found.');
      return;
    }
    renderMeetSearchResult(room);
    showMessage(workspaceMessage, 'Room found. You can join from the search result.', 'success');
  } catch (error) {
    renderMeetSearchEmpty(error.message || 'Room not found.');
    showMessage(workspaceMessage, error.message || 'Room not found.');
  } finally {
    if (searchMeetIdButton) {
      searchMeetIdButton.disabled = false;
    }
  }
}

async function handleJoinSearchedRoom(room) {
  if (!room || !room.id) return;
  const payload = {};
  const canManage = room.canManage || isViewerRoomCreator(room);
  if (room.visibility === 'private' && !canManage) {
    const inviteFromUrl =
      inviteRoomMeetIdFromUrl === String(room.meetId || '').toUpperCase() && inviteTokenFromUrl
        ? inviteTokenFromUrl
        : '';
    const typedPassword = meetIdSearchPasswordInput ? meetIdSearchPasswordInput.value : '';
    if (inviteFromUrl) {
      payload.invite_token = inviteFromUrl;
    }
    if (typedPassword && typedPassword.trim()) {
      payload.meet_password = typedPassword.trim();
    }
    if (room.hasPassword && !payload.meet_password && !payload.invite_token) {
      showMessage(workspaceMessage, 'This private room requires a password.');
      return;
    }
  }

  try {
    showMessage(workspaceMessage, room.state === 'scheduled' ? 'Starting room and joining...' : 'Joining room...');
    const data = await apiRequest(`/api/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (data.joinUrl) {
      openCallPanel(data.joinUrl, room);
    }
    showMessage(workspaceMessage, 'Joined room. Group call loaded on the right panel.', 'success');
    await loadRooms();
  } catch (error) {
    showMessage(workspaceMessage, error.message || 'Unable to join room.');
  }
}

function renderRequests() {
  if (!requestList) return;
  requestList.innerHTML = '';
  if (!state.pendingRequests.length) {
    renderEmpty(requestList, 'No pending room requests for your scope.');
    return;
  }

  state.pendingRequests.forEach((request) => {
    const item = document.createElement('article');
    item.className = 'request-item';
    const safeMeetName = escapeHtml(request.meetName);
    const safeRequester = escapeHtml((request.requester && request.requester.displayName) || 'Member');
    item.innerHTML = `
      <h4>${safeMeetName}</h4>
      <p>${request.visibility === 'course_exclusive' ? 'Course-exclusive' : formatStateLabel(request.visibility)} • Max ${request.maxParticipants}</p>
      <p>Requested by ${safeRequester}</p>
      <p>Expires: ${formatDateTime(request.expiresAt)}</p>
      <div class="request-actions"></div>
    `;

    const actions = item.querySelector('.request-actions');
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => handleApproveRequest(request.id));

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Reject';
    reject.className = 'danger';
    reject.addEventListener('click', () => handleRejectRequest(request.id));

    actions.appendChild(approve);
    actions.appendChild(reject);
    requestList.appendChild(item);
  });
}

async function loadPendingRequests() {
  if (!state.viewer || !state.viewer.canReviewRequests) return;
  const context = selectedContext();
  const params = new URLSearchParams({
    status: 'pending',
    page: '1',
    pageSize: '20',
  });
  if (context && context.type === 'community') {
    params.set('communityId', String(context.communityId));
  }

  requestList.innerHTML = '<p>Loading requests...</p>';
  try {
    const data = await apiRequest(`/api/rooms/requests?${params.toString()}`);
    state.pendingRequests = data.requests || [];
    if (pendingRequestCount) {
      pendingRequestCount.textContent = String(state.pendingRequests.length);
    }
    renderRequests();
  } catch (error) {
    state.pendingRequests = [];
    renderEmpty(requestList, error.message || 'Failed to load requests.');
  }
}

async function handleRoomStateChange(roomId, action) {
  try {
    await apiRequest(`/api/rooms/${roomId}/${action}`, { method: 'POST' });
    if (
      action === 'end' &&
      state.currentCall &&
      Number(state.currentCall.roomId || 0) === Number(roomId)
    ) {
      await closeCallPanel({ notifyServer: false });
    }
    showMessage(workspaceMessage, `Room ${action === 'start' ? 'started' : 'ended'} successfully.`, 'success');
    await loadRooms();
  } catch (error) {
    showMessage(workspaceMessage, error.message || 'Unable to update room state.');
  }
}

async function handleJoinRoom(room) {
  const payload = {};
  const canManage = room.canManage || isViewerRoomCreator(room);

  if (room.visibility === 'private' && !canManage) {
    const inviteToken =
      inviteRoomMeetIdFromUrl === String(room.meetId || '').toUpperCase() && inviteTokenFromUrl
        ? inviteTokenFromUrl
        : '';
    if (inviteToken) {
      payload.invite_token = inviteToken.trim();
    }
    if (room.hasPassword) {
      const meetPassword = window.prompt('Enter the room password:', '') || '';
      if (!meetPassword) {
        showMessage(workspaceMessage, 'Room password is required.');
        return;
      }
      payload.meet_password = meetPassword;
    }
  }

  try {
    showMessage(workspaceMessage, room.state === 'scheduled' ? 'Starting room and joining...' : 'Joining room...');
    const data = await apiRequest(`/api/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (data.joinUrl) {
      openCallPanel(data.joinUrl, room);
    }
    showMessage(workspaceMessage, 'Joined room. Group call loaded on the right panel.', 'success');
    await loadRooms();
  } catch (error) {
    showMessage(workspaceMessage, error.message || 'Unable to join room.');
  }
}

async function handleApproveRequest(requestId) {
  try {
    const data = await apiRequest(`/api/rooms/requests/${requestId}/approve`, { method: 'POST' });
    showMessage(workspaceMessage, 'Room request approved successfully.', 'success');
    await Promise.all([loadRooms(), loadPendingRequests()]);

    if (data.inviteLink) {
      openRoomModal();
      resetRoomForm();
      roomModalTitle.textContent = 'Private invite generated';
      submitRoomButton.classList.add('is-hidden');
      inviteResult.classList.remove('is-hidden');
      inviteResultLink.href = data.inviteLink;
      inviteResultLink.textContent = data.inviteLink;
      showMessage(roomFormMessage, 'Copy this invite link and share it with approved participants.', 'success');
    }
  } catch (error) {
    showMessage(workspaceMessage, error.message || 'Unable to approve request.');
  }
}

async function handleRejectRequest(requestId) {
  const note = window.prompt('Optional rejection reason:', '');
  try {
    await apiRequest(`/api/rooms/requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || '' }),
    });
    showMessage(workspaceMessage, 'Room request rejected.', 'success');
    await loadPendingRequests();
  } catch (error) {
    showMessage(workspaceMessage, error.message || 'Unable to reject request.');
  }
}

function openCreateOrRequestModal() {
  const context = selectedContext();
  if (!context) return;

  const directMode = context.canCreate;
  const hostCommunities = directMode ? state.availableCommunities : state.requestHostCommunities;
  resetRoomForm();
  populateCommunitySelect(hostCommunities, {
    emptyLabel: directMode ? 'No specific course' : 'Select course',
  });
  contextForRoomDefaults();
  if (!directMode && communityInput && !communityInput.value && hostCommunities.length === 1) {
    communityInput.value = String(hostCommunities[0].id);
  }
  syncVisibilityOptions(directMode);
  submitRoomButton.classList.remove('is-hidden');

  roomModalTitle.textContent = directMode ? 'Create room' : 'Request room approval';
  submitRoomButton.textContent = directMode ? 'Create room' : 'Submit request';
  openRoomModal();
}

async function handleRoomFormSubmit(event) {
  event.preventDefault();
  const context = selectedContext();
  if (!context) return;

  const payload = buildPayloadFromForm();
  const directMode = context.canCreate;
  const endpoint = directMode ? '/api/rooms' : '/api/rooms/requests';

  submitRoomButton.disabled = true;
  showMessage(roomFormMessage, directMode ? 'Creating room...' : 'Submitting request...');

  try {
    const data = await apiRequest(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (directMode) {
      const room = data.room || {};
      if (meetIdPreview) {
        meetIdPreview.value = room.meetId || 'Generated';
      }
      showMessage(roomFormMessage, 'Room created. Joining call...', 'success');
      if (data.inviteLink && inviteResult && inviteResultLink) {
        inviteResult.classList.remove('is-hidden');
        inviteResultLink.href = data.inviteLink;
        inviteResultLink.textContent = data.inviteLink;
      }

      if (room.id) {
        const joinData = await apiRequest(`/api/rooms/${room.id}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (joinData.joinUrl) {
          openCallPanel(joinData.joinUrl, room);
        }
      }

      closeRoomModal();
      showMessage(workspaceMessage, 'Room created and joined successfully.', 'success');
    } else {
      showMessage(roomFormMessage, 'Room request submitted for moderator/admin review.', 'success');
      setTimeout(() => closeRoomModal(), 900);
    }

    await loadRooms();
    if (state.viewer && state.viewer.canReviewRequests) {
      await loadPendingRequests();
    }
  } catch (error) {
    showMessage(roomFormMessage, error.message || 'Submission failed.');
  } finally {
    submitRoomButton.disabled = false;
  }
}

if (openCreateRoomButton) {
  openCreateRoomButton.addEventListener('click', openCreateOrRequestModal);
}

if (refreshRoomsButton) {
  refreshRoomsButton.addEventListener('click', async () => {
    await loadRooms();
    if (state.viewer && state.viewer.canReviewRequests) {
      await loadPendingRequests();
    }
  });
}

if (stateFilter) {
  stateFilter.addEventListener('change', () => {
    loadRooms();
  });
}

if (mineOnlyToggle) {
  mineOnlyToggle.addEventListener('change', () => {
    loadRooms();
  });
}

if (meetSearchForm) {
  meetSearchForm.addEventListener('submit', handleSearchRoomByMeetId);
}

if (meetIdSearchInput) {
  meetIdSearchInput.addEventListener('input', () => {
    clearMeetSearchResult();
  });
}

if (visibilityInput) {
  visibilityInput.addEventListener('change', togglePrivateField);
}

if (roomModalClose) {
  roomModalClose.addEventListener('click', closeRoomModal);
}

if (roomModal) {
  roomModal.addEventListener('click', (event) => {
    if (event.target === roomModal) {
      closeRoomModal();
    }
  });
}

if (roomForm) {
  roomForm.addEventListener('submit', handleRoomFormSubmit);
}

if (leaveCallButton) {
  leaveCallButton.addEventListener('click', async () => {
    await closeCallPanel({ notifyServer: true });
    showMessage(workspaceMessage, 'You left the call.', 'success');
    await loadRooms();
  });
}

window.addEventListener('message', handleCallWindowMessage);

async function init() {
  const prejoinedRoom = consumePrejoinedRoom();
  try {
    clearMeetSearchResult();
    await loadRoomsContentSettings();
    await loadBootstrap();
    await loadRooms();
    if (prejoinedRoom && prejoinedRoom.joinUrl) {
      openCallPanel(prejoinedRoom.joinUrl, {
        id: prejoinedRoom.roomId,
        meetId: prejoinedRoom.meetId,
        meetName: prejoinedRoom.meetName,
      });
      showMessage(workspaceMessage, 'Joined room from Home sidecard.', 'success');
    }
    if (state.viewer && state.viewer.canReviewRequests) {
      await loadPendingRequests();
    }
  } catch (error) {
    showMessage(workspaceMessage, error.message || 'Failed to load Rooms.');
  }
}

init();
