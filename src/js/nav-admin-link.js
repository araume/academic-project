(async function initNavEnhancements() {
  await Promise.all([
    injectAdminNavLink(),
    initMobileAppMenuEntry(),
    initNotificationsMenu(),
    initGlobalSearchModal(),
  ]);
})();

async function injectAdminNavLink() {
  const profileMenu = document.getElementById('profileMenu');
  if (!profileMenu) return;

  try {
    const response = await fetch('/api/admin/me');
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok || data.allowed !== true) {
      return;
    }

    const existing = profileMenu.querySelector('a[href="/admin"]');
    if (existing) return;

    const accountLink = profileMenu.querySelector('a[href="/account"]');
    const link = document.createElement('a');
    link.href = '/admin';
    link.textContent = 'Admin';

    if (accountLink && accountLink.nextSibling) {
      profileMenu.insertBefore(link, accountLink.nextSibling);
    } else if (accountLink) {
      profileMenu.appendChild(link);
    } else {
      profileMenu.insertBefore(link, profileMenu.firstChild);
    }
  } catch (error) {
    // ignore; nav still works for non-admin users
  }
}

async function initMobileAppMenuEntry() {
  const profileMenu = document.getElementById('profileMenu');
  if (!profileMenu) return;

  let mobileAppButton = profileMenu.querySelector('[data-action="open-mobile-app-modal"]');
  if (!mobileAppButton) {
    mobileAppButton = document.createElement('button');
    mobileAppButton.type = 'button';
    mobileAppButton.dataset.action = 'open-mobile-app-modal';
    mobileAppButton.textContent = 'Mobile app';

    const preferencesLink = profileMenu.querySelector('a[href="/preferences"]');
    if (preferencesLink) {
      profileMenu.insertBefore(mobileAppButton, preferencesLink);
    } else {
      profileMenu.appendChild(mobileAppButton);
    }
  }

  if (mobileAppButton.dataset.bound === '1') return;
  mobileAppButton.dataset.bound = '1';

  const overlay = document.createElement('div');
  overlay.className = 'mobile-app-overlay is-hidden';
  overlay.innerHTML = `
    <div class="mobile-app-modal" role="dialog" aria-modal="true" aria-labelledby="mobileAppModalTitle">
      <div class="mobile-app-modal-head">
        <h3 id="mobileAppModalTitle">Open Library Lite</h3>
        <button type="button" class="mobile-app-modal-close" aria-label="Close mobile app modal">×</button>
      </div>
      <p class="mobile-app-modal-subtitle" id="mobileAppModalSubtitle">Scan the QR code to download the Android lite app.</p>
      <p class="mobile-app-modal-description" id="mobileAppModalDescription"></p>
      <div class="mobile-app-modal-qr-wrap">
        <img class="mobile-app-modal-qr is-hidden" id="mobileAppModalQr" alt="Open Library Lite QR code" />
        <p class="mobile-app-modal-qr-empty is-hidden" id="mobileAppModalQrEmpty">QR code is not configured yet.</p>
      </div>
      <div class="mobile-app-modal-actions" id="mobileAppModalActions"></div>
      <p class="mobile-app-modal-message" id="mobileAppModalMessage"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeButton = overlay.querySelector('.mobile-app-modal-close');
  const modalTitle = overlay.querySelector('#mobileAppModalTitle');
  const modalSubtitle = overlay.querySelector('#mobileAppModalSubtitle');
  const modalDescription = overlay.querySelector('#mobileAppModalDescription');
  const qrImage = overlay.querySelector('#mobileAppModalQr');
  const qrEmpty = overlay.querySelector('#mobileAppModalQrEmpty');
  const actions = overlay.querySelector('#mobileAppModalActions');
  const message = overlay.querySelector('#mobileAppModalMessage');

  const closeModal = () => {
    overlay.classList.add('is-hidden');
  };

  function showMessage(text) {
    if (!message) return;
    message.textContent = text || '';
  }

  function canRenderImageUrl(value) {
    if (!value) return false;
    return (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('/') ||
      value.startsWith('data:image/')
    );
  }

  function renderMobileAppPage(page) {
    const payload = page || {};
    const body = payload.body || {};
    const title = String(payload.title || '').trim() || 'Open Library Lite';
    const subtitle = String(payload.subtitle || '').trim() || 'Scan the QR code to download the Android lite app.';
    const description = String(body.description || '').trim();
    const qrImageUrl = String(body.qrImageUrl || '').trim();
    const qrAltText = String(body.qrAltText || '').trim() || 'Open Library Lite QR code';
    const downloadUrl = String(body.downloadUrl || '').trim();
    const downloadLabel = String(body.downloadLabel || '').trim() || 'Download APK';

    if (modalTitle) modalTitle.textContent = title;
    if (modalSubtitle) modalSubtitle.textContent = subtitle;
    if (modalDescription) {
      modalDescription.textContent = description || 'Open Library Lite helps you stay connected on mobile.';
    }

    if (actions) {
      actions.innerHTML = '';
      if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'mobile-app-download-link';
        link.textContent = downloadLabel;
        actions.appendChild(link);
      }
    }

    if (qrImage && qrEmpty) {
      if (canRenderImageUrl(qrImageUrl)) {
        qrImage.src = qrImageUrl;
        qrImage.alt = qrAltText;
        qrImage.classList.remove('is-hidden');
        qrEmpty.classList.add('is-hidden');
      } else {
        qrImage.classList.add('is-hidden');
        qrImage.removeAttribute('src');
        qrEmpty.classList.remove('is-hidden');
      }
    }
  }

  if (qrImage && qrEmpty) {
    qrImage.addEventListener('error', () => {
      qrImage.classList.add('is-hidden');
      qrImage.removeAttribute('src');
      qrEmpty.classList.remove('is-hidden');
      qrEmpty.textContent = 'Unable to load QR code image. Check the configured URL.';
    });
  }

  async function openModal() {
    overlay.classList.remove('is-hidden');
    showMessage('Loading mobile app details...');
    try {
      const response = await fetch('/api/site-pages/mobile-app');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok || !data.page) {
        throw new Error(data && data.message ? data.message : 'Unable to load mobile app details.');
      }
      renderMobileAppPage(data.page);
      showMessage('');
    } catch (error) {
      renderMobileAppPage(null);
      showMessage(error.message || 'Unable to load mobile app details.');
    }
  }

  mobileAppButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    profileMenu.classList.add('is-hidden');
    await openModal();
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeModal);
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.classList.contains('is-hidden')) {
      closeModal();
    }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizeTargetUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/')) return null;
  return trimmed;
}

function extractPostIdFromTargetUrl(value) {
  const targetUrl = normalizeTargetUrl(value);
  if (!targetUrl) return '';
  try {
    const parsed = new URL(targetUrl, window.location.origin);
    if (parsed.pathname !== '/home') return '';
    const queryId = (parsed.searchParams.get('post') || '').trim();
    if (queryId) return queryId;
    const hash = (parsed.hash || '').trim();
    if (hash.startsWith('#post-')) {
      return hash.slice(6).trim();
    }
    return '';
  } catch (error) {
    return '';
  }
}

function initialsFromName(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'ME';
  return safe
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

async function initGlobalSearchModal() {
  const searchButton = document.querySelector('.nav-actions .icon-button[aria-label="Search"]');
  if (!searchButton) return;
  if (searchButton.dataset.searchBound === '1') return;
  searchButton.dataset.searchBound = '1';

  const overlay = document.createElement('div');
  overlay.className = 'search-overlay is-hidden';
  overlay.innerHTML = `
    <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search">
      <div class="search-modal-head">
        <h3>Search</h3>
        <button type="button" class="search-close" aria-label="Close search">×</button>
      </div>
      <form class="search-form" novalidate>
        <input type="search" class="search-input" placeholder="Search posts, users, documents..." minlength="2" />
      </form>
      <div class="search-scope-row" role="tablist" aria-label="Search scope">
        <button type="button" class="search-scope-chip is-active" data-scope="all">All</button>
        <button type="button" class="search-scope-chip" data-scope="posts">Posts</button>
        <button type="button" class="search-scope-chip" data-scope="users">Users</button>
        <button type="button" class="search-scope-chip" data-scope="documents">Documents</button>
      </div>
      <div class="search-results">
        <p class="search-empty">Type at least 2 characters to search.</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeButton = overlay.querySelector('.search-close');
  const form = overlay.querySelector('.search-form');
  const input = overlay.querySelector('.search-input');
  const results = overlay.querySelector('.search-results');
  const scopeChips = Array.from(overlay.querySelectorAll('.search-scope-chip'));

  const state = {
    scope: 'all',
    query: '',
    loading: false,
    timer: null,
    requestId: 0,
  };

  function closeSearch() {
    overlay.classList.add('is-hidden');
  }

  function openSearch() {
    overlay.classList.remove('is-hidden');
    if (input) {
      input.focus();
      if (input.value) {
        input.select();
      }
    }
  }

  function renderMessage(message) {
    results.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'search-empty';
    p.textContent = message;
    results.appendChild(p);
  }

  function createSection(title, count) {
    const section = document.createElement('section');
    section.className = 'search-section';
    const heading = document.createElement('div');
    heading.className = 'search-section-head';
    heading.innerHTML = `<h4>${escapeHtml(title)}</h4><span>${count}</span>`;
    section.appendChild(heading);
    return section;
  }

  function renderAvatar(photoLink, displayName) {
    const node = document.createElement('span');
    node.className = 'search-item-avatar';
    if (photoLink) {
      const image = document.createElement('img');
      image.src = photoLink;
      image.alt = displayName || 'Profile photo';
      node.appendChild(image);
    } else {
      node.textContent = initialsFromName(displayName);
    }
    return node;
  }

  function goToPost(postId) {
    if (!postId) return;
    if (window.location.pathname === '/home') {
      window.dispatchEvent(
        new CustomEvent('open-post-modal', {
          detail: { postId },
        })
      );
    } else {
      window.location.href = `/home?post=${encodeURIComponent(postId)}&openPostModal=1`;
    }
  }

  function renderPosts(items) {
    if (!items.length) return null;
    const section = createSection('Posts', items.length);
    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-item';
      const actorName = item.uploader && item.uploader.displayName ? item.uploader.displayName : 'Member';

      const body = document.createElement('span');
      body.className = 'search-item-body';
      const title = document.createElement('strong');
      title.textContent = item.title || 'Untitled post';
      const subtitle = document.createElement('span');
      subtitle.textContent = `${actorName}${item.course ? ` • ${item.course}` : ''}`;
      const excerpt = document.createElement('small');
      excerpt.textContent = item.excerpt || '';
      body.appendChild(title);
      body.appendChild(subtitle);
      body.appendChild(excerpt);

      row.appendChild(renderAvatar(item.uploader && item.uploader.photoLink, actorName));
      row.appendChild(body);
      row.addEventListener('click', () => {
        closeSearch();
        goToPost(item.id);
      });
      section.appendChild(row);
    });
    return section;
  }

  function renderUsers(items) {
    if (!items.length) return null;
    const section = createSection('Users', items.length);
    items.forEach((item) => {
      const row = document.createElement('a');
      row.className = 'search-item';
      row.href = item.targetUrl || `/profile?uid=${encodeURIComponent(item.uid || '')}`;

      const body = document.createElement('span');
      body.className = 'search-item-body';
      const title = document.createElement('strong');
      title.textContent = item.displayName || 'Member';
      const subtitle = document.createElement('span');
      subtitle.textContent = `${item.course || 'No course'}${item.relation && item.relation.isFollowing ? ' • Following' : ''}`;
      const excerpt = document.createElement('small');
      excerpt.textContent = item.bio || '';
      body.appendChild(title);
      body.appendChild(subtitle);
      body.appendChild(excerpt);

      row.appendChild(renderAvatar(item.photoLink, item.displayName || 'Member'));
      row.appendChild(body);
      row.addEventListener('click', () => {
        closeSearch();
      });
      section.appendChild(row);
    });
    return section;
  }

  function renderDocuments(items) {
    if (!items.length) return null;
    const section = createSection('Documents', items.length);
    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-item';

      const body = document.createElement('span');
      body.className = 'search-item-body';
      const title = document.createElement('strong');
      title.textContent = item.title || 'Untitled document';
      const subtitle = document.createElement('span');
      subtitle.textContent = `${item.course || 'No course'}${item.subject ? ` • ${item.subject}` : ''}`;
      const excerpt = document.createElement('small');
      excerpt.textContent = item.description || item.uploaderName || '';
      body.appendChild(title);
      body.appendChild(subtitle);
      body.appendChild(excerpt);

      const badge = document.createElement('span');
      badge.className = 'search-item-doc';
      badge.textContent = 'DOC';

      row.appendChild(badge);
      row.appendChild(body);
      row.addEventListener('click', () => {
        closeSearch();
        if (item.link) {
          window.open(item.link, '_blank');
        } else if (item.targetUrl) {
          window.location.href = item.targetUrl;
        } else {
          window.location.href = '/open-library';
        }
      });
      section.appendChild(row);
    });
    return section;
  }

  function renderSearchResults(payload) {
    const resultsMap = payload && payload.results ? payload.results : {};
    const posts = Array.isArray(resultsMap.posts) ? resultsMap.posts : [];
    const users = Array.isArray(resultsMap.users) ? resultsMap.users : [];
    const documents = Array.isArray(resultsMap.documents) ? resultsMap.documents : [];

    const sections = [renderPosts(posts), renderUsers(users), renderDocuments(documents)].filter(Boolean);
    results.innerHTML = '';
    if (!sections.length) {
      renderMessage('No results found.');
      return;
    }
    sections.forEach((section) => results.appendChild(section));
  }

  async function runSearch() {
    const q = String(state.query || '').trim();
    if (q.length < 2) {
      renderMessage('Type at least 2 characters to search.');
      return;
    }

    const reqId = ++state.requestId;
    state.loading = true;
    renderMessage('Searching...');
    try {
      const params = new URLSearchParams({
        q,
        scope: state.scope,
        limit: '8',
      });
      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (reqId !== state.requestId) return;
      if (!response.ok || !data || !data.ok) {
        throw new Error(data && data.message ? data.message : 'Search failed.');
      }
      renderSearchResults(data);
    } catch (error) {
      if (reqId !== state.requestId) return;
      renderMessage(error.message || 'Unable to search right now.');
    } finally {
      if (reqId === state.requestId) {
        state.loading = false;
      }
    }
  }

  function queueSearch() {
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = window.setTimeout(runSearch, 220);
  }

  searchButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSearch();
    queueSearch();
  });

  if (closeButton) {
    closeButton.addEventListener('click', closeSearch);
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runSearch();
    });
  }

  if (input) {
    input.addEventListener('input', () => {
      state.query = input.value || '';
      queueSearch();
    });
  }

  scopeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const scope = chip.dataset.scope || 'all';
      state.scope = scope;
      scopeChips.forEach((btn) => btn.classList.toggle('is-active', btn === chip));
      queueSearch();
    });
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeSearch();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.classList.contains('is-hidden')) {
      closeSearch();
    }
  });
}

