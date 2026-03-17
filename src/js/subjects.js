const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const subjectsList = document.getElementById('subjectsList');
const subjectSearchInput = document.getElementById('subjectSearchInput');
const subjectCourseLabel = document.getElementById('subjectCourseLabel');
const subjectTitle = document.getElementById('subjectTitle');
const subjectDescription = document.getElementById('subjectDescription');
const subjectPosts = document.getElementById('subjectPosts');
const openSubjectAiModalButton = document.getElementById('openSubjectAiModal');

const openCreateSubjectModal = document.getElementById('openCreateSubjectModal');
const createSubjectModal = document.getElementById('createSubjectModal');
const closeCreateSubjectModal = document.getElementById('closeCreateSubjectModal');
const createSubjectForm = document.getElementById('createSubjectForm');
const createSubjectMessage = document.getElementById('createSubjectMessage');

const openCreateSubjectPostModal = document.getElementById('openCreateSubjectPostModal');
const createSubjectPostModal = document.getElementById('createSubjectPostModal');
const closeCreateSubjectPostModal = document.getElementById('closeCreateSubjectPostModal');
const createSubjectPostForm = document.getElementById('createSubjectPostForm');
const createSubjectPostMessage = document.getElementById('createSubjectPostMessage');
const editSubjectPostModal = document.getElementById('editSubjectPostModal');
const closeEditSubjectPostModal = document.getElementById('closeEditSubjectPostModal');
const editSubjectPostForm = document.getElementById('editSubjectPostForm');
const editSubjectPostMessage = document.getElementById('editSubjectPostMessage');

const subjectAiModal = document.getElementById('subjectAiModal');
const closeSubjectAiModal = document.getElementById('closeSubjectAiModal');
const subjectAiTitle = document.getElementById('subjectAiTitle');
const subjectAiSubtitle = document.getElementById('subjectAiSubtitle');
const subjectAiMessages = document.getElementById('subjectAiMessages');
const subjectAiForm = document.getElementById('subjectAiForm');
const subjectAiInput = document.getElementById('subjectAiInput');
const subjectAiMessage = document.getElementById('subjectAiMessage');

const subjectPostAiModal = document.getElementById('subjectPostAiModal');
const closeSubjectPostAiModal = document.getElementById('closeSubjectPostAiModal');
const subjectPostAiTitle = document.getElementById('subjectPostAiTitle');
const subjectPostAiSubtitle = document.getElementById('subjectPostAiSubtitle');
const subjectPostAiMessages = document.getElementById('subjectPostAiMessages');
const subjectPostAiForm = document.getElementById('subjectPostAiForm');
const subjectPostAiInput = document.getElementById('subjectPostAiInput');
const subjectPostAiMessage = document.getElementById('subjectPostAiMessage');

function parsePositiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function readInitialSelection() {
  const params = new URLSearchParams(window.location.search);
  return {
    subjectId: parsePositiveInteger(params.get('subjectId')),
    postId: parsePositiveInteger(params.get('postId')),
  };
}

const initialSelection = readInitialSelection();
const state = {
  subjects: [],
  selectedSubjectId: initialSelection.subjectId,
  canCreate: false,
  loadingFeed: false,
  subjectSearchQuery: '',
  feedPosts: [],
  requestedPostId: initialSelection.postId,
  expandedCommentPostIds: new Set(initialSelection.postId ? [initialSelection.postId] : []),
};

let activeSubjectAiSubjectId = null;
let isSendingSubjectAi = false;
let activeSubjectPostAiContext = null;
let isSendingSubjectPostAi = false;
let activeEditSubjectPostId = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initialsFromName(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'M';
  return safe[0].toUpperCase();
}

function setAvatarContent(target, photoLink, displayName) {
  if (!target) return;
  target.innerHTML = '';
  if (photoLink) {
    const image = document.createElement('img');
    image.src = photoLink;
    image.alt = `${displayName || 'User'} profile photo`;
    target.appendChild(image);
    return;
  }
  target.textContent = initialsFromName(displayName);
}

function buildAvatarElement(photoLink, displayName, className) {
  const avatar = document.createElement('div');
  avatar.className = className;
  setAvatarContent(avatar, photoLink, displayName);
  return avatar;
}

function setNavAvatar(photoLink, displayName) {
  setAvatarContent(navAvatarLabel, photoLink, displayName);
}

function closeProfileMenuOnOutsideClick(event) {
  if (!profileMenu || !profileToggle) return;
  if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
    profileMenu.classList.add('is-hidden');
  }
}

function closeAllSubjectPostMenus() {
  document.querySelectorAll('.subject-post-menu').forEach((menu) => menu.classList.add('is-hidden'));
}

if (profileToggle && profileMenu) {
  profileToggle.addEventListener('click', () => {
    profileMenu.classList.toggle('is-hidden');
  });
  document.addEventListener('click', closeProfileMenuOnOutsideClick);
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.subject-post-menu-wrap')) {
    closeAllSubjectPostMenus();
  }
});

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (_error) {
      // best effort
    }
    window.location.href = '/login';
  });
}

function openModal(modal) {
  if (modal) modal.classList.remove('is-hidden');
}

function closeModal(modal) {
  if (modal) modal.classList.add('is-hidden');
}

