const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const communityCount = document.getElementById('communityCount');
const communitySearch = document.getElementById('communitySearch');
const communityList = document.getElementById('communityList');

const selectedPlaceholder = document.getElementById('selectedPlaceholder');
const selectedContent = document.getElementById('selectedContent');
const selectedCommunityCode = document.getElementById('selectedCommunityCode');
const selectedCommunityName = document.getElementById('selectedCommunityName');
const selectedCommunityDescription = document.getElementById('selectedCommunityDescription');
const selectedStats = document.getElementById('selectedStats');
const communityMessage = document.getElementById('communityMessage');
const openRulesButton = document.getElementById('openRulesButton');
const membershipButton = document.getElementById('membershipButton');

const composeEligibility = document.getElementById('composeEligibility');
const openCreatePostButton = document.getElementById('openCreatePostButton');
const communityPostForm = document.getElementById('communityPostForm');
const postCourseName = document.getElementById('postCourseName');
const postTitle = document.getElementById('postTitle');
const postContent = document.getElementById('postContent');
const postVisibility = document.getElementById('postVisibility');
const attachmentFile = document.getElementById('attachmentFile');
const openLibraryPicker = document.getElementById('openLibraryPicker');
const selectedLibraryDoc = document.getElementById('selectedLibraryDoc');
const selectedLibraryDocTitle = document.getElementById('selectedLibraryDocTitle');
const clearLibraryDoc = document.getElementById('clearLibraryDoc');
const postSubmitButton = document.getElementById('postSubmitButton');
const postMessage = document.getElementById('postMessage');

const refreshFeedButton = document.getElementById('refreshFeedButton');
const feedList = document.getElementById('feedList');

const moderationCard = document.getElementById('moderationCard');
const joinRequestsList = document.getElementById('joinRequestsList');
const membersList = document.getElementById('membersList');
const reportsList = document.getElementById('reportsList');

const rulesModal = document.getElementById('rulesModal');
const rulesModalClose = document.getElementById('rulesModalClose');
const rulesCancel = document.getElementById('rulesCancel');
const rulesVersionLabel = document.getElementById('rulesVersionLabel');
const rulesContent = document.getElementById('rulesContent');
const rulesAcknowledge = document.getElementById('rulesAcknowledge');
const rulesAcceptButton = document.getElementById('rulesAcceptButton');
const rulesMessage = document.getElementById('rulesMessage');

const commentsModal = document.getElementById('commentsModal');
const commentsModalClose = document.getElementById('commentsModalClose');
const commentsModalTitle = document.getElementById('commentsModalTitle');
const commentsList = document.getElementById('commentsList');
const commentForm = document.getElementById('commentForm');
const commentInput = document.getElementById('commentInput');
const commentMessage = document.getElementById('commentMessage');

const createPostModal = document.getElementById('createPostModal');
const createPostModalClose = document.getElementById('createPostModalClose');
const libraryPickerModal = document.getElementById('libraryPickerModal');
const libraryPickerClose = document.getElementById('libraryPickerClose');
const libraryPickerSearch = document.getElementById('libraryPickerSearch');
const libraryPickerList = document.getElementById('libraryPickerList');

const DEFAULT_AVATAR = '/assets/LOGO.png';

const state = {
  viewer: null,
  profilePhotoLink: null,
  communities: [],
  selectedCommunityId: null,
  selectedCommunity: null,
  selectedDetail: null,
  feed: [],
  canPost: false,
  canModerate: false,
  joinRequests: [],
  members: [],
  reports: [],
  currentPostForComments: null,
  pendingRuleAction: null,
  selectedLibraryDocument: null,
};

let libraryPickerSearchTimer = null;

