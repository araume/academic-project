const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const postCardHost = document.getElementById('postCardHost');
const postError = document.getElementById('postError');
const postCommentList = document.getElementById('postCommentList');
const postCommentForm = document.getElementById('postCommentForm');
const postCommentInput = document.getElementById('postCommentInput');
const postCommentSubmitButton = postCommentForm
  ? postCommentForm.querySelector('button[type="submit"]')
  : null;

const DEFAULT_AVATAR = '/assets/LOGO.png';

let currentPostId = '';
let currentPost = null;
let isSubmittingComment = false;

let imageLightbox = null;
let imageLightboxImage = null;

function normalizePostId(value) {
  return String(value || '').trim();
}

function postUrlForId(postId) {
  const safe = normalizePostId(postId);
  return safe ? `/posts/${encodeURIComponent(safe)}` : '/home';
}

function profileUrlForUid(uid) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) return '';
  return `/profile?uid=${encodeURIComponent(safeUid)}`;
}

function initialsFromName(name) {
  const words = String(name || '')
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

function setAvatarImage(container, photoLink, altText) {
  if (!container) return;
  const image = container.querySelector('img') || document.createElement('img');
  image.src = photoLink || DEFAULT_AVATAR;
  image.alt = altText || 'Profile photo';
  if (!image.parentElement) {
    container.appendChild(image);
  }
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

function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
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

function setError(message) {
  if (!postError) return;
  const text = String(message || '').trim();
  if (!text) {
    postError.textContent = '';
    postError.classList.add('is-hidden');
    return;
  }
  postError.textContent = text;
  postError.classList.remove('is-hidden');
}

function setPostingState(button, posting) {
  if (!button) return;
  if (posting) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || 'Post';
    }
    button.disabled = true;
    button.textContent = 'Posting...';
    return;
  }
  button.disabled = false;
  button.textContent = button.dataset.originalText || 'Post';
}

function ensureImageLightbox() {
  if (imageLightbox && imageLightboxImage) {
    return;
  }
  imageLightbox = document.createElement('div');
  imageLightbox.className = 'image-lightbox is-hidden';
  imageLightbox.innerHTML = `
    <div class="lightbox-card">
      <button type="button" class="lightbox-close" aria-label="Close image">×</button>
      <img alt="Expanded post image" />
    </div>
  `;
  document.body.appendChild(imageLightbox);
  imageLightboxImage = imageLightbox.querySelector('img');
  const closeButton = imageLightbox.querySelector('.lightbox-close');
  if (closeButton) {
    closeButton.addEventListener('click', closeImageLightbox);
  }
  imageLightbox.addEventListener('click', (event) => {
    if (event.target === imageLightbox) {
      closeImageLightbox();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeImageLightbox();
    }
  });
}

function openImageLightbox(src, altText) {
  if (!src) return;
  ensureImageLightbox();
  if (!imageLightboxImage || !imageLightbox) return;
  imageLightboxImage.src = src;
  imageLightboxImage.alt = altText || 'Expanded post image';
  imageLightbox.classList.remove('is-hidden');
}

function closeImageLightbox() {
  if (!imageLightbox || !imageLightboxImage) return;
  imageLightbox.classList.add('is-hidden');
  imageLightboxImage.removeAttribute('src');
}

