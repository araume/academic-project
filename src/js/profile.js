const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const profileForm = document.getElementById('profileForm');
const profileMessage = document.getElementById('profileMessage');
const resetProfile = document.getElementById('resetProfile');
const profileImage = document.getElementById('profileImage');
const profileName = document.getElementById('profileName');
const profileUsername = document.getElementById('profileUsername');
const profileCourse = document.getElementById('profileCourse');
const profileBio = document.getElementById('profileBio');
const profileViewActions = document.getElementById('profileViewActions');
const profileFollowButton = document.getElementById('profileFollowButton');
const profileOptionsToggle = document.getElementById('profileOptionsToggle');
const profileOptionsMenu = document.getElementById('profileOptionsMenu');
const toggleHidePostsButton = document.getElementById('toggleHidePostsButton');
const toggleBlockButton = document.getElementById('toggleBlockButton');
const profileActionMessage = document.getElementById('profileActionMessage');
const profilePresence = document.getElementById('profilePresence');
const profilePresenceLabel = document.getElementById('profilePresenceLabel');
const profileOwnActions = document.getElementById('profileOwnActions');
const viewBookmarksButton = document.getElementById('viewBookmarksButton');
const profileSubCourses = document.getElementById('profileSubCourses');
const profileFacebook = document.getElementById('profileFacebook');
const profileLinkedin = document.getElementById('profileLinkedin');
const profileInstagram = document.getElementById('profileInstagram');
const profileGithub = document.getElementById('profileGithub');
const profilePortfolio = document.getElementById('profilePortfolio');
const profilePostsHint = document.getElementById('profilePostsHint');
const profilePostsList = document.getElementById('profilePostsList');
const profileEditCard = document.getElementById('profileEditCard');
const toggleEditMode = document.getElementById('toggleEditMode');
const photoUploadLabel = document.getElementById('photoUploadLabel');
const photoInput = document.getElementById('photoInput');
const mainCourseSelect = document.getElementById('mainCourseSelect');
const subCoursesSelect = document.getElementById('subCoursesSelect');
const bookmarksModal = document.getElementById('bookmarksModal');
const bookmarksModalClose = document.getElementById('bookmarksModalClose');
const bookmarksMessage = document.getElementById('bookmarksMessage');
const bookmarksList = document.getElementById('bookmarksList');

let savedProfile = null;
let isEditMode = false;
let isOwnProfile = true;
let interactionState = null;
const viewedUid = new URLSearchParams(window.location.search).get('uid');

function closeMenuOnOutsideClick(event) {
  if (!profileMenu || !profileToggle) return;
  if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
    profileMenu.classList.add('is-hidden');
  }
}

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

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function populateCourses(courses) {
  courses.forEach((course) => {
    const option = document.createElement('option');
    option.value = course.course_name;
    option.textContent = course.course_name;
    mainCourseSelect.appendChild(option);

    const subOption = document.createElement('option');
    subOption.value = course.course_name;
    subOption.textContent = course.course_name;
    subCoursesSelect.appendChild(subOption);
  });
}

function renderOptionalText(target, value) {
  if (!target) return;
  const cleaned = typeof value === 'string' ? value.trim() : '';
  target.textContent = cleaned || 'Not set.';
}

function setEditMode(enabled) {
  if (!isOwnProfile) return;
  isEditMode = Boolean(enabled);
  if (profileEditCard) {
    profileEditCard.classList.toggle('is-hidden', !isEditMode);
  }
  if (photoUploadLabel) {
    photoUploadLabel.classList.toggle('is-hidden', !isEditMode);
  }
  if (toggleEditMode) {
    toggleEditMode.textContent = isEditMode ? 'Close edit mode' : 'Edit profile';
  }
  if (!isEditMode && savedProfile) {
    setProfileFields(savedProfile);
    profileMessage.textContent = '';
  }
}