async function initNotificationsMenu() {
  const baseButton = document.querySelector('.nav-actions .icon-button[aria-label="Notifications"]');
  if (!baseButton) return;

  if (baseButton.closest('.notifications-wrap')) {
    return;
  }

  const parent = baseButton.parentElement;
  if (!parent) return;

  const wrap = document.createElement('div');
  wrap.className = 'notifications-wrap';
  parent.insertBefore(wrap, baseButton);
  wrap.appendChild(baseButton);

  baseButton.classList.add('notifications-button');

  const dot = document.createElement('span');
  dot.className = 'notifications-dot is-hidden';
  dot.setAttribute('aria-hidden', 'true');
  baseButton.appendChild(dot);

  const panel = document.createElement('div');
  panel.className = 'notifications-menu is-hidden';
  panel.innerHTML = `
    <div class="notifications-head">
      <h3>Notifications</h3>
      <button type="button" class="notifications-mark-all">Mark all read</button>
    </div>
    <div class="notifications-list">
      <p class="notifications-empty">Loading...</p>
    </div>
  `;
  wrap.appendChild(panel);

  const list = panel.querySelector('.notifications-list');
  const markAllButton = panel.querySelector('.notifications-mark-all');

  const state = {
    unreadCount: 0,
    loading: false,
  };

  function setUnread(count) {
    const unread = Math.max(Number(count) || 0, 0);
    state.unreadCount = unread;
    dot.classList.toggle('is-hidden', unread < 1);
  }

  function closePanel() {
    panel.classList.add('is-hidden');
  }

  function openPanel() {
    panel.classList.remove('is-hidden');
  }

  async function fetchUnreadCount() {
    try {
      const response = await fetch('/api/notifications/unread-count');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) return;
      setUnread(data.unreadCount);
    } catch (error) {
      // ignore polling errors
    }
  }

  async function markSingleRead(id) {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) return false;
      setUnread(data.unreadCount);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function markAllRead() {
    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) return;
      setUnread(data.unreadCount);
      await loadNotifications();
    } catch (error) {
      // no-op
    }
  }

  function renderNotifications(items) {
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<p class="notifications-empty">No notifications yet.</p>';
      return;
    }

    list.innerHTML = '';
    items.forEach((item) => {
      const node = document.createElement('a');
      node.className = 'notification-item';
      if (!item.isRead) {
        node.classList.add('is-unread');
      }
      node.href = normalizeTargetUrl(item.targetUrl) || '#';

      const actorName = item.actor && item.actor.displayName ? item.actor.displayName : 'Someone';
      const actorPhoto = item.actor && item.actor.photoLink ? item.actor.photoLink : '';
      const message = item.message || `${actorName} sent a notification.`;
      const created = timeAgo(item.createdAt);

      node.innerHTML = `
        <span class="notification-avatar">
          ${
            actorPhoto
              ? `<img src="${escapeHtml(actorPhoto)}" alt="${escapeHtml(actorName)}" />`
              : `<span>${escapeHtml(actorName.slice(0, 2).toUpperCase())}</span>`
          }
        </span>
        <span class="notification-body">
          <strong>${escapeHtml(actorName)}</strong>
          <span>${escapeHtml(message)}</span>
          <small>${escapeHtml(created)}</small>
        </span>
      `;

      node.addEventListener('click', async (event) => {
        const targetUrl = normalizeTargetUrl(item.targetUrl);
        const postId = extractPostIdFromTargetUrl(item.targetUrl);
        event.preventDefault();

        if (!item.isRead) {
          await markSingleRead(item.id);
        }

        if (postId) {
          if (window.location.pathname === '/home') {
            window.dispatchEvent(
              new CustomEvent('open-post-modal', {
                detail: { postId },
              })
            );
          } else {
            const destination = `/home?post=${encodeURIComponent(postId)}&openPostModal=1`;
            window.location.href = destination;
          }
          closePanel();
          return;
        }

        closePanel();
        if (targetUrl) {
          window.location.href = targetUrl;
        }
      });

      list.appendChild(node);
    });
  }

  async function loadNotifications() {
    if (state.loading) return;
    state.loading = true;
    try {
      const response = await fetch('/api/notifications?page=1&pageSize=12');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.ok) {
        throw new Error(data && data.message ? data.message : 'Failed to load notifications.');
      }
      setUnread(data.unreadCount);
      renderNotifications(data.notifications || []);
    } catch (error) {
      list.innerHTML = '<p class="notifications-empty">Unable to load notifications.</p>';
    } finally {
      state.loading = false;
    }
  }

  baseButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    const hidden = panel.classList.contains('is-hidden');
    if (hidden) {
      openPanel();
      await loadNotifications();
    } else {
      closePanel();
    }
  });

  markAllButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await markAllRead();
  });

  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) {
      closePanel();
    }
  });

  await fetchUnreadCount();
  window.setInterval(fetchUnreadCount, 30000);
}
