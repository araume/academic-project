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
const conversationControls = document.getElementById('conversationControls');
const toggleReadButton = document.getElementById('toggleReadButton');
const toggleArchiveButton = document.getElementById('toggleArchiveButton');
const toggleMuteButton = document.getElementById('toggleMuteButton');
const deleteConversationButton = document.getElementById('deleteConversationButton');
const leaveConversationButton = document.getElementById('leaveConversationButton');
const messageList = document.getElementById('messageList');
const typingIndicator = document.getElementById('typingIndicator');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messageSend = document.getElementById('messageSend');
const messageFeedback = document.getElementById('messageFeedback');
const chatFocusToggle = document.getElementById('chatFocusToggle');
const replyPreview = document.getElementById('replyPreview');
const replyPreviewAuthor = document.getElementById('replyPreviewAuthor');
const replyPreviewText = document.getElementById('replyPreviewText');
const clearReplyButton = document.getElementById('clearReplyButton');
const messageAttachmentInput = document.getElementById('messageAttachmentInput');
const messageAttachmentPreview = document.getElementById('messageAttachmentPreview');
const messageAttachmentName = document.getElementById('messageAttachmentName');
const removeMessageAttachmentButton = document.getElementById('removeMessageAttachmentButton');
const emojiToggleButton = document.getElementById('emojiToggleButton');
const emojiPicker = document.getElementById('emojiPicker');

const openGroupModal = document.getElementById('openGroupModal');
const groupModal = document.getElementById('groupModal');
const groupModalClose = document.getElementById('groupModalClose');
const groupForm = document.getElementById('groupForm');
const groupTitle = document.getElementById('groupTitle');
const groupMembers = document.getElementById('groupMembers');
const groupMessage = document.getElementById('groupMessage');

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
  typingByConversation: new Map(),
  activeReplyMessageId: null,
  chatFocus: false,
};

let pollTimer = null;
let typingStopTimer = null;
let lastTypingPingAt = 0;

const EMOJI_CHOICES = ['😀', '😁', '😂', '😊', '😍', '😎', '🤔', '👍', '👏', '🔥', '🎯', '📚', '✅', '🚀'];

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

function setAvatarContent(container, photoLink, displayName, altText) {
  if (!container) return;
  container.textContent = '';
  if (photoLink) {
    const img = document.createElement('img');
    img.src = photoLink;
    img.alt = altText || `${displayName || 'User'} profile photo`;
    container.appendChild(img);
    return;
  }
  container.textContent = initialsFromName(displayName || 'Member');
}

function showMessage(target, text, type = 'error') {
  if (!target) return;
  target.textContent = text || '';
  target.style.color = type === 'success' ? '#2f9e68' : '#9d3f36';
}

function clearReplySelection() {
  state.activeReplyMessageId = null;
  if (replyPreview) replyPreview.classList.add('is-hidden');
  if (replyPreviewAuthor) replyPreviewAuthor.textContent = '';
  if (replyPreviewText) replyPreviewText.textContent = '';
}

function setReplySelection(message) {
  if (!message || !Number.isInteger(Number(message.id))) {
    clearReplySelection();
    return;
  }
  state.activeReplyMessageId = Number(message.id);
  if (!replyPreview || !replyPreviewAuthor || !replyPreviewText) return;
  replyPreviewAuthor.textContent = `Replying to ${message.senderName || 'Member'}`;
  const snippet = (message.body || '').replace(/\s+/g, ' ').trim();
  replyPreviewText.textContent = snippet ? (snippet.length > 130 ? `${snippet.slice(0, 130)}...` : snippet) : '[Attachment]';
  replyPreview.classList.remove('is-hidden');
}

function updateAttachmentPreview() {
  if (!messageAttachmentInput || !messageAttachmentPreview || !messageAttachmentName) return;
  const file = messageAttachmentInput.files && messageAttachmentInput.files[0] ? messageAttachmentInput.files[0] : null;
  if (!file) {
    messageAttachmentPreview.classList.add('is-hidden');
    messageAttachmentName.textContent = '';
    return;
  }
  messageAttachmentName.textContent = `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`;
  messageAttachmentPreview.classList.remove('is-hidden');
}

function clearMessageAttachment() {
  if (messageAttachmentInput) {
    messageAttachmentInput.value = '';
  }
  updateAttachmentPreview();
}

