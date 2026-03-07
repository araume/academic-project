const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');

const subjectsList = document.getElementById('subjectsList');
const subjectCourseLabel = document.getElementById('subjectCourseLabel');
const subjectTitle = document.getElementById('subjectTitle');
const subjectDescription = document.getElementById('subjectDescription');
const subjectPosts = document.getElementById('subjectPosts');

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

const state = {
  subjects: [],
  selectedSubjectId: null,
  canCreate: false,
  loadingFeed: false,
};

function initialsFromName(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'M';
  return safe[0].toUpperCase();
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
    subjectCourseLabel.textContent = 'Select a unit';
    subjectTitle.textContent = 'Unit feed';
    subjectDescription.textContent = 'Choose a unit on the left to load posts.';
    if (openCreateSubjectPostModal) openCreateSubjectPostModal.disabled = true;
    return;
  }

  subjectCourseLabel.textContent = subject.courseName || 'Unit course';
  subjectTitle.textContent = subject.subjectName || 'Unit feed';
  subjectDescription.textContent = subject.description || 'No unit description yet.';
  if (openCreateSubjectPostModal) openCreateSubjectPostModal.disabled = false;
}

function renderSubjects() {
  if (!subjectsList) return;
  subjectsList.innerHTML = '';
  if (!state.subjects.length) {
    subjectsList.innerHTML = '<p class="subject-empty">No units available for your course yet.</p>';
    setSubjectFeedHeader(null);
    return;
  }

  state.subjects.forEach((subject) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `subject-item${subject.id === state.selectedSubjectId ? ' is-active' : ''}`;
    button.innerHTML = `
      <h3>${subject.subjectName || 'Untitled unit'}</h3>
      <p>${subject.postsCount || 0} posts</p>
    `;
    button.addEventListener('click', async () => {
      if (state.selectedSubjectId === subject.id) return;
      state.selectedSubjectId = subject.id;
      renderSubjects();
      await fetchAndRenderSubjectFeed(subject.id);
    });
    subjectsList.appendChild(button);
  });
}

function renderPostList(posts) {
  if (!subjectPosts) return;
  subjectPosts.innerHTML = '';
  if (!Array.isArray(posts) || !posts.length) {
    subjectPosts.innerHTML = '<p class="subject-empty">No posts yet for this unit.</p>';
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement('article');
    card.className = 'subject-post';

    const title = document.createElement('div');
    title.className = 'subject-post-head';
    title.innerHTML = `<h4>${post.title || 'Untitled post'}</h4>`;

    const meta = document.createElement('p');
    meta.className = 'subject-post-meta';
    meta.textContent = `${post.author?.displayName || 'Member'} • ${timeAgo(post.createdAt)}`;

    const body = document.createElement('p');
    body.className = 'subject-post-body';
    body.textContent = post.content || '';

    const actions = document.createElement('div');
    actions.className = 'subject-post-actions';
    const likeButton = document.createElement('button');
    likeButton.type = 'button';
    likeButton.textContent = post.liked
      ? `Unlike (${Number(post.likesCount || 0)})`
      : `Like (${Number(post.likesCount || 0)})`;
    likeButton.addEventListener('click', async () => {
      if (!state.selectedSubjectId) return;
      likeButton.disabled = true;
      try {
        const response = await fetch(
          `/api/subjects/${encodeURIComponent(state.selectedSubjectId)}/posts/${encodeURIComponent(post.id)}/like`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: post.liked ? 'unlike' : 'like' }),
          }
        );
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'Unable to update like.');
        }
        post.liked = Boolean(data.liked);
        post.likesCount = Number(data.likesCount || 0);
        likeButton.textContent = post.liked
          ? `Unlike (${post.likesCount})`
          : `Like (${post.likesCount})`;
      } catch (error) {
        alert(error.message || 'Unable to update like.');
      } finally {
        likeButton.disabled = false;
      }
    });

    const commentsCount = document.createElement('span');
    commentsCount.textContent = `${Number(post.commentsCount || 0)} comments`;

    actions.appendChild(likeButton);
    actions.appendChild(commentsCount);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(body);

    if (post.attachment && post.attachment.uuid) {
      const attachment = document.createElement('a');
      attachment.className = 'subject-post-attachment';
      attachment.textContent = `Attachment: ${post.attachment.title || 'Open Library document'}`;
      attachment.href = post.attachment.link || '/open-library';
      attachment.target = '_blank';
      attachment.rel = 'noopener noreferrer';
      card.appendChild(attachment);
    }

    card.appendChild(actions);

    const commentsWrap = document.createElement('div');
    commentsWrap.className = 'subject-comments';
    const comments = Array.isArray(post.comments) ? post.comments : [];
    comments.forEach((comment) => {
      const commentItem = document.createElement('div');
      commentItem.className = 'subject-comment';
      const content = document.createElement('p');
      content.textContent = comment.content || '';
      const metaLine = document.createElement('small');
      metaLine.textContent = `${comment.authorName || 'Member'} • ${timeAgo(comment.createdAt)}`;
      commentItem.appendChild(content);
      commentItem.appendChild(metaLine);
      commentsWrap.appendChild(commentItem);
    });

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
      const sendButton = commentForm.querySelector('button[type="submit"]');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = 'Sending...';
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
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'Unable to submit comment.');
        }
        input.value = '';
        await fetchAndRenderSubjectFeed(state.selectedSubjectId);
      } catch (error) {
        alert(error.message || 'Unable to submit comment.');
      } finally {
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.textContent = 'Send';
        }
      }
    });

    card.appendChild(commentsWrap);
    card.appendChild(commentForm);
    subjectPosts.appendChild(card);
  });
}

