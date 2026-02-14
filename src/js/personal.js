const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const journalForm = document.getElementById('journalForm');
const journalMessage = document.getElementById('journalMessage');
const resetJournal = document.getElementById('resetJournal');
const newJournal = document.getElementById('newJournal');
const journalModal = document.getElementById('journalModal');
const journalModalClose = document.getElementById('journalModalClose');
const journalModalTitle = document.getElementById('journalModalTitle');
const journalFolderSelect = document.getElementById('journalFolderSelect');
const newFolderName = document.getElementById('newFolderName');
const createFolder = document.getElementById('createFolder');
const folderList = document.getElementById('folderList');
const journalViewTitle = document.getElementById('journalViewTitle');
const journalViewMeta = document.getElementById('journalViewMeta');
const journalViewContent = document.getElementById('journalViewContent');

const taskForm = document.getElementById('taskForm');
const taskMessage = document.getElementById('taskMessage');
const tasksPending = document.getElementById('tasksPending');
const tasksOngoing = document.getElementById('tasksOngoing');
const tasksComplete = document.getElementById('tasksComplete');
const openTaskModal = document.getElementById('openTaskModal');
const taskModal = document.getElementById('taskModal');
const taskModalClose = document.getElementById('taskModalClose');

const conversationList = document.getElementById('conversationList');
const newConversation = document.getElementById('newConversation');
const messageList = document.getElementById('messageList');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const aiMessage = document.getElementById('aiMessage');
const conversationTitle = document.getElementById('conversationTitle');
const conversationSubtitle = document.getElementById('conversationSubtitle');
const confirmProposal = document.getElementById('confirmProposal');
const rejectProposal = document.getElementById('rejectProposal');
const proposalActions = document.getElementById('proposalActions');
const openContextPicker = document.getElementById('openContextPicker');
const contextModal = document.getElementById('contextModal');
const contextModalClose = document.getElementById('contextModalClose');
const contextSearch = document.getElementById('contextSearch');
const contextList = document.getElementById('contextList');
const contextChip = document.getElementById('contextChip');
const contextLabel = document.getElementById('contextLabel');
const clearContext = document.getElementById('clearContext');

let activeJournalId = null;
let selectedJournalId = null;
let activeConversationId = null;
let activeProposalId = null;
const openFolders = new Set();
let selectedContext = null;

function setConversationHeader(title, subtitle) {
  if (conversationTitle) {
    conversationTitle.textContent = title || 'New conversation';
  }
  if (conversationSubtitle) {
    conversationSubtitle.textContent = subtitle || 'Start a new chat to see responses.';
  }
}

function renderEmptyChat(message = 'Start a new chat to see responses.') {
  messageList.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  empty.textContent = message;
  messageList.appendChild(empty);
}

function escapeHtml(value) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineMarkdown(text) {
  let result = text;
  const codeSnippets = [];

  result = result.replace(/`([^`]+)`/g, (match, code) => {
    const index = codeSnippets.length;
    codeSnippets.push(code);
    return `{{CODE_${index}}}`;
  });

  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    if (/^https?:\/\//i.test(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
  });

  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  result = result.replace(/\{\{CODE_(\d+)\}\}/g, (match, index) => {
    const code = codeSnippets[Number(index)] ?? '';
    return `<code>${code}</code>`;
  });

  return result;
}

function renderMarkdownBlocks(text) {
  const lines = text.split('\n');
  let html = '';
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#{1,3}/)[0].length;
      const heading = line.replace(/^#{1,3}\s+/, '');
      html += `<h${level}>${applyInlineMarkdown(heading)}</h${level}>`;
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      html += `<blockquote>${renderMarkdownBlocks(quoteLines.join('\n'))}</blockquote>`;
      continue;
    }

    if (/^(\*|-|\+)\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^(\*|-|\+)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(\*|-|\+)\s+/, ''));
        index += 1;
      }
      html += `<ul>${items.map((item) => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</ul>`;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      html += `<ol>${items.map((item) => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</ol>`;
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      html += '<hr />';
      index += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^(#{1,3}\s+|>\s?|(\*|-|\+)\s+|\d+\.\s+|(-{3,}|_{3,}|\*{3,})$)/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    const content = applyInlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br />');
    html += `<p>${content}</p>`;
  }

  return html;
}

function renderMarkdown(text) {
  const safeText = escapeHtml(text);
  const segments = safeText.split(/```/);
  let html = '';

  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const lines = segment.split('\n');
      let language = '';
      let code = segment;

      if (lines.length > 1 && /^[a-z0-9_-]+$/i.test(lines[0].trim())) {
        language = lines[0].trim().toLowerCase();
        code = lines.slice(1).join('\n');
      }

      const className = language ? ` class="language-${language}"` : '';
      html += `<pre><code${className}>${code}</code></pre>`;
    } else {
      html += renderMarkdownBlocks(segment);
    }
  });

  return html;
}