function setOwnProfileControlsVisible(visible) {
  if (toggleEditMode) {
    toggleEditMode.classList.toggle('is-hidden', !visible);
  }
  if (profileOwnActions) {
    profileOwnActions.classList.toggle('is-hidden', !visible);
  }
  if (profileViewActions) {
    profileViewActions.classList.toggle('is-hidden', visible);
  }
  if (!visible) {
    if (photoUploadLabel) {
      photoUploadLabel.classList.add('is-hidden');
    }
    if (profileEditCard) {
      profileEditCard.classList.add('is-hidden');
    }
    isEditMode = false;
  }
}

function setActionMessage(text, type = 'error') {
  if (!profileActionMessage) return;
  profileActionMessage.textContent = text || '';
  profileActionMessage.style.color = type === 'success' ? '#2f9e68' : '#b0554a';
}

function formatDateValue(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function setBookmarksMessage(message) {
  if (!bookmarksMessage) return;
  bookmarksMessage.textContent = message || '';
}

function closeBookmarksModal() {
  if (!bookmarksModal) return;
  bookmarksModal.classList.add('is-hidden');
}

function openBookmarksModal() {
  if (!bookmarksModal) return;
  bookmarksModal.classList.remove('is-hidden');
}

function renderBookmarkedPosts(posts) {
  if (!bookmarksList) return;
  clearElement(bookmarksList);

  if (!Array.isArray(posts) || !posts.length) {
    const empty = document.createElement('p');
    empty.className = 'bookmarks-empty';
    empty.textContent = 'No bookmarked posts yet.';
    bookmarksList.appendChild(empty);
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'bookmark-card';

    const title = document.createElement('h4');
    title.textContent = post.title || 'Untitled post';

    const meta = document.createElement('p');
    meta.className = 'bookmark-meta';
    const uploaderName = post.uploader && post.uploader.displayName
      ? post.uploader.displayName
      : 'Member';
    const bookmarkedAt = post.bookmarkedAt ? formatDateValue(post.bookmarkedAt) : formatDateValue(post.uploadDate);
    meta.textContent = `${uploaderName} • saved ${bookmarkedAt}`;

    const preview = document.createElement('p');
    preview.className = 'bookmark-preview';
    const content = typeof post.content === 'string' ? post.content.trim() : '';
    preview.textContent = content ? content.slice(0, 180) : 'No content preview.';

    const footer = document.createElement('div');
    footer.className = 'bookmark-footer';

    const stats = document.createElement('span');
    stats.textContent = `${Number(post.likesCount || 0)} likes • ${Number(post.commentsCount || 0)} comments`;

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'ghost-button';
    openButton.textContent = 'Open post';
    openButton.addEventListener('click', () => {
      const postId = post && post.id ? String(post.id) : '';
      if (!postId) return;
      window.location.href = `/posts/${encodeURIComponent(postId)}`;
    });

    footer.appendChild(stats);
    footer.appendChild(openButton);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(preview);
    card.appendChild(footer);
    bookmarksList.appendChild(card);
  });
}

async function loadBookmarkedPosts() {
  if (!isOwnProfile) return;
  if (!bookmarksList) return;
  setBookmarksMessage('');
  clearElement(bookmarksList);

  const loading = document.createElement('p');
  loading.className = 'bookmarks-empty';
  loading.textContent = 'Loading bookmarked posts...';
  bookmarksList.appendChild(loading);

  try {
    const data = await apiRequest('/api/posts/bookmarks?limit=30');
    renderBookmarkedPosts(data.posts || []);
    if (!data.posts || !data.posts.length) {
      setBookmarksMessage('Save posts from Home to see them here.');
    }
  } catch (error) {
    clearElement(bookmarksList);
    setBookmarksMessage(error.message || 'Failed to load bookmarked posts.');
  }
}

function closeProfileOptionsMenu() {
  if (profileOptionsMenu) {
    profileOptionsMenu.classList.add('is-hidden');
  }
}