function setChatFocusMode(enabled) {
  state.chatFocus = enabled === true;
  document.body.classList.toggle('chat-focus-mode', state.chatFocus);
  if (chatFocusToggle) {
    chatFocusToggle.textContent = state.chatFocus ? 'Exit expanded' : 'Expand chat';
  }
}

function renderEmojiPicker() {
  if (!emojiPicker) return;
  emojiPicker.innerHTML = '';
  EMOJI_CHOICES.forEach((emoji) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-option';
    button.dataset.emoji = emoji;
    button.textContent = emoji;
    emojiPicker.appendChild(button);
  });
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

function profileUrlForUid(uid) {
  const safeUid = typeof uid === 'string' ? uid.trim() : '';
  if (!safeUid) return '';
  return `/profile?uid=${encodeURIComponent(safeUid)}`;
}

function buildProfileNameNode(uid, displayName, className = 'connection-name-link') {
  const label = displayName || 'Member';
  const url = profileUrlForUid(uid);
  if (!url) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = label;
    return span;
  }
  const link = document.createElement('a');
  link.className = className;
  link.href = url;
  link.textContent = label;
  return link;
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
    setAvatarContent(avatar, user.photoLink, user.displayName || 'User', `${user.displayName || 'User'} profile photo`);

    const head = document.createElement('div');
    head.className = 'person-head';

    const name = document.createElement('h3');
    name.appendChild(buildProfileNameNode(user.uid || '', user.displayName || 'Member'));

    const meta = document.createElement('p');
    meta.className = 'person-meta';
    const usernameHandle = user.username ? `@${user.username}` : '';
    meta.textContent = `${usernameHandle ? `${usernameHandle} • ` : ''}${user.course || 'No course set'} • ${relationLabel(user.relation)}`;

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
    setAvatarContent(
      avatar,
      request.user.photoLink,
      request.user.displayName || 'User',
      `${request.user.displayName || 'User'} profile photo`
    );

    const metaWrap = document.createElement('div');
    const title = document.createElement('h4');
    title.appendChild(
      buildProfileNameNode(
        request.user && request.user.uid ? request.user.uid : '',
        request.user && request.user.displayName ? request.user.displayName : 'Member'
      )
    );
    const meta = document.createElement('p');
    const requestUsernameHandle = request.user && request.user.username
      ? `@${request.user.username}`
      : '';
    meta.textContent = `${requestUsernameHandle ? `${requestUsernameHandle} • ` : ''}${request.user.course || 'No course'}`;

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
    if (conversation.unreadCount > 0) {
      title.textContent = `(${conversation.unreadCount}) ${title.textContent}`;
    }

    const preview = document.createElement('p');
    const previewBody = conversation.lastMessage ? conversation.lastMessage.body.slice(0, 72) : 'No messages yet';
    const badges = [];
    if (conversation.isMuted) badges.push('Muted');
    if (conversation.isArchived) badges.push('Archived');
    preview.textContent = badges.length ? `${badges.join(' • ')} • ${previewBody}` : previewBody;

    button.appendChild(title);
    button.appendChild(preview);
    conversationList.appendChild(button);
  });
}

function findMessageInActiveConversation(messageId) {
  const activeMessages = state.messagesByConversation.get(state.activeConversationId) || [];
  return activeMessages.find((item) => Number(item.id) === Number(messageId)) || null;
}

function renderTypingIndicator() {
  if (!typingIndicator) return;
  if (!state.activeConversationId) {
    typingIndicator.textContent = '';
    return;
  }
  const typingUsers = state.typingByConversation.get(state.activeConversationId) || [];
  if (!typingUsers.length) {
    typingIndicator.textContent = '';
    return;
  }
  const names = typingUsers.map((item) => item.displayName || 'Member').slice(0, 2);
  if (typingUsers.length === 1) {
    typingIndicator.textContent = `${names[0]} is typing...`;
    return;
  }
  if (typingUsers.length === 2) {
    typingIndicator.textContent = `${names[0]} and ${names[1]} are typing...`;
    return;
  }
  typingIndicator.textContent = `${names[0]}, ${names[1]} and others are typing...`;
}

function getActiveConversation() {
  if (!state.activeConversationId) return null;
  return state.conversations.find((item) => item.id === state.activeConversationId) || null;
}