function initialsFromName(name) {
  const safe = (name || '').trim();
  if (!safe) return 'ME';
  const parts = safe.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
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

function formatAgo(dateString) {
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

function renderEmpty(target, text) {
  if (!target) return;
  target.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'empty-state';
  node.textContent = text;
  target.appendChild(node);
}

function closeRulesModalWindow() {
  state.pendingRuleAction = null;
  showMessage(rulesMessage, '');
  closeModal(rulesModal);
}

function updateSelectedLibraryDocUI() {
  if (!selectedLibraryDoc || !selectedLibraryDocTitle) return;
  if (!state.selectedLibraryDocument) {
    selectedLibraryDoc.classList.add('is-hidden');
    selectedLibraryDocTitle.textContent = '';
    return;
  }
  selectedLibraryDocTitle.textContent = state.selectedLibraryDocument.title || 'Selected document';
  selectedLibraryDoc.classList.remove('is-hidden');
}

async function loadLibraryPickerDocs(query = '') {
  if (!libraryPickerList) return;

  const q = query.trim();
  const params = new URLSearchParams({
    page: '1',
    pageSize: '50',
    sort: 'recent',
  });
  if (q) {
    params.set('q', q);
  }

  libraryPickerList.innerHTML = '<p>Loading documents...</p>';
  try {
    const data = await apiRequest(`/api/library/documents?${params.toString()}`);
    libraryPickerList.innerHTML = '';
    if (!data.documents || !data.documents.length) {
      libraryPickerList.innerHTML = '<p>No documents found.</p>';
      return;
    }

    data.documents.forEach((doc) => {
      const item = document.createElement('div');
      item.className = 'library-picker-item';

      const title = document.createElement('h4');
      title.textContent = doc.title || 'Untitled document';

      const meta = document.createElement('p');
      meta.textContent = `${doc.course || 'No course'} • ${doc.subject || 'No subject'}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Select document';
      button.addEventListener('click', () => {
        state.selectedLibraryDocument = {
          uuid: doc.uuid,
          title: doc.title || 'Untitled document',
        };
        if (attachmentFile) {
          attachmentFile.value = '';
        }
        updateSelectedLibraryDocUI();
        closeModal(libraryPickerModal);
      });

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(button);
      libraryPickerList.appendChild(item);
    });
  } catch (error) {
    libraryPickerList.innerHTML = `<p>${error.message}</p>`;
  }
}

function handleLibraryPickerSearch() {
  clearTimeout(libraryPickerSearchTimer);
  libraryPickerSearchTimer = setTimeout(() => {
    loadLibraryPickerDocs(libraryPickerSearch ? libraryPickerSearch.value : '');
  }, 250);
}

async function openLibraryDocument(uuid) {
  if (!uuid) return;
  try {
    const data = await apiRequest(`/api/library/documents/${uuid}`);
    if (data.document && data.document.link) {
      window.open(data.document.link, '_blank');
      return;
    }
    throw new Error('Document link is not available.');
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

function closeCreatePostModalWindow() {
  showMessage(postMessage, '');
  closeModal(libraryPickerModal);
  closeModal(createPostModal);
}

function openCreatePostModalWindow() {
  if (!state.selectedCommunityId || !state.selectedCommunity) {
    showMessage(communityMessage, 'Select a community first.');
    return;
  }
  if (!state.canPost) {
    showMessage(communityMessage, 'You cannot post in this community yet.');
    return;
  }

  if (postCourseName) {
    const code = state.selectedCommunity.courseCode ? `${state.selectedCommunity.courseCode} • ` : '';
    postCourseName.value = `${code}${state.selectedCommunity.courseName || 'Community'}`;
  }
  postTitle.value = '';
  postContent.value = '';
  postVisibility.value = 'community';
  if (attachmentFile) {
    attachmentFile.value = '';
  }
  state.selectedLibraryDocument = null;
  updateSelectedLibraryDocUI();
  showMessage(postMessage, '');
  openModal(createPostModal);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.code = data.code;
    error.payload = data;
    throw error;
  }
  return data;
}

function communityById(id) {
  return state.communities.find((community) => community.id === id) || null;
}

function communityMatchesQuery(community, query) {
  if (!query) return true;
  const combined = `${community.courseName || ''} ${community.courseCode || ''}`.toLowerCase();
  return combined.includes(query.toLowerCase());
}

function membershipLabelClass(stateValue) {
  if (stateValue === 'member') return 'member';
  if (stateValue === 'pending') return 'pending';
  if (stateValue === 'banned') return 'banned';
  return 'left';
}

function renderCommunityList() {
  if (!communityList) return;

  const query = (communitySearch && communitySearch.value ? communitySearch.value : '').trim();
  const filtered = state.communities.filter((community) => communityMatchesQuery(community, query));

  if (communityCount) {
    communityCount.textContent = `${filtered.length}`;
  }

  communityList.innerHTML = '';
  if (!filtered.length) {
    renderEmpty(communityList, query ? 'No communities match this search.' : 'No communities available yet.');
    return;
  }

  filtered.forEach((community) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `community-item${state.selectedCommunityId === community.id ? ' is-active' : ''}`;
    button.dataset.id = String(community.id);

    const title = document.createElement('h3');
    title.textContent = community.courseName || 'Untitled course';

    const subtitle = document.createElement('p');
    subtitle.textContent = `${community.membersCount || 0} members`;

    const badges = document.createElement('div');
    badges.className = 'community-badges';

    const membership = document.createElement('span');
    membership.className = `badge ${membershipLabelClass(community.membershipState)}`;
    membership.textContent = community.membershipState;
    badges.appendChild(membership);

    if (community.isMainCourseCommunity) {
      const mainBadge = document.createElement('span');
      mainBadge.className = 'badge main-course';
      mainBadge.textContent = 'Main course';
      badges.appendChild(mainBadge);
    }

    if (community.canModerate) {
      const modBadge = document.createElement('span');
      modBadge.className = 'badge member';
      modBadge.textContent = 'Moderator';
      badges.appendChild(modBadge);
    }

    button.appendChild(title);
    button.appendChild(subtitle);
    button.appendChild(badges);

    button.addEventListener('click', () => {
      loadCommunity(community.id);
    });

    communityList.appendChild(button);
  });
}

function updateMembershipButton() {
  if (!membershipButton || !state.selectedCommunity) return;
  const membershipState = state.selectedCommunity.membershipState;

  membershipButton.disabled = false;
  membershipButton.classList.remove('danger-button');

  if (membershipState === 'member') {
    if (state.selectedCommunity.isMainCourseCommunity) {
      membershipButton.textContent = 'Main course member';
      membershipButton.disabled = true;
      return;
    }
    membershipButton.textContent = 'Leave';
    membershipButton.classList.add('danger-button');
    return;
  }

  if (membershipState === 'pending') {
    membershipButton.textContent = 'Cancel request';
    membershipButton.classList.add('danger-button');
    return;
  }

  if (membershipState === 'banned') {
    membershipButton.textContent = 'Banned';
    membershipButton.disabled = true;
    return;
  }

  membershipButton.textContent = 'Join';
}

function renderSelectedCommunity() {
  if (!selectedPlaceholder || !selectedContent) return;

  if (!state.selectedCommunity || !state.selectedDetail) {
    selectedPlaceholder.classList.remove('is-hidden');
    selectedContent.classList.add('is-hidden');
    return;
  }

  selectedPlaceholder.classList.add('is-hidden');
  selectedContent.classList.remove('is-hidden');

  selectedCommunityCode.textContent = state.selectedCommunity.courseCode || 'Course community';
  selectedCommunityName.textContent = state.selectedCommunity.courseName || 'Community';
  selectedCommunityDescription.textContent =
    state.selectedDetail.community.description ||
    'No custom description set yet. Use this feed for discussions, resources, and course updates.';
  if (postCourseName) {
    const code = state.selectedCommunity.courseCode ? `${state.selectedCommunity.courseCode} • ` : '';
    postCourseName.value = `${code}${state.selectedCommunity.courseName || 'Community'}`;
  }

  selectedStats.innerHTML = '';
  const stats = [
    { label: 'Members', value: state.selectedDetail.community.stats.membersCount || 0 },
    { label: 'Pending', value: state.selectedDetail.community.stats.pendingCount || 0 },
    { label: 'Posts', value: state.selectedDetail.community.stats.postsCount || 0 },
  ];

  stats.forEach((item) => {
    const stat = document.createElement('div');
    stat.className = 'stat';

    const label = document.createElement('span');
    label.textContent = item.label;

    const value = document.createElement('strong');
    value.textContent = String(item.value);

    stat.appendChild(label);
    stat.appendChild(value);
    selectedStats.appendChild(stat);
  });

  updateMembershipButton();
}

function setPostFormEnabled(enabled) {
  if (!postTitle || !postContent || !postVisibility || !postSubmitButton) return;

  if (openCreatePostButton) {
    openCreatePostButton.disabled = !enabled;
  }
  postTitle.disabled = !enabled;
  postContent.disabled = !enabled;
  postVisibility.disabled = !enabled;
  postSubmitButton.disabled = !enabled;
  if (postCourseName) {
    postCourseName.disabled = true;
  }

  if (!enabled) {
    if (composeEligibility) {
      composeEligibility.textContent = 'Join this community and accept rules to post.';
    }
  } else {
    if (composeEligibility) {
      composeEligibility.textContent = 'Post directly to this selected community.';
    }
  }
}

function renderAttachment(post) {
  if (!post || !post.attachment) return null;
  const { type, link, title, libraryDocumentUuid } = post.attachment;

  if (type === 'image') {
    const media = document.createElement('div');
    media.className = 'post-media';
    const img = document.createElement('img');
    img.src = link;
    img.alt = 'Attachment';
    media.appendChild(img);
    return media;
  }
  if (type === 'video') {
    const media = document.createElement('div');
    media.className = 'post-media';
    const video = document.createElement('video');
    video.src = link;
    video.controls = true;
    media.appendChild(video);
    return media;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'post-attachment';
  const icon = document.createElement('img');
  icon.src = '/assets/document.svg';
  icon.alt = '';
  const label = document.createElement('span');
  label.textContent = title || 'Open document';
  button.appendChild(icon);
  button.appendChild(label);
  button.addEventListener('click', () => {
    if (type === 'library_doc' && libraryDocumentUuid) {
      openLibraryDocument(libraryDocumentUuid);
      return;
    }
    if (link) {
      window.open(link, '_blank');
    }
  });
  return button;
}

function renderFeed() {
  if (!feedList) return;
  feedList.innerHTML = '';

  if (!state.selectedCommunityId) {
    renderEmpty(feedList, 'Select a community to view its feed.');
    return;
  }

  if (!state.feed.length) {
    renderEmpty(feedList, 'No posts in this community yet.');
    return;
  }

  state.feed.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'post-card';

    const header = document.createElement('div');
    header.className = 'post-header';

    const author = document.createElement('div');
    author.className = 'post-author';

    const avatar = document.createElement('div');
    avatar.className = 'post-avatar';
    const avatarImg = document.createElement('img');
    avatarImg.src = post.author && post.author.photoLink ? post.author.photoLink : DEFAULT_AVATAR;
    avatarImg.alt = `${post.author && post.author.displayName ? post.author.displayName : 'Member'} profile photo`;
    avatar.appendChild(avatarImg);

    const meta = document.createElement('div');
    const name = document.createElement('h4');
    name.textContent = post.author && post.author.displayName ? post.author.displayName : 'Member';
    const time = document.createElement('p');
    time.textContent = formatAgo(post.createdAt);
    meta.appendChild(name);
    meta.appendChild(time);

    author.appendChild(avatar);
    author.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'post-actions';

    const likeButton = document.createElement('button');
    likeButton.type = 'button';
    likeButton.className = `ghost-button${post.liked ? ' is-active' : ''}`;
    likeButton.textContent = `${post.likesCount || 0} Like`;
    likeButton.addEventListener('click', () => togglePostLike(post));
    actions.appendChild(likeButton);

    const commentButton = document.createElement('button');
    commentButton.type = 'button';
    commentButton.className = 'ghost-button';
    commentButton.textContent = `Comments (${post.commentsCount || 0})`;
    commentButton.addEventListener('click', () => openCommentsModal(post));
    actions.appendChild(commentButton);

    const reportButton = document.createElement('button');
    reportButton.type = 'button';
    reportButton.className = 'ghost-button';
    reportButton.textContent = 'Report';
    reportButton.addEventListener('click', () => reportPost(post));
    actions.appendChild(reportButton);

    const isOwner = state.viewer && post.author && post.author.uid === state.viewer.uid;
    if (isOwner) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'ghost-button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => editPost(post));
      actions.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'ghost-button danger-button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => deletePost(post));
      actions.appendChild(deleteButton);
    }

    if (state.canModerate && post.status === 'active') {
      const takedownButton = document.createElement('button');
      takedownButton.type = 'button';
      takedownButton.className = 'warn-button';
      takedownButton.textContent = 'Take down';
      takedownButton.addEventListener('click', () => takeDownPost(post));
      actions.appendChild(takedownButton);
    }

    header.appendChild(author);
    header.appendChild(actions);

    const title = document.createElement('h4');
    title.textContent = post.title;

    const content = document.createElement('p');
    content.className = 'post-body';
    content.textContent = post.content;

    const tag = document.createElement('span');
    tag.className = 'post-tag';
    tag.textContent = post.visibility === 'main_course_only' ? 'Main-course only' : 'Community visible';

    card.appendChild(header);
    card.appendChild(title);
    card.appendChild(content);

    const attachmentNode = renderAttachment(post);
    if (attachmentNode) {
      card.appendChild(attachmentNode);
    }
    card.appendChild(tag);

    if (post.status !== 'active') {
      const statusLine = document.createElement('p');
      statusLine.className = 'meta-line';
      statusLine.textContent = post.takenDownReason
        ? `Taken down: ${post.takenDownReason}`
        : 'This post was taken down.';
      card.appendChild(statusLine);
    }

    feedList.appendChild(card);
  });
}

function renderJoinRequests() {
  if (!joinRequestsList) return;
  joinRequestsList.innerHTML = '';

  if (!state.joinRequests.length) {
    renderEmpty(joinRequestsList, 'No pending join requests.');
    return;
  }

  state.joinRequests.forEach((request) => {
    const item = document.createElement('article');
    item.className = 'moderation-item';

    const name = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = request.displayName || 'Member';
    name.appendChild(strong);

    const meta = document.createElement('p');
    meta.className = 'meta-line';
    meta.textContent = `${request.course || 'No course'} • ${formatAgo(request.requestedAt)}`;

    const actions = document.createElement('div');
    actions.className = 'member-actions';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'primary-button';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => decideJoinRequest(request.uid, 'approve'));

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'ghost-button danger-button';
    reject.textContent = 'Reject';
    reject.addEventListener('click', () => decideJoinRequest(request.uid, 'reject'));

    actions.appendChild(approve);
    actions.appendChild(reject);

    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(actions);
    joinRequestsList.appendChild(item);
  });
}

function renderMembers() {
  if (!membersList) return;
  membersList.innerHTML = '';

  if (!state.members.length) {
    renderEmpty(membersList, 'No members to display.');
    return;
  }

  state.members.forEach((member) => {
    const item = document.createElement('article');
    item.className = 'moderation-item';

    const name = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = member.displayName || 'Member';
    name.appendChild(strong);

    const meta = document.createElement('p');
    meta.className = 'meta-line';
    const suffix = member.isModerator ? ' • moderator' : '';
    meta.textContent = `${member.state}${suffix}`;

    item.appendChild(name);
    item.appendChild(meta);

    if (member.uid !== state.viewer.uid && state.canModerate) {
      const actions = document.createElement('div');
      actions.className = 'member-actions';

      if (member.state !== 'banned') {
        const warnButton = document.createElement('button');
        warnButton.type = 'button';
        warnButton.className = 'ghost-button';
        warnButton.textContent = 'Warn';
        warnButton.addEventListener('click', () => warnMember(member));
        actions.appendChild(warnButton);

        const banButton = document.createElement('button');
        banButton.type = 'button';
        banButton.className = 'warn-button';
        banButton.textContent = 'Ban';
        banButton.addEventListener('click', () => banMember(member));
        actions.appendChild(banButton);
      } else {
        const unbanButton = document.createElement('button');
        unbanButton.type = 'button';
        unbanButton.className = 'ghost-button';
        unbanButton.textContent = 'Unban';
        unbanButton.addEventListener('click', () => unbanMember(member));
        actions.appendChild(unbanButton);
      }

      item.appendChild(actions);
    }

    membersList.appendChild(item);
  });
}

function renderReports() {
  if (!reportsList) return;
  reportsList.innerHTML = '';

  if (!state.reports.length) {
    renderEmpty(reportsList, 'No open reports.');
    return;
  }

  state.reports.forEach((report) => {
    const item = document.createElement('article');
    item.className = 'moderation-item';

    const title = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${report.targetType} report`;
    title.appendChild(strong);

    const meta = document.createElement('p');
    meta.className = 'meta-line';
    const target = report.targetName || report.targetUid || 'Unknown target';
    meta.textContent = `${target} • ${report.status} • ${formatAgo(report.createdAt)}`;

    const reason = document.createElement('p');
    reason.textContent = report.reason || 'No reason provided.';

    const actions = document.createElement('div');
    actions.className = 'member-actions';

    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'ghost-button';
    reviewButton.textContent = 'Under review';
    reviewButton.addEventListener('click', () => resolveReport(report, { status: 'under_review', action: 'none' }));
    actions.appendChild(reviewButton);

    const noActionButton = document.createElement('button');
    noActionButton.type = 'button';
    noActionButton.className = 'ghost-button';
    noActionButton.textContent = 'Resolve';
    noActionButton.addEventListener('click', () => resolveReport(report, { status: 'resolved_no_action', action: 'none' }));
    actions.appendChild(noActionButton);

    const rejectButton = document.createElement('button');
    rejectButton.type = 'button';
    rejectButton.className = 'ghost-button danger-button';
    rejectButton.textContent = 'Reject';
    rejectButton.addEventListener('click', () => resolveReport(report, { status: 'rejected', action: 'none' }));
    actions.appendChild(rejectButton);

    const isModeratorReport = report.targetType === 'moderator';
    const canUseModeratorActions =
      isModeratorReport &&
      state.viewer &&
      (state.viewer.platformRole === 'owner' || state.viewer.platformRole === 'admin');

    if (canUseModeratorActions) {
      const warnButton = document.createElement('button');
      warnButton.type = 'button';
      warnButton.className = 'warn-button';
      warnButton.textContent = 'Warn mod';
      warnButton.addEventListener('click', () => resolveReport(report, { action: 'warn_moderator' }));
      actions.appendChild(warnButton);

      const suspendButton = document.createElement('button');
      suspendButton.type = 'button';
      suspendButton.className = 'warn-button';
      suspendButton.textContent = 'Suspend mod';
      suspendButton.addEventListener('click', () => resolveReport(report, { action: 'suspend_moderator' }));
      actions.appendChild(suspendButton);

      const banButton = document.createElement('button');
      banButton.type = 'button';
      banButton.className = 'warn-button';
      banButton.textContent = 'Ban mod';
      banButton.addEventListener('click', () => resolveReport(report, { action: 'ban_moderator' }));
      actions.appendChild(banButton);
    }

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(reason);
    item.appendChild(actions);
    reportsList.appendChild(item);
  });
}

async function loadBootstrap() {
  const data = await apiRequest('/api/community/bootstrap');
  state.viewer = data.viewer;
  state.communities = data.communities || [];

  setNavAvatar(state.profilePhotoLink, state.viewer && state.viewer.displayName);

  renderCommunityList();

  if (!state.communities.length) {
    state.selectedCommunityId = null;
    state.selectedCommunity = null;
    state.selectedDetail = null;
    if (postCourseName) {
      postCourseName.value = '';
    }
    renderSelectedCommunity();
    renderFeed();
    setPostFormEnabled(false);
    return;
  }

  const existingSelection = state.selectedCommunityId;
  const selected = existingSelection && communityById(existingSelection)
    ? existingSelection
    : (state.communities.find((item) => item.isMainCourseCommunity) || state.communities[0]).id;

  await loadCommunity(selected);
}

async function loadProfilePhoto() {
  try {
    const data = await apiRequest('/api/profile');
    const profile = data.profile || {};
    state.profilePhotoLink = profile.photo_link || null;
  } catch (error) {
    state.profilePhotoLink = null;
  }
}

async function loadCommunity(communityId) {
  state.selectedCommunityId = communityId;
  state.selectedCommunity = communityById(communityId);
  renderCommunityList();
  showMessage(communityMessage, '');
  showMessage(postMessage, '');

  try {
    const detail = await apiRequest(`/api/community/${communityId}`);
    state.selectedDetail = detail;
    state.canPost = false;
    state.canModerate = Boolean(detail.canModerate);
    state.feed = [];

    try {
      const feedData = await apiRequest(`/api/community/${communityId}/feed?page=1&pageSize=24`);
      state.feed = feedData.posts || [];
      state.canPost = feedData.canPost === true;
      state.canModerate = feedData.canModerate === true;
    } catch (feedError) {
      state.feed = [];
      state.canPost = false;
      if (feedError.payload && feedError.payload.requiresRuleAcceptance) {
        showMessage(communityMessage, 'Please accept the latest community rules to access the feed.');
      } else {
        showMessage(communityMessage, feedError.message);
      }
    }

    renderSelectedCommunity();
    renderFeed();
    setPostFormEnabled(state.canPost);

    if (state.selectedCommunity) {
      state.selectedCommunity.membershipState = detail.membershipState;
      state.selectedCommunity.requiresRuleAcceptance = detail.requiresRuleAcceptance;
      state.selectedCommunity.canModerate = detail.canModerate === true;
      if (detail.latestRule) {
        state.selectedCommunity.latestRuleVersion = detail.latestRule.version;
        state.selectedCommunity.acceptedLatestRule = detail.latestRule.accepted;
      }
      renderCommunityList();
      updateMembershipButton();
    }

    if (state.canModerate) {
      moderationCard.classList.remove('is-hidden');
      await Promise.all([loadJoinRequests(), loadMembers(), loadReports()]);
    } else {
      moderationCard.classList.add('is-hidden');
      state.joinRequests = [];
      state.members = [];
      state.reports = [];
      renderJoinRequests();
      renderMembers();
      renderReports();
    }

    if (detail.requiresRuleAcceptance) {
      showMessage(communityMessage, 'Please accept the latest community rules to access feed actions.');
    }
  } catch (error) {
    state.selectedDetail = null;
    state.feed = [];
    state.canPost = false;
    state.canModerate = false;
    state.joinRequests = [];
    state.members = [];
    state.reports = [];
    if (postCourseName) {
      postCourseName.value = '';
    }
    renderSelectedCommunity();
    renderFeed();
    renderJoinRequests();
    renderMembers();
    renderReports();
    moderationCard.classList.add('is-hidden');
    setPostFormEnabled(false);
    showMessage(communityMessage, error.message);
  }
}

async function loadJoinRequests() {
  if (!state.selectedCommunityId || !state.canModerate) {
    state.joinRequests = [];
    renderJoinRequests();
    return;
  }
  try {
    const data = await apiRequest(`/api/community/${state.selectedCommunityId}/join-requests?page=1&pageSize=40`);
    state.joinRequests = data.requests || [];
    renderJoinRequests();
  } catch (error) {
    state.joinRequests = [];
    renderJoinRequests();
  }
}

async function loadMembers() {
  if (!state.selectedCommunityId || !state.canModerate) {
    state.members = [];
    renderMembers();
    return;
  }
  try {
    const data = await apiRequest(`/api/community/${state.selectedCommunityId}/members?page=1&pageSize=60`);
    state.members = data.members || [];
    renderMembers();
  } catch (error) {
    state.members = [];
    renderMembers();
  }
}

async function loadReports() {
  if (!state.selectedCommunityId || !state.canModerate) {
    state.reports = [];
    renderReports();
    return;
  }
  try {
    const data = await apiRequest(`/api/community/${state.selectedCommunityId}/reports?page=1&pageSize=40&status=open`);
    state.reports = data.reports || [];
    renderReports();
  } catch (error) {
    state.reports = [];
    renderReports();
  }
}

async function resolveReport(report, options = {}) {
  if (!state.selectedCommunityId || !report || !report.id) return;

  const payload = {
    status: options.status || (options.action && options.action !== 'none' ? 'resolved_action_taken' : 'resolved_no_action'),
    action: options.action || 'none',
    resolutionNote: '',
    actionReason: '',
  };

  if (payload.action !== 'none') {
    const note = window.prompt('Resolution note', '') || '';
    const actionReason = window.prompt('Action reason', '') || '';
    payload.resolutionNote = note.trim();
    payload.actionReason = actionReason.trim();
    payload.actionTargetUid = report.targetUid || null;
  } else if (payload.status !== 'under_review') {
    const note = window.prompt('Resolution note (optional)', '') || '';
    payload.resolutionNote = note.trim();
  }

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/reports/${report.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await Promise.all([loadReports(), loadMembers()]);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function openRulesModal(callback = null) {
  if (!state.selectedCommunityId) return;

  state.pendingRuleAction = typeof callback === 'function' ? callback : null;
  showMessage(rulesMessage, '');
  rulesAcknowledge.checked = false;

  try {
    const data = await apiRequest(`/api/community/${state.selectedCommunityId}/rules`);
    const latestRule = data.latestRule;

    if (!latestRule) {
      rulesVersionLabel.textContent = 'No rules have been published yet.';
      rulesContent.textContent = 'This community currently has no published rules.';
      rulesAcceptButton.textContent = 'Continue';
      rulesAcknowledge.disabled = true;
    } else {
      rulesVersionLabel.textContent = `Version ${latestRule.version}`;
      rulesContent.textContent = latestRule.content;
      rulesAcceptButton.textContent = 'Accept and continue';
      rulesAcknowledge.disabled = false;
    }

    openModal(rulesModal);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function acceptRulesAndContinue() {
  showMessage(rulesMessage, '');
  if (!state.selectedCommunityId) return;

  try {
    const data = await apiRequest(`/api/community/${state.selectedCommunityId}/rules`, { method: 'GET' });
    if (data.latestRule) {
      if (!rulesAcknowledge.checked) {
        showMessage(rulesMessage, 'Please acknowledge the rules first.');
        return;
      }
      await apiRequest(`/api/community/${state.selectedCommunityId}/rules/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: data.latestRule.version }),
      });
    }

    closeModal(rulesModal);
    if (state.pendingRuleAction) {
      const callback = state.pendingRuleAction;
      state.pendingRuleAction = null;
      await callback();
    } else {
      await loadBootstrap();
    }
  } catch (error) {
    showMessage(rulesMessage, error.message);
  }
}

async function joinSelectedCommunity() {
  if (!state.selectedCommunityId || !state.selectedCommunity) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/join`, { method: 'POST' });
    showMessage(communityMessage, 'Join request submitted.', 'success');
    await loadBootstrap();
  } catch (error) {
    if (error.code === 'RULES_NOT_ACCEPTED') {
      await openRulesModal(async () => {
        await joinSelectedCommunity();
      });
      return;
    }
    showMessage(communityMessage, error.message);
  }
}

async function leaveSelectedCommunity() {
  if (!state.selectedCommunityId) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/leave`, { method: 'POST' });
    showMessage(communityMessage, 'Membership updated.', 'success');
    await loadBootstrap();
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function handleMembershipAction() {
  if (!state.selectedCommunity) return;

  const membershipState = state.selectedCommunity.membershipState;
  if (membershipState === 'member' || membershipState === 'pending') {
    await leaveSelectedCommunity();
    return;
  }

  if (membershipState === 'banned') {
    showMessage(communityMessage, 'You are banned from this community.');
    return;
  }

  const requiresRules = state.selectedCommunity.latestRuleVersion && !state.selectedCommunity.acceptedLatestRule;
  if (requiresRules && !state.selectedCommunity.isMainCourseCommunity) {
    await openRulesModal(async () => {
      await joinSelectedCommunity();
    });
    return;
  }

  await joinSelectedCommunity();
}

async function createCommunityPost(payload) {
  if (!state.selectedCommunityId) {
    throw new Error('Select a community first.');
  }

  const isFormData = payload instanceof FormData;
  return apiRequest(`/api/community/${state.selectedCommunityId}/posts`, {
    method: 'POST',
    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
    body: isFormData ? payload : JSON.stringify(payload),
  });
}

async function togglePostLike(post) {
  if (!state.selectedCommunityId || !post || !post.id) return;
  try {
    const data = await apiRequest(`/api/community/${state.selectedCommunityId}/posts/${post.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: post.liked ? 'unlike' : 'like' }),
    });
    post.liked = Boolean(data.liked);
    post.likesCount = Number(data.likesCount || 0);
    renderFeed();
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function submitPost(event) {
  event.preventDefault();
  showMessage(postMessage, '');

  if (!state.selectedCommunityId) {
    showMessage(postMessage, 'Select a community first.');
    return;
  }

  const title = (postTitle.value || '').trim();
  const content = (postContent.value || '').trim();
  const visibility = postVisibility.value || 'community';
  const file = attachmentFile && attachmentFile.files ? attachmentFile.files[0] : null;

  if (!title || !content) {
    showMessage(postMessage, 'Title and content are required.');
    return;
  }

  if (file && state.selectedLibraryDocument) {
    showMessage(postMessage, 'Choose either an uploaded file or an Open Library document.');
    return;
  }

  const formData = new FormData();
  formData.set('title', title);
  formData.set('content', content);
  formData.set('visibility', visibility);

  if (state.selectedLibraryDocument) {
    formData.set('attachmentType', 'library_doc');
    formData.set('libraryDocumentUuid', state.selectedLibraryDocument.uuid);
    formData.set('attachmentTitle', state.selectedLibraryDocument.title || '');
  } else if (file) {
    const mimeType = (file.type || '').toLowerCase();
    if (mimeType.startsWith('image/')) {
      formData.set('attachmentType', 'image');
    } else if (mimeType.startsWith('video/')) {
      formData.set('attachmentType', 'video');
    } else {
      showMessage(postMessage, 'Unsupported file type. Upload an image or video.');
      return;
    }
    formData.set('file', file);
  } else {
    formData.set('attachmentType', 'none');
  }

  try {
    await createCommunityPost(formData);

    postTitle.value = '';
    postContent.value = '';
    postVisibility.value = 'community';
    if (attachmentFile) {
      attachmentFile.value = '';
    }
    state.selectedLibraryDocument = null;
    updateSelectedLibraryDocUI();
    showMessage(postMessage, 'Post published.', 'success');
    await loadCommunity(state.selectedCommunityId);
    closeCreatePostModalWindow();
  } catch (error) {
    if (error.payload && error.payload.requiresRuleAcceptance) {
      closeCreatePostModalWindow();
      await openRulesModal(async () => {
        await createCommunityPost(formData);
        showMessage(communityMessage, 'Post published.', 'success');
        await loadCommunity(state.selectedCommunityId);
      });
      return;
    }
    showMessage(postMessage, error.message);
  }
}

async function editPost(post) {
  if (!state.selectedCommunityId) return;

  const title = window.prompt('Edit title', post.title || '');
  if (title === null) return;
  const content = window.prompt('Edit content', post.content || '');
  if (content === null) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), content: content.trim(), visibility: post.visibility }),
    });
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function deletePost(post) {
  if (!state.selectedCommunityId) return;
  if (!window.confirm('Delete this post?')) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/posts/${post.id}`, {
      method: 'DELETE',
    });
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function takeDownPost(post) {
  if (!state.selectedCommunityId) return;
  const reason = window.prompt('Reason for takedown (optional)', '') || '';

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/posts/${post.id}/takedown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function reportPost(post) {
  if (!state.selectedCommunityId) return;

  const reason = window.prompt('Why are you reporting this post?', '') || '';
  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'post',
        targetPostId: post.id,
        reason: reason.trim(),
      }),
    });
    showMessage(communityMessage, 'Report submitted.', 'success');
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function openCommentsModal(post) {
  state.currentPostForComments = post;
  commentsModalTitle.textContent = `Comments • ${post.title}`;
  commentInput.value = '';
  showMessage(commentMessage, '');

  await loadComments();
  openModal(commentsModal);
}

async function loadComments() {
  if (!state.selectedCommunityId || !state.currentPostForComments) return;

  try {
    const data = await apiRequest(
      `/api/community/${state.selectedCommunityId}/posts/${state.currentPostForComments.id}/comments?page=1&pageSize=100`
    );
    renderComments(data.comments || []);
  } catch (error) {
    renderEmpty(commentsList, error.message);
  }
}

function renderComments(comments) {
  commentsList.innerHTML = '';

  if (!comments.length) {
    renderEmpty(commentsList, 'No comments yet.');
    return;
  }

  comments.forEach((comment) => {
    const item = document.createElement('article');
    item.className = 'comment-item';

    const text = document.createElement('p');
    text.textContent = comment.content;

    const meta = document.createElement('p');
    meta.className = 'meta-line';
    meta.textContent = `${comment.authorName || 'Member'} • ${formatAgo(comment.createdAt)}`;

    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    const reportButton = document.createElement('button');
    reportButton.type = 'button';
    reportButton.className = 'ghost-button';
    reportButton.textContent = 'Report';
    reportButton.addEventListener('click', () => reportComment(comment));
    actions.appendChild(reportButton);

    const isOwner = state.viewer && comment.authorUid === state.viewer.uid;
    if (isOwner) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'ghost-button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => editComment(comment));
      actions.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'ghost-button danger-button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => deleteComment(comment));
      actions.appendChild(deleteButton);
    }

    if (state.canModerate && comment.status === 'active') {
      const takedownButton = document.createElement('button');
      takedownButton.type = 'button';
      takedownButton.className = 'warn-button';
      takedownButton.textContent = 'Take down';
      takedownButton.addEventListener('click', () => takeDownComment(comment));
      actions.appendChild(takedownButton);
    }

    item.appendChild(text);
    item.appendChild(meta);
    item.appendChild(actions);

    commentsList.appendChild(item);
  });
}

async function submitComment(event) {
  event.preventDefault();
  showMessage(commentMessage, '');

  if (!state.selectedCommunityId || !state.currentPostForComments) {
    showMessage(commentMessage, 'Select a post first.');
    return;
  }

  const content = (commentInput.value || '').trim();
  if (!content) {
    showMessage(commentMessage, 'Comment cannot be empty.');
    return;
  }

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/posts/${state.currentPostForComments.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    commentInput.value = '';
    await loadComments();
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(commentMessage, error.message);
  }
}

async function editComment(comment) {
  if (!state.selectedCommunityId) return;
  const content = window.prompt('Edit comment', comment.content || '');
  if (content === null) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/comments/${comment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim() }),
    });
    await loadComments();
  } catch (error) {
    showMessage(commentMessage, error.message);
  }
}

async function deleteComment(comment) {
  if (!state.selectedCommunityId) return;
  if (!window.confirm('Delete this comment?')) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/comments/${comment.id}`, {
      method: 'DELETE',
    });
    await loadComments();
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(commentMessage, error.message);
  }
}