function updateProfileActionUI() {
  if (!profileFollowButton || !toggleHidePostsButton || !toggleBlockButton || !interactionState) return;

  if (interactionState.moderation && interactionState.moderation.isBlocked) {
    profileFollowButton.textContent = 'User blocked';
    profileFollowButton.disabled = true;
    toggleBlockButton.textContent = 'Unblock user';
  } else if (interactionState.moderation && interactionState.moderation.blockedByUser) {
    profileFollowButton.textContent = 'Unavailable';
    profileFollowButton.disabled = true;
    toggleBlockButton.textContent = 'Blocked by this user';
  } else {
    profileFollowButton.disabled = false;
    if (interactionState.relation && interactionState.relation.isFollowing) {
      profileFollowButton.textContent = 'Unfollow';
    } else if (interactionState.relation && interactionState.relation.followRequestSent) {
      profileFollowButton.textContent = 'Cancel follow request';
    } else {
      profileFollowButton.textContent = 'Follow';
    }
    toggleBlockButton.textContent = 'Block user';
  }

  if (interactionState.moderation && interactionState.moderation.hidePosts) {
    toggleHidePostsButton.textContent = "Don't hide posts anymore";
  } else {
    toggleHidePostsButton.textContent = "Don't see posts from this user";
  }
}

function setPresenceBadge(presence) {
  if (!profilePresence || !profilePresenceLabel) return;

  profilePresence.classList.remove('presence-pill--active', 'presence-pill--inactive', 'presence-pill--hidden');
  if (!presence || presence.status === 'hidden') {
    profilePresence.classList.add('presence-pill--hidden');
    profilePresenceLabel.textContent = 'Status hidden';
    return;
  }
  if (presence.status === 'active') {
    profilePresence.classList.add('presence-pill--active');
    profilePresenceLabel.textContent = 'Active now';
    return;
  }
  profilePresence.classList.add('presence-pill--inactive');
  profilePresenceLabel.textContent = 'Inactive';
}