function syncSubjectLocation(subjectId, postId = null) {
  if (!window.history || typeof window.history.replaceState !== 'function') return;
  const url = new URL(window.location.href);
  if (subjectId) {
    url.searchParams.set('subjectId', String(subjectId));
  } else {
    url.searchParams.delete('subjectId');
  }
  if (postId) {
    url.searchParams.set('postId', String(postId));
  } else {
    url.searchParams.delete('postId');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function highlightSubjectPost(postId) {
  if (!postId) return;
  const card = document.getElementById(`subject-post-${postId}`);
  if (!card) return;
  card.classList.add('is-highlighted');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    card.classList.remove('is-highlighted');
  }, 2400);
}

function timeAgo(dateValue) {
  if (!dateValue) return 'just now';
  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function setSubjectFeedHeader(subject) {
  if (!subject) {
    if (subjectCourseLabel) subjectCourseLabel.textContent = 'Select a unit';
    if (subjectTitle) subjectTitle.textContent = 'Unit feed';
    if (subjectDescription) subjectDescription.textContent = 'Choose a unit on the left to load posts.';
    if (openCreateSubjectPostModal) openCreateSubjectPostModal.disabled = true;
    if (openSubjectAiModalButton) openSubjectAiModalButton.disabled = true;
    return;
  }

  if (subjectCourseLabel) subjectCourseLabel.textContent = subject.courseName || 'Unit course';
  if (subjectTitle) subjectTitle.textContent = subject.subjectName || 'Unit feed';
  if (subjectDescription) {
    subjectDescription.textContent = subject.description || 'No unit description yet.';
  }
  if (openCreateSubjectPostModal) openCreateSubjectPostModal.disabled = false;
  if (openSubjectAiModalButton) openSubjectAiModalButton.disabled = false;
}

function getSelectedSubject() {
  return state.subjects.find((subject) => subject.id === state.selectedSubjectId) || null;
}

function getFilteredSubjects() {
  const query = String(state.subjectSearchQuery || '').trim().toLowerCase();
  if (!query) return state.subjects;
  return state.subjects.filter((subject) => {
    const subjectName = String(subject.subjectName || '').toLowerCase();
    const subjectCode = String(subject.subjectCode || '').toLowerCase();
    const courseName = String(subject.courseName || '').toLowerCase();
    return subjectName.includes(query) || subjectCode.includes(query) || courseName.includes(query);
  });
}

function renderSubjects() {
  if (!subjectsList) return;
  subjectsList.innerHTML = '';
  if (!state.subjects.length) {
    subjectsList.innerHTML = '<p class="subject-empty">No units available for your course yet.</p>';
    setSubjectFeedHeader(null);
    return;
  }

  const visibleSubjects = getFilteredSubjects();
  if (!visibleSubjects.length) {
    subjectsList.innerHTML = '<p class="subject-empty">No units match your search.</p>';
    return;
  }

  visibleSubjects.forEach((subject) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `subject-item${subject.id === state.selectedSubjectId ? ' is-active' : ''}`;
    button.innerHTML = `
      <h3>${escapeHtml(subject.subjectName || 'Untitled unit')}</h3>
      <p>${Number(subject.postsCount || 0)} posts</p>
    `;
    button.addEventListener('click', async () => {
      if (state.selectedSubjectId === subject.id) return;
      state.selectedSubjectId = subject.id;
      state.requestedPostId = null;
      renderSubjects();
      syncSubjectLocation(subject.id);
      await fetchAndRenderSubjectFeed(subject.id);
    });
    subjectsList.appendChild(button);
  });
}

async function applySubjectSearch() {
  const visibleSubjects = getFilteredSubjects();
  const hasSelectedVisible = visibleSubjects.some((subject) => subject.id === state.selectedSubjectId);
  const shouldReloadFeed = !hasSelectedVisible;

  if (!visibleSubjects.length) {
    state.selectedSubjectId = null;
    state.requestedPostId = null;
    renderSubjects();
    setSubjectFeedHeader(null);
    if (subjectPosts) {
      subjectPosts.innerHTML = '<p class="subject-empty">No units match your search.</p>';
    }
    syncSubjectLocation(null);
    return;
  }

  if (!hasSelectedVisible) {
    state.selectedSubjectId = visibleSubjects[0].id;
    state.requestedPostId = null;
  }

  renderSubjects();
  const selectedSubject = visibleSubjects.find((subject) => subject.id === state.selectedSubjectId) || null;
  setSubjectFeedHeader(selectedSubject);
  if (selectedSubject) {
    syncSubjectLocation(selectedSubject.id, state.requestedPostId);
  }
  if (selectedSubject && shouldReloadFeed) {
    await fetchAndRenderSubjectFeed(selectedSubject.id);
  }
}

function createSubjectPostBadge(text, modifier = '') {
  const badge = document.createElement('span');
  badge.className = `subject-post-badge${modifier ? ` ${modifier}` : ''}`;
  badge.textContent = text;
  return badge;
}

function createSubjectPostActionButton({ action, icon, label, active = false }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.className = `subject-post-action${active ? ' is-active' : ''}`;

  const iconImage = document.createElement('img');
  iconImage.src = icon;
  iconImage.alt = '';
  button.appendChild(iconImage);

  const text = document.createElement('span');
  text.textContent = label;
  button.appendChild(text);
  return button;
}

