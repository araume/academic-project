const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const composerAvatar = document.getElementById('composerAvatar');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const postsFeed = document.getElementById('postsFeed');
const createPostToggle = document.getElementById('createPostToggle');
const createPostModal = document.getElementById('createPostModal');
const createPostClose = document.getElementById('createPostClose');
const createPostForm = document.getElementById('createPostForm');
const createPostMessage = document.getElementById('createPostMessage');
const createPostSubmitButton = createPostForm
  ? createPostForm.querySelector('button[type="submit"]')
  : null;
const attachmentFile = document.getElementById('attachmentFile');
const openLibraryPicker = document.getElementById('openLibraryPicker');
const libraryPickerModal = document.getElementById('libraryPickerModal');
const libraryPickerClose = document.getElementById('libraryPickerClose');
const libraryPickerSearch = document.getElementById('libraryPickerSearch');
const libraryPickerList = document.getElementById('libraryPickerList');
const selectedLibraryDoc = document.getElementById('selectedLibraryDoc');
const selectedLibraryDocTitle = document.getElementById('selectedLibraryDocTitle');
const clearLibraryDoc = document.getElementById('clearLibraryDoc');

const editPostModal = document.getElementById('editPostModal');
const editPostClose = document.getElementById('editPostClose');
const editPostForm = document.getElementById('editPostForm');
const editPostMessage = document.getElementById('editPostMessage');

const commentsModal = document.getElementById('commentsModal');
const commentsClose = document.getElementById('commentsClose');
const postCommentList = document.getElementById('postCommentList');
const postCommentForm = document.getElementById('postCommentForm');
const postCommentInput = document.getElementById('postCommentInput');
const postCommentSubmitButton = postCommentForm
  ? postCommentForm.querySelector('button[type="submit"]')
  : null;
const postAiModal = document.getElementById('postAiModal');
const postAiClose = document.getElementById('postAiClose');
const postAiTitle = document.getElementById('postAiTitle');
const postAiSubtitle = document.getElementById('postAiSubtitle');
const postAiMessages = document.getElementById('postAiMessages');
const postAiForm = document.getElementById('postAiForm');
const postAiInput = document.getElementById('postAiInput');
const postAiMessage = document.getElementById('postAiMessage');
const postSpotlightModal = document.getElementById('postSpotlightModal');
const postSpotlightClose = document.getElementById('postSpotlightClose');
const postSpotlightContainer = document.getElementById('postSpotlightContainer');

const libraryDocModal = document.getElementById('libraryDocModal');
const libraryDocClose = document.getElementById('libraryDocClose');
const libraryDocTitle = document.getElementById('libraryDocTitle');
const libraryDocDescription = document.getElementById('libraryDocDescription');
const libraryDocUploader = document.getElementById('libraryDocUploader');
const libraryDocCourse = document.getElementById('libraryDocCourse');
const libraryDocSubject = document.getElementById('libraryDocSubject');
const libraryDocOpen = document.getElementById('libraryDocOpen');
const libraryDocOpenMessage = document.getElementById('libraryDocOpenMessage');
const trendingDiscussionsList = document.getElementById('trendingDiscussionsList');
const courseMaterialsList = document.getElementById('courseMaterialsList');
const suggestedRoomsList = document.getElementById('suggestedRoomsList');

let currentPostId = null;
let currentLibraryDoc = null;
let currentEditPost = null;
let selectedLibraryDocument = null;
let libraryPickerSearchTimer = null;
let postCache = new Map();
let activePostAiPostId = null;
let isSendingPostAi = false;
let isCreatingPost = false;
let isSubmittingPostComment = false;
const ROOMS_PREJOIN_KEY = 'rooms-prejoin';

const state = {
  page: 1,
  pageSize: 8,
};
const DEFAULT_AVATAR = '/assets/LOGO.png';

function profileUrlForUid(uid) {
  const safeUid = typeof uid === 'string' ? uid.trim() : '';
  if (!safeUid) return '';
  return `/profile?uid=${encodeURIComponent(safeUid)}`;
}