function formatShortTimestamp(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildProfilePostCard(post, source) {
  const item = document.createElement('article');
  item.className = 'profile-post-item';

  const row = document.createElement('div');
  row.className = 'profile-post-row';

  const badge = document.createElement('span');
  badge.className = 'profile-post-badge';
  if (source === 'community') {
    badge.textContent = post.communityName
      ? `Community post • ${post.communityName}`
      : 'Community post';
  } else {
    badge.textContent = 'Main feed post';
  }

  const meta = document.createElement('p');
  meta.className = 'profile-post-meta';
  meta.textContent = `${formatShortTimestamp(post.createdAt)} • ${Number(post.likesCount || 0)} likes • ${Number(post.commentsCount || 0)} comments`;

  row.appendChild(badge);
  row.appendChild(meta);

  const title = document.createElement('h4');
  title.className = 'profile-post-title';
  title.textContent = post.title || 'Untitled post';

  const content = document.createElement('p');
  content.className = 'profile-post-content';
  content.textContent = post.content || 'No content preview.';

  const actions = document.createElement('div');
  actions.className = 'profile-post-actions';
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'ghost-button';
  openButton.textContent = source === 'community' ? 'Open community' : 'Open post';
  openButton.addEventListener('click', () => {
    if (source === 'community') {
      if (!post.communityId) return;
      window.location.href = `/community?community=${encodeURIComponent(post.communityId)}`;
      return;
    }
    if (!post.id) return;
    window.location.href = `/posts/${encodeURIComponent(post.id)}`;
  });
  actions.appendChild(openButton);

  item.appendChild(row);
  item.appendChild(title);
  item.appendChild(content);

  if (source === 'main' && post.attachment && post.attachment.type) {
    const attachment = document.createElement('p');
    attachment.className = 'profile-post-meta';
    attachment.textContent = `Attachment: ${post.attachment.type}`;
    item.appendChild(attachment);
  }

  item.appendChild(actions);
  return item;
}

function renderProfilePosts(data) {
  if (!profilePostsList || !profilePostsHint) return;
  clearElement(profilePostsList);

  const mainFeedPosts = Array.isArray(data.mainFeedPosts) ? data.mainFeedPosts : [];
  const communityPosts = Array.isArray(data.communityPosts) ? data.communityPosts : [];

  if (!mainFeedPosts.length && !communityPosts.length) {
    profilePostsHint.textContent = 'No posts to show yet.';
    if (!data.canViewCommunityPosts && !isOwnProfile) {
      profilePostsHint.textContent = 'Community posts are visible only to viewers from the same course.';
    }
    const empty = document.createElement('p');
    empty.className = 'bookmarks-empty';
    empty.textContent = 'No posts available for this profile.';
    profilePostsList.appendChild(empty);
    return;
  }

  profilePostsHint.textContent = '';
  if (!data.canViewCommunityPosts && !isOwnProfile) {
    profilePostsHint.textContent = 'Community posts are visible only to viewers from the same course.';
  }

  if (mainFeedPosts.length) {
    const mainGroup = document.createElement('section');
    mainGroup.className = 'profile-posts-group';
    const heading = document.createElement('h3');
    heading.className = 'profile-posts-group-title';
    heading.textContent = 'Main Feed Posts';
    mainGroup.appendChild(heading);
    mainFeedPosts.forEach((post) => mainGroup.appendChild(buildProfilePostCard(post, 'main')));
    profilePostsList.appendChild(mainGroup);
  }

  if (communityPosts.length) {
    const communityGroup = document.createElement('section');
    communityGroup.className = 'profile-posts-group';
    const heading = document.createElement('h3');
    heading.className = 'profile-posts-group-title';
    heading.textContent = 'Community Posts';
    communityGroup.appendChild(heading);
    communityPosts.forEach((post) => communityGroup.appendChild(buildProfilePostCard(post, 'community')));
    profilePostsList.appendChild(communityGroup);
  }
}

async function loadProfilePosts() {
  if (!profilePostsList || !profilePostsHint) return;
  profilePostsHint.textContent = 'Loading posts...';
  clearElement(profilePostsList);

  const endpoint = viewedUid
    ? `/api/profile/${encodeURIComponent(viewedUid)}/posts/feed`
    : '/api/profile/posts/feed';
  const data = await apiRequest(endpoint);
  renderProfilePosts(data);
}

function setProfileFields(profile) {
  profileForm.elements.display_name.value = profile.display_name || '';
  profileForm.elements.bio.value = profile.bio || '';
  profileForm.elements.main_course.value = profile.main_course || '';
  profileForm.elements.facebook.value = profile.facebook || '';
  profileForm.elements.linkedin.value = profile.linkedin || '';
  profileForm.elements.instagram.value = profile.instagram || '';
  profileForm.elements.github.value = profile.github || '';
  profileForm.elements.portfolio.value = profile.portfolio || '';

  const subs = Array.isArray(profile.sub_courses) ? profile.sub_courses : [];
  Array.from(subCoursesSelect.options).forEach((option) => {
    option.selected = subs.includes(option.value);
  });

  profileName.textContent = profile.display_name || 'Profile';
  if (profileUsername) {
    const handle = typeof profile.username === 'string' ? profile.username.trim() : '';
    profileUsername.textContent = handle ? `@${handle}` : '@user';
  }
  profileCourse.textContent = profile.main_course || 'Main course';
  if (profileBio) {
    profileBio.textContent = profile.bio || 'No bio yet.';
  }
  if (profileSubCourses) {
    profileSubCourses.textContent = subs.length ? subs.join(', ') : 'None set.';
  }
  renderOptionalText(profileFacebook, profile.facebook);
  renderOptionalText(profileLinkedin, profile.linkedin);
  renderOptionalText(profileInstagram, profile.instagram);
  renderOptionalText(profileGithub, profile.github);
  renderOptionalText(profilePortfolio, profile.portfolio);
  if (profile.photo_link) {
    profileImage.src = profile.photo_link;
  } else {
    profileImage.src = '/assets/LOGO.png';
  }
}

async function loadInteractionState() {
  if (isOwnProfile || !savedProfile || !savedProfile.uid) {
    interactionState = null;
    updateProfileActionUI();
    return;
  }
  const data = await apiRequest(`/api/connections/user-state?uid=${encodeURIComponent(savedProfile.uid)}`);
  interactionState = {
    relation: data.user && data.user.relation ? data.user.relation : null,
    moderation: data.moderation || null,
  };
  updateProfileActionUI();
}

async function loadProfile() {
  const endpoint = viewedUid
    ? `/api/profile/${encodeURIComponent(viewedUid)}`
    : '/api/profile';
  const data = await apiRequest(endpoint);
  isOwnProfile = data.is_self !== false;
  setOwnProfileControlsVisible(isOwnProfile);
  savedProfile = data.profile;
  setProfileFields(savedProfile);
  if (isOwnProfile) {
    setEditMode(false);
  } else {
    profileMessage.textContent = '';
  }
  setActionMessage('');

  await loadInteractionState().catch(() => {
    interactionState = null;
    updateProfileActionUI();
  });

  try {
    const presenceData = await apiRequest(`/api/connections/presence?uid=${encodeURIComponent(savedProfile.uid)}`);
    setPresenceBadge(presenceData.presence);
  } catch (error) {
    setPresenceBadge({ status: 'inactive' });
  }
}

async function loadCourses() {
  const response = await fetch('/api/library/courses');
  const data = await response.json();
  if (response.ok && data.ok) {
    populateCourses(data.courses);
  }
}

async function saveProfile(event) {
  event.preventDefault();
  if (!isOwnProfile) return;
  profileMessage.textContent = '';

  const selectedSubs = Array.from(subCoursesSelect.selectedOptions).map((option) => option.value);
  const payload = {
    display_name: profileForm.elements.display_name.value,
    bio: profileForm.elements.bio.value,
    main_course: profileForm.elements.main_course.value,
    sub_courses: selectedSubs,
    facebook: profileForm.elements.facebook.value,
    linkedin: profileForm.elements.linkedin.value,
    instagram: profileForm.elements.instagram.value,
    github: profileForm.elements.github.value,
    portfolio: profileForm.elements.portfolio.value,
  };

  const response = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    profileMessage.textContent = data.message || 'Failed to save profile.';
    return;
  }
  savedProfile = data.profile;
  setProfileFields(savedProfile);
  profileMessage.textContent = 'Profile saved.';
  setEditMode(false);
}