async function takeDownComment(comment) {
  if (!state.selectedCommunityId) return;

  const reason = window.prompt('Reason for takedown (optional)', '') || '';
  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/comments/${comment.id}/takedown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    await loadComments();
  } catch (error) {
    showMessage(commentMessage, error.message);
  }
}

async function reportComment(comment) {
  if (!state.selectedCommunityId) return;

  const reason = window.prompt('Why are you reporting this comment?', '') || '';
  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'comment',
        targetCommentId: comment.id,
        reason: reason.trim(),
      }),
    });
    showMessage(commentMessage, 'Report submitted.', 'success');
  } catch (error) {
    showMessage(commentMessage, error.message);
  }
}

async function decideJoinRequest(uid, action) {
  if (!state.selectedCommunityId) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/join-requests/${encodeURIComponent(uid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await Promise.all([loadJoinRequests(), loadMembers(), loadCommunity(state.selectedCommunityId)]);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function warnMember(member) {
  if (!state.selectedCommunityId) return;
  const reason = window.prompt(`Warning reason for ${member.displayName}`, '') || '';

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/members/${encodeURIComponent(member.uid)}/warn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    showMessage(communityMessage, 'Warning issued.', 'success');
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function banMember(member) {
  if (!state.selectedCommunityId) return;
  if (!window.confirm(`Ban ${member.displayName}?`)) return;
  const reason = window.prompt(`Ban reason for ${member.displayName}`, '') || '';

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/members/${encodeURIComponent(member.uid)}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    await loadMembers();
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

async function unbanMember(member) {
  if (!state.selectedCommunityId) return;

  try {
    await apiRequest(`/api/community/${state.selectedCommunityId}/members/${encodeURIComponent(member.uid)}/unban`, {
      method: 'POST',
    });
    await loadMembers();
    await loadCommunity(state.selectedCommunityId);
  } catch (error) {
    showMessage(communityMessage, error.message);
  }
}

if (communitySearch) {
  communitySearch.addEventListener('input', () => {
    renderCommunityList();
  });
}

if (membershipButton) {
  membershipButton.addEventListener('click', handleMembershipAction);
}

if (openRulesButton) {
  openRulesButton.addEventListener('click', () => openRulesModal());
}

if (openCreatePostButton) {
  openCreatePostButton.addEventListener('click', openCreatePostModalWindow);
}

if (openLibraryPicker) {
  openLibraryPicker.addEventListener('click', () => {
    openModal(libraryPickerModal);
    loadLibraryPickerDocs(libraryPickerSearch ? libraryPickerSearch.value : '');
  });
}

if (libraryPickerClose) {
  libraryPickerClose.addEventListener('click', () => closeModal(libraryPickerModal));
}

if (libraryPickerSearch) {
  libraryPickerSearch.addEventListener('input', handleLibraryPickerSearch);
}

if (clearLibraryDoc) {
  clearLibraryDoc.addEventListener('click', () => {
    state.selectedLibraryDocument = null;
    updateSelectedLibraryDocUI();
  });
}

if (attachmentFile) {
  attachmentFile.addEventListener('change', () => {
    if (attachmentFile.files.length && state.selectedLibraryDocument) {
      state.selectedLibraryDocument = null;
      updateSelectedLibraryDocUI();
    }
  });
}

if (communityPostForm) {
  communityPostForm.addEventListener('submit', submitPost);
}

if (refreshFeedButton) {
  refreshFeedButton.addEventListener('click', async () => {
    if (!state.selectedCommunityId) return;
    await loadCommunity(state.selectedCommunityId);
  });
}

if (rulesModalClose) {
  rulesModalClose.addEventListener('click', closeRulesModalWindow);
}

if (rulesCancel) {
  rulesCancel.addEventListener('click', closeRulesModalWindow);
}

if (rulesAcceptButton) {
  rulesAcceptButton.addEventListener('click', acceptRulesAndContinue);
}

if (commentsModalClose) {
  commentsModalClose.addEventListener('click', () => closeModal(commentsModal));
}

if (createPostModalClose) {
  createPostModalClose.addEventListener('click', closeCreatePostModalWindow);
}

if (commentForm) {
  commentForm.addEventListener('submit', submitComment);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeRulesModalWindow();
    closeModal(commentsModal);
    closeCreatePostModalWindow();
    closeModal(libraryPickerModal);
  }
});

async function init() {
  showMessage(communityMessage, '');
  showMessage(postMessage, '');
  updateSelectedLibraryDocUI();
  setPostFormEnabled(false);

  try {
    await loadProfilePhoto();
    await loadBootstrap();
  } catch (error) {
    renderEmpty(communityList, error.message || 'Failed to load communities.');
    showMessage(communityMessage, error.message || 'Failed to load communities.');
  }
}

init();