function subjectPostUrl(subjectId, postId) {
  return `${window.location.origin}/subjects?subjectId=${encodeURIComponent(subjectId)}&postId=${encodeURIComponent(postId)}`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const result = window.prompt('Copy this link:', text);
  return result !== null;
}

async function collectReportPayload() {
  if (typeof window.showReportDialog === 'function') {
    return window.showReportDialog({
      title: 'Report unit post',
      subtitle: 'Select the reason and add optional details.',
    });
  }

  const reason = window.prompt('Report reason:', '');
  if (reason === null) return null;
  const trimmed = reason.trim();
  return {
    category: 'other',
    customReason: trimmed || 'Other',
    details: null,
    reason: trimmed || 'Other',
  };
}

function updatePostInState(postId, updater) {
  const index = state.feedPosts.findIndex((item) => item.id === postId);
  if (index === -1) return null;
  const target = state.feedPosts[index];
  updater(target);
  return target;
}

function replaceSubjectPostCard(postId) {
  const existing = document.getElementById(`subject-post-${postId}`);
  const index = state.feedPosts.findIndex((item) => item.id === postId);
  if (!existing || index === -1) return;
  const replacement = renderSubjectPostCard(state.feedPosts[index], index);
  existing.replaceWith(replacement);
}

function setSubjectPostCommentsExpanded(postId, expanded) {
  if (!postId) return;
  if (expanded) {
    state.expandedCommentPostIds.add(postId);
    return;
  }
  state.expandedCommentPostIds.delete(postId);
}

function openSubjectPostDiscussion(post) {
  const commentCount = Array.isArray(post.comments) ? post.comments.length : 0;
  const shouldExpand = commentCount > 2 && !state.expandedCommentPostIds.has(post.id);
  if (shouldExpand) {
    setSubjectPostCommentsExpanded(post.id, true);
    replaceSubjectPostCard(post.id);
  }
  focusSubjectPostDiscussion(post.id);
}

function focusSubjectPostDiscussion(postId) {
  const card = document.getElementById(`subject-post-${postId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = card.querySelector('input[name="content"]');
  if (input) {
    input.focus();
    input.select();
  }
}

async function toggleSubjectPostLike(post) {
  if (!state.selectedSubjectId) return;
  const action = post.liked ? 'unlike' : 'like';
  const response = await fetch(
    `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(post.id)}/like`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }
  );
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to update like.');
  }
  updatePostInState(post.id, (target) => {
    target.liked = Boolean(data.liked);
    target.likesCount = Number(data.likesCount || 0);
  });
  replaceSubjectPostCard(post.id);
}

async function toggleSubjectPostBookmark(post) {
  if (!state.selectedSubjectId) return;
  const response = await fetch(
    `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(post.id)}/bookmark`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: post.bookmarked ? 'remove' : 'add' }),
    }
  );
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to update bookmark.');
  }
  updatePostInState(post.id, (target) => {
    target.bookmarked = Boolean(data.bookmarked);
  });
  replaceSubjectPostCard(post.id);
}

async function shareSubjectPost(post) {
  const shareUrl = subjectPostUrl(post.subjectId || state.selectedSubjectId, post.id);
  try {
    await copyTextToClipboard(shareUrl);
    window.alert('Unit post link copied.');
  } catch (_error) {
    window.prompt('Copy this link:', shareUrl);
  }
}

async function reportSubjectPost(post) {
  if (!state.selectedSubjectId) return;
  const payload = await collectReportPayload();
  if (!payload) return;
  const response = await fetch(
    `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(post.id)}/report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to submit report.');
  }
  window.alert('Report submitted. Thank you.');
}

function resetEditSubjectPostState() {
  activeEditSubjectPostId = null;
  if (editSubjectPostForm) editSubjectPostForm.reset();
  if (editSubjectPostMessage) editSubjectPostMessage.textContent = '';
}

function closeEditSubjectPostDialog() {
  closeModal(editSubjectPostModal);
  resetEditSubjectPostState();
}

function openEditSubjectPostDialog(post) {
  if (!post || !post.id || !editSubjectPostModal || !editSubjectPostForm) return;
  activeEditSubjectPostId = post.id;
  editSubjectPostForm.elements.title.value = post.title || '';
  editSubjectPostForm.elements.content.value = post.content || '';
  editSubjectPostForm.elements.attachmentLibraryDocumentUuid.value =
    post.attachment && post.attachment.uuid ? post.attachment.uuid : '';
  if (editSubjectPostMessage) editSubjectPostMessage.textContent = '';
  openModal(editSubjectPostModal);
}

async function deleteSubjectPost(post) {
  if (!state.selectedSubjectId || !post || !post.id) return;
  if (!window.confirm('Delete this unit post?')) return;

  const response = await fetch(
    `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(post.id)}`,
    { method: 'DELETE' }
  );
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Unable to delete unit post.');
  }

  state.requestedPostId = null;
  setSubjectPostCommentsExpanded(post.id, false);
  await loadSubjectsBootstrap();
}