function renderAttachment(post) {
  if (!post || !post.attachment) return null;
  const attachment = post.attachment || {};
  const type = String(attachment.type || '').trim();
  const link = String(attachment.link || '').trim();

  if (type === 'image' && link) {
    const media = document.createElement('div');
    media.className = 'post-media';
    const image = document.createElement('img');
    image.src = link;
    image.alt = post.title ? `Image attachment for ${post.title}` : 'Image attachment';
    image.addEventListener('click', () => openImageLightbox(link, image.alt));
    media.appendChild(image);
    return media;
  }

  if (type === 'video' && link) {
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
  button.innerHTML = `<img src="/assets/document.svg" alt="" />${attachment.title || 'Open attachment'}`;
  button.addEventListener('click', () => {
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    if (type === 'library_doc' && attachment.libraryDocumentUuid) {
      window.location.href = '/open-library';
      return;
    }
    setError('Attachment is unavailable.');
  });
  return button;
}

function renderPostCard(post) {
  const article = document.createElement('article');
  article.className = 'post-card';

  const uploaderName = post.uploader && post.uploader.displayName ? post.uploader.displayName : 'Member';

  const header = document.createElement('div');
  header.className = 'post-header';
  header.innerHTML = `
    <div class="post-avatar"></div>
    <div class="post-meta">
      <h1></h1>
      <p>${timeAgo(post.uploadDate)}</p>
    </div>
  `;
  const avatar = header.querySelector('.post-avatar');
  setAvatarImage(avatar, post.uploader && post.uploader.photoLink, `${uploaderName} profile photo`);
  const authorHeading = header.querySelector('.post-meta h1');
  if (authorHeading) {
    authorHeading.textContent = '';
    authorHeading.appendChild(
      buildProfileNameNode(post.uploader && post.uploader.uid, uploaderName, 'post-author-link')
    );
  }

  const body = document.createElement('div');
  body.className = 'post-body';
  const title = document.createElement('h2');
  title.textContent = post.title || 'Untitled post';
  const content = document.createElement('p');
  content.textContent = post.content || '';
  body.appendChild(title);
  body.appendChild(content);

  const stats = document.createElement('p');
  stats.className = 'post-meta-line';
  stats.textContent = `${Number(post.likesCount || 0)} likes • ${Number(post.commentsCount || 0)} comments`;

  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const likeButton = document.createElement('button');
  likeButton.type = 'button';
  likeButton.textContent = `${Number(post.likesCount || 0)} Like`;
  likeButton.classList.toggle('is-active', Boolean(post.liked));
  likeButton.addEventListener('click', handleLikeToggle);

  const bookmarkButton = document.createElement('button');
  bookmarkButton.type = 'button';
  bookmarkButton.textContent = post.bookmarked ? 'Remove bookmark' : 'Bookmark';
  bookmarkButton.addEventListener('click', handleBookmarkToggle);

  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.textContent = 'Copy link';
  shareButton.addEventListener('click', async () => {
    const shareUrl = `${window.location.origin}${postUrlForId(currentPostId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setError('');
    } catch (error) {
      window.prompt('Copy post link:', shareUrl);
    }
  });

  actions.appendChild(likeButton);
  actions.appendChild(bookmarkButton);
  actions.appendChild(shareButton);

  article.appendChild(header);
  article.appendChild(body);
  const attachmentNode = renderAttachment(post);
  if (attachmentNode) {
    article.appendChild(attachmentNode);
  }
  article.appendChild(stats);
  article.appendChild(actions);
  return article;
}

async function fetchPost(postId) {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.post) {
    throw new Error(data.message || 'Unable to load post.');
  }
  return data.post;
}

async function renderCurrentPost() {
  if (!currentPost || !postCardHost) return;
  clearElement(postCardHost);
  postCardHost.appendChild(renderPostCard(currentPost));
}

async function handleLikeToggle() {
  if (!currentPost || !currentPostId) return;
  const response = await fetch(`/api/posts/${encodeURIComponent(currentPostId)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: currentPost.liked ? 'unlike' : 'like' }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    setError(data.message || 'Unable to update like.');
    return;
  }
  currentPost.liked = !currentPost.liked;
  currentPost.likesCount = Number(data.likesCount || 0);
  setError('');
  await renderCurrentPost();
}

async function handleBookmarkToggle() {
  if (!currentPost || !currentPostId) return;
  const response = await fetch(`/api/posts/${encodeURIComponent(currentPostId)}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: currentPost.bookmarked ? 'remove' : 'add' }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    setError(data.message || 'Unable to update bookmark.');
    return;
  }
  currentPost.bookmarked = !currentPost.bookmarked;
  setError('');
  await renderCurrentPost();
}

async function loadComments() {
  if (!currentPostId || !postCommentList) return;
  clearElement(postCommentList);
  try {
    const response = await fetch(`/api/posts/${encodeURIComponent(currentPostId)}/comments`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load comments.');
    }
    const comments = Array.isArray(data.comments) ? data.comments : [];
    if (!comments.length) {
      postCommentList.innerHTML = '<p>No comments yet.</p>';
      return;
    }

    comments.forEach((comment) => {
      const item = document.createElement('div');
      item.className = 'comment-item';

      const content = document.createElement('p');
      content.textContent = comment.content || '';

      const time = comment.createdAt ? new Date(comment.createdAt).toLocaleString() : '';
      const name = comment.displayName || 'Member';
      const meta = document.createElement('span');
      meta.appendChild(
        buildProfileNameNode(
          comment.userUid || comment.uid || comment.authorUid || '',
          name,
          'comment-author-link'
        )
      );
      meta.appendChild(document.createTextNode(time ? ` • ${time}` : ''));

      item.appendChild(content);
      item.appendChild(meta);
      postCommentList.appendChild(item);
    });
  } catch (error) {
    postCommentList.innerHTML = `<p>${error.message}</p>`;
  }
}

async function submitComment(event) {
  event.preventDefault();
  if (isSubmittingComment) return;
  if (!currentPostId || !postCommentInput) return;

  const content = String(postCommentInput.value || '').trim();
  if (!content) return;

  isSubmittingComment = true;
  setPostingState(postCommentSubmitButton, true);
  try {
    const response = await fetch(`/api/posts/${encodeURIComponent(currentPostId)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to add comment.');
    }
    postCommentInput.value = '';
    currentPost.commentsCount = Number(currentPost.commentsCount || 0) + 1;
    await Promise.all([renderCurrentPost(), loadComments()]);
    setError('');
  } catch (error) {
    setError(error.message || 'Unable to add comment.');
  } finally {
    isSubmittingComment = false;
    setPostingState(postCommentSubmitButton, false);
  }
}

async function loadCurrentProfile() {
  setNavAvatar(null, '');
  try {
    const response = await fetch('/api/profile');
    const data = await response.json();
    if (!response.ok || !data.ok) return;
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (error) {
    // keep fallback
  }
}

function extractPostIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return '';
  if (parts[0] !== 'posts') return '';
  return normalizePostId(decodeURIComponent(parts[1] || ''));
}

function bindNavMenu() {
  if (profileToggle && profileMenu) {
    profileToggle.addEventListener('click', () => {
      profileMenu.classList.toggle('is-hidden');
    });
    document.addEventListener('click', (event) => {
      if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
        profileMenu.classList.add('is-hidden');
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (error) {
        // best effort
      }
      window.location.href = '/login';
    });
  }
}

async function initPostPage() {
  bindNavMenu();
  ensureImageLightbox();
  await loadCurrentProfile();

  currentPostId = extractPostIdFromPath();
  if (!currentPostId) {
    setError('Invalid post URL.');
    return;
  }

  try {
    currentPost = await fetchPost(currentPostId);
    await Promise.all([renderCurrentPost(), loadComments()]);
  } catch (error) {
    setError(error.message || 'Unable to load post.');
    if (postCommentForm) {
      postCommentForm.classList.add('is-hidden');
    }
  }
}

if (postCommentForm) {
  postCommentForm.addEventListener('submit', submitComment);
}

initPostPage();