function buildProfileNameNode(uid, displayName, className = 'post-author-link') {
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

function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function renderSidecardEmpty(container, message) {
  if (!container) return;
  clearElement(container);
  const empty = document.createElement('p');
  empty.className = 'sidecard-empty';
  empty.textContent = message;
  container.appendChild(empty);
}

function sanitizePostId(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function extractRequestedPostId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = sanitizePostId(params.get('post') || '');
  if (fromQuery) return fromQuery;

  const hash = sanitizePostId(window.location.hash || '');
  if (hash.startsWith('#post-')) {
    return hash.slice(6).trim();
  }
  return '';
}

function clearRequestedPostFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.has('post')) {
    url.searchParams.delete('post');
    changed = true;
  }
  if (url.searchParams.has('openPostModal')) {
    url.searchParams.delete('openPostModal');
    changed = true;
  }
  if (url.hash && url.hash.startsWith('#post-')) {
    url.hash = '';
    changed = true;
  }
  if (changed) {
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

async function fetchPostById(postId) {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}`);
  const data = await response.json();
  if (!response.ok || !data.ok || !data.post) {
    throw new Error(data.message || 'Unable to load post.');
  }
  return data.post;
}

function renderSpotlightPost(post) {
  const article = document.createElement('article');
  article.className = 'post-card spotlight-post-card';
  const uploaderName = post.uploader?.displayName || 'Member';

  const header = document.createElement('div');
  header.className = 'post-header spotlight-post-header';
  header.innerHTML = `
    <div class="post-avatar"></div>
    <div class="spotlight-header-meta">
      <h4>${uploaderName}</h4>
      <p>${timeAgo(post.uploadDate)}</p>
    </div>
  `;
  const postAvatar = header.querySelector('.post-avatar');
  setAvatarImage(postAvatar, post.uploader?.photoLink, `${uploaderName} profile photo`);
  const nameHeading = header.querySelector('.spotlight-header-meta h4');
  if (nameHeading) {
    nameHeading.textContent = '';
    nameHeading.appendChild(
      buildProfileNameNode(post.uploader?.uid || '', uploaderName, 'post-author-link')
    );
  }

  const content = document.createElement('div');
  content.className = 'spotlight-post-content';
  content.innerHTML = `
    <h4>${post.title}</h4>
    <p>${post.content}</p>
  `;

  const footer = document.createElement('div');
  footer.className = 'spotlight-post-footer';
  const stat = document.createElement('p');
  stat.textContent = `${Number(post.likesCount || 0)} likes • ${Number(post.commentsCount || 0)} comments`;
  const discussion = document.createElement('button');
  discussion.type = 'button';
  discussion.className = 'secondary-button';
  discussion.textContent = 'Open discussion';
  discussion.addEventListener('click', async () => {
    currentPostId = post.id;
    await loadPostComments(post.id);
    openModal(commentsModal);
  });
  footer.appendChild(stat);
  footer.appendChild(discussion);

  const attachment = renderAttachment(post);
  article.appendChild(header);
  article.appendChild(content);
  if (attachment) {
    article.appendChild(attachment);
  }
  article.appendChild(footer);

  return article;
}

async function openPostSpotlight(postId, options = {}) {
  const id = sanitizePostId(postId);
  if (!id || !postSpotlightContainer) return;

  const clearUrl = options && options.clearUrl === true;
  postSpotlightContainer.innerHTML = '<p>Loading post...</p>';
  openModal(postSpotlightModal);

  try {
    let post = postCache.get(id);
    if (!post) {
      post = await fetchPostById(id);
    }
    postSpotlightContainer.innerHTML = '';
    postSpotlightContainer.appendChild(renderSpotlightPost(post));
  } catch (error) {
    postSpotlightContainer.innerHTML = `<p>${error.message}</p>`;
  } finally {
    if (clearUrl) {
      clearRequestedPostFromUrl();
    }
  }
}

async function maybeOpenRequestedPost() {
  const postId = extractRequestedPostId();
  if (!postId) return;
  await openPostSpotlight(postId, { clearUrl: true });
}

function setJoinButtonLoadingState(button, loading) {
  if (!button) return;
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = 'Joining...';
    return;
  }
  button.disabled = false;
  button.textContent = button.dataset.originalText || 'Join now';
}

async function directJoinSuggestedRoom(room, button) {
  if (!room || !room.id) return;
  if (button && button.disabled) return;
  setJoinButtonLoadingState(button, true);
  try {
    const response = await fetch(`/api/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!response.ok || !data.ok || !data.joinUrl) {
      throw new Error(data.message || 'Unable to join this room.');
    }

    try {
      sessionStorage.setItem(
        ROOMS_PREJOIN_KEY,
        JSON.stringify({
          roomId: Number(room.id),
          meetId: room.meetId || '',
          meetName: room.meetName || 'Live room',
          joinUrl: data.joinUrl,
          createdAt: Date.now(),
        })
      );
    } catch (error) {
      // sessionStorage is best-effort only.
    }

    window.location.href = '/rooms';
  } catch (error) {
    alert(error.message || 'Unable to join this room.');
  } finally {
    setJoinButtonLoadingState(button, false);
  }
}