function buildSubjectPostAttachment(post) {
  if (!post.attachment || !post.attachment.link) return null;
  const attachment = document.createElement('a');
  attachment.className = 'subject-post-attachment';
  attachment.href = post.attachment.link;
  attachment.target = '_blank';
  attachment.rel = 'noopener noreferrer';

  const icon = document.createElement('img');
  icon.src = '/assets/document.svg';
  icon.alt = '';
  attachment.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = post.attachment.title || 'Open Library document';
  attachment.appendChild(text);
  return attachment;
}

function buildSubjectCommentsSection(post) {
  const commentsWrap = document.createElement('section');
  commentsWrap.className = 'subject-post-comments';

  const commentsHead = document.createElement('div');
  commentsHead.className = 'subject-post-comments-head';
  commentsHead.innerHTML = `
    <h5>Discussion</h5>
    <span>${Number(post.commentsCount || 0)} comments</span>
  `;
  commentsWrap.appendChild(commentsHead);

  const commentsList = document.createElement('div');
  commentsList.className = 'subject-comments';
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const hasOverflow = comments.length > 2;
  const isExpanded = state.expandedCommentPostIds.has(post.id);
  const visibleComments = hasOverflow && !isExpanded ? comments.slice(-2) : comments;

  if (hasOverflow) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'subject-comments-toggle';
    toggle.textContent = isExpanded
      ? 'Show fewer comments'
      : `Show all ${comments.length} comments`;
    toggle.addEventListener('click', () => {
      setSubjectPostCommentsExpanded(post.id, !isExpanded);
      replaceSubjectPostCard(post.id);
    });
    commentsWrap.appendChild(toggle);
  }

  if (!visibleComments.length) {
    const empty = document.createElement('p');
    empty.className = 'subject-post-comments-empty';
    empty.textContent = 'No discussion yet. Start the thread.';
    commentsList.appendChild(empty);
  } else {
    visibleComments.forEach((comment) => {
      const commentItem = document.createElement('article');
      commentItem.className = 'subject-comment';

      const commentMeta = document.createElement('div');
      commentMeta.className = 'subject-comment-meta';
      commentMeta.innerHTML = `
        <strong>${escapeHtml(comment.authorName || 'Member')}</strong>
        <span>${escapeHtml(timeAgo(comment.createdAt))}</span>
      `;

      const content = document.createElement('p');
      content.textContent = comment.content || '';

      commentItem.appendChild(commentMeta);
      commentItem.appendChild(content);
      commentsList.appendChild(commentItem);
    });
  }
  commentsWrap.appendChild(commentsList);

  const commentForm = document.createElement('form');
  commentForm.className = 'subject-comment-form';
  commentForm.innerHTML = `
    <input type="text" name="content" placeholder="Write a comment..." required />
    <button type="submit" class="primary-button">Send</button>
  `;
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedSubjectId) return;
    const input = commentForm.elements.content;
    const content = String(input.value || '').trim();
    if (!content) return;

    const submitButton = commentForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    try {
      const response = await fetch(
        `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(post.id)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to submit comment.');
      }
      input.value = '';
      state.requestedPostId = post.id;
      setSubjectPostCommentsExpanded(post.id, true);
      syncSubjectLocation(state.selectedSubjectId, post.id);
      await fetchAndRenderSubjectFeed(state.selectedSubjectId);
      focusSubjectPostDiscussion(post.id);
    } catch (error) {
      window.alert(error.message || 'Unable to submit comment.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Send';
      }
    }
  });

  commentsWrap.appendChild(commentForm);
  return commentsWrap;
}

function renderSubjectPostCard(post, index) {
  const article = document.createElement('article');
  article.id = `subject-post-${post.id}`;
  article.className = `subject-post-card${index % 2 ? ' alt' : ''}`;

  const header = document.createElement('div');
  header.className = 'subject-post-header';

  const authorWrap = document.createElement('div');
  authorWrap.className = 'subject-post-author-wrap';
  authorWrap.appendChild(buildAvatarElement(post.author?.photoLink, post.author?.displayName || 'Member', 'subject-post-avatar'));

  const meta = document.createElement('div');
  meta.className = 'subject-post-meta';
  meta.innerHTML = `
    <div class="subject-post-author-row">
      <h3>${escapeHtml(post.author?.displayName || 'Member')}</h3>
      <span class="subject-post-divider">•</span>
      <p>${escapeHtml(timeAgo(post.createdAt))}</p>
    </div>
    <p class="subject-post-subline">Unit discussion</p>
  `;
  authorWrap.appendChild(meta);

  const menuWrap = document.createElement('div');
  menuWrap.className = 'subject-post-menu-wrap';
  menuWrap.innerHTML = `
    <button type="button" class="subject-post-menu-button" aria-label="More post actions">
      <img src="/assets/dot-menu.svg" alt="" />
    </button>
    <div class="subject-post-menu is-hidden">
      <button type="button" data-action="bookmark">${post.bookmarked ? 'Remove bookmark' : 'Bookmark post'}</button>
      <button type="button" data-action="share">Share link</button>
      <button type="button" data-action="report">Report post</button>
      ${post.isOwner ? '<button type="button" data-action="edit">Edit post</button>' : ''}
      ${post.isOwner ? '<button type="button" class="is-danger" data-action="delete">Delete post</button>' : ''}
    </div>
  `;

  header.appendChild(authorWrap);
  header.appendChild(menuWrap);
  article.appendChild(header);

  const title = document.createElement('h4');
  title.className = 'subject-post-title';
  title.textContent = post.title || 'Untitled post';
  article.appendChild(title);

  const body = document.createElement('p');
  body.className = 'subject-post-body';
  body.textContent = post.content || '';
  article.appendChild(body);

  const utilityRow = document.createElement('div');
  utilityRow.className = 'subject-post-utility-row';
  utilityRow.appendChild(createSubjectPostBadge(`${Number(post.likesCount || 0)} likes`));
  utilityRow.appendChild(createSubjectPostBadge(`${Number(post.commentsCount || 0)} comments`));
  if (post.bookmarked) {
    utilityRow.appendChild(createSubjectPostBadge('Bookmarked', 'is-accent'));
  }
  const attachment = buildSubjectPostAttachment(post);
  if (attachment) {
    utilityRow.appendChild(attachment);
  }
  article.appendChild(utilityRow);

  const actions = document.createElement('div');
  actions.className = 'subject-post-actions';
  const likeButton = createSubjectPostActionButton({
    action: 'like',
    icon: '/assets/heart.svg',
    label: `${Number(post.likesCount || 0)} Like`,
    active: Boolean(post.liked),
  });
  const discussionButton = createSubjectPostActionButton({
    action: 'comments',
    icon: '/assets/comment-discussion.svg',
    label: 'Discussion',
  });
  const askAiButton = createSubjectPostActionButton({
    action: 'ask-ai',
    icon: '/assets/AI-star.svg',
    label: 'Ask AI',
  });

  actions.appendChild(likeButton);
  actions.appendChild(discussionButton);
  actions.appendChild(askAiButton);
  article.appendChild(actions);
  article.appendChild(buildSubjectCommentsSection(post));

  const menuButton = menuWrap.querySelector('.subject-post-menu-button');
  const menu = menuWrap.querySelector('.subject-post-menu');
  if (menuButton && menu) {
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const willShow = menu.classList.contains('is-hidden');
      closeAllSubjectPostMenus();
      menu.classList.toggle('is-hidden', !willShow);
    });
    menu.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        menu.classList.add('is-hidden');
        try {
          if (button.dataset.action === 'bookmark') {
            await toggleSubjectPostBookmark(post);
          } else if (button.dataset.action === 'share') {
            await shareSubjectPost(post);
          } else if (button.dataset.action === 'report') {
            await reportSubjectPost(post);
          } else if (button.dataset.action === 'edit') {
            openEditSubjectPostDialog(post);
          } else if (button.dataset.action === 'delete') {
            await deleteSubjectPost(post);
          }
        } catch (error) {
          window.alert(error.message || 'Unable to complete post action.');
        }
      });
    });
  }

  actions.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        if (button.dataset.action === 'like') {
          await toggleSubjectPostLike(post);
        } else if (button.dataset.action === 'comments') {
          openSubjectPostDiscussion(post);
        } else if (button.dataset.action === 'ask-ai') {
          await openSubjectPostAiChatModal(post);
        }
      } catch (error) {
        window.alert(error.message || 'Unable to complete post action.');
      }
    });
  });

  return article;
}

function renderPostList(posts) {
  if (!subjectPosts) return;
  state.feedPosts = Array.isArray(posts) ? posts : [];
  const visiblePostIds = new Set(state.feedPosts.map((item) => item.id));
  Array.from(state.expandedCommentPostIds).forEach((postId) => {
    if (!visiblePostIds.has(postId)) {
      state.expandedCommentPostIds.delete(postId);
    }
  });
  if (state.requestedPostId && visiblePostIds.has(state.requestedPostId)) {
    state.expandedCommentPostIds.add(state.requestedPostId);
  }
  subjectPosts.innerHTML = '';
  if (!state.feedPosts.length) {
    subjectPosts.innerHTML = '<p class="subject-empty">No posts yet for this unit.</p>';
    return;
  }

  state.feedPosts.forEach((post, index) => {
    subjectPosts.appendChild(renderSubjectPostCard(post, index));
  });

  if (state.requestedPostId) {
    window.requestAnimationFrame(() => highlightSubjectPost(state.requestedPostId));
  }
}

function appendAiBubble(container, role, text, { pending = false } = {}) {
  if (!container) return null;
  const empty = container.querySelector('.subject-ai-empty');
  if (empty) empty.remove();
  const bubble = document.createElement('div');
  bubble.className = `subject-ai-bubble ${role}${pending ? ' pending' : ''}`;
  bubble.textContent = text || '';
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function renderAiMessages(container, messages, emptyText) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(messages) || !messages.length) {
    const empty = document.createElement('p');
    empty.className = 'subject-ai-empty';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  messages.forEach((message) => {
    appendAiBubble(container, message.role === 'user' ? 'user' : 'assistant', message.content || '');
  });
}

function renderSubjectAiMessages(messages) {
  renderAiMessages(subjectAiMessages, messages, 'Ask about this unit, its topics, or recent discussions.');
}

function resetSubjectAiState() {
  activeSubjectAiSubjectId = null;
  isSendingSubjectAi = false;
  if (subjectAiInput) {
    subjectAiInput.value = '';
    subjectAiInput.disabled = false;
  }
  if (subjectAiMessage) subjectAiMessage.textContent = '';
  renderSubjectAiMessages([]);
}

function closeSubjectAiChatModal() {
  closeModal(subjectAiModal);
  resetSubjectAiState();
}

async function openSubjectAiChatModal(subject) {
  if (!subject || !subject.id || !subjectAiModal) return;
  activeSubjectAiSubjectId = subject.id;
  if (subjectAiTitle) {
    subjectAiTitle.textContent = `Unit AI: ${subject.subjectName || 'Untitled unit'}`;
  }
  if (subjectAiSubtitle) {
    subjectAiSubtitle.textContent = 'Loading unit context...';
  }
  if (subjectAiMessage) subjectAiMessage.textContent = '';
  renderSubjectAiMessages([]);
  openModal(subjectAiModal);

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subject.id)}/ask-ai/bootstrap`);
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load unit AI conversation.');
    }
    if (subjectAiSubtitle) {
      const summary = data.context && data.context.summary ? data.context.summary : 'Unit context ready.';
      subjectAiSubtitle.textContent = `Focus: ${summary}`;
    }
    renderSubjectAiMessages(data.messages || []);
    if (subjectAiInput) subjectAiInput.focus();
  } catch (error) {
    if (subjectAiSubtitle) {
      subjectAiSubtitle.textContent = 'Unit context could not be loaded.';
    }
    if (subjectAiMessage) {
      subjectAiMessage.textContent = error.message || 'Unable to load unit AI conversation.';
    }
  }
}