async function resetFields() {
  if (savedProfile) {
    setProfileFields(savedProfile);
    profileMessage.textContent = '';
    setEditMode(false);
  }
}

async function uploadPhoto() {
  if (!isOwnProfile) return;
  if (!isEditMode) return;
  if (!photoInput.files.length) return;
  const formData = new FormData();
  formData.append('photo', photoInput.files[0]);
  const response = await fetch('/api/profile/photo', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    profileMessage.textContent = data.message || 'Failed to upload photo.';
    return;
  }
  profileImage.src = data.photo_link;
  profileMessage.textContent = 'Photo updated.';
}

async function handleFollowAction() {
  if (isOwnProfile || !savedProfile || !savedProfile.uid || !profileFollowButton) return;
  if (!interactionState || !interactionState.moderation) return;

  const targetUid = savedProfile.uid;
  setActionMessage('');

  if (interactionState.moderation.isBlocked || interactionState.moderation.blockedByUser) {
    setActionMessage('Follow is unavailable for this user.');
    return;
  }

  try {
    if (interactionState.relation && interactionState.relation.isFollowing) {
      await apiRequest('/api/connections/unfollow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid }),
      });
      setActionMessage('Unfollowed user.', 'success');
    } else if (interactionState.relation && interactionState.relation.followRequestSent) {
      await apiRequest('/api/connections/follow/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid }),
      });
      setActionMessage('Follow request canceled.', 'success');
    } else {
      const result = await apiRequest('/api/connections/follow/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid }),
      });
      if (result.requiresApproval) {
        setActionMessage('Follow request sent.', 'success');
      } else {
        setActionMessage('You are now following this user.', 'success');
      }
    }
    await loadInteractionState();
  } catch (error) {
    setActionMessage(error.message);
  }
}