function buildAvatarThumb(photoLink, altText) {
  const avatar = document.createElement('span');
  avatar.className = 'sidecard-avatar';
  const img = document.createElement('img');
  img.src = photoLink || DEFAULT_AVATAR;
  img.alt = altText || 'Profile photo';
  avatar.appendChild(img);
  return avatar;
}

function setAvatarImage(container, photoLink, altText) {
  if (!container) return;
  const image = container.querySelector('img') || document.createElement('img');
  image.src = photoLink || DEFAULT_AVATAR;
  image.alt = altText || 'Profile photo';
  if (!image.parentElement) {
    container.appendChild(image);
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

function setPostingState(button, isPosting) {
  if (!button) return;
  if (isPosting) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || 'Post';
    }
    button.disabled = true;
    button.textContent = 'Posting...';
    return;
  }
  button.disabled = false;
  button.textContent = button.dataset.originalText || button.textContent || 'Post';
  delete button.dataset.originalText;
}

function closeMenuOnOutsideClick(event) {
  if (!profileMenu || !profileToggle) {
    return;
  }
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

function appendPostAiBubble(role, text, { pending = false } = {}) {
  if (!postAiMessages) return null;
  const empty = postAiMessages.querySelector('.post-ai-empty');
  if (empty) empty.remove();
  const bubble = document.createElement('div');
  bubble.className = `post-ai-bubble ${role}${pending ? ' pending' : ''}`;
  bubble.textContent = text || '';
  postAiMessages.appendChild(bubble);
  postAiMessages.scrollTop = postAiMessages.scrollHeight;
  return bubble;
}

function renderPostAiMessages(messages) {
  if (!postAiMessages) return;
  clearElement(postAiMessages);
  if (!Array.isArray(messages) || !messages.length) {
    const empty = document.createElement('p');
    empty.className = 'post-ai-empty';
    empty.textContent = 'Start by asking a question about this post.';
    postAiMessages.appendChild(empty);
    return;
  }
  messages.forEach((message) => {
    appendPostAiBubble(message.role === 'user' ? 'user' : 'assistant', message.content || '');
  });
}

async function openPostAiModal(post) {
  if (!post || !post.id || !postAiModal) return;
  activePostAiPostId = post.id;
  if (postAiMessage) postAiMessage.textContent = '';
  if (postAiTitle) {
    postAiTitle.textContent = `Ask AI: ${post.title || 'Untitled post'}`;
  }
  if (postAiSubtitle) {
    postAiSubtitle.textContent = 'Loading post context...';
  }
  renderPostAiMessages([]);
  openModal(postAiModal);

  try {
    const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/ask-ai/bootstrap`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load post AI conversation.');
    }
    const attachmentSummary = data.context && data.context.attachmentSummary
      ? data.context.attachmentSummary
      : 'No attachment.';
    if (postAiSubtitle) {
      const shortSummary = attachmentSummary.length > 180
        ? `${attachmentSummary.slice(0, 180).trim()}...`
        : attachmentSummary;
      postAiSubtitle.textContent = `Context: ${shortSummary}`;
    }
    renderPostAiMessages(data.messages || []);
  } catch (error) {
    if (postAiSubtitle) {
      postAiSubtitle.textContent = 'Post context could not be loaded.';
    }
    if (postAiMessage) {
      postAiMessage.textContent = error.message || 'Unable to load post AI conversation.';
    }
  }
}

async function sendPostAiMessage(event) {
  event.preventDefault();
  if (isSendingPostAi || !activePostAiPostId || !postAiInput) return;
  const content = postAiInput.value.trim();
  if (!content) return;
  isSendingPostAi = true;
  if (postAiMessage) postAiMessage.textContent = '';
  postAiInput.value = '';
  postAiInput.disabled = true;
  const userBubble = appendPostAiBubble('user', content);
  const pendingBubble = appendPostAiBubble('assistant', 'Thinking...', { pending: true });

  try {
    const response = await fetch(`/api/posts/${encodeURIComponent(activePostAiPostId)}/ask-ai/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to send message.');
    }
    if (pendingBubble) {
      pendingBubble.classList.remove('pending');
      pendingBubble.textContent = data.message && data.message.content
        ? data.message.content
        : 'No response generated.';
    }
  } catch (error) {
    if (pendingBubble) pendingBubble.remove();
    if (!userBubble || !userBubble.parentElement) {
      appendPostAiBubble('user', content);
    }
    if (postAiMessage) {
      postAiMessage.textContent = error.message || 'Unable to send message.';
    }
  } finally {
    isSendingPostAi = false;
    postAiInput.disabled = false;
    postAiInput.focus();
    if (postAiMessages) {
      postAiMessages.scrollTop = postAiMessages.scrollHeight;
    }
  }
}

