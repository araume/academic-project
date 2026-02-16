const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const followingCount = document.getElementById('followingCount');
const followersCount = document.getElementById('followersCount');
const pendingCount = document.getElementById('pendingCount');
const quickListButtons = Array.from(document.querySelectorAll('[data-quick-list]'));

const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const userResults = document.getElementById('userResults');
const searchResultCount = document.getElementById('searchResultCount');
const listTypeChips = Array.from(document.querySelectorAll('.chip[data-list-type]'));
const userListModal = document.getElementById('userListModal');
const userListModalClose = document.getElementById('userListModalClose');
const userListModalTitle = document.getElementById('userListModalTitle');
const userListModalMeta = document.getElementById('userListModalMeta');

const requestTabs = Array.from(document.querySelectorAll('.request-tab'));
const requestList = document.getElementById('requestList');

const conversationList = document.getElementById('conversationList');
const activeConversationTitle = document.getElementById('activeConversationTitle');
const activeConversationMeta = document.getElementById('activeConversationMeta');
const messageList = document.getElementById('messageList');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messageSend = document.getElementById('messageSend');
const messageFeedback = document.getElementById('messageFeedback');

const openGroupModal = document.getElementById('openGroupModal');
const groupModal = document.getElementById('groupModal');
const groupModalClose = document.getElementById('groupModalClose');
const groupForm = document.getElementById('groupForm');
const groupTitle = document.getElementById('groupTitle');
const groupMembers = document.getElementById('groupMembers');
const groupMessage = document.getElementById('groupMessage');

const DEFAULT_AVATAR = '/assets/LOGO.png';

const state = {
  me: null,
  searchQuery: '',
  listType: null,
  userListVisible: false,
  activeRequestTab: 'follow',
  users: [],
  requests: [],
  conversations: [],
  activeConversationId: null,
  messagesByConversation: new Map(),
};