function renderConversationControls() {
  const conversation = getActiveConversation();
  const hasConversation = Boolean(conversation);

  if (conversationControls) {
    conversationControls.classList.toggle('is-hidden', !hasConversation);
  }

  if (toggleReadButton) {
    toggleReadButton.disabled = !hasConversation;
    toggleReadButton.textContent = conversation && conversation.isRead ? 'Mark unread' : 'Mark read';
  }
  if (toggleArchiveButton) {
    toggleArchiveButton.disabled = !hasConversation;
    toggleArchiveButton.textContent = conversation && conversation.isArchived ? 'Unarchive' : 'Archive';
  }
  if (toggleMuteButton) {
    toggleMuteButton.disabled = !hasConversation;
    toggleMuteButton.textContent = conversation && conversation.isMuted ? 'Unmute' : 'Mute';
  }
  if (deleteConversationButton) {
    deleteConversationButton.disabled = !hasConversation;
  }
  if (leaveConversationButton) {
    leaveConversationButton.disabled = !hasConversation || !(conversation && conversation.canLeave);
  }
}

function renderMessages() {
  if (!messageList || !activeConversationTitle || !activeConversationMeta) return;

  const nearBottom =
    messageList.scrollHeight <= messageList.clientHeight + 8 ||
    messageList.scrollHeight - (messageList.scrollTop + messageList.clientHeight) < 72;

  messageList.innerHTML = '';

  if (!state.activeConversationId) {
    activeConversationTitle.textContent = 'Select a conversation';
    activeConversationMeta.textContent = 'Messages stay inside this panel and won’t expand the page.';
    messageInput.value = '';
    messageInput.disabled = true;
    messageSend.disabled = true;
    if (emojiToggleButton) emojiToggleButton.disabled = true;
    if (messageAttachmentInput) messageAttachmentInput.disabled = true;
    if (emojiPicker) emojiPicker.classList.add('is-hidden');
    clearReplySelection();
    clearMessageAttachment();
    renderTypingIndicator();
    renderConversationControls();
    renderEmptyState(messageList, 'Pick a conversation to start messaging.');
    return;
  }

  const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
  if (!conversation) {
    messageInput.value = '';
    messageInput.disabled = true;
    messageSend.disabled = true;
    if (emojiToggleButton) emojiToggleButton.disabled = true;
    if (messageAttachmentInput) messageAttachmentInput.disabled = true;
    clearReplySelection();
    clearMessageAttachment();
    renderTypingIndicator();
    renderConversationControls();
    renderEmptyState(messageList, 'Conversation not found.');
    return;
  }

  activeConversationTitle.textContent = conversation.title || 'Conversation';
  activeConversationMeta.textContent = `${conversation.threadType === 'group' ? 'Group chat' : 'Direct chat'} • ${conversation.participants.length} participant${conversation.participants.length === 1 ? '' : 's'}`;

  messageInput.disabled = false;
  messageSend.disabled = false;
  if (emojiToggleButton) emojiToggleButton.disabled = false;
  if (messageAttachmentInput) messageAttachmentInput.disabled = false;
  renderTypingIndicator();
  renderConversationControls();

  const messages = state.messagesByConversation.get(state.activeConversationId) || [];
  if (!messages.length) {
    renderEmptyState(messageList, 'No messages yet. Send the first one.');
    return;
  }

  messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble${message.senderUid === state.me?.uid ? ' own' : ''}`;
    bubble.dataset.messageId = String(message.id);

    if (message.replyTo && message.replyTo.id) {
      const replyBlock = document.createElement('div');
      replyBlock.className = 'message-reply-ref';
      const replyAuthor = document.createElement('strong');
      replyAuthor.textContent = message.replyTo.senderName || 'Member';
      const replyText = document.createElement('span');
      replyText.textContent = message.replyTo.bodySnippet || '[Original message]';
      replyBlock.appendChild(replyAuthor);
      replyBlock.appendChild(replyText);
      bubble.appendChild(replyBlock);
    }

    const body = document.createElement('div');
    body.className = 'message-text';
    body.textContent = message.body;
    if (message.body) {
      bubble.appendChild(body);
    }

    if (message.attachment && message.attachment.link) {
      if (message.attachment.type === 'video') {
        const video = document.createElement('video');
        video.className = 'message-attachment-video';
        video.src = message.attachment.link;
        video.controls = true;
        video.preload = 'metadata';
        bubble.appendChild(video);
      } else {
        const image = document.createElement('img');
        image.className = 'message-attachment-image';
        image.src = message.attachment.link;
        image.alt = message.attachment.filename || 'Attached image';
        image.loading = 'lazy';
        bubble.appendChild(image);
      }
    } else if (message.attachment) {
      const attachmentFallback = document.createElement('div');
      attachmentFallback.className = 'message-reply-ref';
      const fallbackLabel = document.createElement('strong');
      fallbackLabel.textContent = message.attachment.type === 'video' ? 'Video attachment' : 'Image attachment';
      const fallbackText = document.createElement('span');
      fallbackText.textContent = message.attachment.filename || 'Attachment is not available.';
      attachmentFallback.appendChild(fallbackLabel);
      attachmentFallback.appendChild(fallbackText);
      bubble.appendChild(attachmentFallback);
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const date = new Date(message.createdAt);
    meta.textContent = `${message.senderName || 'Member'} • ${date.toLocaleString()}`;

    bubble.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (!message.isDeleted) {
      const replyButton = document.createElement('button');
      replyButton.type = 'button';
      replyButton.className = 'message-action-button';
      replyButton.dataset.action = 'reply-message';
      replyButton.dataset.id = String(message.id);
      replyButton.textContent = 'Reply';
      actions.appendChild(replyButton);
    }

    if (!message.isDeleted && message.senderUid !== state.me?.uid) {
      const reportButton = document.createElement('button');
      reportButton.type = 'button';
      reportButton.className = 'message-action-button warn';
      reportButton.dataset.action = 'report-message';
      reportButton.dataset.id = String(message.id);
      reportButton.textContent = 'Report';
      actions.appendChild(reportButton);
    }

    if (!message.isDeleted && message.senderUid === state.me?.uid) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'message-action-button delete';
      deleteButton.dataset.action = 'delete-message';
      deleteButton.dataset.id = String(message.id);
      deleteButton.textContent = 'Delete';
      actions.appendChild(deleteButton);
    }

    if (actions.children.length) {
      bubble.appendChild(actions);
    }
    messageList.appendChild(bubble);
  });

  if (nearBottom) {
    messageList.scrollTop = messageList.scrollHeight;
  }
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

async function refreshConversationList(keepSelection = true) {
  const data = await apiRequest('/api/connections/conversations?page=1&pageSize=40&scope=all');
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
}

async function loadConversations(keepSelection = true) {
  await refreshConversationList(keepSelection);
  if (state.activeConversationId) {
    await Promise.all([loadMessages(state.activeConversationId), loadTypingUsers(state.activeConversationId)]);
  }
  startConversationPolling();
}

async function loadMessages(conversationId) {
  const data = await apiRequest(`/api/connections/conversations/${conversationId}/messages?page=1&pageSize=80`);
  state.messagesByConversation.set(conversationId, data.messages || []);
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (conversation) {
    conversation.unreadCount = 0;
    conversation.isRead = true;
  }
  renderConversationList();
  renderMessages();
}

async function loadTypingUsers(conversationId) {
  const data = await apiRequest(`/api/connections/conversations/${conversationId}/typing`);
  state.typingByConversation.set(conversationId, data.typingUsers || []);
  renderTypingIndicator();
}

async function postTypingState(isTyping) {
  if (!state.activeConversationId) return;
  await apiRequest(`/api/connections/conversations/${state.activeConversationId}/typing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isTyping: isTyping === true }),
  });
}