function updateSelectedLibraryDocUI() {
  if (!selectedLibraryDoc || !selectedLibraryDocTitle) {
    return;
  }
  if (!selectedLibraryDocument) {
    selectedLibraryDoc.classList.add('is-hidden');
    selectedLibraryDocTitle.textContent = '';
    return;
  }
  selectedLibraryDocTitle.textContent = selectedLibraryDocument.title || 'Selected document';
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
    const response = await fetch(`/api/library/documents?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load documents.');
    }

    libraryPickerList.innerHTML = '';
    if (!data.documents.length) {
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
        selectedLibraryDocument = {
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

function timeAgo(dateString) {
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

function renderTrendingSidecard(items) {
  if (!trendingDiscussionsList) return;
  if (!Array.isArray(items) || !items.length) {
    renderSidecardEmpty(trendingDiscussionsList, 'No trending discussions in the last 3 days.');
    return;
  }

  clearElement(trendingDiscussionsList);
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'sidecard-item sidecard-item--discussion';

    const top = document.createElement('div');
    top.className = 'sidecard-top';
    top.appendChild(buildAvatarThumb(item.uploader && item.uploader.photoLink, `${item.uploader && item.uploader.displayName ? item.uploader.displayName : 'Member'} profile photo`));

    const meta = document.createElement('div');
    meta.className = 'sidecard-meta';
    const title = document.createElement('h4');
    title.textContent = item.title || 'Untitled discussion';
    const info = document.createElement('p');
    const uploader = item.uploader && item.uploader.displayName ? item.uploader.displayName : 'Member';
    info.textContent = `${uploader} • ${timeAgo(item.uploadDate)}`;
    meta.appendChild(title);
    meta.appendChild(info);
    top.appendChild(meta);

    const excerpt = document.createElement('p');
    excerpt.className = 'sidecard-text';
    excerpt.textContent = item.excerpt || '';

    const stat = document.createElement('p');
    stat.className = 'sidecard-stat';
    stat.textContent = `${Number(item.likesCount || 0)} likes`;

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'sidecard-action sidecard-action-button';
    open.textContent = 'Open discussion';
    open.addEventListener('click', async (event) => {
      event.stopPropagation();
      await openPostSpotlight(item.id);
    });

    row.appendChild(top);
    if (item.excerpt) {
      row.appendChild(excerpt);
    }
    row.appendChild(stat);
    row.appendChild(open);
    row.addEventListener('click', async () => {
      await openPostSpotlight(item.id);
    });
    trendingDiscussionsList.appendChild(row);
  });
}

function renderCourseMaterialsSidecard(items) {
  if (!courseMaterialsList) return;
  if (!Array.isArray(items) || !items.length) {
    renderSidecardEmpty(courseMaterialsList, 'No recent materials available.');
    return;
  }

  clearElement(courseMaterialsList);
  items.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'sidecard-item sidecard-item--material';
    link.href = item.link || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const title = document.createElement('h4');
    title.textContent = item.title || 'Untitled document';

    const info = document.createElement('p');
    const course = item.course || 'No course';
    const subject = item.subject || 'No subject';
    info.textContent = `${course} • ${subject}`;

    const time = document.createElement('p');
    time.className = 'sidecard-stat';
    time.textContent = timeAgo(item.uploadDate);

    link.appendChild(title);
    link.appendChild(info);
    link.appendChild(time);
    courseMaterialsList.appendChild(link);
  });
}

function renderSuggestedRoomsSidecard(items) {
  if (!suggestedRoomsList) return;
  if (!Array.isArray(items) || !items.length) {
    renderSidecardEmpty(suggestedRoomsList, 'No live rooms available right now.');
    return;
  }

  clearElement(suggestedRoomsList);
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'sidecard-item sidecard-item--room';

    const title = document.createElement('h4');
    title.textContent = item.meetName || 'Live room';
    const meta = document.createElement('p');
    const visibilityLabel = item.visibility === 'course_exclusive' ? 'Course' : 'Public';
    meta.textContent = `${visibilityLabel} • ${item.activeParticipants || 0} active`;

    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'sidecard-action sidecard-action-button';
    join.textContent = 'Join now';
    join.addEventListener('click', async (event) => {
      event.stopPropagation();
      await directJoinSuggestedRoom(item, join);
    });

    row.appendChild(title);
    row.appendChild(meta);
    row.appendChild(join);
    row.addEventListener('click', async () => {
      await directJoinSuggestedRoom(item, join);
    });
    suggestedRoomsList.appendChild(row);
  });
}

async function fetchHomeSidecards() {
  try {
    const response = await fetch('/api/home/sidecards?limit=6');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load sidecards.');
    }
    const sidecards = data.sidecards || {};
    renderTrendingSidecard(sidecards.trendingDiscussions || []);
    renderCourseMaterialsSidecard(sidecards.courseMaterials || []);
    renderSuggestedRoomsSidecard(sidecards.suggestedRooms || []);
  } catch (error) {
    renderSidecardEmpty(trendingDiscussionsList, 'Unable to load trending discussions.');
    renderSidecardEmpty(courseMaterialsList, 'Unable to load course materials.');
    renderSidecardEmpty(suggestedRoomsList, 'Unable to load suggested rooms.');
  }
}

function renderPost(post, index) {
  const article = document.createElement('article');
  article.className = `post-card${index % 2 ? ' alt' : ''}`;
  const uploaderName = post.uploader?.displayName || 'Member';

  const header = document.createElement('div');
  header.className = 'post-header';
  header.innerHTML = `
    <div class="post-avatar"></div>
    <div class="post-meta">
      <div>
        <h4>${uploaderName}</h4>
        <p>${timeAgo(post.uploadDate)}</p>
      </div>
      <div class="menu-wrap">
        <button class="icon-button subtle" aria-label="More">
          <img src="/assets/dot-menu.svg" alt="" />
        </button>
        <div class="menu-pop is-hidden">
          <button type="button" data-action="bookmark">${post.bookmarked ? 'Remove bookmark' : 'Bookmark post'}</button>
          <button type="button" data-action="share">Share link</button>
          <button type="button" data-action="report">Report post</button>
          ${post.isOwner ? '<button type="button" data-action="edit">Edit post</button>' : ''}
          ${post.isOwner ? '<button type="button" data-action="delete">Delete post</button>' : ''}
        </div>
      </div>
    </div>
  `;
  const postAvatar = header.querySelector('.post-avatar');
  setAvatarImage(postAvatar, post.uploader?.photoLink, `${uploaderName} profile photo`);
  const nameHeading = header.querySelector('.post-meta h4');
  if (nameHeading) {
    nameHeading.textContent = '';
    nameHeading.appendChild(
      buildProfileNameNode(post.uploader?.uid || '', uploaderName, 'post-author-link')
    );
  }

  const content = document.createElement('div');
  content.innerHTML = `
    <h4>${post.title}</h4>
    <p>${post.content}</p>
  `;

  const attachment = renderAttachment(post);
  const actions = document.createElement('div');
  actions.className = 'post-actions';
  actions.innerHTML = `
    <button data-action="like"><img src="/assets/heart.svg" alt="" />${post.likesCount} Like</button>
    <button data-action="comments"><img src="/assets/comment-discussion.svg" alt="" />Discussion</button>
    <button data-action="ask-ai"><img src="/assets/AI-star.svg" alt="" />Ask AI</button>
  `;

  article.appendChild(header);
  article.appendChild(content);
  if (attachment) article.appendChild(attachment);
  article.appendChild(actions);

  const menuButton = header.querySelector('.icon-button');
  const menu = header.querySelector('.menu-pop');
  if (menuButton && menu) {
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.classList.toggle('is-hidden');
    });
    document.addEventListener('click', () => menu.classList.add('is-hidden'));
  }

  menu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => handleMenuAction(btn.dataset.action, post));
  });

  actions.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, post));
  });

  return article;
}

function replacePostCard(post) {
  if (!post || !post.id) return;
  const existing = document.getElementById(`post-${post.id}`);
  if (!existing) return;
  const alt = existing.classList.contains('alt');
  const replacement = renderPost(post, alt ? 1 : 0);
  replacement.id = existing.id;
  existing.replaceWith(replacement);
}

function removePostCard(postId) {
  const card = document.getElementById(`post-${postId}`);
  if (card) {
    card.remove();
  }
  postCache.delete(postId);
  if (postsFeed && !postsFeed.children.length) {
    postsFeed.innerHTML = '<p>No posts yet. Be the first to share.</p>';
  }
}

function renderAttachment(post) {
  if (!post.attachment) return null;
  const { type, link, title, libraryDocumentUuid } = post.attachment;

  if (type === 'image') {
    const media = document.createElement('div');
    media.className = 'post-media';
    media.innerHTML = `<img src="${link}" alt="Attachment" />`;
    return media;
  }
  if (type === 'video') {
    const media = document.createElement('div');
    media.className = 'post-media';
    media.innerHTML = `<video src="${link}" controls></video>`;
    return media;
  }

  const button = document.createElement('button');
  button.className = 'post-attachment';
  button.innerHTML = `<img src="/assets/document.svg" alt="" />${title || 'Open document'}`;
  button.addEventListener('click', () => {
    if (type === 'library_doc' && libraryDocumentUuid) {
      openLibraryDoc(libraryDocumentUuid);
    } else {
      window.open(link, '_blank');
    }
  });
  return button;
}

async function handleMenuAction(action, post) {
  if (action === 'bookmark') {
    const response = await fetch(`/api/posts/${post.id}/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: post.bookmarked ? 'remove' : 'add' }),
    });
    const data = await response.json();
    if (response.ok && data.ok) {
      post.bookmarked = !post.bookmarked;
      replacePostCard(post);
    }
  } else if (action === 'share') {
    const shareUrl = `${window.location.origin}/home?post=${encodeURIComponent(post.id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Post link copied.');
    } catch (error) {
      prompt('Copy post link:', shareUrl);
    }
  } else if (action === 'report') {
    await fetch(`/api/posts/${post.id}/report`, { method: 'POST' });
    alert('Report submitted. Thank you.');
  } else if (action === 'edit') {
    currentEditPost = post;
    editPostForm.elements.title.value = post.title;
    editPostForm.elements.content.value = post.content;
    openModal(editPostModal);
  } else if (action === 'delete') {
    if (!confirm('Delete this post?')) return;
    const response = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    if (response.ok) {
      removePostCard(post.id);
      fetchHomeSidecards();
    } else {
      const data = await response.json();
      alert(data.message || 'Unable to delete post.');
    }
  }
}

async function handleAction(action, post) {
  if (action === 'like') {
    const response = await fetch(`/api/posts/${post.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: post.liked ? 'unlike' : 'like' }),
    });
    const data = await response.json();
    if (response.ok && data.ok) {
      post.liked = !post.liked;
      post.likesCount = Number(data.likesCount || 0);
      replacePostCard(post);
      fetchHomeSidecards();
    }
  } else if (action === 'comments') {
    currentPostId = post.id;
    await loadPostComments(post.id);
    openModal(commentsModal);
  } else if (action === 'ask-ai') {
    await openPostAiModal(post);
  }
}