function initialsFromName(name) {
  const safe = (name || '').trim();
  if (!safe) return 'ME';
  const parts = safe.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
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

function showMessage(target, text, type = 'error') {
  if (!target) return;
  target.textContent = text || '';
  target.style.color = type === 'success' ? '#2f9e68' : '#9d3f36';
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
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

function describePresence(presence) {
  if (!presence || presence.status === 'hidden') {
    return { label: 'Hidden', className: 'is-hidden' };
  }
  if (presence.status === 'active') {
    return { label: 'Active now', className: 'is-active' };
  }
  return { label: 'Inactive', className: 'is-inactive' };
}

function relationLabel(relation) {
  if (!relation) return 'No connection';
  if (relation.isFollowing && relation.followsYou) return 'Mutual connection';
  if (relation.isFollowing) return 'Following';
  if (relation.followsYou) return 'Follows you';
  if (relation.followRequestSent) return 'Follow request sent';
  if (relation.followRequestReceived) return 'Requested to follow you';
  return 'No connection yet';
}

function renderEmptyState(target, text) {
  target.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  target.appendChild(empty);
}

function updateUserListModalHeader(count = 0) {
  if (!userListModalTitle || !userListModalMeta) return;

  if (state.searchQuery) {
    userListModalTitle.textContent = `Search: "${state.searchQuery}"`;
    userListModalMeta.textContent = `${count} result${count === 1 ? '' : 's'}`;
    return;
  }

  const labelMap = {
    following: 'Following',
    followers: 'Followers',
    mutual: 'Mutual',
  };
  const label = labelMap[state.listType] || 'Connections';
  userListModalTitle.textContent = label;
  if (state.listType) {
    userListModalMeta.textContent = `${count} user${count === 1 ? '' : 's'}`;
  } else {
    userListModalMeta.textContent = 'Choose a list or run a search to view users.';
  }
}

function renderUserCards() {
  if (!userResults) return;
  userResults.innerHTML = '';

  if (!state.userListVisible && !state.searchQuery) {
    updateUserListModalHeader(0);
    renderEmptyState(userResults, 'Select Following or Followers to view the list.');
    searchResultCount.textContent = '0 results';
    return;
  }

  if (!state.users.length) {
    updateUserListModalHeader(0);
    renderEmptyState(userResults, state.searchQuery ? 'No users found for this search.' : `No ${state.listType} users to display yet.`);
    searchResultCount.textContent = '0 results';
    return;
  }

  updateUserListModalHeader(state.users.length);
  searchResultCount.textContent = `${state.users.length} result${state.users.length === 1 ? '' : 's'}`;

  state.users.forEach((user) => {
    const card = document.createElement('article');
    card.className = 'person-card';

    const top = document.createElement('div');
    top.className = 'person-top';

    const avatar = document.createElement('div');
    avatar.className = 'person-avatar';
    const avatarImg = document.createElement('img');
    avatarImg.src = user.photoLink || DEFAULT_AVATAR;
    avatarImg.alt = `${user.displayName || 'User'} profile photo`;
    avatar.appendChild(avatarImg);

    const head = document.createElement('div');
    head.className = 'person-head';

    const name = document.createElement('h3');
    name.textContent = user.displayName || 'Member';

    const meta = document.createElement('p');
    meta.className = 'person-meta';
    meta.textContent = `${user.course || 'No course set'} • ${relationLabel(user.relation)}`;

    const presenceInfo = describePresence(user.presence);
    const presence = document.createElement('div');
    presence.className = `presence ${presenceInfo.className}`;
    presence.innerHTML = '<span class="presence-dot"></span>';
    const presenceLabel = document.createElement('span');
    presenceLabel.textContent = presenceInfo.label;
    presence.appendChild(presenceLabel);

    head.appendChild(name);
    head.appendChild(meta);
    head.appendChild(presence);

    top.appendChild(avatar);
    top.appendChild(head);

    const bio = document.createElement('p');
    bio.className = 'person-bio';
    bio.textContent = user.bio || 'No bio added yet.';

    const actions = document.createElement('div');
    actions.className = 'person-actions';

    const profileLink = document.createElement('a');
    profileLink.className = 'secondary-button';
    profileLink.href = `/profile?uid=${encodeURIComponent(user.uid)}`;
    profileLink.textContent = 'View profile';
    actions.appendChild(profileLink);

    if (user.relation && user.relation.isFollowing) {
      const unfollowButton = document.createElement('button');
      unfollowButton.type = 'button';
      unfollowButton.className = 'warn';
      unfollowButton.dataset.action = 'unfollow';
      unfollowButton.dataset.uid = user.uid;
      unfollowButton.textContent = 'Unfollow';
      actions.appendChild(unfollowButton);
    } else if (user.relation && user.relation.followRequestSent) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ghost';
      cancelButton.dataset.action = 'cancel-follow';
      cancelButton.dataset.uid = user.uid;
      cancelButton.textContent = 'Cancel request';
      actions.appendChild(cancelButton);
    } else if (user.relation && user.relation.followRequestReceived) {
      const openRequestsButton = document.createElement('button');
      openRequestsButton.type = 'button';
      openRequestsButton.className = 'ghost';
      openRequestsButton.dataset.action = 'open-follow-requests';
      openRequestsButton.textContent = 'Respond in requests';
      actions.appendChild(openRequestsButton);
    } else {
      const followButton = document.createElement('button');
      followButton.type = 'button';
      followButton.dataset.action = 'follow';
      followButton.dataset.uid = user.uid;
      followButton.textContent = 'Follow';
      actions.appendChild(followButton);
    }

    const chatButton = document.createElement('button');
    chatButton.type = 'button';
    chatButton.className = 'ghost';
    chatButton.dataset.action = 'chat';
    chatButton.dataset.uid = user.uid;
    chatButton.textContent = user.relation && user.relation.isFollowing ? 'Message' : 'Request chat';
    actions.appendChild(chatButton);

    card.appendChild(top);
    card.appendChild(bio);
    card.appendChild(actions);
    userResults.appendChild(card);
  });
}

function renderRequests() {
  if (!requestList) return;
  requestList.innerHTML = '';

  if (!state.requests.length) {
    renderEmptyState(requestList, state.activeRequestTab === 'follow' ? 'No pending follow requests.' : 'No pending chat requests.');
    return;
  }

  state.requests.forEach((request) => {
    const item = document.createElement('article');
    item.className = 'request-item';

    const head = document.createElement('div');
    head.className = 'request-item-head';

    const avatar = document.createElement('div');
    avatar.className = 'person-avatar';
    const img = document.createElement('img');
    img.src = request.user.photoLink || DEFAULT_AVATAR;
    img.alt = `${request.user.displayName || 'User'} profile photo`;
    avatar.appendChild(img);

    const metaWrap = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = request.user.displayName || 'Member';
    const meta = document.createElement('p');
    meta.textContent = request.user.course || 'No course';

    metaWrap.appendChild(title);
    metaWrap.appendChild(meta);

    head.appendChild(avatar);
    head.appendChild(metaWrap);

    const actions = document.createElement('div');
    actions.className = 'request-item-actions';

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'accept';
    accept.dataset.action = state.activeRequestTab === 'follow' ? 'accept-follow' : 'accept-chat';
    accept.dataset.id = String(request.id);
    accept.textContent = 'Accept';

    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'decline';
    decline.dataset.action = state.activeRequestTab === 'follow' ? 'decline-follow' : 'decline-chat';
    decline.dataset.id = String(request.id);
    decline.textContent = 'Decline';

    actions.appendChild(accept);
    actions.appendChild(decline);

    item.appendChild(head);
    item.appendChild(actions);
    requestList.appendChild(item);
  });
}

function renderConversationList() {
  if (!conversationList) return;
  conversationList.innerHTML = '';

  if (!state.conversations.length) {
    renderEmptyState(conversationList, 'No conversations yet. Start one from the user list.');
    return;
  }

  state.conversations.forEach((conversation) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `conversation-item${conversation.id === state.activeConversationId ? ' is-active' : ''}`;
    button.dataset.action = 'open-conversation';
    button.dataset.id = String(conversation.id);

    const title = document.createElement('h4');
    title.textContent = conversation.title || 'Conversation';

    const preview = document.createElement('p');
    preview.textContent = conversation.lastMessage ? conversation.lastMessage.body.slice(0, 72) : 'No messages yet';

    button.appendChild(title);
    button.appendChild(preview);
    conversationList.appendChild(button);
  });
}