function updateContextChip() {
  if (!contextChip || !contextLabel) return;
  if (selectedContext) {
    contextLabel.textContent = selectedContext.title;
    contextChip.classList.remove('is-hidden');
  } else {
    contextChip.classList.add('is-hidden');
  }
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

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    tabButtons.forEach((btn) => btn.classList.remove('is-active'));
    button.classList.add('is-active');
    tabPanels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.id === `tab-${button.dataset.tab}`);
    });
  });
});

function clearJournalView() {
  if (journalViewTitle) journalViewTitle.textContent = 'Select an entry';
  if (journalViewMeta) journalViewMeta.textContent = '';
  if (journalViewContent) journalViewContent.textContent = 'Choose a journal entry from the left to read it here.';
}

function setJournalView(entry) {
  selectedJournalId = String(entry._id);
  journalViewTitle.textContent = entry.title;
  journalViewMeta.textContent = `${entry.folder || 'Ungrouped'} • ${new Date(entry.updatedAt).toLocaleString()}`;
  journalViewContent.textContent = entry.content || '';
}

function openJournalEditor(entry = null) {
  journalMessage.textContent = '';
  if (entry) {
    activeJournalId = String(entry._id);
    journalModalTitle.textContent = 'Edit journal entry';
    journalForm.elements.title.value = entry.title || '';
    journalFolderSelect.value = entry.folder || '';
    journalForm.elements.tags.value = (entry.tags || []).join(', ');
    journalForm.elements.content.value = entry.content || '';
  } else {
    activeJournalId = null;
    journalModalTitle.textContent = 'New journal entry';
    journalForm.reset();
    journalFolderSelect.value = '';
  }
  openModal(journalModal);
}

function renderEntryItem(entry) {
  const item = document.createElement('div');
  item.className = 'entry-item';
  item.innerHTML = `
    <h4>${entry.title}</h4>
    <p>${entry.folder || 'Ungrouped'} • ${new Date(entry.updatedAt).toLocaleDateString()}</p>
    <div class="list-actions">
      <button data-action="view">View</button>
      <button data-action="edit">Edit</button>
      <button data-action="delete">Delete</button>
    </div>
  `;
  item.querySelector('[data-action="view"]').addEventListener('click', () => setJournalView(entry));
  item.querySelector('[data-action="edit"]').addEventListener('click', () => {
    setJournalView(entry);
    openJournalEditor(entry);
  });
  item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    await fetch(`/api/personal/journals/${entry._id}`, { method: 'DELETE' });
    if (activeJournalId === String(entry._id)) {
      activeJournalId = null;
      journalForm.reset();
      journalFolderSelect.value = '';
      if (journalModal) {
        closeModal(journalModal);
      }
    }
    if (selectedJournalId === String(entry._id)) {
      selectedJournalId = null;
      clearJournalView();
    }
    loadJournalWorkspace();
  });
  return item;
}

function renderFolderCard({ name, entries, canDelete, id }) {
  const card = document.createElement('div');
  card.className = 'folder-card';

  const header = document.createElement('div');
  header.className = 'folder-header';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'folder-toggle';
  toggle.innerHTML = `
    <span class="folder-name">${name}</span>
    <span class="folder-meta">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</span>
  `;

  const actions = document.createElement('div');
  actions.className = 'folder-actions';
  if (canDelete) {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await fetch(`/api/personal/journal-folders/${id}`, { method: 'DELETE' });
      openFolders.delete(name);
      loadJournalWorkspace();
    });
    actions.appendChild(deleteButton);
  }

  header.appendChild(toggle);
  header.appendChild(actions);

  const entriesWrap = document.createElement('div');
  entriesWrap.className = 'folder-entries';
  if (!openFolders.has(name)) {
    entriesWrap.classList.add('is-hidden');
  }

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'folder-meta';
    empty.textContent = 'No entries yet.';
    entriesWrap.appendChild(empty);
  } else {
    entries.forEach((entry) => entriesWrap.appendChild(renderEntryItem(entry)));
  }

  toggle.addEventListener('click', () => {
    if (openFolders.has(name)) {
      openFolders.delete(name);
      entriesWrap.classList.add('is-hidden');
    } else {
      openFolders.add(name);
      entriesWrap.classList.remove('is-hidden');
    }
  });

  card.appendChild(header);
  card.appendChild(entriesWrap);
  return card;
}