async function fetchPosts() {
  try {
    const params = new URLSearchParams({
      page: state.page,
      pageSize: state.pageSize,
    });
    const response = await fetch(`/api/posts?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load posts.');
    }
    postCache = new Map(data.posts.map((post) => [post.id, post]));
    postsFeed.innerHTML = '';
    if (!data.posts.length) {
      postsFeed.innerHTML = '<p>No posts yet. Be the first to share.</p>';
      return;
    }
    data.posts.forEach((post, index) => {
      const card = renderPost(post, index);
      card.id = `post-${post.id}`;
      postsFeed.appendChild(card);
    });
  } catch (error) {
    postsFeed.innerHTML = `<p>${error.message}</p>`;
  }
}

async function loadCurrentProfile() {
  setAvatarImage(composerAvatar, null, 'Your profile photo');
  setNavAvatar(null, '');
  try {
    const response = await fetch('/api/profile');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load profile.');
    }
    setAvatarImage(composerAvatar, data.profile?.photo_link || null, 'Your profile photo');
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (error) {
    // keep fallback avatar
  }
}

async function createPost(event) {
  event.preventDefault();
  if (isCreatingPost) return;
  createPostMessage.textContent = '';

  const formData = new FormData(createPostForm);
  formData.set('visibility', 'public');
  formData.delete('course');

  const file = attachmentFile && attachmentFile.files ? attachmentFile.files[0] : null;

  if (file && selectedLibraryDocument) {
    createPostMessage.textContent = 'Choose either an uploaded file or an Open Library document.';
    return;
  }

  if (selectedLibraryDocument) {
    formData.set('attachmentType', 'library_doc');
    formData.set('libraryDocumentUuid', selectedLibraryDocument.uuid);
    formData.set('attachmentTitle', selectedLibraryDocument.title || '');
  } else if (file) {
    const mimeType = (file.type || '').toLowerCase();
    if (mimeType.startsWith('image/')) {
      formData.set('attachmentType', 'image');
    } else if (mimeType.startsWith('video/')) {
      formData.set('attachmentType', 'video');
    } else {
      createPostMessage.textContent = 'Unsupported file type. Upload an image or video instead.';
      return;
    }
  } else {
    formData.set('attachmentType', 'none');
  }
  formData.delete('attachmentLink');

  isCreatingPost = true;
  setPostingState(createPostSubmitButton, true);
  try {
    const response = await fetch('/api/posts', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to create post.');
    }
    createPostForm.reset();
    selectedLibraryDocument = null;
    updateSelectedLibraryDocUI();
    closeModal(createPostModal);
    await fetchPosts();
    fetchHomeSidecards();
  } catch (error) {
    createPostMessage.textContent = error.message;
  } finally {
    isCreatingPost = false;
    setPostingState(createPostSubmitButton, false);
  }
}

async function savePost(event) {
  event.preventDefault();
  if (!currentEditPost) return;

  editPostMessage.textContent = '';
  const payload = {
    title: editPostForm.elements.title.value,
    content: editPostForm.elements.content.value,
    visibility: 'public',
  };

  try {
    const response = await fetch(`/api/posts/${currentEditPost.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to update post.');
    }
    currentEditPost.title = payload.title;
    currentEditPost.content = payload.content;
    currentEditPost.course = null;
    currentEditPost.visibility = 'public';
    replacePostCard(currentEditPost);
    closeModal(editPostModal);
  } catch (error) {
    editPostMessage.textContent = error.message;
  }
}

async function loadPostComments(postId) {
  postCommentList.innerHTML = '';
  try {
    const response = await fetch(`/api/posts/${postId}/comments`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load comments.');
    }
    if (!data.comments.length) {
      postCommentList.innerHTML = '<p>No comments yet.</p>';
      return;
    }
    data.comments.forEach((comment) => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      const time = new Date(comment.createdAt).toLocaleString();
      const name = comment.displayName || 'Member';
      const content = document.createElement('p');
      content.textContent = comment.content || '';
      const meta = document.createElement('span');
      meta.appendChild(
        buildProfileNameNode(
          comment.userUid || comment.uid || comment.authorUid || '',
          name,
          'comment-author-link'
        )
      );
      meta.appendChild(document.createTextNode(` • ${time}`));
      item.appendChild(content);
      item.appendChild(meta);
      postCommentList.appendChild(item);
    });
  } catch (error) {
    postCommentList.innerHTML = `<p>${error.message}</p>`;
  }
}

