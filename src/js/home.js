const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');

const postsFeed = document.getElementById('postsFeed');
const createPostToggle = document.getElementById('createPostToggle');
const createPostModal = document.getElementById('createPostModal');
const createPostClose = document.getElementById('createPostClose');
const createPostForm = document.getElementById('createPostForm');
const createPostMessage = document.getElementById('createPostMessage');
const postCourse = document.getElementById('postCourse');
const postPublic = document.getElementById('postPublic');
const attachmentType = document.getElementById('attachmentType');
const attachmentFileRow = document.getElementById('attachmentFileRow');
const attachmentLinkRow = document.getElementById('attachmentLinkRow');
const attachmentDocRow = document.getElementById('attachmentDocRow');
const attachmentFile = document.getElementById('attachmentFile');
const attachmentLink = document.getElementById('attachmentLink');
const attachmentDoc = document.getElementById('attachmentDoc');

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
let libraryDocIndex = new Map();

const state = {
  page: 1,
  pageSize: 8,
};

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

function updateAttachmentFields() {
  const type = attachmentType ? attachmentType.value : 'none';
  if (attachmentFileRow) attachmentFileRow.classList.add('is-hidden');
  if (attachmentLinkRow) attachmentLinkRow.classList.add('is-hidden');
  if (attachmentDocRow) attachmentDocRow.classList.add('is-hidden');
  if (attachmentFile) attachmentFile.value = '';
  if (attachmentLink) attachmentLink.value = '';

  if (type === 'image' || type === 'video') {
    if (attachmentFileRow) attachmentFileRow.classList.remove('is-hidden');
    if (attachmentFile) {
      attachmentFile.accept = type === 'image' ? 'image/*' : 'video/*';
    }
  } else if (type === 'link') {
    if (attachmentLinkRow) attachmentLinkRow.classList.remove('is-hidden');
  } else if (type === 'library_doc') {
    if (attachmentDocRow) attachmentDocRow.classList.remove('is-hidden');
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

async function loadLibraryDocs() {
  try {
    const params = new URLSearchParams({ page: 1, pageSize: 50 });
    const response = await fetch(`/api/library/documents?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to load documents.');
    }
    libraryDocIndex = new Map();
    if (attachmentDoc) {
      attachmentDoc.innerHTML = '<option value="">Select a document</option>';
      data.documents.forEach((doc) => {
        libraryDocIndex.set(doc.uuid, doc);
        const option = document.createElement('option');
        option.value = doc.uuid;
        option.textContent = `${doc.title} (${doc.course})`;
        option.dataset.link = doc.link;
        option.dataset.title = doc.title;
        attachmentDoc.appendChild(option);
      });
    }
  } catch (error) {
    // optional
  }
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

  const header = document.createElement('div');
  header.className = 'post-header';
  header.innerHTML = `
    <div class="post-avatar"></div>
    <div class="post-meta">
      <div>
        <h4>${post.uploader?.displayName || 'Member'}</h4>
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
    await fetch(`/api/posts/${post.id}/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: post.bookmarked ? 'remove' : 'add' }),
    });
    await fetchPosts();
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
    await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    await fetchPosts();
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
      await fetchPosts();
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

  if (attachmentType.value === 'library_doc') {
    const selected = attachmentDoc.options[attachmentDoc.selectedIndex];
    if (selected) {
      formData.set('libraryDocumentUuid', selected.value);
      formData.set('attachmentLink', selected.dataset.link || '');
      formData.set('attachmentTitle', selected.dataset.title || '');
    }
    if (!selected || !selected.dataset.link) {
      createPostMessage.textContent = 'Please select a library document.';
      return;
    }
  } else if (attachmentType.value === 'link') {
    formData.set('attachmentLink', attachmentLink.value || '');
    if (!attachmentLink.value) {
      createPostMessage.textContent = 'Please enter a link.';
      return;
    }
  }
  if ((attachmentType.value === 'image' || attachmentType.value === 'video') && !attachmentFile.value) {
    createPostMessage.textContent = 'Please attach a file.';
    return;
  }

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
    updateAttachmentFields();
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
    closeModal(editPostModal);
    await fetchPosts();
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
    await fetchPosts();
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

if (postPublic) {
  postPublic.addEventListener('change', () => updateCourseDisabled(postPublic, postCourse));
}

if (attachmentType) {
  attachmentType.addEventListener('change', updateAttachmentFields);
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

updateAttachmentFields();
updateCourseDisabled(postPublic, postCourse);
updateCourseDisabled(editPostPublic, editPostCourse);
loadCourses();
loadLibraryDocs();
fetchPosts();