async function sendSubjectAiMessage(event) {
  event.preventDefault();
  if (isSendingSubjectAi || !activeSubjectAiSubjectId || !subjectAiInput) return;
  const content = subjectAiInput.value.trim();
  if (!content) return;

  isSendingSubjectAi = true;
  if (subjectAiMessage) subjectAiMessage.textContent = '';
  subjectAiInput.value = '';
  subjectAiInput.disabled = true;
  appendAiBubble(subjectAiMessages, 'user', content);
  const pendingBubble = appendAiBubble(subjectAiMessages, 'assistant', 'Thinking...', { pending: true });

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(activeSubjectAiSubjectId)}/ask-ai/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to send message.');
    }
    if (pendingBubble) {
      pendingBubble.classList.remove('pending');
      pendingBubble.textContent = data.message && data.message.content ? data.message.content : 'No response generated.';
    }
  } catch (error) {
    if (pendingBubble) pendingBubble.remove();
    if (subjectAiMessage) {
      subjectAiMessage.textContent = error.message || 'Unable to send message.';
    }
  } finally {
    isSendingSubjectAi = false;
    subjectAiInput.disabled = false;
    subjectAiInput.focus();
  }
}

function renderSubjectPostAiMessages(messages) {
  renderAiMessages(
    subjectPostAiMessages,
    messages,
    'Ask about this post, the discussion around it, or related unit topics.'
  );
}

