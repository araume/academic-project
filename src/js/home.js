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
const postCourse = document.getElementById('postCourse');
const postPublic = document.getElementById('postPublic');
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
const editPostCourse = document.getElementById('editPostCourse');
const editPostPublic = document.getElementById('editPostPublic');

const commentsModal = document.getElementById('commentsModal');
const commentsClose = document.getElementById('commentsClose');
const postCommentList = document.getElementById('postCommentList');
const postCommentForm = document.getElementById('postCommentForm');
const postCommentInput = document.getElementById('postCommentInput');

const libraryDocModal = document.getElementById('libraryDocModal');
const libraryDocClose = document.getElementById('libraryDocClose');
const libraryDocTitle = document.getElementById('libraryDocTitle');
const libraryDocDescription = document.getElementById('libraryDocDescription');
const libraryDocUploader = document.getElementById('libraryDocUploader');
const libraryDocCourse = document.getElementById('libraryDocCourse');
const libraryDocSubject = document.getElementById('libraryDocSubject');
const libraryDocOpen = document.getElementById('libraryDocOpen');

let currentPostId = null;
let currentLibraryDoc = null;
let currentEditPost = null;
let selectedLibraryDocument = null;
let libraryPickerSearchTimer = null;
let postCache = new Map();

const state = {
  page: 1,
  pageSize: 8,
};
const DEFAULT_AVATAR = '/assets/LOGO.png';

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

function updateCourseDisabled(toggle, selectEl) {
  const isPublic = toggle && toggle.checked;
  if (selectEl) {
    selectEl.disabled = isPublic;
    if (isPublic) {
      selectEl.value = '';
    }
  }
}

async function loadCourses() {
  try {
    const response = await fetch('/api/library/courses');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load courses.');
    }
    data.courses.forEach((course) => {
      const option = document.createElement('option');
      option.value = course.course_name;
      option.textContent = course.course_name;
      postCourse.appendChild(option);

      const editOption = document.createElement('option');
      editOption.value = course.course_name;
      editOption.textContent = course.course_name;
      editPostCourse.appendChild(editOption);
    });
  } catch (error) {
    // optional
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
    <button disabled><img src="/assets/AI-star.svg" alt="" />Ask AI</button>
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
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/home#post-${post.id}`);
      alert('Post link copied.');
    } catch (error) {
      prompt('Copy post link:', `${window.location.origin}/home#post-${post.id}`);
    }
  } else if (action === 'report') {
    await fetch(`/api/posts/${post.id}/report`, { method: 'POST' });
    alert('Report submitted. Thank you.');
  } else if (action === 'edit') {
    currentEditPost = post;
    editPostForm.elements.title.value = post.title;
    editPostForm.elements.content.value = post.content;
    editPostPublic.checked = post.visibility === 'public';
    editPostCourse.value = post.course || '';
    updateCourseDisabled(editPostPublic, editPostCourse);
    openModal(editPostModal);
  } else if (action === 'delete') {
    if (!confirm('Delete this post?')) return;
    const response = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    if (response.ok) {
      removePostCard(post.id);
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
    }
  } else if (action === 'comments') {
    currentPostId = post.id;
    await loadPostComments(post.id);
    openModal(commentsModal);
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
  createPostMessage.textContent = '';

  const formData = new FormData(createPostForm);
  const isPublic = postPublic.checked;
  formData.set('visibility', isPublic ? 'public' : 'private');
  if (!isPublic && !postCourse.value) {
    createPostMessage.textContent = 'Please select a course for private posts.';
    return;
  }

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
    updateCourseDisabled(postPublic, postCourse);
    closeModal(createPostModal);
    await fetchPosts();
  } catch (error) {
    createPostMessage.textContent = error.message;
  }
}

async function savePost(event) {
  event.preventDefault();
  if (!currentEditPost) return;

  editPostMessage.textContent = '';
  const payload = {
    title: editPostForm.elements.title.value,
    content: editPostForm.elements.content.value,
    course: editPostCourse.value,
    visibility: editPostPublic.checked ? 'public' : 'private',
  };
  if (payload.visibility === 'private' && !payload.course) {
    editPostMessage.textContent = 'Please select a course for private posts.';
    return;
  }

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
    currentEditPost.course = payload.course || null;
    currentEditPost.visibility = payload.visibility;
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
      item.innerHTML = `<p>${comment.content}</p><span>${name} • ${time}</span>`;
      postCommentList.appendChild(item);
    });
  } catch (error) {
    postCommentList.innerHTML = `<p>${error.message}</p>`;
  }
}

async function submitPostComment(event) {
  event.preventDefault();
  if (!currentPostId || !postCommentInput.value.trim()) {
    return;
  }
  const content = postCommentInput.value.trim();
  const response = await fetch(`/api/posts/${currentPostId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await response.json();
  if (response.ok && data.ok) {
    postCommentInput.value = '';
    await loadPostComments(currentPostId);
    const post = postCache.get(currentPostId);
    if (post) {
      post.commentsCount = Number(post.commentsCount || 0) + 1;
    }
  }
}

async function openLibraryDoc(uuid) {
  try {
    const response = await fetch(`/api/library/documents/${uuid}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load document.');
    }
    currentLibraryDoc = data.document;
    libraryDocTitle.textContent = data.document.title;
    libraryDocDescription.textContent = data.document.description || 'No description provided.';
    libraryDocUploader.textContent = data.document.uploader_name || 'Member';
    libraryDocCourse.textContent = data.document.course;
    libraryDocSubject.textContent = data.document.subject;
    openModal(libraryDocModal);
  } catch (error) {
    alert(error.message);
  }
}

if (libraryDocOpen) {
  libraryDocOpen.addEventListener('click', () => {
    if (currentLibraryDoc) {
      window.open(currentLibraryDoc.link, '_blank');
    }
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

if (postPublic) {
  postPublic.addEventListener('change', () => updateCourseDisabled(postPublic, postCourse));
}

if (editPostClose) {
  editPostClose.addEventListener('click', () => closeModal(editPostModal));
}

if (editPostForm) {
  editPostForm.addEventListener('submit', savePost);
}

if (editPostPublic) {
  editPostPublic.addEventListener('change', () => updateCourseDisabled(editPostPublic, editPostCourse));
}

updateCourseDisabled(postPublic, postCourse);
updateCourseDisabled(editPostPublic, editPostCourse);
loadCourses();
updateSelectedLibraryDocUI();
loadCurrentProfile();
fetchPosts();
