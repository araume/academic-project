const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const blockedList = document.getElementById('blockedList');
const blockedMessage = document.getElementById('blockedMessage');

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

function setFeedback(message, type = 'error') {
  if (!blockedMessage) return;
  blockedMessage.textContent = message || '';
  blockedMessage.style.color = type === 'success' ? '#2f9e68' : '#9d3f36';
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ ok: false, message: 'Unexpected response.' }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function renderEmpty(text) {
  blockedList.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  blockedList.appendChild(empty);
}

function renderBlockedUsers(users) {
  blockedList.innerHTML = '';
  if (!users.length) {
    renderEmpty('No blocked users yet.');
    return;
  }

  users.forEach((user) => {
    const item = document.createElement('article');
    item.className = 'blocked-item';

    const main = document.createElement('div');
    main.className = 'blocked-main';

    const avatar = document.createElement('div');
    avatar.className = 'blocked-avatar';
    setAvatarContent(avatar, user.photoLink, user.displayName || 'User', `${user.displayName || 'User'} profile photo`);

    const meta = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = user.displayName || 'Member';
    const subtitle = document.createElement('p');
    subtitle.textContent = `${user.course || 'No course'}${user.hidePosts ? ' • Posts hidden' : ''}`;

    meta.appendChild(title);
    meta.appendChild(subtitle);

    main.appendChild(avatar);
    main.appendChild(meta);

    const unblockBtn = document.createElement('button');
    unblockBtn.type = 'button';
    unblockBtn.className = 'unblock-btn';
    unblockBtn.dataset.uid = user.uid;
    unblockBtn.textContent = 'Unblock';

    item.appendChild(main);
    item.appendChild(unblockBtn);
    blockedList.appendChild(item);
  });
}

async function loadBootstrap() {
  const data = await apiRequest('/api/connections/bootstrap');
  if (data.me) {
    setNavAvatar(data.me.photoLink, data.me.displayName);
  }
}

async function loadBlockedUsers() {
  const data = await apiRequest('/api/preferences/blocked-users?page=1&pageSize=100');
  renderBlockedUsers(data.users || []);
}

if (blockedList) {
  blockedList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-uid]');
    if (!button) return;

    try {
      await apiRequest('/api/connections/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid: button.dataset.uid }),
      });
      setFeedback('User unblocked.', 'success');
      await loadBlockedUsers();
    } catch (error) {
      setFeedback(error.message);
    }
  });
}

async function init() {
  try {
    await loadBootstrap();
    await loadBlockedUsers();
  } catch (error) {
    setFeedback(error.message);
    renderEmpty(error.message);
  }
}

init();