function stopTypingTimeout() {
  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }
}

function queueTypingHeartbeat() {
  if (!state.activeConversationId || !messageInput || messageInput.disabled) return;
  const text = (messageInput.value || '').trim();
  if (!text) {
    postTypingState(false).catch(() => {});
    stopTypingTimeout();
    return;
  }

  const now = Date.now();
  if (now - lastTypingPingAt >= 1700) {
    lastTypingPingAt = now;
    postTypingState(true).catch(() => {});
  }

  stopTypingTimeout();
  typingStopTimer = setTimeout(() => {
    postTypingState(false).catch(() => {});
  }, 3000);
}

function stopConversationPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startConversationPolling() {
  stopConversationPolling();
  if (!state.activeConversationId) return;
  pollTimer = setInterval(async () => {
    try {
      await refreshConversationList(true);
      const activeId = state.activeConversationId;
      if (!activeId) return;
      await Promise.all([loadMessages(activeId), loadTypingUsers(activeId)]);
    } catch (error) {
      // suppress polling errors to avoid noisy UI
    }
  }, 4500);
}

async function openConversation(conversationId) {
  if (state.activeConversationId && state.activeConversationId !== conversationId) {
    state.typingByConversation.delete(state.activeConversationId);
    postTypingState(false).catch(() => {});
  }
  state.activeConversationId = conversationId;
  clearReplySelection();
  clearMessageAttachment();
  renderConversationList();
  renderMessages();
  await Promise.all([loadMessages(conversationId), loadTypingUsers(conversationId)]);
  startConversationPolling();
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

async function handleConversationAction(action) {
  const conversation = getActiveConversation();
  if (!conversation || !state.activeConversationId) {
    showMessage(messageFeedback, 'Select a conversation first.');
    return;
  }

  const threadId = state.activeConversationId;

  if (action === 'toggle-read') {
    const endpoint = conversation.isRead ? 'mark-unread' : 'mark-read';
    await apiRequest(`/api/connections/conversations/${threadId}/${endpoint}`, {
      method: 'POST',
    });
    conversation.isRead = !conversation.isRead;
    conversation.unreadCount = conversation.isRead ? 0 : Math.max(1, Number(conversation.unreadCount || 0));
    renderConversationList();
    renderConversationControls();
    showMessage(messageFeedback, conversation.isRead ? 'Conversation marked as read.' : 'Conversation marked as unread.', 'success');
    return;
  }

  if (action === 'toggle-archive') {
    const endpoint = conversation.isArchived ? 'unarchive' : 'archive';
    await apiRequest(`/api/connections/conversations/${threadId}/${endpoint}`, {
      method: 'POST',
    });
    await refreshConversationList(true);
    showMessage(messageFeedback, conversation.isArchived ? 'Conversation unarchived.' : 'Conversation archived.', 'success');
    return;
  }

  if (action === 'toggle-mute') {
    const endpoint = conversation.isMuted ? 'unmute' : 'mute';
    await apiRequest(`/api/connections/conversations/${threadId}/${endpoint}`, {
      method: 'POST',
    });
    conversation.isMuted = !conversation.isMuted;
    renderConversationList();
    renderConversationControls();
    showMessage(messageFeedback, conversation.isMuted ? 'Conversation muted.' : 'Conversation unmuted.', 'success');
    return;
  }

  if (action === 'delete-conversation') {
    const confirmed = window.confirm('Delete this conversation from your list? New messages can make it appear again.');
    if (!confirmed) return;
    await apiRequest(`/api/connections/conversations/${threadId}`, {
      method: 'DELETE',
    });
    state.messagesByConversation.delete(threadId);
    state.typingByConversation.delete(threadId);
    state.activeConversationId = null;
    await refreshConversationList(false);
    if (state.activeConversationId) {
      await Promise.all([loadMessages(state.activeConversationId), loadTypingUsers(state.activeConversationId)]);
    } else {
      renderMessages();
    }
    showMessage(messageFeedback, 'Conversation deleted from your view.', 'success');
    return;
  }

  if (action === 'leave-conversation') {
    if (!conversation.canLeave) {
      showMessage(messageFeedback, 'Only group conversations can be left.');
      return;
    }
    const confirmed = window.confirm('Leave this group conversation?');
    if (!confirmed) return;
    await apiRequest(`/api/connections/conversations/${threadId}/leave`, {
      method: 'POST',
    });
    state.messagesByConversation.delete(threadId);
    state.typingByConversation.delete(threadId);
    state.activeConversationId = null;
    await refreshConversationList(false);
    if (state.activeConversationId) {
      await Promise.all([loadMessages(state.activeConversationId), loadTypingUsers(state.activeConversationId)]);
    } else {
      renderMessages();
    }
    showMessage(messageFeedback, 'You left the group conversation.', 'success');
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
  const file = messageAttachmentInput && messageAttachmentInput.files && messageAttachmentInput.files[0]
    ? messageAttachmentInput.files[0]
    : null;
  if (!text && !file) {
    showMessage(messageFeedback, 'Write a message or attach an image/video.');
    return;
  }

  try {
    const payload = new FormData();
    if (text) payload.append('body', text);
    if (file) payload.append('attachment', file);
    if (state.activeReplyMessageId) {
      payload.append('parentMessageId', String(state.activeReplyMessageId));
    }

    const data = await apiRequest(`/api/connections/conversations/${state.activeConversationId}/messages`, {
      method: 'POST',
      body: payload,
    });

    const currentMessages = state.messagesByConversation.get(state.activeConversationId) || [];
    currentMessages.push(data.message);
    state.messagesByConversation.set(state.activeConversationId, currentMessages);
    messageInput.value = '';
    clearReplySelection();
    clearMessageAttachment();
    stopTypingTimeout();
    postTypingState(false).catch(() => {});
    renderMessages();
    await Promise.all([refreshConversationList(true), loadTypingUsers(state.activeConversationId)]);
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

if (messageList) {
  messageList.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button[data-action][data-id]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    const messageId = Number(actionButton.dataset.id);
    if (!Number.isInteger(messageId) || messageId <= 0) return;

    if (action === 'reply-message') {
      const message = findMessageInActiveConversation(messageId);
      setReplySelection(message);
      if (messageInput) {
        messageInput.focus();
      }
      return;
    }

    if (action === 'report-message') {
      const reasonInput = window.prompt('Report this message? Optional reason:', '');
      if (reasonInput === null) return;
      try {
        await apiRequest(`/api/connections/messages/${messageId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reasonInput.trim() }),
        });
        showMessage(messageFeedback, 'Message reported.', 'success');
      } catch (error) {
        showMessage(messageFeedback, error.message);
      }
    }

    if (action === 'delete-message') {
      const confirmed = window.confirm('Delete this message for everyone in the conversation?');
      if (!confirmed) return;
      try {
        const data = await apiRequest(`/api/connections/messages/${messageId}`, {
          method: 'DELETE',
        });
        const activeMessages = state.messagesByConversation.get(state.activeConversationId) || [];
        const index = activeMessages.findIndex((item) => Number(item.id) === messageId);
        if (index !== -1) {
          activeMessages[index] = data.message || activeMessages[index];
          state.messagesByConversation.set(state.activeConversationId, activeMessages);
          renderMessages();
        }
        await refreshConversationList(true);
        showMessage(messageFeedback, 'Message deleted.', 'success');
      } catch (error) {
        showMessage(messageFeedback, error.message);
      }
    }
  });
}

if (messageForm) {
  messageForm.addEventListener('submit', submitMessage);
}

if (messageInput) {
  messageInput.addEventListener('input', () => {
    queueTypingHeartbeat();
  });
  messageInput.addEventListener('blur', () => {
    stopTypingTimeout();
    postTypingState(false).catch(() => {});
  });
}

if (messageAttachmentInput) {
  messageAttachmentInput.addEventListener('change', () => {
    updateAttachmentPreview();
  });
}

if (removeMessageAttachmentButton) {
  removeMessageAttachmentButton.addEventListener('click', () => {
    clearMessageAttachment();
  });
}

if (clearReplyButton) {
  clearReplyButton.addEventListener('click', () => {
    clearReplySelection();
  });
}

if (emojiToggleButton && emojiPicker) {
  emojiToggleButton.addEventListener('click', () => {
    emojiPicker.classList.toggle('is-hidden');
  });
}

if (emojiPicker) {
  emojiPicker.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-emoji]');
    if (!button || !messageInput) return;
    messageInput.value = `${messageInput.value || ''}${button.dataset.emoji || ''}`;
    messageInput.focus();
    queueTypingHeartbeat();
  });
}

if (chatFocusToggle) {
  chatFocusToggle.addEventListener('click', () => {
    setChatFocusMode(!state.chatFocus);
  });
}

if (toggleReadButton) {
  toggleReadButton.addEventListener('click', async () => {
    try {
      await handleConversationAction('toggle-read');
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (toggleArchiveButton) {
  toggleArchiveButton.addEventListener('click', async () => {
    try {
      await handleConversationAction('toggle-archive');
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (toggleMuteButton) {
  toggleMuteButton.addEventListener('click', async () => {
    try {
      await handleConversationAction('toggle-mute');
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (deleteConversationButton) {
  deleteConversationButton.addEventListener('click', async () => {
    try {
      await handleConversationAction('delete-conversation');
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
}

if (leaveConversationButton) {
  leaveConversationButton.addEventListener('click', async () => {
    try {
      await handleConversationAction('leave-conversation');
    } catch (error) {
      showMessage(messageFeedback, error.message);
    }
  });
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

window.addEventListener('beforeunload', () => {
  stopConversationPolling();
  stopTypingTimeout();
});

async function init() {
  try {
    renderEmojiPicker();
    setChatFocusMode(false);
    renderConversationControls();
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
