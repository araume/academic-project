const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const profileForm = document.getElementById('profileForm');
const profileMessage = document.getElementById('profileMessage');
const resetProfile = document.getElementById('resetProfile');
const profileImage = document.getElementById('profileImage');
const profileName = document.getElementById('profileName');
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
const profileSubCourses = document.getElementById('profileSubCourses');
const profileFacebook = document.getElementById('profileFacebook');
const profileLinkedin = document.getElementById('profileLinkedin');
const profileInstagram = document.getElementById('profileInstagram');
const profileGithub = document.getElementById('profileGithub');
const profilePortfolio = document.getElementById('profilePortfolio');
const profileEditCard = document.getElementById('profileEditCard');
const toggleEditMode = document.getElementById('toggleEditMode');
const photoUploadLabel = document.getElementById('photoUploadLabel');
const photoInput = document.getElementById('photoInput');
const mainCourseSelect = document.getElementById('mainCourseSelect');
const subCoursesSelect = document.getElementById('subCoursesSelect');

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
  } catch (error) {
    profileMessage.textContent = error.message;
  }
}

init();