async function fetchAndRenderSubjectFeed(subjectId) {
  if (!subjectId || state.loadingFeed) return;
  state.loadingFeed = true;
  subjectPosts.innerHTML = '<p class="subject-empty">Loading unit feed...</p>';
  try {
    const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/feed?page=1&pageSize=50`);
    const data = await response.json();
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
  } catch (error) {
    subjectPosts.innerHTML = `<p class="subject-empty">${error.message}</p>`;
  } finally {
    state.loadingFeed = false;
  }
}

async function loadSubjectsBootstrap() {
  try {
    const response = await fetch('/api/subjects/bootstrap');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to load units.');
    }
    state.subjects = Array.isArray(data.subjects) ? data.subjects : [];
    state.canCreate = Boolean(data.canCreate);
    if (openCreateSubjectModal) {
      openCreateSubjectModal.classList.toggle('is-hidden', !state.canCreate);
    }

    if (!state.selectedSubjectId && state.subjects.length) {
      state.selectedSubjectId = state.subjects[0].id;
    } else if (
      state.selectedSubjectId &&
      !state.subjects.some((subject) => subject.id === state.selectedSubjectId)
    ) {
      state.selectedSubjectId = state.subjects.length ? state.subjects[0].id : null;
    }

    renderSubjects();
    const selected = state.subjects.find((subject) => subject.id === state.selectedSubjectId);
    setSubjectFeedHeader(selected || null);
    if (selected) {
      await fetchAndRenderSubjectFeed(selected.id);
    } else {
      subjectPosts.innerHTML = '<p class="subject-empty">No units available yet.</p>';
    }
  } catch (error) {
    subjectsList.innerHTML = `<p class="subject-empty">${error.message}</p>`;
    subjectPosts.innerHTML = '<p class="subject-empty">Unable to load unit feed.</p>';
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
      const data = await response.json();
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
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Unable to create post.');
      }
      closeModal(createSubjectPostModal);
      createSubjectPostForm.reset();
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

async function loadCurrentProfile() {
  try {
    const response = await fetch('/api/profile');
    const data = await response.json();
    if (!response.ok || !data.ok) return;
    setNavAvatar(data.profile?.photo_link || null, data.profile?.display_name || '');
  } catch (error) {
    // keep fallback avatar
  }
}

async function initSubjectsPage() {
  await Promise.all([loadCurrentProfile(), loadSubjectsBootstrap()]);
}

initSubjectsPage();