async function submitPostComment(event) {
  event.preventDefault();
  if (isSubmittingPostComment) return;
  if (!currentPostId || !postCommentInput.value.trim()) {
    return;
  }

  isSubmittingPostComment = true;
  setPostingState(postCommentSubmitButton, true);
  const content = postCommentInput.value.trim();
  try {
    const response = await fetch(`/api/posts/${currentPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (response.ok && data.ok) {
      postCommentInput.value = '';
      await loadPostComments(currentPostId);
      const post = postCache.get(currentPostId);
      if (post) {
        post.commentsCount = Number(post.commentsCount || 0) + 1;
      }
    }
  } finally {
    isSubmittingPostComment = false;
    setPostingState(postCommentSubmitButton, false);
  }
}

async function openLibraryDoc(uuid) {
  try {
    const response = await fetch(`/api/library/documents/${uuid}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load document.');
    }
    const raw = data.document || {};
    const normalized = {
      title: raw.title || raw.name || 'Untitled document',
      description: raw.description || raw.summary || '',
      uploaderName: raw.uploader_name || raw.uploaderName || raw.uploader || 'Member',
      course: raw.course || raw.course_name || raw.courseName || '',
      subject: raw.subject || raw.subject_name || raw.subjectName || '',
      link: raw.link || raw.documentLink || raw.url || '',
    };
    currentLibraryDoc = normalized;

    libraryDocTitle.textContent = normalized.title;
    libraryDocDescription.textContent = normalized.description || 'No description provided.';
    libraryDocUploader.textContent = normalized.uploaderName || 'Member';
    libraryDocCourse.textContent = normalized.course || 'No course';
    libraryDocSubject.textContent = normalized.subject || 'No subject';
    if (libraryDocOpen) {
      libraryDocOpen.disabled = !normalized.link;
      libraryDocOpen.title = normalized.link ? '' : 'Document file is unavailable in storage.';
    }
    if (libraryDocOpenMessage) {
      libraryDocOpenMessage.textContent = normalized.link
        ? ''
        : 'This attachment is unavailable. It may have been removed from Open Library.';
    }
    openModal(libraryDocModal);
  } catch (error) {
    currentLibraryDoc = null;
    const rawMessage = error && error.message ? String(error.message) : 'Unable to load document.';
    const friendlyMessage =
      rawMessage.toLowerCase().includes('document not found')
        ? 'This document is no longer available.'
        : rawMessage;
    alert(friendlyMessage);
  }
}