async function handleProfileOption(action) {
  if (isOwnProfile || !savedProfile || !savedProfile.uid) return;
  const targetUid = savedProfile.uid;

  try {
    if (action === 'copy-link') {
      const profileUrl = `${window.location.origin}/profile?uid=${encodeURIComponent(targetUid)}`;
      try {
        await navigator.clipboard.writeText(profileUrl);
        setActionMessage('Profile link copied.', 'success');
      } catch (error) {
        prompt('Copy profile link:', profileUrl);
      }
      return;
    }

    if (action === 'toggle-hide-posts') {
      const endpoint = interactionState && interactionState.moderation && interactionState.moderation.hidePosts
        ? '/api/connections/unhide-posts'
        : '/api/connections/hide-posts';
      await apiRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid }),
      });
      await loadInteractionState();
      setActionMessage('Post visibility preference updated.', 'success');
      return;
    }

    if (action === 'report-user') {
      const reason = prompt('Optional report reason (leave blank to skip):', '') || '';
      await apiRequest('/api/connections/report-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid, reason }),
      });
      setActionMessage('User reported. Thank you.', 'success');
      return;
    }

    if (action === 'toggle-block') {
      if (interactionState && interactionState.moderation && interactionState.moderation.isBlocked) {
        await apiRequest('/api/connections/unblock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUid }),
        });
        setActionMessage('User unblocked.', 'success');
      } else {
        const shouldBlock = confirm('Block this user? This will remove follows and hide their posts.');
        if (!shouldBlock) return;
        await apiRequest('/api/connections/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUid }),
        });
        setActionMessage('User blocked.', 'success');
      }
      await loadInteractionState();
    }
  } catch (error) {
    setActionMessage(error.message);
  }
}

if (profileForm) {
  profileForm.addEventListener('submit', saveProfile);
}

if (resetProfile) {
  resetProfile.addEventListener('click', resetFields);
}

if (photoInput) {
  photoInput.addEventListener('change', uploadPhoto);
}

if (toggleEditMode) {
  toggleEditMode.addEventListener('click', () => {
    if (!isOwnProfile) return;
    if (isEditMode) {
      setEditMode(false);
    } else {
      if (savedProfile) {
        setProfileFields(savedProfile);
      }
      setEditMode(true);
    }
  });
}

if (viewBookmarksButton) {
  viewBookmarksButton.addEventListener('click', async () => {
    if (!isOwnProfile) return;
    openBookmarksModal();
    await loadBookmarkedPosts();
  });
}

if (bookmarksModalClose) {
  bookmarksModalClose.addEventListener('click', closeBookmarksModal);
}

if (bookmarksModal) {
  bookmarksModal.addEventListener('click', (event) => {
    if (event.target === bookmarksModal) {
      closeBookmarksModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && bookmarksModal && !bookmarksModal.classList.contains('is-hidden')) {
    closeBookmarksModal();
  }
});

if (profileFollowButton) {
  profileFollowButton.addEventListener('click', handleFollowAction);
}

if (profileOptionsToggle && profileOptionsMenu) {
  profileOptionsToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    profileOptionsMenu.classList.toggle('is-hidden');
  });

  profileOptionsMenu.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    closeProfileOptionsMenu();
    await handleProfileOption(button.dataset.action);
  });

  document.addEventListener('click', (event) => {
    if (!profileOptionsMenu.contains(event.target) && !profileOptionsToggle.contains(event.target)) {
      closeProfileOptionsMenu();
    }
  });
}

async function init() {
  try {
    await loadNavAvatar().catch(() => {});
    await loadCourses().catch(() => {});
    await loadProfile();
    await loadProfilePosts().catch((error) => {
      if (profilePostsHint) {
        profilePostsHint.textContent = error && error.message ? error.message : 'Failed to load posts.';
      }
    });
  } catch (error) {
    profileMessage.textContent = error.message;
  }
}

init();