function resetSubjectPostAiState() {
  activeSubjectPostAiContext = null;
  isSendingSubjectPostAi = false;
  if (subjectPostAiInput) {
    subjectPostAiInput.value = '';
    subjectPostAiInput.disabled = false;
  }
  if (subjectPostAiMessage) subjectPostAiMessage.textContent = '';
  renderSubjectPostAiMessages([]);
}

function closeSubjectPostAiChatModal() {
  closeModal(subjectPostAiModal);
  resetSubjectPostAiState();
}

async function openSubjectPostAiChatModal(post) {
  const subject = getSelectedSubject();
  if (!subject || !post || !post.id || !subjectPostAiModal) return;

  activeSubjectPostAiContext = {
    subjectId: subject.id,
    postId: post.id,
  };

  if (subjectPostAiTitle) {
    subjectPostAiTitle.textContent = `Ask AI: ${post.title || 'Unit post'}`;
  }
  if (subjectPostAiSubtitle) {
    subjectPostAiSubtitle.textContent = 'Loading post context...';
  }
  if (subjectPostAiMessage) subjectPostAiMessage.textContent = '';
  renderSubjectPostAiMessages([]);
  openModal(subjectPostAiModal);

  try {
    const response = await fetch(
      `/api/subjects/${encodeURIComponent(subject.id)}/posts/${encodeURIComponent(post.id)}/ask-ai/bootstrap`
    );
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load unit post AI conversation.');
    }
    if (subjectPostAiSubtitle) {
      const summary = data.context && data.context.summary ? data.context.summary : 'Post context ready.';
      subjectPostAiSubtitle.textContent = `Unit: ${data.context?.subjectTitle || subject.subjectName || 'Unit'} | Focus: ${summary}`;
    }
    renderSubjectPostAiMessages(data.messages || []);
    if (subjectPostAiInput) subjectPostAiInput.focus();
  } catch (error) {
    if (subjectPostAiSubtitle) {
      subjectPostAiSubtitle.textContent = 'Post context could not be loaded.';
    }
    if (subjectPostAiMessage) {
      subjectPostAiMessage.textContent = error.message || 'Unable to load unit post AI conversation.';
    }
  }
}