function renderMessages() {
  if (!messageList || !activeConversationTitle || !activeConversationMeta) return;

  messageList.innerHTML = '';

  if (!state.activeConversationId) {
    activeConversationTitle.textContent = 'Select a conversation';
    activeConversationMeta.textContent = 'Messages stay inside this panel and won’t expand the page.';
    messageInput.value = '';
    messageInput.disabled = true;
    messageSend.disabled = true;
    renderEmptyState(messageList, 'Pick a conversation to start messaging.');
    return;
  }

  const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
  if (!conversation) {
    renderEmptyState(messageList, 'Conversation not found.');
    return;
  }

  activeConversationTitle.textContent = conversation.title || 'Conversation';
  activeConversationMeta.textContent = `${conversation.threadType === 'group' ? 'Group chat' : 'Direct chat'} • ${conversation.participants.length} participant${conversation.participants.length === 1 ? '' : 's'}`;

  messageInput.disabled = false;
  messageSend.disabled = false;

  const messages = state.messagesByConversation.get(state.activeConversationId) || [];
  if (!messages.length) {
    renderEmptyState(messageList, 'No messages yet. Send the first one.');
    return;
  }

  messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble${message.senderUid === state.me?.uid ? ' own' : ''}`;

    const body = document.createElement('div');
    body.textContent = message.body;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const date = new Date(message.createdAt);
    meta.textContent = `${message.senderName || 'Member'} • ${date.toLocaleString()}`;

    bubble.appendChild(body);
    bubble.appendChild(meta);
    messageList.appendChild(bubble);
  });

  messageList.scrollTop = messageList.scrollHeight;
}

async function loadBootstrap() {
  const data = await apiRequest('/api/connections/bootstrap');
  state.me = data.me || null;

  if (state.me) {
    setNavAvatar(state.me.photoLink, state.me.displayName);
  }

  followingCount.textContent = String(data.counts?.following || 0);
  followersCount.textContent = String(data.counts?.followers || 0);
  pendingCount.textContent = String((data.counts?.incomingFollowRequests || 0) + (data.counts?.incomingChatRequests || 0));
}

async function loadUsers() {
  if (state.searchQuery) {
    const data = await apiRequest(`/api/connections/search?q=${encodeURIComponent(state.searchQuery)}&page=1&pageSize=24`);
    state.users = data.users || [];
    state.userListVisible = true;
  } else {
    if (!state.listType) {
      state.users = [];
      renderUserCards();
      return;
    }
    const data = await apiRequest(`/api/connections/list?type=${encodeURIComponent(state.listType)}&page=1&pageSize=24`);
    state.users = data.users || [];
    state.userListVisible = true;
  }

  renderUserCards();
}

async function loadRequests() {
  if (state.activeRequestTab === 'follow') {
    const data = await apiRequest('/api/connections/follow-requests?type=incoming&page=1&pageSize=30');
    state.requests = data.requests || [];
  } else {
    const data = await apiRequest('/api/connections/chat-requests?type=incoming&page=1&pageSize=30');
    state.requests = data.requests || [];
  }

  renderRequests();
}

async function loadConversations(keepSelection = true) {
  const data = await apiRequest('/api/connections/conversations?page=1&pageSize=40');
  state.conversations = data.conversations || [];

  if (!keepSelection || !state.activeConversationId) {
    state.activeConversationId = state.conversations[0] ? state.conversations[0].id : null;
  } else {
    const stillExists = state.conversations.some((conv) => conv.id === state.activeConversationId);
    if (!stillExists) {
      state.activeConversationId = state.conversations[0] ? state.conversations[0].id : null;
    }
  }

  renderConversationList();
  renderMessages();

  if (state.activeConversationId) {
    await loadMessages(state.activeConversationId);
  }
}

async function loadMessages(conversationId) {
  const data = await apiRequest(`/api/connections/conversations/${conversationId}/messages?page=1&pageSize=80`);
  state.messagesByConversation.set(conversationId, data.messages || []);
  renderMessages();
}

async function openConversation(conversationId) {
  state.activeConversationId = conversationId;
  renderConversationList();
  renderMessages();
  await loadMessages(conversationId);
}

function setActiveListChip(type) {
  state.listType = type;
  listTypeChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.listType === type);
  });
}

function setActiveRequestTab(tab) {
  state.activeRequestTab = tab;
  requestTabs.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.requestTab === tab);
  });
}

async function handleUserAction(action, uid) {
  if (!uid) return;

  if (action === 'follow') {
    await apiRequest('/api/connections/follow/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUid: uid }),
    });
    await Promise.all([loadUsers(), loadBootstrap()]);
    return;
  }

  if (action === 'cancel-follow') {
    await apiRequest('/api/connections/follow/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUid: uid }),
    });
    await loadUsers();
    return;
  }

  if (action === 'unfollow') {
    await apiRequest('/api/connections/unfollow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUid: uid }),
    });
    await Promise.all([loadUsers(), loadBootstrap()]);
    return;
  }

  if (action === 'chat') {
    const data = await apiRequest('/api/connections/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUid: uid }),
    });

    if (data.requiresApproval) {
      showMessage(messageFeedback, 'Chat request sent. Waiting for approval.', 'success');
      await loadBootstrap();
      return;
    }

    showMessage(messageFeedback, 'Conversation ready.', 'success');
    await loadConversations(false);
    if (data.threadId) {
      await openConversation(Number(data.threadId));
    }
    return;
  }

  if (action === 'open-follow-requests') {
    setActiveRequestTab('follow');
    await loadRequests();
  }
}

async function handleRequestAction(action, requestId) {
  if (!requestId) return;

  if (action === 'accept-follow' || action === 'decline-follow') {
    await apiRequest('/api/connections/follow/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: Number(requestId),
        action: action === 'accept-follow' ? 'accept' : 'decline',
      }),
    });
    await Promise.all([loadRequests(), loadUsers(), loadBootstrap()]);
    return;
  }

  if (action === 'accept-chat' || action === 'decline-chat') {
    const data = await apiRequest('/api/connections/chat/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: Number(requestId),
        action: action === 'accept-chat' ? 'accept' : 'decline',
      }),
    });

    await Promise.all([loadRequests(), loadConversations(false), loadBootstrap()]);
    if (data.threadId) {
      await openConversation(Number(data.threadId));
    }
  }
}

async function submitMessage(event) {
  event.preventDefault();
  showMessage(messageFeedback, '');

  if (!state.activeConversationId) {
    showMessage(messageFeedback, 'Select a conversation first.');
    return;
  }

  const text = (messageInput.value || '').trim();
  if (!text) {
    showMessage(messageFeedback, 'Message cannot be empty.');
    return;
  }

  try {
    const data = await apiRequest(`/api/connections/conversations/${state.activeConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });

    const currentMessages = state.messagesByConversation.get(state.activeConversationId) || [];
    currentMessages.push(data.message);
    state.messagesByConversation.set(state.activeConversationId, currentMessages);
    messageInput.value = '';
    renderMessages();
    await loadConversations(true);
  } catch (error) {
    showMessage(messageFeedback, error.message);
  }
}