async function loadJournalWorkspace() {
  folderList.innerHTML = '';
  journalFolderSelect.innerHTML = '<option value="">Select folder</option>';

  const [foldersResponse, journalsResponse] = await Promise.all([
    fetch('/api/personal/journal-folders'),
    fetch('/api/personal/journals'),
  ]);
  const foldersData = await foldersResponse.json();
  const journalsData = await journalsResponse.json();

  if (!foldersResponse.ok || !foldersData.ok || !journalsResponse.ok || !journalsData.ok) {
    folderList.innerHTML = '<p>Unable to load folders.</p>';
    clearJournalView();
    return;
  }

  const entries = journalsData.entries || [];
  const entriesByFolder = new Map();
  entries.forEach((entry) => {
    const key = entry.folder && entry.folder.trim() ? entry.folder.trim() : 'Ungrouped';
    if (!entriesByFolder.has(key)) {
      entriesByFolder.set(key, []);
    }
    entriesByFolder.get(key).push(entry);
  });

  const folderNames = foldersData.folders.map((folder) => folder.name);
  folderNames.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    journalFolderSelect.appendChild(option);
  });

  const knownFolderNames = new Set(folderNames);
  const extraFolderNames = [];
  entriesByFolder.forEach((_value, name) => {
    if (name !== 'Ungrouped' && !knownFolderNames.has(name)) {
      extraFolderNames.push(name);
    }
  });

  const allFolders = [
    ...foldersData.folders.map((folder) => ({
      name: folder.name,
      id: folder._id,
      canDelete: true,
    })),
    ...extraFolderNames.map((name) => ({
      name,
      id: null,
      canDelete: false,
    })),
    { name: 'Ungrouped', id: null, canDelete: false },
  ];

  const folderNameSet = new Set(allFolders.map((folder) => folder.name));
  Array.from(openFolders).forEach((name) => {
    if (!folderNameSet.has(name)) {
      openFolders.delete(name);
    }
  });

  allFolders.forEach((folder) => {
    const entriesForFolder = entriesByFolder.get(folder.name) || [];
    const card = renderFolderCard({
      name: folder.name,
      entries: entriesForFolder,
      canDelete: folder.canDelete,
      id: folder.id,
    });
    folderList.appendChild(card);
  });

  const selectedEntry = entries.find((entry) => String(entry._id) === String(selectedJournalId));
  if (selectedEntry) {
    setJournalView(selectedEntry);
    return;
  }
  if (entries.length) {
    setJournalView(entries[0]);
    return;
  }
  selectedJournalId = null;
  clearJournalView();
}

async function saveJournal(event) {
  event.preventDefault();
  journalMessage.textContent = '';
  const editingJournalId = activeJournalId;
  const payload = {
    title: journalForm.elements.title.value,
    folder: journalFolderSelect.value,
    tags: journalForm.elements.tags.value,
    content: journalForm.elements.content.value,
  };

  const url = activeJournalId ? `/api/personal/journals/${activeJournalId}` : '/api/personal/journals';
  const method = activeJournalId ? 'PATCH' : 'POST';
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    journalMessage.textContent = data.message || 'Unable to save journal.';
    return;
  }
  journalForm.reset();
  journalFolderSelect.value = '';
  if (editingJournalId) {
    selectedJournalId = editingJournalId;
  } else if (data.entry && data.entry._id) {
    selectedJournalId = String(data.entry._id);
  }
  activeJournalId = null;
  closeModal(journalModal);
  await loadJournalWorkspace();
}

if (journalForm) {
  journalForm.addEventListener('submit', saveJournal);
}

if (resetJournal) {
  resetJournal.addEventListener('click', () => {
    activeJournalId = null;
    if (journalModalTitle) {
      journalModalTitle.textContent = 'New journal entry';
    }
    journalForm.reset();
    journalFolderSelect.value = '';
    journalMessage.textContent = '';
  });
}

if (newJournal) {
  newJournal.addEventListener('click', () => {
    openJournalEditor();
  });
}

if (journalModalClose) {
  journalModalClose.addEventListener('click', () => {
    closeModal(journalModal);
    activeJournalId = null;
    journalMessage.textContent = '';
  });
}