if (libraryDocOpen) {
  libraryDocOpen.addEventListener('click', () => {
    if (!currentLibraryDoc || !currentLibraryDoc.link) {
      if (libraryDocOpenMessage) {
        libraryDocOpenMessage.textContent =
          'This attachment is unavailable. It may have been removed from Open Library.';
      }
      return;
    }
    if (libraryDocOpenMessage) {
      libraryDocOpenMessage.textContent = '';
    }
    window.open(currentLibraryDoc.link, '_blank', 'noopener,noreferrer');
  });
}

if (libraryDocClose) {
  libraryDocClose.addEventListener('click', () => closeModal(libraryDocModal));
}

if (commentsClose) {
  commentsClose.addEventListener('click', () => closeModal(commentsModal));
}

if (postCommentForm) {
  postCommentForm.addEventListener('submit', submitPostComment);
}

if (postAiClose) {
  postAiClose.addEventListener('click', () => {
    closeModal(postAiModal);
    activePostAiPostId = null;
    if (postAiInput) postAiInput.value = '';
    if (postAiMessage) postAiMessage.textContent = '';
  });
}

if (postAiForm) {
  postAiForm.addEventListener('submit', sendPostAiMessage);
}

if (createPostToggle) {
  createPostToggle.addEventListener('click', () => openModal(createPostModal));
}

