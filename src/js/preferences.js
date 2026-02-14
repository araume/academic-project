const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const privacyForm = document.getElementById('privacyForm');
const searchable = document.getElementById('searchable');
const followApprovalRequired = document.getElementById('followApprovalRequired');
const activeVisible = document.getElementById('activeVisible');
const nonFollowerChatPolicy = document.getElementById('nonFollowerChatPolicy');
const privacyMessage = document.getElementById('privacyMessage');

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

function showMessage(text, type = 'error') {
  if (!privacyMessage) return;
  privacyMessage.textContent = text || '';
  privacyMessage.style.color = type === 'success' ? '#2f9e68' : '#9d3f36';
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

async function loadBootstrap() {
  const data = await apiRequest('/api/connections/bootstrap');
  if (data.me) {
    setNavAvatar(data.me.photoLink, data.me.displayName);
  }
}

async function loadPrivacySettings() {
  const data = await apiRequest('/api/preferences/privacy');
  const settings = data.settings || {};

  searchable.checked = settings.searchable !== false;
  followApprovalRequired.checked = settings.follow_approval_required !== false;
  activeVisible.checked = settings.active_visible !== false;
  nonFollowerChatPolicy.value = settings.non_follower_chat_policy || 'request';
}

async function savePrivacySettings(event) {
  event.preventDefault();
  showMessage('');

  const payload = {
    searchable: Boolean(searchable.checked),
    follow_approval_required: Boolean(followApprovalRequired.checked),
    active_visible: Boolean(activeVisible.checked),
    non_follower_chat_policy: nonFollowerChatPolicy.value,
  };

  try {
    await apiRequest('/api/preferences/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    showMessage('Preferences saved.', 'success');
  } catch (error) {
    showMessage(error.message);
  }
}

if (privacyForm) {
  privacyForm.addEventListener('submit', savePrivacySettings);
}

async function init() {
  try {
    await loadBootstrap();
    await loadPrivacySettings();
  } catch (error) {
    showMessage(error.message);
  }
}

init();