function openModal(modal) {
  if (modal) {
    modal.classList.remove('is-hidden');
  }
}

function closeModal(modal) {
  if (modal) {
    modal.classList.add('is-hidden');
  }
}

async function loadGroupMemberOptions() {
  groupMembers.innerHTML = '';
  const data = await apiRequest('/api/connections/list?type=following&page=1&pageSize=100');

  if (!data.users.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'Follow users first to create group chats.';
    groupMembers.appendChild(option);
    return;
  }

  data.users.forEach((user) => {
    const option = document.createElement('option');
    option.value = user.uid;
    option.textContent = `${user.displayName} (${user.course || 'No course'})`;
    groupMembers.appendChild(option);
  });
}

async function createGroup(event) {
  event.preventDefault();
  showMessage(groupMessage, '');

  const title = (groupTitle.value || '').trim();
  const selectedMembers = Array.from(groupMembers.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);

  if (!title) {
    showMessage(groupMessage, 'Please enter a group title.');
    return;
  }

  if (!selectedMembers.length) {
    showMessage(groupMessage, 'Select at least one member.');
    return;
  }

  try {
    const data = await apiRequest('/api/connections/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, memberUids: selectedMembers }),
    });

    showMessage(groupMessage, 'Group chat created.', 'success');
    await loadConversations(false);
    if (data.threadId) {
      await openConversation(Number(data.threadId));
    }

    groupForm.reset();
    closeModal(groupModal);
  } catch (error) {
    showMessage(groupMessage, error.message);
  }
}