if (createPostClose) {
  createPostClose.addEventListener('click', () => closeModal(createPostModal));
}

if (createPostForm) {
  createPostForm.addEventListener('submit', createPost);
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
    selectedLibraryDocument = null;
    updateSelectedLibraryDocUI();
  });
}

if (attachmentFile) {
  attachmentFile.addEventListener('change', () => {
    if (attachmentFile.files.length && selectedLibraryDocument) {
      selectedLibraryDocument = null;
      updateSelectedLibraryDocUI();
    }
  });
}

if (editPostClose) {
  editPostClose.addEventListener('click', () => closeModal(editPostModal));
}

if (editPostForm) {
  editPostForm.addEventListener('submit', savePost);
}

if (postSpotlightClose) {
  postSpotlightClose.addEventListener('click', () => closeModal(postSpotlightModal));
}

if (postSpotlightModal) {
  postSpotlightModal.addEventListener('click', (event) => {
    if (event.target === postSpotlightModal) {
      closeModal(postSpotlightModal);
    }
  });
}

if (postAiModal) {
  postAiModal.addEventListener('click', (event) => {
    if (event.target === postAiModal) {
      closeModal(postAiModal);
      activePostAiPostId = null;
      if (postAiInput) postAiInput.value = '';
      if (postAiMessage) postAiMessage.textContent = '';
    }
  });
}

window.addEventListener('open-post-modal', async (event) => {
  const postId = event && event.detail ? sanitizePostId(event.detail.postId || '') : '';
  if (!postId) return;
  await openPostSpotlight(postId);
});

async function initHome() {
  updateSelectedLibraryDocUI();

  await Promise.all([
    loadCurrentProfile(),
    fetchPosts(),
    fetchHomeSidecards(),
  ]);

  await maybeOpenRequestedPost();
}

initHome();