if (createFolder) {
  createFolder.addEventListener('click', async () => {
    const name = newFolderName.value.trim();
    if (!name) return;
    await fetch('/api/personal/journal-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    newFolderName.value = '';
    loadJournalWorkspace();
  });
}

async function loadTasks() {
  const response = await fetch('/api/personal/tasks');
  const data = await response.json();
  tasksPending.innerHTML = '';
  tasksOngoing.innerHTML = '';
  tasksComplete.innerHTML = '';

  if (!response.ok || !data.ok) {
    taskMessage.textContent = 'Unable to load tasks.';
    return;
  }

  data.tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    const tags = (task.tags || []).length ? task.tags.join(', ') : 'No tags';
    card.innerHTML = `
      <strong>${task.title}</strong>
      <p>${task.description || 'No description.'}</p>
      <div class="meta">${task.priority} • ${task.dueDate || 'No due date'} • ${tags}</div>
      <div class="task-status-select">
        <select data-action="status" aria-label="Task status">
          <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="ongoing" ${task.status === 'ongoing' ? 'selected' : ''}>Ongoing</option>
          <option value="complete" ${task.status === 'complete' ? 'selected' : ''}>Complete</option>
        </select>
      </div>
      <button data-action="delete">Delete</button>
    `;
    card.querySelector('[data-action="status"]').addEventListener('change', async (event) => {
      await fetch(`/api/personal/tasks/${task._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: event.target.value }),
      });
      loadTasks();
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await fetch(`/api/personal/tasks/${task._id}`, { method: 'DELETE' });
      loadTasks();
    });

    if (task.status === 'ongoing') {
      tasksOngoing.appendChild(card);
    } else if (task.status === 'complete') {
      tasksComplete.appendChild(card);
    } else {
      tasksPending.appendChild(card);
    }
  });
}

async function createTask(event) {
  event.preventDefault();
  taskMessage.textContent = '';
  const payload = {
    title: taskForm.elements.title.value,
    description: taskForm.elements.description.value,
    priority: taskForm.elements.priority.value,
    dueDate: taskForm.elements.dueDate.value || null,
    tags: taskForm.elements.tags.value,
    status: 'pending',
  };
  const response = await fetch('/api/personal/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    taskMessage.textContent = data.message || 'Unable to create task.';
    return;
  }
  taskForm.reset();
  closeModal(taskModal);
  loadTasks();
}

if (taskForm) {
  taskForm.addEventListener('submit', createTask);
}

if (openTaskModal) {
  openTaskModal.addEventListener('click', () => openModal(taskModal));
}

if (taskModalClose) {
  taskModalClose.addEventListener('click', () => closeModal(taskModal));
}

async function loadConversations() {
  const response = await fetch('/api/personal/conversations');
  const data = await response.json();
  conversationList.innerHTML = '';
  if (!response.ok || !data.ok) {
    conversationList.innerHTML = '<p>Unable to load conversations.</p>';
    return;
  }
  if (!data.conversations.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No conversations yet.';
    conversationList.appendChild(empty);
    setConversationHeader('New conversation', 'Start a new chat to see responses.');
    renderEmptyChat('Start a new chat to see responses.');
    return;
  }
  data.conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    if (activeConversationId === conv._id) {
      item.classList.add('is-active');
    }
    item.innerHTML = `
      <span class="conversation-title">${conv.title || 'New conversation'}</span>
      <span class="conversation-meta">${new Date(conv.updatedAt).toLocaleDateString()}</span>
      <div class="conversation-actions">
        <button data-action="open">Open</button>
        <button data-action="delete">Delete</button>
      </div>
    `;
    item.querySelector('[data-action="open"]').addEventListener('click', () => {
      activeConversationId = conv._id;
      loadMessages(conv._id);
      setConversationHeader(conv.title || 'New conversation', 'Private conversation');
      loadConversations();
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await fetch(`/api/personal/conversations/${conv._id}`, { method: 'DELETE' });
      if (activeConversationId === conv._id) {
        activeConversationId = null;
        renderEmptyChat('Start a new chat to see responses.');
        setConversationHeader('New conversation', 'Start a new chat to see responses.');
      }
      loadConversations();
    });
    conversationList.appendChild(item);
  });

  if (activeConversationId) {
    const active = data.conversations.find((conv) => conv._id === activeConversationId);
    if (active) {
      setConversationHeader(active.title || 'New conversation', 'Private conversation');
    }
  }
}

async function createConversation() {
  const response = await fetch('/api/personal/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'New conversation' }),
  });
  const data = await response.json();
  if (response.ok && data.ok) {
    activeConversationId = data.conversation._id;
    renderEmptyChat();
    setConversationHeader('New conversation', 'Start a new chat to see responses.');
    aiMessage.textContent = '';
    loadConversations();
  }
}

if (newConversation) {
  newConversation.addEventListener('click', () => {
    activeConversationId = null;
    renderEmptyChat('Start a new chat to see responses.');
    setConversationHeader('New conversation', 'Start a new chat to see responses.');
    aiMessage.textContent = '';
    selectedContext = null;
    updateContextChip();
    loadConversations();
  });
}

async function loadMessages(conversationId) {
  const response = await fetch(`/api/personal/conversations/${conversationId}/messages`);
  const data = await response.json();
  messageList.innerHTML = '';
  if (!response.ok || !data.ok) {
    messageList.innerHTML = '<p>Unable to load messages.</p>';
    return;
  }
  if (!data.messages.length) {
    renderEmptyChat('Start the conversation with a question or a goal.');
  } else {
    messageList.innerHTML = '';
    data.messages.forEach((message) => {
      const item = document.createElement('div');
      item.className = `message ${message.role}`;
      item.innerHTML = renderMarkdown(message.content || '');
      messageList.appendChild(item);
    });
  }
  messageList.scrollTop = messageList.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;
  aiMessage.textContent = '';

  if (!activeConversationId) {
    await createConversation();
  }
  if (!activeConversationId) {
    aiMessage.textContent = 'Unable to start a new conversation.';
    return;
  }

  const context = selectedContext ? { uuid: selectedContext.uuid } : null;
  const response = await fetch(`/api/personal/conversations/${activeConversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, contextDoc: context }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    aiMessage.textContent = data.message || 'Unable to send message.';
    return;
  }
  messageInput.value = '';
  await loadMessages(activeConversationId);
  if (data.conversationTitle) {
    setConversationHeader(data.conversationTitle, 'Private conversation');
  }
  await loadConversations();
  if (data.proposalId) {
    activeProposalId = data.proposalId;
    proposalActions.classList.remove('is-hidden');
  } else {
    proposalActions.classList.add('is-hidden');
  }
  if (data.createdTasks && data.createdTasks.length) {
    activeProposalId = null;
    proposalActions.classList.add('is-hidden');
    loadTasks();
  }
}

if (messageForm) {
  messageForm.addEventListener('submit', sendMessage);
}

if (confirmProposal) {
  confirmProposal.addEventListener('click', async () => {
    if (!activeProposalId) return;
    await fetch(`/api/personal/task-proposals/${activeProposalId}/confirm`, { method: 'POST' });
    proposalActions.classList.add('is-hidden');
    activeProposalId = null;
    loadTasks();
  });
}

if (rejectProposal) {
  rejectProposal.addEventListener('click', async () => {
    if (!activeProposalId) return;
    await fetch(`/api/personal/task-proposals/${activeProposalId}/reject`, { method: 'POST' });
    proposalActions.classList.add('is-hidden');
    activeProposalId = null;
  });
}

async function loadContextDocs(query = '') {
  if (!contextList) return;
  const q = query.trim();
  const params = new URLSearchParams({
    page: '1',
    pageSize: '50',
    sort: 'recent',
  });
  if (q) {
    params.set('q', q);
  }
  const response = await fetch(`/api/library/documents?${params.toString()}`);
  const data = await response.json();
  contextList.innerHTML = '';
  if (!response.ok || !data.ok) {
    contextList.innerHTML = '<p>Unable to load documents.</p>';
    return;
  }
  if (!data.documents.length) {
    contextList.innerHTML = '<p>No documents found.</p>';
    return;
  }
  data.documents.forEach((doc) => {
    const item = document.createElement('div');
    item.className = 'context-item';
    item.innerHTML = `
      <h4>${doc.title}</h4>
      <p>${doc.course || 'No course'} • ${doc.subject || 'No subject'}</p>
      <button type="button">Use as context</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      selectedContext = { uuid: doc.uuid, title: doc.title };
      updateContextChip();
      closeModal(contextModal);
    });
    contextList.appendChild(item);
  });
}

let contextSearchTimer = null;
function handleContextSearch() {
  const value = contextSearch ? contextSearch.value : '';
  clearTimeout(contextSearchTimer);
  contextSearchTimer = setTimeout(() => {
    loadContextDocs(value);
  }, 250);
}

if (openContextPicker) {
  openContextPicker.addEventListener('click', () => {
    openModal(contextModal);
    loadContextDocs(contextSearch ? contextSearch.value : '');
  });
}

if (contextModalClose) {
  contextModalClose.addEventListener('click', () => closeModal(contextModal));
}

if (contextSearch) {
  contextSearch.addEventListener('input', handleContextSearch);
}

if (clearContext) {
  clearContext.addEventListener('click', () => {
    selectedContext = null;
    updateContextChip();
  });
}

loadJournalWorkspace();
loadTasks();
loadConversations();
updateContextChip();