if (searchForm) {
  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.searchQuery = (searchInput.value || '').trim();
    state.userListVisible = Boolean(state.searchQuery);

    try {
      await loadUsers();
      if (state.userListVisible || state.searchQuery) {
        openModal(userListModal);
      }
    } catch (error) {
      renderEmptyState(userResults, error.message);
    }
  });
}

if (searchInput) {
  searchInput.addEventListener('input', async () => {
    const value = (searchInput.value || '').trim();
    if (!value) {
      state.searchQuery = '';
      if (!state.listType) {
        state.userListVisible = false;
        closeModal(userListModal);
      }
      await loadUsers().catch((error) => {
        renderEmptyState(userResults, error.message);
      });
    }
  });
}

listTypeChips.forEach((chip) => {
  chip.addEventListener('click', async () => {
    setActiveListChip(chip.dataset.listType);
    state.userListVisible = true;
    state.searchQuery = '';
    if (searchInput) {
      searchInput.value = '';
    }
    if (!state.searchQuery) {
      await loadUsers().catch((error) => {
        renderEmptyState(userResults, error.message);
      });
      openModal(userListModal);
    }
  });
});

quickListButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const type = button.dataset.quickList || '';
    if (!type) return;
    setActiveListChip(type);
    state.userListVisible = true;
    state.searchQuery = '';
    if (searchInput) {
      searchInput.value = '';
    }
    await loadUsers().catch((error) => {
      renderEmptyState(userResults, error.message);
    });
    openModal(userListModal);
  });
});

requestTabs.forEach((button) => {
  button.addEventListener('click', async () => {
    setActiveRequestTab(button.dataset.requestTab);
    await loadRequests().catch((error) => {
      renderEmptyState(requestList, error.message);
    });
  });
});

if (userResults) {
  userResults.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const { action, uid } = button.dataset;
    try {
      await handleUserAction(action, uid);
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (requestList) {
  requestList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button) return;

    try {
      await handleRequestAction(button.dataset.action, button.dataset.id);
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (conversationList) {
  conversationList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="open-conversation"]');
    if (!button) return;

    const conversationId = Number(button.dataset.id);
    if (!Number.isInteger(conversationId)) return;

    try {
      await openConversation(conversationId);
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (messageForm) {
  messageForm.addEventListener('submit', submitMessage);
}

if (openGroupModal) {
  openGroupModal.addEventListener('click', async () => {
    try {
      await loadGroupMemberOptions();
      showMessage(groupMessage, '');
      openModal(groupModal);
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (groupModalClose) {
  groupModalClose.addEventListener('click', () => closeModal(groupModal));
}

if (groupModal) {
  groupModal.addEventListener('click', (event) => {
    if (event.target === groupModal) {
      closeModal(groupModal);
    }
  });
}

if (groupForm) {
  groupForm.addEventListener('submit', createGroup);
}

if (userListModalClose) {
  userListModalClose.addEventListener('click', () => closeModal(userListModal));
}

if (userListModal) {
  userListModal.addEventListener('click', (event) => {
    if (event.target === userListModal) {
      closeModal(userListModal);
    }
  });
}

async function init() {
  try {
    await loadBootstrap();
    renderUserCards();
    setActiveRequestTab(state.activeRequestTab);
    await Promise.all([
      loadRequests(),
    ]);
    await loadConversations(true);
  } catch (error) {
    showMessage(messageFeedback, error.message);
    renderEmptyState(userResults, error.message);
    renderEmptyState(requestList, error.message);
    renderEmptyState(conversationList, error.message);
    renderEmptyState(messageList, error.message);
  }
}

init();