async function sendSubjectPostAiMessage(event) {
  event.preventDefault();
  if (isSendingSubjectPostAi || !activeSubjectPostAiContext || !subjectPostAiInput) return;
  const content = subjectPostAiInput.value.trim();
  if (!content) return;

  isSendingSubjectPostAi = true;
  if (subjectPostAiMessage) subjectPostAiMessage.textContent = '';
  subjectPostAiInput.value = '';
  subjectPostAiInput.disabled = true;
  appendAiBubble(subjectPostAiMessages, 'user', content);
  const pendingBubble = appendAiBubble(subjectPostAiMessages, 'assistant', 'Thinking...', { pending: true });

  try {
    const response = await fetch(
      `/api/subjects/${encodeURIComponent(activeSubjectPostAiContext.subjectId)}/posts/${encodeURIComponent(activeSubjectPostAiContext.postId)}/ask-ai/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }
    );
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to send message.');
    }
    if (pendingBubble) {
      pendingBubble.classList.remove('pending');
      pendingBubble.textContent = data.message && data.message.content ? data.message.content : 'No response generated.';
    }
  } catch (error) {
    if (pendingBubble) pendingBubble.remove();
    if (subjectPostAiMessage) {
      subjectPostAiMessage.textContent = error.message || 'Unable to send message.';
    }
  } finally {
    isSendingSubjectPostAi = false;
    subjectPostAiInput.disabled = false;
    subjectPostAiInput.focus();
  }
}

async function fetchAndRenderSubjectFeed(subjectId) {
  if (!subjectId || state.loadingFeed || !subjectPosts) return;
  state.loadingFeed = true;
  subjectPosts.innerHTML = '<p class="subject-empty">Loading unit feed...</p>';

  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/feed?page=1&pageSize=50`);
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load unit feed.');
    }

    const selectedSubject = state.subjects.find((item) => item.id === subjectId) || null;
    if (selectedSubject && data.subject) {
      selectedSubject.description = data.subject.description || selectedSubject.description || '';
      selectedSubject.subjectName = data.subject.subjectName || selectedSubject.subjectName || '';
      selectedSubject.courseName = data.subject.courseName || selectedSubject.courseName || '';
    }

    setSubjectFeedHeader(selectedSubject);
    renderPostList(data.posts || []);
    syncSubjectLocation(subjectId, state.requestedPostId);
  } catch (error) {
    subjectPosts.innerHTML = `<p class="subject-empty">${escapeHtml(error.message || 'Unable to load unit feed.')}</p>`;
  } finally {
    state.loadingFeed = false;
  }
}

async function loadSubjectsBootstrap() {
  try {
    const response = await fetch('/api/subjects/bootstrap');
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load units.');
    }

    state.subjects = Array.isArray(data.subjects) ? data.subjects : [];
    state.canCreate = Boolean(data.canCreate);
    if (openCreateSubjectModal) {
      openCreateSubjectModal.classList.toggle('is-hidden', !state.canCreate);
    }

    const visibleSubjects = getFilteredSubjects();
    if (!state.selectedSubjectId && visibleSubjects.length) {
      state.selectedSubjectId = visibleSubjects[0].id;
    } else if (
      state.selectedSubjectId &&
      !visibleSubjects.some((subject) => subject.id === state.selectedSubjectId)
    ) {
      state.selectedSubjectId = visibleSubjects.length ? visibleSubjects[0].id : null;
      state.requestedPostId = null;
    }

    renderSubjects();
    const selected = visibleSubjects.find((subject) => subject.id === state.selectedSubjectId) || null;
    setSubjectFeedHeader(selected);
    if (selected) {
      syncSubjectLocation(selected.id, state.requestedPostId);
      await fetchAndRenderSubjectFeed(selected.id);
    } else if (subjectPosts) {
      subjectPosts.innerHTML = state.subjects.length
        ? '<p class="subject-empty">No units match your search.</p>'
        : '<p class="subject-empty">No units available yet.</p>';
      syncSubjectLocation(null);
    }
  } catch (error) {
    if (subjectsList) {
      subjectsList.innerHTML = `<p class="subject-empty">${escapeHtml(error.message)}</p>`;
    }
    if (subjectPosts) {
      subjectPosts.innerHTML = '<p class="subject-empty">Unable to load unit feed.</p>';
    }
  }
}

if (openCreateSubjectModal) {
  openCreateSubjectModal.addEventListener('click', () => {
    if (createSubjectMessage) createSubjectMessage.textContent = '';
    openModal(createSubjectModal);
  });
}

if (closeCreateSubjectModal) {
  closeCreateSubjectModal.addEventListener('click', () => closeModal(createSubjectModal));
}

if (createSubjectForm) {
  createSubjectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (createSubjectMessage) createSubjectMessage.textContent = '';
    const formData = new FormData(createSubjectForm);
    const payload = {
      subjectName: formData.get('subjectName'),
      subjectCode: formData.get('subjectCode'),
      courseName: formData.get('courseName'),
      description: formData.get('description'),
    };

    try {
      const response = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to create unit.');
      }
      closeModal(createSubjectModal);
      createSubjectForm.reset();
      await loadSubjectsBootstrap();
    } catch (error) {
      if (createSubjectMessage) {
        createSubjectMessage.textContent = error.message || 'Unable to create unit.';
      }
    }
  });
}

if (openCreateSubjectPostModal) {
  openCreateSubjectPostModal.addEventListener('click', () => {
    if (!state.selectedSubjectId) return;
    if (createSubjectPostMessage) createSubjectPostMessage.textContent = '';
    openModal(createSubjectPostModal);
  });
}

if (closeCreateSubjectPostModal) {
  closeCreateSubjectPostModal.addEventListener('click', () => closeModal(createSubjectPostModal));
}

if (createSubjectPostForm) {
  createSubjectPostForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedSubjectId) return;
    if (createSubjectPostMessage) createSubjectPostMessage.textContent = '';

    const formData = new FormData(createSubjectPostForm);
    const payload = {
      title: formData.get('title'),
      content: formData.get('content'),
      attachmentLibraryDocumentUuid: formData.get('attachmentLibraryDocumentUuid'),
    };

    const submitButton = createSubjectPostForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Posting...';
    }

    try {
      const response = await fetch(`/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to create post.');
      }
      closeModal(createSubjectPostModal);
      createSubjectPostForm.reset();
      state.requestedPostId = data.post && data.post.id ? Number(data.post.id) : null;
      syncSubjectLocation(state.selectedSubjectId, state.requestedPostId);
      await fetchAndRenderSubjectFeed(state.selectedSubjectId);
      await loadSubjectsBootstrap();
    } catch (error) {
      if (createSubjectPostMessage) {
        createSubjectPostMessage.textContent = error.message || 'Unable to create post.';
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Post';
      }
    }
  });
}

if (closeEditSubjectPostModal) {
  closeEditSubjectPostModal.addEventListener('click', () => closeEditSubjectPostDialog());
}

if (editSubjectPostForm) {
  editSubjectPostForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selectedSubjectId || !activeEditSubjectPostId) return;
    if (editSubjectPostMessage) editSubjectPostMessage.textContent = '';

    const formData = new FormData(editSubjectPostForm);
    const payload = {
      title: formData.get('title'),
      content: formData.get('content'),
      attachmentLibraryDocumentUuid: formData.get('attachmentLibraryDocumentUuid'),
    };

    const submitButton = editSubjectPostForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    try {
      const response = await fetch(
        `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(activeEditSubjectPostId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to update unit post.');
      }

      const editedPostId = activeEditSubjectPostId;
      state.requestedPostId = editedPostId;
      setSubjectPostCommentsExpanded(editedPostId, true);
      syncSubjectLocation(state.selectedSubjectId, editedPostId);
      closeEditSubjectPostDialog();
      await fetchAndRenderSubjectFeed(state.selectedSubjectId);
    } catch (error) {
      if (editSubjectPostMessage) {
        editSubjectPostMessage.textContent = error.message || 'Unable to update unit post.';
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Save changes';
      }
    }
  });
}

if (openSubjectAiModalButton) {
  openSubjectAiModalButton.addEventListener('click', async () => {
    const subject = getSelectedSubject();
    if (!subject) return;
    await openSubjectAiChatModal(subject);
  });
}

if (closeSubjectAiModal) {
  closeSubjectAiModal.addEventListener('click', () => closeSubjectAiChatModal());
}

if (closeSubjectPostAiModal) {
  closeSubjectPostAiModal.addEventListener('click', () => closeSubjectPostAiChatModal());
}

if (subjectAiModal) {
  subjectAiModal.addEventListener('click', (event) => {
    if (event.target === subjectAiModal) {
      closeSubjectAiChatModal();
    }
  });
}

if (subjectPostAiModal) {
  subjectPostAiModal.addEventListener('click', (event) => {
    if (event.target === subjectPostAiModal) {
      closeSubjectPostAiChatModal();
    }
  });
}

if (subjectAiForm) {
  subjectAiForm.addEventListener('submit', sendSubjectAiMessage);
}

if (subjectPostAiForm) {
  subjectPostAiForm.addEventListener('submit', sendSubjectPostAiMessage);
}

if (createSubjectModal) {
  createSubjectModal.addEventListener('click', (event) => {
    if (event.target === createSubjectModal) {
      closeModal(createSubjectModal);
    }
  });
}

if (createSubjectPostModal) {
  createSubjectPostModal.addEventListener('click', (event) => {
    if (event.target === createSubjectPostModal) {
      closeModal(createSubjectPostModal);
    }
  });
}

if (editSubjectPostModal) {
  editSubjectPostModal.addEventListener('click', (event) => {
    if (event.target === editSubjectPostModal) {
      closeEditSubjectPostDialog();
    }
  });
}

if (subjectSearchInput) {
  subjectSearchInput.addEventListener('input', async () => {
    state.subjectSearchQuery = subjectSearchInput.value || '';
    await applySubjectSearch();
  });
}

async function loadCurrentProfile() {
  try {
    const response = await fetch('/api/profile');
    const data = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) return;
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (_error) {
    // keep fallback avatar
  }
}

async function initSubjectsPage() {
  await Promise.all([loadCurrentProfile(), loadSubjectsBootstrap()]);
}

initSubjectsPage();
