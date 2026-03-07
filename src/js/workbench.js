const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');
const navAvatarLabel = document.getElementById('navAvatarLabel');
const workbenchShell = document.getElementById('workbenchShell');
const workbenchLeftColumn = document.getElementById('workbenchLeftColumn');
const markdownFsLayout = document.querySelector('.markdown-fs-layout');

const createWorkbenchForm = document.getElementById('createWorkbenchForm');
const createWorkbenchTitle = document.getElementById('createWorkbenchTitle');
const createWorkbenchDescription = document.getElementById('createWorkbenchDescription');
const createWorkbenchCourse = document.getElementById('createWorkbenchCourse');
const createWorkbenchVisibility = document.getElementById('createWorkbenchVisibility');
const createWorkbenchButton = document.getElementById('createWorkbenchButton');
const createWorkbenchMessage = document.getElementById('createWorkbenchMessage');
const createWorkbenchDirectSection = document.getElementById('createWorkbenchDirectSection');
const createRequestDivider = document.getElementById('createRequestDivider');

const requestWorkbenchForm = document.getElementById('requestWorkbenchForm');
const requestWorkbenchTitle = document.getElementById('requestWorkbenchTitle');
const requestWorkbenchDescription = document.getElementById('requestWorkbenchDescription');
const requestWorkbenchButton = document.getElementById('requestWorkbenchButton');
const requestWorkbenchMessage = document.getElementById('requestWorkbenchMessage');

const workbenchSearchInput = document.getElementById('workbenchSearchInput');
const refreshWorkbenchListButton = document.getElementById('refreshWorkbenchListButton');
const workbenchList = document.getElementById('workbenchList');
const workbenchCount = document.getElementById('workbenchCount');
const workbenchListMessage = document.getElementById('workbenchListMessage');
const workbenchListBody = document.getElementById('workbenchListBody');
const toggleWorkbenchListButton = document.getElementById('toggleWorkbenchListButton');

const refreshRequestQueueButton = document.getElementById('refreshRequestQueueButton');
const requestQueueList = document.getElementById('requestQueueList');
const requestQueueCount = document.getElementById('requestQueueCount');
const requestQueueMessage = document.getElementById('requestQueueMessage');

const activeWorkbenchTitle = document.getElementById('activeWorkbenchTitle');
const activeWorkbenchDescription = document.getElementById('activeWorkbenchDescription');
const activeWorkbenchMeta = document.getElementById('activeWorkbenchMeta');
const activeWorkbenchVisibility = document.getElementById('activeWorkbenchVisibility');
const activeWorkbenchStatus = document.getElementById('activeWorkbenchStatus');
const activeWorkbenchOwner = document.getElementById('activeWorkbenchOwner');
const activeWorkbenchAi = document.getElementById('activeWorkbenchAi');
const joinWorkbenchButton = document.getElementById('joinWorkbenchButton');
const refreshWorkbenchDetailButton = document.getElementById('refreshWorkbenchDetailButton');
const workbenchDetailMessage = document.getElementById('workbenchDetailMessage');

const memberManageForm = document.getElementById('memberManageForm');
const memberSearchInput = document.getElementById('memberSearchInput');
const memberSearchResults = document.getElementById('memberSearchResults');
const memberSelectedInput = document.getElementById('memberSelectedInput');
const memberRoleInput = document.getElementById('memberRoleInput');
const memberManageButton = document.getElementById('memberManageButton');
const memberManageMessage = document.getElementById('memberManageMessage');
const workbenchMembersList = document.getElementById('workbenchMembersList');

const pendingTransferBox = document.getElementById('pendingTransferBox');
const ownershipTransferForm = document.getElementById('ownershipTransferForm');
const transferToUidInput = document.getElementById('transferToUidInput');
const transferHoursInput = document.getElementById('transferHoursInput');
const transferNoteInput = document.getElementById('transferNoteInput');
const transferRequestButton = document.getElementById('transferRequestButton');
const transferRequestMessage = document.getElementById('transferRequestMessage');
const ownershipTransferRespondForm = document.getElementById('ownershipTransferRespondForm');
const transferRespondNoteInput = document.getElementById('transferRespondNoteInput');
const transferAcceptButton = document.getElementById('transferAcceptButton');
const transferRejectButton = document.getElementById('transferRejectButton');
const transferRespondMessage = document.getElementById('transferRespondMessage');

const nodeCreateForm = document.getElementById('nodeCreateForm');
const nodeEditorTitle = document.getElementById('nodeEditorTitle');
const nodeEditorHint = document.getElementById('nodeEditorHint');
const nodeEditorCancelButton = document.getElementById('nodeEditorCancelButton');
const nodeEditorBody = document.getElementById('nodeEditorBody');
const toggleNodeEditorButton = document.getElementById('toggleNodeEditorButton');
const nodeTitleInput = document.getElementById('nodeTitleInput');
const nodeVisibilityInput = document.getElementById('nodeVisibilityInput');
const nodeSortOrderInput = document.getElementById('nodeSortOrderInput');
const nodeMarkdownField = document.getElementById('nodeMarkdownField');
const nodeMarkdownInput = document.getElementById('nodeMarkdownInput');
const nodeCreateButton = document.getElementById('nodeCreateButton');
const workbenchNodesList = document.getElementById('workbenchNodesList');
const directoryPath = document.getElementById('directoryPath');
const directoryRootButton = document.getElementById('directoryRootButton');
const directoryWorkspaceButton = document.getElementById('directoryWorkspaceButton');
const directoryRecycleButton = document.getElementById('directoryRecycleButton');
const addFileButton = document.getElementById('addFileButton');
const addFolderButton = document.getElementById('addFolderButton');
const directoryPasteButton = document.getElementById('directoryPasteButton');
const directoryCancelPasteButton = document.getElementById('directoryCancelPasteButton');
const directoryPendingOperationMessage = document.getElementById('directoryPendingOperationMessage');
const directoryActionMessage = document.getElementById('directoryActionMessage');
const nodeCreateMessage = document.getElementById('nodeCreateMessage') || directoryActionMessage;
const markdownViewerPane = document.getElementById('markdownViewerPane');
const markdownViewerTitle = document.getElementById('markdownViewerTitle');
const markdownViewerMeta = document.getElementById('markdownViewerMeta');
const markdownViewerContent = document.getElementById('markdownViewerContent');
const markdownViewerToggleModeButton = document.getElementById('markdownViewerToggleModeButton');
const markdownViewerCloseButton = document.getElementById('markdownViewerCloseButton');
const markdownViewerEditForm = document.getElementById('markdownViewerEditForm');
const markdownViewerTitleInput = document.getElementById('markdownViewerTitleInput');
const markdownViewerVisibilityInput = document.getElementById('markdownViewerVisibilityInput');
const markdownViewerSortOrderInput = document.getElementById('markdownViewerSortOrderInput');
const markdownViewerMarkdownInput = document.getElementById('markdownViewerMarkdownInput');
const markdownViewerSaveButton = document.getElementById('markdownViewerSaveButton');
const markdownViewerCancelEditButton = document.getElementById('markdownViewerCancelEditButton');
const markdownViewerEditMessage = document.getElementById('markdownViewerEditMessage');

const edgeSelectionForm = document.getElementById('edgeSelectionForm');
const edgeSelectedLabel = document.getElementById('edgeSelectedLabel');
const edgeSelectedDescriptionInput = document.getElementById('edgeSelectedDescriptionInput');
const edgeUpdateButton = document.getElementById('edgeUpdateButton');
const edgeDeleteButton = document.getElementById('edgeDeleteButton');
const edgeSelectionMessage = document.getElementById('edgeSelectionMessage');
const workbenchEdgesList = document.getElementById('workbenchEdgesList');
const graphCanvasViewport = document.getElementById('graphCanvasViewport');
const graphCanvasEdges = document.getElementById('graphCanvasEdges');
const graphCanvasNodes = document.getElementById('graphCanvasNodes');
const graphCanvasEmpty = document.getElementById('graphCanvasEmpty');
const graphEdgeTooltip = document.getElementById('graphEdgeTooltip');
const graphCanvasMessage = document.getElementById('graphCanvasMessage');
const boardLayout = document.getElementById('boardLayout');
const boardNodeSourceSelect = document.getElementById('boardNodeSourceSelect');
const boardNodeSearchInput = document.getElementById('boardNodeSearchInput');
const boardNodeQuickList = document.getElementById('boardNodeQuickList');
const boardAddNodeButton = document.getElementById('boardAddNodeButton');
const boardResetLayoutButton = document.getElementById('boardResetLayoutButton');
const boardExpandCanvasButton = document.getElementById('boardExpandCanvasButton');

const noteCreateForm = document.getElementById('noteCreateForm');
const noteTargetTypeInput = document.getElementById('noteTargetTypeInput');
const noteTargetIdInput = document.getElementById('noteTargetIdInput');
const noteContentInput = document.getElementById('noteContentInput');
const noteCreateButton = document.getElementById('noteCreateButton');
const noteCreateMessage = document.getElementById('noteCreateMessage');
const aiNoteInstructionInput = document.getElementById('aiNoteInstructionInput');
const noteCreateAiButton = document.getElementById('noteCreateAiButton');
const noteCreateAiMessage = document.getElementById('noteCreateAiMessage');
const workbenchNotesList = document.getElementById('workbenchNotesList');
const boardAiChatForm = document.getElementById('boardAiChatForm');
const boardAiChatList = document.getElementById('boardAiChatList');
const boardAiChatInput = document.getElementById('boardAiChatInput');
const boardAiChatSendButton = document.getElementById('boardAiChatSendButton');
const boardAiChatMessage = document.getElementById('boardAiChatMessage');
const boardPanelToggles = Array.from(document.querySelectorAll('[data-board-panel-toggle]'));

const taskCount = document.getElementById('taskCount');
const taskCreateForm = document.getElementById('taskCreateForm');
const taskTitleInput = document.getElementById('taskTitleInput');
const taskDescriptionInput = document.getElementById('taskDescriptionInput');
const taskTypeInput = document.getElementById('taskTypeInput');
const taskPriorityInput = document.getElementById('taskPriorityInput');
const taskDueAtInput = document.getElementById('taskDueAtInput');
const taskGroupTitleInput = document.getElementById('taskGroupTitleInput');
const taskAssigneeSearchInput = document.getElementById('taskAssigneeSearchInput');
const taskAssigneeSearchResults = document.getElementById('taskAssigneeSearchResults');
const taskAssigneeSelectedList = document.getElementById('taskAssigneeSelectedList');
const taskRequiresFileInput = document.getElementById('taskRequiresFileInput');
const taskCreateButton = document.getElementById('taskCreateButton');
const taskCreateMessage = document.getElementById('taskCreateMessage');
const workbenchTasksList = document.getElementById('workbenchTasksList');
const openCollaborativeTasksModalButton = document.getElementById('openCollaborativeTasksModal');
const collaborativeTasksModal = document.getElementById('collaborativeTasksModal');
const collaborativeTasksModalClose = document.getElementById('collaborativeTasksModalClose');
const collaborativeTasksMessage = document.getElementById('collaborativeTasksMessage');
const collaborativeTasksPending = document.getElementById('collaborativeTasksPending');
const collaborativeTasksOngoing = document.getElementById('collaborativeTasksOngoing');
const collaborativeTasksComplete = document.getElementById('collaborativeTasksComplete');
const workbenchMenuButtons = Array.from(document.querySelectorAll('.workbench-menu-button[data-workbench-view]'));
const workbenchPanels = Array.from(document.querySelectorAll('[data-workbench-panel]'));

const state = {
  me: null,
  canCreateWorkbenchDirect: false,
  selectedWorkbenchId: null,
  workbenches: [],
  workbenchSearchQuery: '',
  workbenchDetail: null,
  tasks: [],
  taskboardAvailable: true,
  reviewRequestsAvailable: false,
  reviewRequests: [],
  workbenchAiEnabled: true,
  activeWorkbenchView: 'overview',
  boardChat: {
    messages: [],
  },
  memberPicker: {
    query: '',
    selected: null,
    results: [],
    searchToken: 0,
    searchTimer: null,
  },
  taskAssigneePicker: {
    query: '',
    selected: [],
    results: [],
    searchToken: 0,
    searchTimer: null,
  },
  boardPicker: {
    query: '',
    items: [],
  },
  graph: {
    draggingNodeId: null,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    nodeStartX: 0,
    nodeStartY: 0,
    selectedEdgeId: null,
    connectingFromNodeId: null,
    connectingFromSide: '',
    connectPointerId: null,
    connectPointerX: 0,
    connectPointerY: 0,
  },
  ui: {
    workbenchListCollapsed: false,
    nodeEditorCollapsed: false,
    boardCanvasExpanded: false,
  },
  directory: {
    roots: null,
    currentParentId: null,
    currentPath: [],
    children: [],
    inRecycleBin: false,
    pendingOperation: null,
    menuNodeId: null,
    editingNodeId: null,
    creatingFile: false,
    viewerMode: false,
    viewerEditMode: false,
    viewingNodeId: null,
  },
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

document.addEventListener('click', closeMemberSearchOnOutsideClick);
document.addEventListener('click', closeTaskAssigneeSearchOnOutsideClick);

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

function toggleHidden(element, hidden) {
  if (!element) return;
  element.classList.toggle('is-hidden', hidden);
}

function setMessage(element, text, type = 'error') {
  if (!element) return;
  element.textContent = text || '';
  element.classList.toggle('is-success', type === 'success');
}

function clearMessage(element) {
  setMessage(element, '', 'error');
}

function normalizePlatformRole(roleValue) {
  const normalized = String(roleValue || '').trim().toLowerCase();
  if (!normalized) return 'member';
  if (normalized === 'administrator') return 'admin';
  if (normalized === 'student') return 'member';
  return normalized;
}

function viewerCanCreateWorkbenchDirect(profile) {
  const role = normalizePlatformRole(
    (profile && (profile.platformRole || profile.platform_role || profile.role || profile.userType || profile.user_type)) || ''
  );
  return role === 'owner' || role === 'admin' || role === 'professor';
}

function applyCreateWorkbenchVisibility() {
  const canCreateDirect = Boolean(state.canCreateWorkbenchDirect);
  toggleHidden(createWorkbenchDirectSection, !canCreateDirect);
  toggleHidden(createRequestDivider, !canCreateDirect);
}

function isFiniteNumber(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isNodePlacedOnGraph(node) {
  if (!node || typeof node !== 'object') return false;
  return isFiniteNumber(node.positionX) && isFiniteNumber(node.positionY);
}

function getNodeTypeLabel(node) {
  return node && String(node.nodeType || '').toLowerCase() === 'folder' ? 'Folder' : 'Item';
}

function getNodeTypeIcon(node) {
  return node && String(node.nodeType || '').toLowerCase() === 'folder' ? '📁' : '📄';
}

function getBoardNodeById(nodeId) {
  const detail = state.workbenchDetail;
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  const numericId = parsePositiveInt(nodeId);
  if (!numericId) return null;
  const node = nodes.find((entry) => Number(entry.id) === Number(numericId)) || null;
  if (!node || isSystemDirectoryNode(node)) return null;
  return node;
}

function getBoardEdgeById(edgeId) {
  const detail = state.workbenchDetail;
  const edges = detail && Array.isArray(detail.edges) ? detail.edges : [];
  const numericId = parsePositiveInt(edgeId);
  if (!numericId) return null;
  return edges.find((entry) => Number(entry.id) === Number(numericId)) || null;
}

function getEdgeDisplayLabel(edge) {
  if (!edge) return '';
  const detail = state.workbenchDetail;
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  const fromNode = nodes.find((node) => Number(node.id) === Number(edge.fromNodeId));
  const toNode = nodes.find((node) => Number(node.id) === Number(edge.toNodeId));
  const fromLabel = fromNode ? fromNode.title : `Node #${edge.fromNodeId}`;
  const toLabel = toNode ? toNode.title : `Node #${edge.toNodeId}`;
  return `#${edge.id} ${fromLabel} -> ${toLabel}`;
}

function getNodePortCoordinates(nodeElement, side) {
  if (!nodeElement) return { x: 0, y: 0 };
  const viewportRect = graphCanvasViewport
    ? graphCanvasViewport.getBoundingClientRect()
    : { left: 0, top: 0 };
  const normalized = String(side || '').trim().toLowerCase();

  // Prefer the actual rendered port center so edges always snap to the chosen port.
  const portElement = normalized
    ? nodeElement.querySelector(`.graph-node-port[data-side="${normalized}"]`)
    : null;
  if (portElement && graphCanvasViewport) {
    const portRect = portElement.getBoundingClientRect();
    return {
      x: (portRect.left - viewportRect.left) + (portRect.width || 0) / 2,
      y: (portRect.top - viewportRect.top) + (portRect.height || 0) / 2,
    };
  }

  const nodeRect = nodeElement.getBoundingClientRect();
  const left = nodeRect.left - viewportRect.left;
  const top = nodeRect.top - viewportRect.top;
  const width = nodeRect.width || nodeElement.offsetWidth || 0;
  const height = nodeRect.height || nodeElement.offsetHeight || 0;
  if (normalized === 'top') {
    return { x: left + width / 2, y: top };
  }
  if (normalized === 'bottom') {
    return { x: left + width / 2, y: top + height };
  }
  if (normalized === 'left') {
    return { x: left, y: top + height / 2 };
  }
  return { x: left + width, y: top + height / 2 };
}

function resolveEdgePortSides(fromElement, toElement) {
  const viewportRect = graphCanvasViewport
    ? graphCanvasViewport.getBoundingClientRect()
    : { left: 0, top: 0 };
  const fromRect = fromElement.getBoundingClientRect();
  const toRect = toElement.getBoundingClientRect();
  const fromCenterX = (fromRect.left - viewportRect.left) + (fromRect.width || fromElement.offsetWidth || 0) / 2;
  const fromCenterY = (fromRect.top - viewportRect.top) + (fromRect.height || fromElement.offsetHeight || 0) / 2;
  const toCenterX = (toRect.left - viewportRect.left) + (toRect.width || toElement.offsetWidth || 0) / 2;
  const toCenterY = (toRect.top - viewportRect.top) + (toRect.height || toElement.offsetHeight || 0) / 2;
  const dx = toCenterX - fromCenterX;
  const dy = toCenterY - fromCenterY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: 'right', toSide: 'left' }
      : { fromSide: 'left', toSide: 'right' };
  }
  return dy >= 0
    ? { fromSide: 'bottom', toSide: 'top' }
    : { fromSide: 'top', toSide: 'bottom' };
}

function resetGraphConnectionState() {
  state.graph.connectingFromNodeId = null;
  state.graph.connectingFromSide = '';
  state.graph.connectPointerId = null;
}

async function createEdgeFromCanvas(fromNodeId, toNodeId, fromAnchor = 'right', toAnchor = 'left') {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  if (!workbenchId || !fromNodeId || !toNodeId || Number(fromNodeId) === Number(toNodeId)) {
    setMessage(graphCanvasMessage, 'Select two different nodes to connect.');
    return;
  }
  await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/edges`, {
    method: 'POST',
    body: {
      fromNodeId: Number(fromNodeId),
      toNodeId: Number(toNodeId),
      fromAnchor: String(fromAnchor || 'right'),
      toAnchor: String(toAnchor || 'left'),
      description: '',
    },
  });
  setMessage(graphCanvasMessage, 'Edge created.', 'success');
  await loadWorkbenchDetail(workbenchId);
}

async function removeNodeFromBoard(nodeId) {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const node = getBoardNodeById(nodeId);
  if (!workbenchId || !node) {
    setMessage(graphCanvasMessage, 'Node not found on this board.');
    return;
  }
  if (!isNodePlacedOnGraph(node)) {
    setMessage(graphCanvasMessage, 'Node is not currently on the canvas.');
    return;
  }
  await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/nodes/${encodeURIComponent(node.id)}`, {
    method: 'PATCH',
    body: {
      positionX: null,
      positionY: null,
    },
  });
  node.positionX = null;
  node.positionY = null;
  if (Number(state.graph.draggingNodeId) === Number(node.id)) {
    state.graph.draggingNodeId = null;
  }
  setMessage(graphCanvasMessage, `"${node.title || `Node #${node.id}`}" removed from canvas.`, 'success');
  renderGraphCanvas();
  updateWorkbenchSelectOptions();
}

function renderGraphEdgeSelectionUi() {
  const edge = getBoardEdgeById(state.graph.selectedEdgeId);
  if (!edge) {
    state.graph.selectedEdgeId = null;
    toggleHidden(edgeSelectionForm, true);
    clearMessage(edgeSelectionMessage);
    return;
  }
  toggleHidden(edgeSelectionForm, false);
  if (edgeSelectedLabel) {
    edgeSelectedLabel.textContent = getEdgeDisplayLabel(edge);
  }
  if (edgeSelectedDescriptionInput) {
    edgeSelectedDescriptionInput.value = edge.description || '';
  }
}

function selectGraphEdge(edgeId, options = {}) {
  const edge = getBoardEdgeById(edgeId);
  if (!edge) {
    state.graph.selectedEdgeId = null;
    renderGraphEdgeSelectionUi();
    renderGraphEdges();
    renderEdgeList();
    return;
  }
  state.graph.selectedEdgeId = Number(edge.id);
  if (noteTargetTypeInput && noteTargetIdInput) {
    noteTargetTypeInput.value = 'edge';
    updateWorkbenchSelectOptions();
    noteTargetIdInput.value = String(edge.id);
  }
  if (options.openBoard) {
    setWorkbenchView('board');
  }
  renderGraphEdgeSelectionUi();
  renderGraphEdges();
  renderEdgeList();
}

function isSystemDirectoryNode(node) {
  const detail = state.workbenchDetail;
  const roots = detail && detail.directoryRoots ? detail.directoryRoots : null;
  if (!node || !roots) return false;
  const nodeId = Number(node.id);
  return (
    nodeId === Number(roots.rootId) ||
    nodeId === Number(roots.workspaceFolderId) ||
    nodeId === Number(roots.recycleBinId)
  );
}

function hideGraphEdgeTooltip() {
  if (!graphEdgeTooltip) return;
  graphEdgeTooltip.classList.add('is-hidden');
}

function showGraphEdgeTooltip(edge, event) {
  if (!graphEdgeTooltip || !graphCanvasViewport) return;
  const detail = state.workbenchDetail;
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  const from = nodes.find((node) => Number(node.id) === Number(edge.fromNodeId));
  const to = nodes.find((node) => Number(node.id) === Number(edge.toNodeId));
  const connection = `${from ? from.title : edge.fromNodeId} -> ${to ? to.title : edge.toNodeId}`;
  graphEdgeTooltip.textContent = edge.description
    ? `${connection}: ${edge.description}`
    : `${connection}: No description`;
  const viewportRect = graphCanvasViewport.getBoundingClientRect();
  const tooltipWidth = 260;
  const left = clamp(
    event.clientX - viewportRect.left + 14,
    8,
    Math.max(8, viewportRect.width - tooltipWidth - 8)
  );
  const top = clamp(
    event.clientY - viewportRect.top + 12,
    8,
    Math.max(8, viewportRect.height - 80)
  );
  graphEdgeTooltip.style.left = `${left}px`;
  graphEdgeTooltip.style.top = `${top}px`;
  graphEdgeTooltip.classList.remove('is-hidden');
}

function renderGraphEdges() {
  if (!graphCanvasEdges || !graphCanvasNodes || !graphCanvasViewport) return;
  graphCanvasEdges.innerHTML = '';
  const detail = state.workbenchDetail;
  const edges = detail && Array.isArray(detail.edges) ? detail.edges : [];
  const viewportWidth = graphCanvasViewport.clientWidth || 0;
  const viewportHeight = graphCanvasViewport.clientHeight || 0;
  graphCanvasEdges.setAttribute('viewBox', `0 0 ${Math.max(1, viewportWidth)} ${Math.max(1, viewportHeight)}`);

  const nodeElements = new Map();
  Array.from(graphCanvasNodes.querySelectorAll('[data-node-id]')).forEach((element) => {
    const nodeId = parsePositiveInt(element.dataset.nodeId);
    if (nodeId) {
      nodeElements.set(nodeId, element);
    }
  });

  edges.forEach((edge) => {
    const fromElement = nodeElements.get(Number(edge.fromNodeId));
    const toElement = nodeElements.get(Number(edge.toNodeId));
    if (!fromElement || !toElement) return;
    const portSides = resolveEdgePortSides(fromElement, toElement);
    const fromSide = ['top', 'right', 'bottom', 'left'].includes(String(edge.fromAnchor || '').toLowerCase())
      ? String(edge.fromAnchor).toLowerCase()
      : portSides.fromSide;
    const toSide = ['top', 'right', 'bottom', 'left'].includes(String(edge.toAnchor || '').toLowerCase())
      ? String(edge.toAnchor).toLowerCase()
      : portSides.toSide;
    const fromPoint = getNodePortCoordinates(fromElement, fromSide);
    const toPoint = getNodePortCoordinates(toElement, toSide);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(fromPoint.x));
    line.setAttribute('y1', String(fromPoint.y));
    line.setAttribute('x2', String(toPoint.x));
    line.setAttribute('y2', String(toPoint.y));
    line.classList.add('graph-edge-line');
    if (Number(state.graph.selectedEdgeId) === Number(edge.id)) {
      line.classList.add('is-selected');
    }
    line.addEventListener('mouseenter', (event) => showGraphEdgeTooltip(edge, event));
    line.addEventListener('mousemove', (event) => showGraphEdgeTooltip(edge, event));
    line.addEventListener('mouseleave', hideGraphEdgeTooltip);
    line.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectGraphEdge(edge.id);
      setMessage(graphCanvasMessage, `Selected ${getEdgeDisplayLabel(edge)}.`, 'success');
    });
    graphCanvasEdges.appendChild(line);
  });

  if (state.graph.connectingFromNodeId && state.graph.connectingFromSide) {
    const sourceElement = nodeElements.get(Number(state.graph.connectingFromNodeId));
    if (sourceElement) {
      const startPoint = getNodePortCoordinates(sourceElement, state.graph.connectingFromSide);
      const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tempLine.setAttribute('x1', String(startPoint.x));
      tempLine.setAttribute('y1', String(startPoint.y));
      tempLine.setAttribute('x2', String(state.graph.connectPointerX || startPoint.x));
      tempLine.setAttribute('y2', String(state.graph.connectPointerY || startPoint.y));
      tempLine.classList.add('graph-edge-line', 'graph-edge-line-temporary');
      graphCanvasEdges.appendChild(tempLine);
    }
  }
}

async function persistNodeBoardPosition(node) {
  if (!node) return;
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const nodeId = parsePositiveInt(node.id);
  if (!workbenchId || !nodeId) return;
  await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    body: {
      positionX: Number(node.positionX || 0),
      positionY: Number(node.positionY || 0),
    },
  });
}

function getNextBoardPosition() {
  const detail = state.workbenchDetail;
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  const placedCount = nodes.filter((node) => !isSystemDirectoryNode(node) && isNodePlacedOnGraph(node)).length;
  const viewportWidth = graphCanvasViewport ? graphCanvasViewport.clientWidth : 900;
  const viewportHeight = graphCanvasViewport ? graphCanvasViewport.clientHeight : 560;
  const columns = Math.max(3, Math.floor(Math.max(1, viewportWidth) / 220));
  const col = placedCount % columns;
  const row = Math.floor(placedCount / columns);
  const x = clamp(48 + col * 210, 20, Math.max(20, viewportWidth - 190));
  const y = clamp(44 + row * 132, 20, Math.max(20, viewportHeight - 110));
  return { x, y };
}

async function placeNodeOnBoard(nodeId, options = {}) {
  const node = getBoardNodeById(nodeId);
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  if (!node || !workbenchId) {
    setMessage(graphCanvasMessage, 'Select a workbench node first.');
    return;
  }
  if (isNodePlacedOnGraph(node)) {
    if (options.openBoard) {
      setWorkbenchView('board');
    }
    setMessage(graphCanvasMessage, `"${node.title}" is already on the canvas.`, 'success');
    return;
  }

  const { x, y } = getNextBoardPosition();
  node.positionX = x;
  node.positionY = y;
  try {
    await persistNodeBoardPosition(node);
    if (options.openBoard) {
      setWorkbenchView('board');
    }
    renderGraphCanvas();
    setMessage(graphCanvasMessage, `"${node.title}" added to canvas.`, 'success');
  } catch (error) {
    node.positionX = null;
    node.positionY = null;
    setMessage(graphCanvasMessage, error.message || 'Unable to add node to canvas.');
  }
}

async function autoLayoutBoardNodes() {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const detail = state.workbenchDetail;
  const nodes = detail && Array.isArray(detail.nodes)
    ? detail.nodes.filter((node) => !isSystemDirectoryNode(node))
    : [];
  if (!workbenchId || !nodes.length) {
    setMessage(graphCanvasMessage, 'No nodes available for layout.');
    return;
  }
  const viewportWidth = graphCanvasViewport ? graphCanvasViewport.clientWidth : 900;
  const viewportHeight = graphCanvasViewport ? graphCanvasViewport.clientHeight : 560;
  const columns = Math.max(3, Math.floor(Math.max(1, viewportWidth) / 220));
  const startX = 46;
  const startY = 34;
  const xStep = 206;
  const yStep = 128;

  const updates = nodes.map((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = clamp(startX + col * xStep, 20, Math.max(20, viewportWidth - 190));
    const y = clamp(startY + row * yStep, 20, Math.max(20, viewportHeight - 100));
    return { node, x, y };
  });

  try {
    await Promise.all(
      updates.map(async ({ node, x, y }) => {
        node.positionX = x;
        node.positionY = y;
        await persistNodeBoardPosition(node);
      })
    );
    renderGraphCanvas();
    setMessage(graphCanvasMessage, 'Auto layout applied.', 'success');
  } catch (error) {
    setMessage(graphCanvasMessage, error.message || 'Unable to auto layout board.');
  }
}

function onGraphPointerMove(event) {
  if (!state.graph.draggingNodeId || !graphCanvasViewport || !graphCanvasNodes) return;
  if (state.graph.dragPointerId != null && event.pointerId !== state.graph.dragPointerId) return;

  const draggingNode = getBoardNodeById(state.graph.draggingNodeId);
  if (!draggingNode) return;

  const viewportRect = graphCanvasViewport.getBoundingClientRect();
  const dx = event.clientX - state.graph.dragStartX;
  const dy = event.clientY - state.graph.dragStartY;
  const nextX = clamp(
    state.graph.nodeStartX + dx,
    10,
    Math.max(10, viewportRect.width - 190)
  );
  const nextY = clamp(
    state.graph.nodeStartY + dy,
    10,
    Math.max(10, viewportRect.height - 98)
  );

  draggingNode.positionX = nextX;
  draggingNode.positionY = nextY;
  const nodeElement = graphCanvasNodes.querySelector(`[data-node-id="${draggingNode.id}"]`);
  if (nodeElement) {
    nodeElement.style.left = `${nextX}px`;
    nodeElement.style.top = `${nextY}px`;
  }
  renderGraphEdges();
}

function onGraphPointerUp(event) {
  if (!state.graph.draggingNodeId) return;
  if (state.graph.dragPointerId != null && event.pointerId !== state.graph.dragPointerId) return;

  const node = getBoardNodeById(state.graph.draggingNodeId);
  state.graph.draggingNodeId = null;
  state.graph.dragPointerId = null;
  window.removeEventListener('pointermove', onGraphPointerMove);
  window.removeEventListener('pointerup', onGraphPointerUp);
  window.removeEventListener('pointercancel', onGraphPointerUp);

  if (!node) return;
  persistNodeBoardPosition(node).catch((error) => {
    setMessage(graphCanvasMessage, error.message || 'Unable to save node position.');
  });
}

function onGraphConnectPointerMove(event) {
  if (!state.graph.connectingFromNodeId) return;
  if (state.graph.connectPointerId != null && event.pointerId !== state.graph.connectPointerId) return;
  if (!graphCanvasViewport) return;
  const viewportRect = graphCanvasViewport.getBoundingClientRect();
  state.graph.connectPointerX = clamp(
    event.clientX - viewportRect.left,
    0,
    Math.max(0, viewportRect.width)
  );
  state.graph.connectPointerY = clamp(
    event.clientY - viewportRect.top,
    0,
    Math.max(0, viewportRect.height)
  );
  renderGraphEdges();
}

function onGraphConnectPointerUp(event) {
  if (!state.graph.connectingFromNodeId) return;
  if (state.graph.connectPointerId != null && event.pointerId !== state.graph.connectPointerId) return;
  const fromNodeId = Number(state.graph.connectingFromNodeId || 0);
  const fromSide = String(state.graph.connectingFromSide || 'right');
  resetGraphConnectionState();
  window.removeEventListener('pointermove', onGraphConnectPointerMove);
  window.removeEventListener('pointerup', onGraphConnectPointerUp);
  window.removeEventListener('pointercancel', onGraphConnectPointerUp);
  renderGraphEdges();

  const dropElement = typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
    ? document.elementFromPoint(event.clientX, event.clientY)
    : null;
  const targetElement = dropElement && typeof dropElement.closest === 'function'
    ? dropElement.closest('.graph-node-port')
    : null;
  const toNodeId = parsePositiveInt(targetElement && targetElement.dataset ? targetElement.dataset.nodeId : null);
  const toSide = targetElement && targetElement.dataset
    ? String(targetElement.dataset.side || 'left').toLowerCase()
    : 'left';
  if (!fromNodeId || !toNodeId || Number(fromNodeId) === Number(toNodeId)) {
    return;
  }

  createEdgeFromCanvas(fromNodeId, toNodeId, fromSide, toSide).catch((error) => {
    setMessage(graphCanvasMessage, error.message || 'Unable to create edge.');
  });
}

function beginGraphPortConnection(nodeId, side, event) {
  const numericNodeId = parsePositiveInt(nodeId);
  const normalizedSide = String(side || '').trim().toLowerCase();
  if (!numericNodeId || !['top', 'right', 'bottom', 'left'].includes(normalizedSide)) return;
  if (!graphCanvasViewport) return;

  const viewportRect = graphCanvasViewport.getBoundingClientRect();
  state.graph.connectingFromNodeId = Number(numericNodeId);
  state.graph.connectingFromSide = normalizedSide;
  state.graph.connectPointerId = event.pointerId;
  state.graph.connectPointerX = clamp(
    event.clientX - viewportRect.left,
    0,
    Math.max(0, viewportRect.width)
  );
  state.graph.connectPointerY = clamp(
    event.clientY - viewportRect.top,
    0,
    Math.max(0, viewportRect.height)
  );
  window.addEventListener('pointermove', onGraphConnectPointerMove);
  window.addEventListener('pointerup', onGraphConnectPointerUp);
  window.addEventListener('pointercancel', onGraphConnectPointerUp);
  renderGraphEdges();
}

function renderGraphCanvas() {
  if (!graphCanvasNodes || !graphCanvasEdges) return;
  hideGraphEdgeTooltip();
  graphCanvasNodes.innerHTML = '';
  const detail = state.workbenchDetail;
  const permissions = getActivePermissions();
  const canManageNodes = Boolean(permissions && permissions.canManageNodes);
  const canCreateNodes = Boolean(permissions && permissions.canCreateNodes);
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  const placedNodes = nodes.filter((node) => !isSystemDirectoryNode(node) && isNodePlacedOnGraph(node));

  if (graphCanvasEmpty) {
    toggleHidden(graphCanvasEmpty, placedNodes.length > 0);
  }

  if (!placedNodes.length) {
    renderGraphEdges();
    return;
  }

  placedNodes.forEach((node) => {
    const nodeButton = document.createElement('button');
    nodeButton.type = 'button';
    nodeButton.className = `graph-node graph-node-${String(node.nodeType || 'file').toLowerCase() === 'folder' ? 'folder' : 'file'}`;
    nodeButton.dataset.nodeId = String(node.id);
    nodeButton.style.left = `${Number(node.positionX)}px`;
    nodeButton.style.top = `${Number(node.positionY)}px`;

    const type = document.createElement('span');
    type.className = 'graph-node-type';
    type.textContent = `${getNodeTypeIcon(node)} ${getNodeTypeLabel(node)} node`;
    const title = document.createElement('strong');
    title.className = 'graph-node-title';
    title.textContent = node.title || `Node #${node.id}`;
    nodeButton.appendChild(type);
    nodeButton.appendChild(title);

    nodeButton.addEventListener('click', () => {
      state.graph.selectedEdgeId = null;
      renderGraphEdgeSelectionUi();
      renderGraphEdges();
      renderEdgeList();
      if (noteTargetTypeInput && noteTargetTypeInput.value === 'node' && noteTargetIdInput) {
        noteTargetIdInput.value = String(node.id);
      }
    });

    if (canCreateNodes) {
      nodeButton.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const confirmed = window.confirm(`Remove "${node.title || `Node #${node.id}`}" from canvas?`);
        if (!confirmed) return;
        removeNodeFromBoard(node.id).catch((error) => {
          setMessage(graphCanvasMessage, error.message || 'Unable to remove node from canvas.');
        });
      });
    }

    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      const port = document.createElement('span');
      port.className = `graph-node-port graph-node-port-${side}`;
      if (!canManageNodes) {
        port.classList.add('is-readonly');
      }
      port.dataset.nodeId = String(node.id);
      port.dataset.side = side;
      port.title = `Connect from ${side}`;
      if (canManageNodes) {
        port.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          beginGraphPortConnection(node.id, side, event);
        });
      }
      nodeButton.appendChild(port);
    });

    if (canManageNodes) {
      nodeButton.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        state.graph.draggingNodeId = Number(node.id);
        state.graph.dragPointerId = event.pointerId;
        state.graph.dragStartX = event.clientX;
        state.graph.dragStartY = event.clientY;
        state.graph.nodeStartX = Number(node.positionX || 0);
        state.graph.nodeStartY = Number(node.positionY || 0);
        window.addEventListener('pointermove', onGraphPointerMove);
        window.addEventListener('pointerup', onGraphPointerUp);
        window.addEventListener('pointercancel', onGraphPointerUp);
      });
    }

    graphCanvasNodes.appendChild(nodeButton);
  });

  renderGraphEdges();
}

function renderBoardAiChatMessages() {
  if (!boardAiChatList) return;
  boardAiChatList.innerHTML = '';
  const messages = state.boardChat && Array.isArray(state.boardChat.messages) ? state.boardChat.messages : [];
  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'board-ai-empty';
    empty.textContent = 'Ask AI to analyze this board structure.';
    boardAiChatList.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const bubble = document.createElement('article');
    bubble.className = `board-ai-bubble ${message.role === 'assistant' ? 'assistant' : 'user'}`;
    const role = document.createElement('span');
    role.className = 'board-ai-role';
    role.textContent = message.role === 'assistant' ? 'AI' : 'You';
    const content = document.createElement('p');
    content.textContent = message.content || '';
    bubble.appendChild(role);
    bubble.appendChild(content);
    boardAiChatList.appendChild(bubble);
  });
  boardAiChatList.scrollTop = boardAiChatList.scrollHeight;
}

function syncBoardPanelToggleState(button) {
  if (!button) return;
  const panel = button.closest('.board-panel');
  if (!panel) return;
  const expanded = !panel.classList.contains('is-collapsed');
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function resetBoardChat() {
  state.boardChat.messages = [];
  clearMessage(boardAiChatMessage);
  renderBoardAiChatMessages();
}

function panelSupportsView(panel, view) {
  const panelViews = String(panel.dataset.workbenchPanel || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return panelViews.includes(view);
}

function setWorkbenchView(view) {
  const requested = String(view || '').trim().toLowerCase();
  let nextView = requested || 'overview';
  if (nextView === 'review' && state.reviewRequestsAvailable !== true) {
    nextView = 'overview';
  }
  state.activeWorkbenchView = nextView;
  if (nextView !== 'markdown' && state.directory.viewerMode) {
    state.directory.viewerMode = false;
    state.directory.viewerEditMode = false;
    state.directory.viewingNodeId = null;
  }
  if (nextView !== 'markdown') {
    state.directory.creatingFile = false;
  }
  if (nextView !== 'board') {
    hideGraphEdgeTooltip();
    resetGraphConnectionState();
    window.removeEventListener('pointermove', onGraphConnectPointerMove);
    window.removeEventListener('pointerup', onGraphConnectPointerUp);
    window.removeEventListener('pointercancel', onGraphConnectPointerUp);
  }

  workbenchMenuButtons.forEach((button) => {
    const buttonView = String(button.dataset.workbenchView || '').toLowerCase();
    if (buttonView === 'review') {
      toggleHidden(button, state.reviewRequestsAvailable !== true);
    }
    button.classList.toggle('is-active', buttonView === nextView);
  });

  workbenchPanels.forEach((panel) => {
    const matches = panelSupportsView(panel, nextView);
    const isReviewPanel = panel.id === 'requestReviewCard';
    const hidden = isReviewPanel
      ? state.reviewRequestsAvailable !== true || !matches
      : !matches;
    toggleHidden(panel, hidden);
  });
  updateFileViewLayout();
  if (nextView === 'board') {
    window.requestAnimationFrame(() => {
      renderGraphCanvas();
    });
  }
}

function updateWorkbenchAiUi(enabled, message) {
  state.workbenchAiEnabled = enabled !== false;
  if (activeWorkbenchAi) {
    activeWorkbenchAi.classList.remove('ai-enabled', 'ai-disabled');
    activeWorkbenchAi.classList.add(state.workbenchAiEnabled ? 'ai-enabled' : 'ai-disabled');
    if (message) {
      activeWorkbenchAi.textContent = message;
    } else {
      activeWorkbenchAi.textContent = state.workbenchAiEnabled ? 'AI notes: enabled' : 'AI notes: disabled';
    }
  }
  if (noteCreateAiButton) {
    noteCreateAiButton.disabled = !state.workbenchAiEnabled;
    toggleHidden(noteCreateAiButton, !state.workbenchAiEnabled);
  }
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatDateTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildRequestError(message, status = 0, payload = null) {
  const error = new Error(message || 'Request failed.');
  error.status = status;
  error.payload = payload;
  return error;
}

async function parseResponsePayload(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    return data || {};
  }
  const text = await response.text().catch(() => '');
  return { ok: response.ok, message: text || response.statusText };
}

async function apiRequest(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const timeoutMs = Number(options.timeoutMs || 18000);
  const retries = Number.isInteger(options.retries)
    ? Math.max(0, options.retries)
    : (method === 'GET' ? 1 : 0);
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const payload = await parseResponsePayload(response);
      if (!response.ok || payload.ok === false) {
        throw buildRequestError(
          payload && payload.message ? payload.message : `Request failed with status ${response.status}.`,
          response.status,
          payload
        );
      }
      return payload;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const transient = error && (error.name === 'AbortError' || error.message === 'Failed to fetch');
      const shouldRetry = attempt < retries && method === 'GET' && transient;
      if (!shouldRetry) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || buildRequestError('Unable to complete request.');
}

function withButtonBusy(button, busyLabel, fn) {
  if (!button) return Promise.resolve();
  if (button.disabled) return Promise.resolve();
  const original = button.dataset.originalText || button.textContent || '';
  button.dataset.originalText = original;
  button.disabled = true;
  if (busyLabel) button.textContent = busyLabel;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || original;
    });
}

function buildEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  return empty;
}

function getActivePermissions() {
  return (state.workbenchDetail && state.workbenchDetail.permissions) || null;
}

function getFilteredWorkbenches() {
  const query = state.workbenchSearchQuery.trim().toLowerCase();
  if (!query) return state.workbenches.slice();
  return state.workbenches.filter((item) => {
    const title = String(item.title || '').toLowerCase();
    const course = String(item.course || '').toLowerCase();
    return title.includes(query) || course.includes(query);
  });
}

function updateWorkbenchSelectOptions() {
  const detail = state.workbenchDetail;
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  const selectableNodes = nodes.filter((node) => !isSystemDirectoryNode(node));
  const edges = detail && Array.isArray(detail.edges) ? detail.edges : [];
  const previousNoteTarget = noteTargetIdInput ? noteTargetIdInput.value : '';
  const previousSourceNode = boardNodeSourceSelect ? boardNodeSourceSelect.value : '';

  if (noteTargetIdInput) noteTargetIdInput.innerHTML = '';
  if (boardNodeSourceSelect) {
    boardNodeSourceSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select directory item';
    boardNodeSourceSelect.appendChild(placeholder);
  }

  const addOption = (select, value, label) => {
    if (!select) return;
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = label;
    select.appendChild(option);
  };

  state.boardPicker.items = selectableNodes.map((node) => {
    const typeLabel = getNodeTypeLabel(node);
    const icon = getNodeTypeIcon(node);
    const onCanvas = isNodePlacedOnGraph(node);
    return {
      id: Number(node.id),
      title: String(node.title || 'Untitled node'),
      nodeType: String(node.nodeType || 'file').toLowerCase() === 'folder' ? 'folder' : 'file',
      onCanvas,
      label: `#${node.id} [${typeLabel}] ${node.title || 'Untitled node'}`,
      boardLabel: `${icon} #${node.id} [${typeLabel}] ${node.title || 'Untitled node'}${onCanvas ? ' • on canvas' : ''}`,
      searchText: `${node.title || ''} ${typeLabel} ${node.id}`.toLowerCase(),
    };
  });

  selectableNodes.forEach((node) => {
    const pickerItem = state.boardPicker.items.find((entry) => Number(entry.id) === Number(node.id));
    addOption(boardNodeSourceSelect, node.id, pickerItem ? pickerItem.boardLabel : `#${node.id} ${node.title || 'Untitled node'}`);
  });

  const mode = noteTargetTypeInput ? noteTargetTypeInput.value : 'node';
  if (mode === 'edge') {
    edges.forEach((edge) => {
      const from = selectableNodes.find((n) => Number(n.id) === Number(edge.fromNodeId));
      const to = selectableNodes.find((n) => Number(n.id) === Number(edge.toNodeId));
      if (!from || !to) return;
      const label = `#${edge.id} ${from ? from.title : edge.fromNodeId} -> ${to ? to.title : edge.toNodeId}`;
      addOption(noteTargetIdInput, edge.id, label);
    });
  } else {
    selectableNodes.forEach((node) => {
      const typeLabel = getNodeTypeLabel(node);
      const label = `#${node.id} [${typeLabel}] ${node.title || 'Untitled node'}`;
      addOption(noteTargetIdInput, node.id, label);
    });
  }

  if (noteTargetIdInput && previousNoteTarget) {
    noteTargetIdInput.value = previousNoteTarget;
  }
  if (boardNodeSourceSelect && previousSourceNode) {
    boardNodeSourceSelect.value = previousSourceNode;
  }
  renderBoardNodeQuickList();

  if (state.graph.selectedEdgeId && !getBoardEdgeById(state.graph.selectedEdgeId)) {
    state.graph.selectedEdgeId = null;
  }
  renderGraphEdgeSelectionUi();
  renderEdgeList();
}

function renderBoardNodeQuickList() {
  if (!boardNodeQuickList) return;
  boardNodeQuickList.innerHTML = '';
  const allItems = Array.isArray(state.boardPicker.items) ? state.boardPicker.items : [];
  const query = String(state.boardPicker.query || '').trim().toLowerCase();
  const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
  const filtered = !tokens.length
    ? allItems
    : allItems.filter((item) => tokens.every((token) => item.searchText.includes(token)));
  const limited = filtered.slice(0, 20);

  if (!limited.length) {
    const empty = document.createElement('p');
    empty.className = 'board-node-quick-empty';
    empty.textContent = 'No matching directory items.';
    boardNodeQuickList.appendChild(empty);
    return;
  }

  limited.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `board-node-quick-item ${item.nodeType === 'folder' ? 'is-folder' : 'is-file'}`;
    if (boardNodeSourceSelect && Number(boardNodeSourceSelect.value) === Number(item.id)) {
      button.classList.add('is-selected');
    }
    button.innerHTML = `
      <span class="board-node-quick-icon">${item.nodeType === 'folder' ? '📁' : '📄'}</span>
      <span class="board-node-quick-main">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="board-node-quick-meta">#${escapeHtml(item.id)} • ${escapeHtml(item.nodeType === 'folder' ? 'Folder' : 'Item')}${item.onCanvas ? ' • On canvas' : ''}</span>
      </span>
    `;
    button.addEventListener('click', () => {
      if (boardNodeSourceSelect) {
        boardNodeSourceSelect.value = String(item.id);
      }
      renderBoardNodeQuickList();
    });
    boardNodeQuickList.appendChild(button);
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

function setDirectoryPendingOperation(operation) {
  state.directory.pendingOperation = operation || null;
  const hasPending = Boolean(state.directory.pendingOperation);
  toggleHidden(directoryPasteButton, !hasPending);
  toggleHidden(directoryCancelPasteButton, !hasPending);
  if (directoryPendingOperationMessage) {
    if (!hasPending) {
      directoryPendingOperationMessage.textContent = '';
      directoryPendingOperationMessage.classList.remove('is-success');
      return;
    }
    const op = state.directory.pendingOperation;
    directoryPendingOperationMessage.textContent = `${op.type === 'move' ? 'Move' : 'Copy'} ready: ${op.title || `#${op.nodeId}`}. Open a target folder then click "Paste here".`;
    directoryPendingOperationMessage.classList.remove('is-success');
  }
}

function renderDirectoryPath() {
  if (!directoryPath) return;
  const segments = Array.isArray(state.directory.currentPath) ? state.directory.currentPath : [];
  directoryPath.innerHTML = '';
  if (!segments.length) {
    directoryPath.textContent = 'Select a workbench to load directory.';
    return;
  }
  const fragment = document.createDocumentFragment();
  segments.forEach((segment, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'path-segment';
    button.textContent = segment.title || (index === 0 ? 'root' : `#${segment.id}`);
    button.dataset.parentId = String(segment.id);
    button.addEventListener('click', () => {
      loadDirectory({ parentId: Number(segment.id) }).catch((error) => {
        setMessage(nodeCreateMessage, error.message || 'Unable to open folder path.');
      });
    });
    fragment.appendChild(button);
    if (index < segments.length - 1) {
      const divider = document.createElement('span');
      divider.className = 'path-divider';
      divider.textContent = '/';
      fragment.appendChild(divider);
    }
  });
  directoryPath.appendChild(fragment);
}

function updateDirectoryTypeUi() {
  if (nodeMarkdownField) {
    nodeMarkdownField.classList.remove('is-hidden');
  }
  if (nodeMarkdownInput) {
    nodeMarkdownInput.disabled = false;
  }
}

function updateCollapsibleUi() {
  if (workbenchListBody) {
    toggleHidden(workbenchListBody, state.ui.workbenchListCollapsed);
  }
  if (toggleWorkbenchListButton) {
    toggleWorkbenchListButton.textContent = state.ui.workbenchListCollapsed ? 'Expand' : 'Collapse';
  }

  if (nodeEditorBody) {
    toggleHidden(nodeEditorBody, state.ui.nodeEditorCollapsed);
  }
  if (toggleNodeEditorButton) {
    toggleNodeEditorButton.textContent = state.ui.nodeEditorCollapsed ? 'Expand' : 'Collapse';
  }
  updateFileViewLayout();
}

function updateBoardCanvasExpandedUi() {
  if (boardLayout) {
    boardLayout.classList.toggle('is-canvas-expanded', state.ui.boardCanvasExpanded === true);
  }
  if (boardExpandCanvasButton) {
    const expanded = state.ui.boardCanvasExpanded === true;
    boardExpandCanvasButton.textContent = expanded ? 'Collapse canvas' : 'Expand canvas';
    boardExpandCanvasButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  if (state.activeWorkbenchView === 'board') {
    window.requestAnimationFrame(() => {
      renderGraphCanvas();
    });
  }
}

function formatInlineMarkdown(text) {
  let out = escapeHtml(text || '');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function renderMarkdownHtml(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let inCodeBlock = false;
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    html.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  lines.forEach((line) => {
    const raw = String(line || '');
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      closeList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        html.push('<pre><code>');
      } else {
        inCodeBlock = false;
        html.push('</code></pre>');
      }
      return;
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(raw)}\n`);
      return;
    }

    if (!trimmed) {
      closeList();
      html.push('<p class="viewer-spacer"></p>');
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = Math.max(1, Math.min(6, headingMatch[1].length));
      html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${formatInlineMarkdown(orderedMatch[2])}</li>`);
      return;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`);
      return;
    }

    closeList();
    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      html.push(`<blockquote>${formatInlineMarkdown(quoteMatch[1])}</blockquote>`);
      return;
    }

    html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  });

  closeList();
  if (inCodeBlock) {
    html.push('</code></pre>');
  }
  return html.join('');
}

function updateFileViewLayout() {
  const inViewerMode = state.directory.viewerMode === true;
  const hasVisibleLeftPanel = Boolean(
    workbenchLeftColumn
    && Array.from(workbenchLeftColumn.querySelectorAll('[data-workbench-panel]')).some((panel) => !panel.classList.contains('is-hidden'))
  );
  const useSinglePaneLayout = !inViewerMode && !hasVisibleLeftPanel;
  if (workbenchShell) {
    workbenchShell.classList.toggle('file-view-active', inViewerMode);
    workbenchShell.classList.toggle('single-pane-view', useSinglePaneLayout);
  }
  if (workbenchLeftColumn) {
    toggleHidden(workbenchLeftColumn, inViewerMode || useSinglePaneLayout);
  }
  if (markdownFsLayout) {
    markdownFsLayout.classList.toggle('file-view-active', inViewerMode);
  }
  if (markdownViewerPane) {
    toggleHidden(markdownViewerPane, !inViewerMode);
  }
  if (nodeEditorBody) {
    toggleHidden(nodeEditorBody, inViewerMode || state.ui.nodeEditorCollapsed);
  }
  if (toggleNodeEditorButton) {
    toggleHidden(toggleNodeEditorButton, inViewerMode);
  }
  updateMarkdownViewerModeUi();
}

function updateMarkdownViewerModeUi() {
  const inViewerMode = state.directory.viewerMode === true;
  const permissions = getActivePermissions();
  const canEditFile = Boolean(permissions && permissions.canCreateNodes);
  if (!canEditFile && state.directory.viewerEditMode) {
    state.directory.viewerEditMode = false;
  }
  const inEditMode = inViewerMode && state.directory.viewerEditMode === true;
  if (markdownViewerPane) {
    markdownViewerPane.classList.toggle('is-editing', inEditMode);
  }
  if (markdownViewerToggleModeButton) {
    markdownViewerToggleModeButton.textContent = inEditMode ? 'View mode' : 'Edit mode';
    markdownViewerToggleModeButton.disabled = !inViewerMode || !canEditFile;
  }
  if (markdownViewerContent) {
    toggleHidden(markdownViewerContent, inEditMode);
  }
  if (markdownViewerEditForm) {
    toggleHidden(markdownViewerEditForm, !inEditMode);
  }
  [markdownViewerTitleInput, markdownViewerVisibilityInput, markdownViewerSortOrderInput, markdownViewerMarkdownInput, markdownViewerSaveButton].forEach((element) => {
    if (!element) return;
    element.disabled = !canEditFile;
  });
}

function populateMarkdownViewerEditForm(node) {
  if (!node || node.nodeType !== 'file') return;
  if (markdownViewerTitleInput) markdownViewerTitleInput.value = node.title || '';
  if (markdownViewerVisibilityInput) markdownViewerVisibilityInput.value = node.visibility || 'private';
  if (markdownViewerSortOrderInput) markdownViewerSortOrderInput.value = String(Number(node.sortOrder || 0));
  if (markdownViewerMarkdownInput) markdownViewerMarkdownInput.value = node.markdown || '';
}

function setMarkdownViewerEditMode(enabled) {
  state.directory.viewerEditMode = Boolean(enabled) && state.directory.viewerMode === true;
  updateMarkdownViewerModeUi();
}

function openMarkdownViewer(node, options = {}) {
  if (!node || node.nodeType !== 'file') return;
  const preserveMode = options && options.preserveMode === true;
  const openInEditMode = options && options.editMode === true;
  state.directory.viewerMode = true;
  state.directory.viewingNodeId = Number(node.id);
  if (!preserveMode) {
    state.directory.viewerEditMode = openInEditMode;
  } else if (openInEditMode) {
    state.directory.viewerEditMode = true;
  }
  state.ui.nodeEditorCollapsed = true;
  if (markdownViewerTitle) {
    markdownViewerTitle.textContent = node.title || `File #${node.id}`;
  }
  if (markdownViewerMeta) {
    markdownViewerMeta.textContent = `#${node.id} • ${node.visibility || 'private'} • Updated ${formatDateTime(node.updatedAt)}`;
  }
  if (markdownViewerContent) {
    const rendered = renderMarkdownHtml(node.markdown || '');
    markdownViewerContent.innerHTML = rendered || '<p class="viewer-empty">This markdown file is empty.</p>';
  }
  populateMarkdownViewerEditForm(node);
  clearMessage(markdownViewerEditMessage);
  clearDirectoryEditorForm();
  updateCollapsibleUi();
  renderNodeList();
}

function closeMarkdownViewer() {
  state.directory.viewerMode = false;
  state.directory.viewerEditMode = false;
  state.directory.viewingNodeId = null;
  if (markdownViewerContent) {
    markdownViewerContent.innerHTML = '<p class="viewer-empty">Open a markdown file to view its content.</p>';
  }
  clearMessage(markdownViewerEditMessage);
  updateCollapsibleUi();
  renderNodeList();
}

function getCurrentViewingNode() {
  const viewingNodeId = parsePositiveInt(state.directory.viewingNodeId);
  if (!viewingNodeId) return null;
  return (state.directory.children || []).find((entry) => Number(entry.id) === Number(viewingNodeId)) || null;
}

function setDirectoryMenuNodeId(nodeId) {
  state.directory.menuNodeId = parsePositiveInt(nodeId);
}

function clearDirectoryEditorForm() {
  state.directory.editingNodeId = null;
  if (nodeEditorTitle) nodeEditorTitle.textContent = 'Create Markdown File';
  if (nodeEditorHint) {
    nodeEditorHint.textContent = 'Use this panel to create or edit markdown files.';
  }
  if (nodeTitleInput) nodeTitleInput.value = '';
  if (nodeVisibilityInput) nodeVisibilityInput.value = 'private';
  if (nodeSortOrderInput) nodeSortOrderInput.value = '0';
  if (nodeMarkdownInput) nodeMarkdownInput.value = '';
  if (nodeCreateButton) nodeCreateButton.textContent = 'Create file';
  toggleHidden(nodeEditorCancelButton, true);
  updateDirectoryTypeUi();
}

function setDirectoryEditorFromFile(node) {
  if (!node || node.nodeType !== 'file') return;
  state.directory.editingNodeId = Number(node.id);
  state.ui.nodeEditorCollapsed = false;
  updateCollapsibleUi();
  if (nodeEditorTitle) nodeEditorTitle.textContent = `Editing: ${node.title || `File #${node.id}`}`;
  if (nodeEditorHint) nodeEditorHint.textContent = `Path file #${node.id}. Save changes from this panel.`;
  if (nodeTitleInput) nodeTitleInput.value = node.title || '';
  if (nodeVisibilityInput) nodeVisibilityInput.value = node.visibility || 'private';
  if (nodeSortOrderInput) nodeSortOrderInput.value = String(Number(node.sortOrder || 0));
  if (nodeMarkdownInput) nodeMarkdownInput.value = node.markdown || '';
  if (nodeCreateButton) nodeCreateButton.textContent = 'Save file';
  toggleHidden(nodeEditorCancelButton, false);
  updateDirectoryTypeUi();
}

async function showDirectoryProperties(nodeId) {
  const data = await apiRequest(`/api/workbench/${encodeURIComponent(state.selectedWorkbenchId)}/directory/${encodeURIComponent(nodeId)}/properties`);
  const props = data && data.properties ? data.properties : null;
  if (!props) throw new Error('No properties found.');
  const pathLabel = Array.isArray(props.path) ? props.path.map((entry) => entry.title).join('/') : '';
  const summary = [
    `Title: ${props.title}`,
    `Type: ${props.nodeType}`,
    `Visibility: ${props.visibility}`,
    `Children: ${props.childCount}`,
    `Size(bytes): ${props.markdownBytes}`,
    `Created by: ${props.createdByUid}`,
    `Path: ${pathLabel}`,
  ].join('\n');
  window.alert(summary);
}

async function setDirectoryVisibility(node, visibility) {
  await apiRequest(`/api/workbench/${encodeURIComponent(state.selectedWorkbenchId)}/directory/${encodeURIComponent(node.id)}/visibility`, {
    method: 'PATCH',
    body: {
      visibility,
      applyRecursively: node.nodeType === 'folder',
    },
  });
}

async function moveNodeToRecycleBin(nodeId) {
  await apiRequest(`/api/workbench/${encodeURIComponent(state.selectedWorkbenchId)}/directory/${encodeURIComponent(nodeId)}/trash`, {
    method: 'POST',
    body: {},
  });
}

async function restoreNodeFromRecycleBin(nodeId) {
  await apiRequest(`/api/workbench/${encodeURIComponent(state.selectedWorkbenchId)}/directory/${encodeURIComponent(nodeId)}/restore`, {
    method: 'POST',
    body: {},
  });
}

async function permanentlyDeleteNode(nodeId) {
  await apiRequest(`/api/workbench/${encodeURIComponent(state.selectedWorkbenchId)}/directory/${encodeURIComponent(nodeId)}/permanent`, {
    method: 'DELETE',
  });
}

async function generateDirectoryShareLink(nodeId) {
  const data = await apiRequest(`/api/workbench/${encodeURIComponent(state.selectedWorkbenchId)}/directory/${encodeURIComponent(nodeId)}/share`, {
    method: 'POST',
    body: {},
  });
  const link = data && data.shareLink ? data.shareLink : '';
  if (!link) throw new Error('Share link unavailable.');
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(link);
    return;
  }
  window.prompt('Copy this share link', link);
}

function renderWorkbenchList() {
  if (!workbenchList) return;
  workbenchList.innerHTML = '';
  const items = getFilteredWorkbenches();
  if (workbenchCount) {
    workbenchCount.textContent = String(items.length);
  }
  if (!items.length) {
    workbenchList.appendChild(buildEmptyState('No workbenches found.'));
    return;
  }

  items.forEach((workbench) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workbench-item';
    if (Number(state.selectedWorkbenchId) === Number(workbench.id)) {
      button.classList.add('is-active');
    }
    button.innerHTML = `
      <h3>${workbench.title || 'Untitled workbench'}</h3>
      <p class="item-meta">${workbench.course || 'No course'} • ${workbench.visibility || 'invite_only'} • ${workbench.status || 'active'}</p>
      <p class="item-meta">Owner: ${workbench.ownerName || workbench.ownerUid || 'Member'}</p>
    `;
    button.addEventListener('click', () => {
      selectWorkbench(Number(workbench.id));
    });
    workbenchList.appendChild(button);
  });
}

async function loadWorkbenchList(options = {}) {
  const preserveSelected = options.preserveSelected !== false;
  const focusWorkbenchId = parsePositiveInt(options.focusWorkbenchId);
  clearMessage(workbenchListMessage);
  try {
    const data = await apiRequest('/api/workbench');
    state.workbenches = Array.isArray(data.workbenches) ? data.workbenches : [];
    renderWorkbenchList();

    let targetId = null;
    if (focusWorkbenchId) {
      targetId = focusWorkbenchId;
    } else if (preserveSelected && parsePositiveInt(state.selectedWorkbenchId)) {
      const match = state.workbenches.find((item) => Number(item.id) === Number(state.selectedWorkbenchId));
      targetId = match ? Number(match.id) : null;
    } else if (state.workbenches.length) {
      targetId = Number(state.workbenches[0].id);
    }

    if (targetId) {
      await selectWorkbench(targetId);
    } else {
      state.selectedWorkbenchId = null;
      state.workbenchDetail = null;
      state.tasks = [];
      renderWorkbenchDetail();
      renderTaskList();
    }
  } catch (error) {
    state.workbenches = [];
    renderWorkbenchList();
    setMessage(workbenchListMessage, error.message || 'Unable to load workbench list.');
  }
}

async function loadRequestQueue() {
  if (!requestQueueList) return;
  clearMessage(requestQueueMessage);
  try {
    const data = await apiRequest('/api/workbench/requests?status=pending');
    state.reviewRequests = Array.isArray(data.requests) ? data.requests : [];
    state.reviewRequestsAvailable = true;
    renderRequestQueue();
    setWorkbenchView(state.activeWorkbenchView);
  } catch (error) {
    state.reviewRequests = [];
    const status = Number(error && error.status);
    if (status === 403 || status === 404) {
      state.reviewRequestsAvailable = false;
      setWorkbenchView(state.activeWorkbenchView);
      return;
    }
    state.reviewRequestsAvailable = true;
    renderRequestQueue();
    setMessage(requestQueueMessage, error.message || 'Unable to load review queue.');
    setWorkbenchView(state.activeWorkbenchView);
  }
}

function renderRequestQueue() {
  if (!requestQueueList) return;
  requestQueueList.innerHTML = '';
  if (requestQueueCount) {
    requestQueueCount.textContent = String(state.reviewRequests.length);
  }
  if (!state.reviewRequests.length) {
    requestQueueList.appendChild(buildEmptyState('No pending requests.'));
    return;
  }

  state.reviewRequests.forEach((request) => {
    const item = document.createElement('article');
    item.className = 'request-item';
    const noteInputId = `request-note-${request.id}`;
    item.innerHTML = `
      <h4>${request.title || 'Untitled request'}</h4>
      <p class="item-meta">By ${request.requesterName || request.requesterUid || 'Member'} • ${request.course || 'No course'}</p>
      <p class="item-meta">Visibility: ${request.visibility || 'invite_only'}</p>
      <p class="item-meta">${request.description || 'No description provided.'}</p>
      <label for="${noteInputId}">
        <span class="item-meta">Review note</span>
      </label>
      <input id="${noteInputId}" type="text" maxlength="1000" placeholder="Optional note" />
      <div class="item-actions">
        <button type="button" data-action="approve">Approve</button>
        <button type="button" data-action="reject">Reject</button>
      </div>
    `;

    const noteInput = item.querySelector('input');
    const approveButton = item.querySelector('button[data-action="approve"]');
    const rejectButton = item.querySelector('button[data-action="reject"]');
    const handleReview = async (action, button) => {
      await withButtonBusy(button, action === 'approve' ? 'Approving...' : 'Rejecting...', async () => {
        await apiRequest(`/api/workbench/requests/${encodeURIComponent(request.id)}/review`, {
          method: 'POST',
          body: {
            action,
            note: noteInput ? noteInput.value.trim() : '',
          },
        });
        setMessage(requestQueueMessage, `Request "${request.title}" ${action}d.`, 'success');
        await Promise.all([
          loadRequestQueue(),
          loadWorkbenchList({ preserveSelected: true }),
        ]);
      }).catch((error) => {
        setMessage(requestQueueMessage, error.message || 'Unable to review request.');
      });
    };

    if (approveButton) {
      approveButton.addEventListener('click', () => {
        handleReview('approve', approveButton);
      });
    }
    if (rejectButton) {
      rejectButton.addEventListener('click', () => {
        handleReview('reject', rejectButton);
      });
    }
    requestQueueList.appendChild(item);
  });
}

function renderMemberList() {
  if (!workbenchMembersList) return;
  workbenchMembersList.innerHTML = '';
  const detail = state.workbenchDetail;
  const members = detail && Array.isArray(detail.members) ? detail.members : [];
  if (!members.length) {
    workbenchMembersList.appendChild(buildEmptyState('No members loaded.'));
    return;
  }
  members.forEach((member) => {
    const item = document.createElement('article');
    item.className = 'compact-item';
    item.innerHTML = `
      <h4>${member.name || member.uid || 'Member'}</h4>
      <p class="item-meta">${member.uid || ''}</p>
      <p class="item-meta">Role: ${member.role || 'member'} • ${member.state || 'active'}</p>
    `;
    workbenchMembersList.appendChild(item);
  });
}

function getMemberCandidateDisplayName(candidate) {
  if (!candidate || typeof candidate !== 'object') return 'Member';
  return String(candidate.displayName || candidate.username || candidate.email || candidate.uid || 'Member').trim() || 'Member';
}

function getMemberCandidateSearchLabel(candidate) {
  const displayName = getMemberCandidateDisplayName(candidate);
  const username = String(candidate && candidate.username ? candidate.username : '').trim();
  if (username && username.toLowerCase() !== displayName.toLowerCase()) {
    return `${displayName} (@${username})`;
  }
  return displayName;
}

function getMemberCandidateMeta(candidate) {
  const parts = [];
  const email = String(candidate && candidate.email ? candidate.email : '').trim();
  const uid = String(candidate && candidate.uid ? candidate.uid : '').trim();
  const memberState = String(candidate && candidate.memberState ? candidate.memberState : '').trim().toLowerCase();
  const memberRole = String(candidate && candidate.memberRole ? candidate.memberRole : '').trim().toLowerCase();
  if (email) parts.push(email);
  if (uid) parts.push(`UID: ${uid}`);
  if (memberState === 'active') {
    parts.push(`Current role: ${memberRole || 'member'}`);
  } else if (memberState === 'pending') {
    parts.push('Pending member');
  }
  return parts.join(' • ');
}

function setSelectedMemberCandidate(candidate, options = {}) {
  const keepSearchText = options.keepSearchText === true;
  if (!candidate || !candidate.uid) {
    state.memberPicker.selected = null;
    if (memberSelectedInput) memberSelectedInput.value = '';
    if (!keepSearchText && memberSearchInput) memberSearchInput.value = '';
    return;
  }
  state.memberPicker.selected = {
    uid: String(candidate.uid),
    displayName: getMemberCandidateDisplayName(candidate),
    username: String(candidate.username || '').trim(),
    email: String(candidate.email || '').trim(),
    memberRole: String(candidate.memberRole || '').trim(),
    memberState: String(candidate.memberState || '').trim(),
  };
  if (memberSelectedInput) {
    memberSelectedInput.value = `${state.memberPicker.selected.displayName} (${state.memberPicker.selected.uid})`;
  }
  if (!keepSearchText && memberSearchInput) {
    memberSearchInput.value = getMemberCandidateSearchLabel(state.memberPicker.selected);
  }
}

function renderMemberSearchResults(statusText = '') {
  if (!memberSearchResults) return;
  memberSearchResults.innerHTML = '';
  const text = String(statusText || '').trim();
  if (text) {
    const status = document.createElement('p');
    status.className = 'member-search-status';
    status.textContent = text;
    memberSearchResults.appendChild(status);
    toggleHidden(memberSearchResults, false);
    return;
  }

  const results = state.memberPicker && Array.isArray(state.memberPicker.results) ? state.memberPicker.results : [];
  if (!results.length) {
    toggleHidden(memberSearchResults, true);
    return;
  }

  results.forEach((candidate) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'member-search-item';
    const selectedUid = state.memberPicker && state.memberPicker.selected ? state.memberPicker.selected.uid : '';
    if (selectedUid && String(selectedUid) === String(candidate.uid || '')) {
      button.classList.add('is-selected');
    }

    const primary = document.createElement('strong');
    primary.className = 'member-search-primary';
    primary.textContent = getMemberCandidateSearchLabel(candidate);
    const meta = document.createElement('span');
    meta.className = 'member-search-meta';
    meta.textContent = getMemberCandidateMeta(candidate);
    button.appendChild(primary);
    button.appendChild(meta);
    button.addEventListener('click', () => {
      setSelectedMemberCandidate(candidate);
      state.memberPicker.results = [];
      renderMemberSearchResults();
      clearMessage(memberManageMessage);
    });
    memberSearchResults.appendChild(button);
  });
  toggleHidden(memberSearchResults, false);
}

function resetMemberPicker(options = {}) {
  const keepSearchText = options.keepSearchText === true;
  if (state.memberPicker.searchTimer) {
    clearTimeout(state.memberPicker.searchTimer);
    state.memberPicker.searchTimer = null;
  }
  state.memberPicker.searchToken += 1;
  state.memberPicker.results = [];
  setSelectedMemberCandidate(null, { keepSearchText });
  renderMemberSearchResults();
}

function queueMemberCandidateSearch() {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const query = memberSearchInput ? memberSearchInput.value.trim() : '';
  state.memberPicker.query = query;
  if (!workbenchId) {
    state.memberPicker.results = [];
    renderMemberSearchResults();
    return;
  }
  if (query.length < 2) {
    state.memberPicker.results = [];
    renderMemberSearchResults(query ? 'Type at least 2 characters.' : '');
    return;
  }
  if (state.memberPicker.searchTimer) {
    clearTimeout(state.memberPicker.searchTimer);
  }
  const searchToken = state.memberPicker.searchToken + 1;
  state.memberPicker.searchToken = searchToken;
  state.memberPicker.searchTimer = setTimeout(async () => {
    try {
      renderMemberSearchResults('Searching users...');
      const data = await apiRequest(
        `/api/workbench/${encodeURIComponent(workbenchId)}/member-candidates?q=${encodeURIComponent(query)}`
      );
      if (state.memberPicker.searchToken !== searchToken) return;
      state.memberPicker.results = Array.isArray(data.candidates) ? data.candidates : [];
      if (!state.memberPicker.results.length) {
        renderMemberSearchResults('No matching users found.');
        return;
      }
      renderMemberSearchResults();
    } catch (error) {
      if (state.memberPicker.searchToken !== searchToken) return;
      state.memberPicker.results = [];
      renderMemberSearchResults(error.message || 'Unable to search users.');
    }
  }, 260);
}

function closeMemberSearchOnOutsideClick(event) {
  if (!memberManageForm || !memberSearchResults) return;
  if (memberSearchResults.classList.contains('is-hidden')) return;
  if (memberManageForm.contains(event.target)) return;
  toggleHidden(memberSearchResults, true);
}

function getTaskAssigneeId(candidate) {
  if (!candidate || typeof candidate !== 'object') return '';
  const value = String(candidate.assigneeId || candidate.username || candidate.studentNumber || candidate.email || candidate.uid || '').trim();
  return value;
}

function getTaskAssigneeDisplayName(candidate) {
  if (!candidate || typeof candidate !== 'object') return 'Member';
  return String(candidate.displayName || candidate.username || candidate.email || candidate.uid || 'Member').trim() || 'Member';
}

function getTaskAssigneeMeta(candidate) {
  const idValue = getTaskAssigneeId(candidate);
  const email = String(candidate && candidate.email ? candidate.email : '').trim();
  const role = String(candidate && candidate.role ? candidate.role : '').trim();
  const parts = [];
  if (idValue) parts.push(`ID: ${idValue}`);
  if (email && email.toLowerCase() !== idValue.toLowerCase()) parts.push(email);
  if (role) parts.push(`Role: ${role}`);
  return parts.join(' • ');
}

function renderTaskAssigneeSelectedList() {
  if (!taskAssigneeSelectedList) return;
  taskAssigneeSelectedList.innerHTML = '';
  const selected = state.taskAssigneePicker && Array.isArray(state.taskAssigneePicker.selected)
    ? state.taskAssigneePicker.selected
    : [];
  if (!selected.length) {
    const empty = document.createElement('p');
    empty.className = 'task-assignee-empty';
    empty.textContent = 'No assignees selected. Task will default to you.';
    taskAssigneeSelectedList.appendChild(empty);
    return;
  }
  selected.forEach((candidate) => {
    const chip = document.createElement('span');
    chip.className = 'task-assignee-chip';

    const label = document.createElement('span');
    const display = getTaskAssigneeDisplayName(candidate);
    const idValue = getTaskAssigneeId(candidate);
    label.textContent = idValue ? `${display} (${idValue})` : display;
    chip.appendChild(label);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'task-assignee-chip-remove';
    removeButton.setAttribute('aria-label', `Remove ${display}`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      state.taskAssigneePicker.selected = selected.filter((entry) => String(entry.uid || '') !== String(candidate.uid || ''));
      renderTaskAssigneeSelectedList();
    });
    chip.appendChild(removeButton);
    taskAssigneeSelectedList.appendChild(chip);
  });
}

function renderTaskAssigneeSearchResults(statusText = '') {
  if (!taskAssigneeSearchResults) return;
  taskAssigneeSearchResults.innerHTML = '';
  const text = String(statusText || '').trim();
  if (text) {
    const status = document.createElement('p');
    status.className = 'task-assignee-search-status';
    status.textContent = text;
    taskAssigneeSearchResults.appendChild(status);
    toggleHidden(taskAssigneeSearchResults, false);
    return;
  }
  const results = state.taskAssigneePicker && Array.isArray(state.taskAssigneePicker.results)
    ? state.taskAssigneePicker.results
    : [];
  if (!results.length) {
    toggleHidden(taskAssigneeSearchResults, true);
    return;
  }
  const selectedSet = new Set(
    (state.taskAssigneePicker.selected || []).map((entry) => String(entry.uid || ''))
  );
  results.forEach((candidate) => {
    const uid = String(candidate && candidate.uid ? candidate.uid : '');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task-assignee-search-item';
    if (selectedSet.has(uid)) {
      button.classList.add('is-selected');
    }
    const title = document.createElement('strong');
    title.className = 'task-assignee-search-title';
    title.textContent = getTaskAssigneeDisplayName(candidate);
    const meta = document.createElement('span');
    meta.className = 'task-assignee-search-meta';
    meta.textContent = getTaskAssigneeMeta(candidate);
    button.appendChild(title);
    button.appendChild(meta);
    button.addEventListener('click', () => {
      if (!uid) return;
      if (!selectedSet.has(uid)) {
        state.taskAssigneePicker.selected.push({
          uid,
          assigneeId: getTaskAssigneeId(candidate),
          displayName: getTaskAssigneeDisplayName(candidate),
          username: String(candidate.username || '').trim(),
          studentNumber: String(candidate.studentNumber || '').trim(),
          email: String(candidate.email || '').trim(),
          role: String(candidate.role || '').trim(),
        });
        renderTaskAssigneeSelectedList();
      }
      if (taskAssigneeSearchInput) {
        taskAssigneeSearchInput.value = '';
      }
      state.taskAssigneePicker.query = '';
      state.taskAssigneePicker.results = [];
      renderTaskAssigneeSearchResults();
      clearMessage(taskCreateMessage);
    });
    taskAssigneeSearchResults.appendChild(button);
  });
  toggleHidden(taskAssigneeSearchResults, false);
}

function resetTaskAssigneePicker(options = {}) {
  const keepSelected = options.keepSelected === true;
  const keepSearchText = options.keepSearchText === true;
  if (state.taskAssigneePicker.searchTimer) {
    clearTimeout(state.taskAssigneePicker.searchTimer);
    state.taskAssigneePicker.searchTimer = null;
  }
  state.taskAssigneePicker.searchToken += 1;
  state.taskAssigneePicker.results = [];
  if (!keepSelected) {
    state.taskAssigneePicker.selected = [];
  }
  if (!keepSearchText && taskAssigneeSearchInput) {
    taskAssigneeSearchInput.value = '';
  }
  renderTaskAssigneeSearchResults();
  renderTaskAssigneeSelectedList();
}

function queueTaskAssigneeSearch() {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const query = taskAssigneeSearchInput ? taskAssigneeSearchInput.value.trim() : '';
  state.taskAssigneePicker.query = query;
  if (!workbenchId) {
    state.taskAssigneePicker.results = [];
    renderTaskAssigneeSearchResults();
    return;
  }
  if (query.length === 1) {
    state.taskAssigneePicker.results = [];
    renderTaskAssigneeSearchResults('Type at least 2 characters.');
    return;
  }
  if (state.taskAssigneePicker.searchTimer) {
    clearTimeout(state.taskAssigneePicker.searchTimer);
  }
  const searchToken = state.taskAssigneePicker.searchToken + 1;
  state.taskAssigneePicker.searchToken = searchToken;
  state.taskAssigneePicker.searchTimer = setTimeout(async () => {
    try {
      renderTaskAssigneeSearchResults('Searching assignees...');
      const queryPart = query
        ? `?q=${encodeURIComponent(query)}`
        : '';
      const data = await apiRequest(
        `/api/workbench/${encodeURIComponent(workbenchId)}/task-assignee-candidates${queryPart}`
      );
      if (state.taskAssigneePicker.searchToken !== searchToken) return;
      state.taskAssigneePicker.results = Array.isArray(data.candidates) ? data.candidates : [];
      if (!state.taskAssigneePicker.results.length) {
        renderTaskAssigneeSearchResults('No matching users found.');
        return;
      }
      renderTaskAssigneeSearchResults();
    } catch (error) {
      if (state.taskAssigneePicker.searchToken !== searchToken) return;
      state.taskAssigneePicker.results = [];
      renderTaskAssigneeSearchResults(error.message || 'Unable to search assignees.');
    }
  }, 260);
}

function closeTaskAssigneeSearchOnOutsideClick(event) {
  if (!taskCreateForm || !taskAssigneeSearchResults) return;
  if (taskAssigneeSearchResults.classList.contains('is-hidden')) return;
  if (taskCreateForm.contains(event.target)) return;
  toggleHidden(taskAssigneeSearchResults, true);
}

function openWorkbenchModal(modal) {
  if (!modal) return;
  modal.classList.remove('is-hidden');
}

function closeWorkbenchModal(modal) {
  if (!modal) return;
  modal.classList.add('is-hidden');
}

function getCollaborativeTaskColumnKey(task) {
  const normalized = String(task && task.status ? task.status : '').trim().toLowerCase();
  if (normalized === 'in_progress') return 'ongoing';
  if (normalized === 'completed' || normalized === 'archived') return 'complete';
  return 'pending';
}

function isCollaborativeTask(task) {
  const normalized = String(task && task.taskType ? task.taskType : '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'collaborative';
}

function buildCollaborativeTaskCard(task, permissions) {
  const card = document.createElement('article');
  card.className = 'workbench-task-item';
  const assigneeText = (task.assignees || []).map((entry) => {
    const name = entry && entry.name ? entry.name : '';
    const assigneeId = entry && entry.assigneeId ? entry.assigneeId : '';
    if (name && assigneeId) return `${name} (${assigneeId})`;
    return name || assigneeId || (entry && entry.uid ? entry.uid : 'Unknown');
  }).join(', ') || 'None';

  card.innerHTML = `
    <strong>${task.title || 'Untitled task'}</strong>
    <p>${task.description || 'No description.'}</p>
    <div class="meta">${task.priority || 'normal'} • ${task.dueAt ? formatDateTime(task.dueAt) : 'No due date'}</div>
    <div class="meta">Assignees: ${assigneeText}</div>
    <div class="workbench-task-status-select">
      <select aria-label="Task status">
        <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>Ongoing</option>
        <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Complete</option>
        <option value="archived" ${task.status === 'archived' ? 'selected' : ''}>Archived</option>
      </select>
    </div>
  `;

  const select = card.querySelector('select');
  const viewerUid = state.me && state.me.uid ? state.me.uid : '';
  const assigneeUids = Array.isArray(task.assignees) ? task.assignees.map((entry) => entry.uid) : [];
  const viewerIsAssignee = viewerUid ? assigneeUids.includes(viewerUid) : false;
  const canManageTasks = Boolean(permissions && permissions.canManageTasks);
  const canUpdateTask = canManageTasks || task.creatorUid === viewerUid || viewerIsAssignee;
  if (!canUpdateTask) {
    select.disabled = true;
    return card;
  }

  select.addEventListener('change', async () => {
    const previousStatus = String(task.status || 'pending');
    const nextStatus = select.value;
    if (nextStatus === previousStatus) return;
    select.disabled = true;
    try {
      await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setMessage(collaborativeTasksMessage, `Task "${task.title}" updated.`, 'success');
      await loadTasks();
    } catch (error) {
      select.value = previousStatus;
      setMessage(collaborativeTasksMessage, error.message || 'Unable to update task.');
    } finally {
      select.disabled = false;
    }
  });
  return card;
}

function renderCollaborativeTaskModal() {
  if (!collaborativeTasksPending || !collaborativeTasksOngoing || !collaborativeTasksComplete) return;
  collaborativeTasksPending.innerHTML = '';
  collaborativeTasksOngoing.innerHTML = '';
  collaborativeTasksComplete.innerHTML = '';

  const selectedId = parsePositiveInt(state.selectedWorkbenchId);
  if (!selectedId) {
    collaborativeTasksPending.appendChild(buildEmptyState('Select a workbench to view collaborative tasks.'));
    collaborativeTasksOngoing.appendChild(buildEmptyState('Select a workbench to view collaborative tasks.'));
    collaborativeTasksComplete.appendChild(buildEmptyState('Select a workbench to view collaborative tasks.'));
    return;
  }

  if (state.taskboardAvailable !== true) {
    collaborativeTasksPending.appendChild(buildEmptyState('Taskboard is currently disabled.'));
    collaborativeTasksOngoing.appendChild(buildEmptyState('Taskboard is currently disabled.'));
    collaborativeTasksComplete.appendChild(buildEmptyState('Taskboard is currently disabled.'));
    return;
  }

  const permissions = getActivePermissions();
  const allTasks = Array.isArray(state.tasks) ? state.tasks : [];
  const collaborativeTasks = allTasks.filter((task) => isCollaborativeTask(task));
  if (!collaborativeTasks.length) {
    collaborativeTasksPending.appendChild(buildEmptyState('No collaborative tasks yet.'));
    collaborativeTasksOngoing.appendChild(buildEmptyState('No collaborative tasks yet.'));
    collaborativeTasksComplete.appendChild(buildEmptyState('No collaborative tasks yet.'));
    return;
  }

  collaborativeTasks.forEach((task) => {
    const card = buildCollaborativeTaskCard(task, permissions);
    const column = getCollaborativeTaskColumnKey(task);
    if (column === 'ongoing') {
      collaborativeTasksOngoing.appendChild(card);
      return;
    }
    if (column === 'complete') {
      collaborativeTasksComplete.appendChild(card);
      return;
    }
    collaborativeTasksPending.appendChild(card);
  });

  if (!collaborativeTasksPending.children.length) {
    collaborativeTasksPending.appendChild(buildEmptyState('No pending collaborative tasks.'));
  }
  if (!collaborativeTasksOngoing.children.length) {
    collaborativeTasksOngoing.appendChild(buildEmptyState('No ongoing collaborative tasks.'));
  }
  if (!collaborativeTasksComplete.children.length) {
    collaborativeTasksComplete.appendChild(buildEmptyState('No completed collaborative tasks.'));
  }
}

function renderInlineFileCreateRow(canCreateNodes) {
  if (!workbenchNodesList || !state.directory.creatingFile) return;

  const row = document.createElement('article');
  row.className = 'directory-row is-creating';

  const icon = document.createElement('span');
  icon.className = 'directory-icon';
  icon.textContent = '\uD83D\uDCC4';
  row.appendChild(icon);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'directory-inline-input';
  input.maxLength = 220;
  input.placeholder = 'New markdown file';
  input.disabled = !canCreateNodes;
  row.appendChild(input);

  const actions = document.createElement('div');
  actions.className = 'directory-inline-actions';

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'secondary-button';
  createButton.textContent = 'Create';
  createButton.disabled = !canCreateNodes;

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'secondary-button';
  cancelButton.textContent = 'Cancel';
  cancelButton.disabled = !canCreateNodes;

  const handleCancel = () => {
    state.directory.creatingFile = false;
    renderNodeList();
  };

  const handleCreate = () => {
    const id = parsePositiveInt(state.selectedWorkbenchId);
    const parentId = parsePositiveInt(state.directory.currentParentId);
    const title = String(input.value || '').trim();
    if (!id || !parentId) {
      setMessage(nodeCreateMessage, 'Select a workbench and directory first.');
      return;
    }
    if (!title) {
      setMessage(nodeCreateMessage, 'File name is required.');
      input.focus();
      return;
    }
    withButtonBusy(createButton, 'Creating...', async () => {
      await apiRequest(`/api/workbench/${encodeURIComponent(id)}/directory`, {
        method: 'POST',
        body: {
          type: 'file',
          title,
          visibility: 'private',
          parentId,
          markdown: '',
          sortOrder: 0,
        },
      });
      state.directory.creatingFile = false;
      setMessage(nodeCreateMessage, 'File created.', 'success');
      await loadWorkbenchDetail(id);
    }).catch((error) => {
      setMessage(nodeCreateMessage, error.message || 'Unable to create file.');
    });
  };

  createButton.addEventListener('click', handleCreate);
  cancelButton.addEventListener('click', handleCancel);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCreate();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  });

  actions.appendChild(createButton);
  actions.appendChild(cancelButton);
  row.appendChild(actions);
  workbenchNodesList.appendChild(row);

  setTimeout(() => input.focus(), 0);
}

function renderNodeList() {
  if (!workbenchNodesList) return;
  workbenchNodesList.innerHTML = '';
  const permissions = getActivePermissions();
  const canCreateNodes = Boolean(permissions && permissions.canCreateNodes);

  renderDirectoryPath();
  if (directoryRootButton) directoryRootButton.disabled = !state.directory.roots;
  if (directoryWorkspaceButton) directoryWorkspaceButton.disabled = !state.directory.roots;
  if (directoryRecycleButton) directoryRecycleButton.disabled = !state.directory.roots;
  if (addFileButton) addFileButton.disabled = !canCreateNodes || state.directory.inRecycleBin;
  if (addFolderButton) addFolderButton.disabled = !canCreateNodes || state.directory.inRecycleBin;
  if (directoryPasteButton) {
    directoryPasteButton.disabled = !state.directory.pendingOperation || !state.directory.currentParentId;
  }
  setDirectoryPendingOperation(state.directory.pendingOperation);
  updateFileViewLayout();

  if (!state.selectedWorkbenchId) {
    workbenchNodesList.appendChild(buildEmptyState('Select a workbench to load directory.'));
    return;
  }

  if (!state.directory.currentParentId) {
    workbenchNodesList.appendChild(buildEmptyState('Directory not loaded yet.'));
    return;
  }

  const children = Array.isArray(state.directory.children) ? state.directory.children : [];
  renderInlineFileCreateRow(canCreateNodes);
  if (!children.length) {
    if (!state.directory.creatingFile) {
      workbenchNodesList.appendChild(
        buildEmptyState(state.directory.inRecycleBin ? 'Recycle-bin is empty.' : 'No files or folders in this directory.')
      );
    }
    return;
  }

  children.forEach((node) => {
    const row = document.createElement('article');
    row.className = 'directory-row';
    if (
      Number(state.directory.editingNodeId) === Number(node.id) ||
      Number(state.directory.viewingNodeId) === Number(node.id)
    ) {
      row.classList.add('is-selected');
    }

    const mainButton = document.createElement('button');
    mainButton.type = 'button';
    mainButton.className = 'directory-row-main';
    mainButton.innerHTML = `
      <span class="directory-icon">${node.nodeType === 'folder' ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
      <span class="directory-name-wrap">
        <span class="directory-name">${escapeHtml(node.title || 'Untitled')}</span>
        <span class="directory-submeta">${node.visibility || 'private'} • ${formatDateTime(node.updatedAt)}</span>
      </span>
    `;
    mainButton.addEventListener('click', () => {
      setDirectoryMenuNodeId(null);
      if (node.nodeType === 'folder') {
        if (state.directory.viewerMode) {
          closeMarkdownViewer();
        }
        loadDirectory({ parentId: Number(node.id) }).catch((error) => {
          setMessage(nodeCreateMessage, error.message || 'Unable to open folder.');
        });
        return;
      }
      openMarkdownViewer(node);
    });
    row.appendChild(mainButton);

    const menuWrap = document.createElement('div');
    menuWrap.className = 'directory-row-menu';
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'directory-menu-trigger';
    menuButton.setAttribute('aria-label', 'File actions');
    menuButton.textContent = '\u22EE';
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = parsePositiveInt(state.directory.menuNodeId);
      if (current && Number(current) === Number(node.id)) {
        setDirectoryMenuNodeId(null);
      } else {
        setDirectoryMenuNodeId(node.id);
      }
      renderNodeList();
    });
    menuWrap.appendChild(menuButton);

    const menu = document.createElement('div');
    menu.className = 'directory-menu';
    menu.classList.toggle('is-hidden', Number(state.directory.menuNodeId) !== Number(node.id));

    const addMenuItem = (label, onClick, options = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `directory-menu-item${options.danger ? ' is-danger' : ''}`;
      button.textContent = label;
      button.disabled = options.disabled === true;
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await onClick(button);
          setDirectoryMenuNodeId(null);
          renderNodeList();
        } catch (error) {
          setMessage(nodeCreateMessage, (error && error.message) || 'Unable to complete action.');
        }
      });
      menu.appendChild(button);
    };

    if (node.nodeType === 'folder') {
      addMenuItem('Open folder', async () => {
        await loadDirectory({ parentId: Number(node.id) });
      });
    }
    if (node.nodeType === 'file') {
      addMenuItem('Open file', async () => {
        openMarkdownViewer(node);
      });
      addMenuItem('Edit file', async () => {
        openMarkdownViewer(node, { editMode: true });
      });
      addMenuItem('Share link', async () => {
        await generateDirectoryShareLink(node.id);
        setMessage(nodeCreateMessage, 'Share link generated.', 'success');
      }, { disabled: !canCreateNodes });
    }
    addMenuItem('Properties', async () => {
      await showDirectoryProperties(node.id);
    });
    addMenuItem('Place on node board', async () => {
      await placeNodeOnBoard(node.id, { openBoard: true });
    }, { disabled: !canCreateNodes || state.directory.inRecycleBin || isSystemDirectoryNode(node) });

    if (node.nodeType === 'folder') {
      addMenuItem('Set Private', async () => {
        await setDirectoryVisibility(node, 'private');
        setMessage(nodeCreateMessage, 'Visibility set to private.', 'success');
        await loadWorkbenchDetail(Number(state.selectedWorkbenchId));
      }, { disabled: !canCreateNodes });
      addMenuItem('Set Members Visible', async () => {
        await setDirectoryVisibility(node, 'members');
        setMessage(nodeCreateMessage, 'Visibility set to members.', 'success');
        await loadWorkbenchDetail(Number(state.selectedWorkbenchId));
      }, { disabled: !canCreateNodes });
    }

    addMenuItem('Move', async () => {
      setDirectoryPendingOperation({ type: 'move', nodeId: Number(node.id), title: node.title || '' });
    }, { disabled: !canCreateNodes });
    addMenuItem('Copy', async () => {
      setDirectoryPendingOperation({ type: 'copy', nodeId: Number(node.id), title: node.title || '' });
    }, { disabled: !canCreateNodes });

    if (state.directory.inRecycleBin) {
      addMenuItem('Restore', async () => {
        await restoreNodeFromRecycleBin(node.id);
        setMessage(nodeCreateMessage, 'Item restored.', 'success');
        await loadWorkbenchDetail(Number(state.selectedWorkbenchId));
      }, { disabled: !canCreateNodes });
      addMenuItem('Delete permanently', async () => {
        const confirmed = window.confirm(`Permanently delete "${node.title}"? This cannot be undone.`);
        if (!confirmed) return;
        await permanentlyDeleteNode(node.id);
        setMessage(nodeCreateMessage, 'Item permanently deleted.', 'success');
        await loadWorkbenchDetail(Number(state.selectedWorkbenchId));
      }, { disabled: !canCreateNodes, danger: true });
    } else {
      addMenuItem('Move to recycle-bin', async () => {
        await moveNodeToRecycleBin(node.id);
        setMessage(nodeCreateMessage, 'Item moved to recycle-bin.', 'success');
        await loadWorkbenchDetail(Number(state.selectedWorkbenchId));
      }, { disabled: !canCreateNodes, danger: true });
    }

    menuWrap.appendChild(menu);
    row.appendChild(menuWrap);
    workbenchNodesList.appendChild(row);
  });
}

function renderEdgeList() {
  if (!workbenchEdgesList) return;
  workbenchEdgesList.innerHTML = '';
  const detail = state.workbenchDetail;
  const edges = detail && Array.isArray(detail.edges) ? detail.edges : [];
  const nodes = detail && Array.isArray(detail.nodes) ? detail.nodes : [];
  if (!edges.length) {
    workbenchEdgesList.appendChild(buildEmptyState('No edges yet.'));
    return;
  }
  edges.forEach((edge) => {
    const fromNode = nodes.find((node) => Number(node.id) === Number(edge.fromNodeId));
    const toNode = nodes.find((node) => Number(node.id) === Number(edge.toNodeId));
    const item = document.createElement('article');
    item.className = 'compact-item edge-list-item';
    if (Number(state.graph.selectedEdgeId) === Number(edge.id)) {
      item.classList.add('is-selected');
    }
    item.innerHTML = `
      <h4>#${edge.id} ${fromNode ? fromNode.title : edge.fromNodeId} -> ${toNode ? toNode.title : edge.toNodeId}</h4>
      <p class="note-content">${edge.description || 'No description.'}</p>
      <p class="item-meta">Updated ${formatDateTime(edge.updatedAt)}</p>
    `;
    item.addEventListener('click', () => {
      selectGraphEdge(edge.id, { openBoard: true });
    });
    workbenchEdgesList.appendChild(item);
  });
}

async function updateSelectedEdgeDescription() {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const edge = getBoardEdgeById(state.graph.selectedEdgeId);
  if (!workbenchId || !edge) {
    setMessage(edgeSelectionMessage, 'Select an edge first.');
    return;
  }
  const description = edgeSelectedDescriptionInput ? edgeSelectedDescriptionInput.value.trim() : '';
  await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/edges/${encodeURIComponent(edge.id)}`, {
    method: 'PATCH',
    body: { description },
  });
  setMessage(edgeSelectionMessage, 'Edge updated.', 'success');
  await loadWorkbenchDetail(workbenchId);
}

async function deleteSelectedEdge() {
  const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const edge = getBoardEdgeById(state.graph.selectedEdgeId);
  if (!workbenchId || !edge) {
    setMessage(edgeSelectionMessage, 'Select an edge first.');
    return;
  }
  const confirmed = window.confirm(`Delete ${getEdgeDisplayLabel(edge)}?`);
  if (!confirmed) return;
  await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/edges/${encodeURIComponent(edge.id)}`, {
    method: 'DELETE',
  });
  state.graph.selectedEdgeId = null;
  setMessage(edgeSelectionMessage, 'Edge deleted.', 'success');
  await loadWorkbenchDetail(workbenchId);
}

function renderNoteList() {
  if (!workbenchNotesList) return;
  workbenchNotesList.innerHTML = '';
  const detail = state.workbenchDetail;
  const notes = detail && Array.isArray(detail.notes) ? detail.notes : [];
  if (!notes.length) {
    workbenchNotesList.appendChild(buildEmptyState('No notes yet.'));
    return;
  }
  notes.forEach((note) => {
    const item = document.createElement('article');
    item.className = 'compact-item';
    const target = note.nodeId ? `Node #${note.nodeId}` : `Edge #${note.edgeId}`;
    item.innerHTML = `
      <h4>${target} • ${note.source || 'user'}</h4>
      <p class="note-content">${note.content || ''}</p>
      <p class="item-meta">By ${note.authorUid || 'Unknown'} • ${formatDateTime(note.createdAt)}</p>
    `;
    workbenchNotesList.appendChild(item);
  });
}

function renderTaskList() {
  if (!workbenchTasksList) return;
  workbenchTasksList.innerHTML = '';
  const permissions = getActivePermissions();
  const selectedId = parsePositiveInt(state.selectedWorkbenchId);
  const allTasks = Array.isArray(state.tasks) ? state.tasks : [];
  const collaborativeTasks = allTasks.filter((task) => isCollaborativeTask(task));
  const inlineTasks = allTasks.filter((task) => !isCollaborativeTask(task));
  if (taskCount) {
    taskCount.textContent = String(allTasks.length);
  }
  if (openCollaborativeTasksModalButton) {
    openCollaborativeTasksModalButton.disabled = !selectedId || state.taskboardAvailable !== true;
  }
  renderCollaborativeTaskModal();
  if (!selectedId) {
    workbenchTasksList.appendChild(buildEmptyState('Select a workbench to load tasks.'));
    return;
  }
  if (state.taskboardAvailable !== true) {
    workbenchTasksList.appendChild(buildEmptyState('Taskboard is currently disabled.'));
    return;
  }
  if (!inlineTasks.length) {
    if (collaborativeTasks.length) {
      workbenchTasksList.appendChild(buildEmptyState('No personal tasks yet. Open "Collaborative tasks" for shared items.'));
      return;
    }
    workbenchTasksList.appendChild(buildEmptyState('No tasks yet.'));
    return;
  }

  inlineTasks.forEach((task) => {
    const item = document.createElement('article');
    item.className = 'compact-item';

    const viewerUid = state.me && state.me.uid ? state.me.uid : '';
    const assigneeUids = Array.isArray(task.assignees) ? task.assignees.map((entry) => entry.uid) : [];
    const viewerIsAssignee = viewerUid ? assigneeUids.includes(viewerUid) : false;
    const canManageTasks = Boolean(permissions && permissions.canManageTasks);
    const canUpdateTask = canManageTasks || task.creatorUid === viewerUid || viewerIsAssignee;

    item.innerHTML = `
      <h4>${task.title || 'Untitled task'}</h4>
      <p class="note-content">${task.description || 'No description.'}</p>
      <p class="task-meta">Type: ${task.taskType || 'collaborative'} • Priority: ${task.priority || 'normal'} • Status: ${task.status || 'pending'}</p>
      <p class="task-meta">Due: ${task.dueAt ? formatDateTime(task.dueAt) : 'No due date'}</p>
      <p class="task-assignees">Assignees: ${(task.assignees || []).map((entry) => {
        const name = entry && entry.name ? entry.name : '';
        const assigneeId = entry && entry.assigneeId ? entry.assigneeId : '';
        if (name && assigneeId) return `${name} (${assigneeId})`;
        return name || assigneeId || (entry && entry.uid ? entry.uid : 'Unknown');
      }).join(', ') || 'None'}</p>
    `;

    if (canUpdateTask) {
      const statusRow = document.createElement('div');
      statusRow.className = 'row';

      const statusSelect = document.createElement('select');
      ['pending', 'in_progress', 'completed', 'archived'].forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value.replace('_', ' ');
        if (value === task.status) option.selected = true;
        statusSelect.appendChild(option);
      });
      statusRow.appendChild(statusSelect);

      const updateButton = document.createElement('button');
      updateButton.type = 'button';
      updateButton.className = 'secondary-button';
      updateButton.textContent = 'Update status';
      updateButton.addEventListener('click', () => {
        withButtonBusy(updateButton, 'Updating...', async () => {
          await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, {
            method: 'PATCH',
            body: { status: statusSelect.value },
          });
          setMessage(taskCreateMessage, `Task "${task.title}" updated.`, 'success');
          await loadTasks();
        }).catch((error) => {
          setMessage(taskCreateMessage, error.message || 'Unable to update task.');
        });
      });
      statusRow.appendChild(updateButton);
      item.appendChild(statusRow);
    }

    if (canManageTasks) {
      const assignRow = document.createElement('div');
      assignRow.className = 'row';
      const assignInput = document.createElement('input');
      assignInput.type = 'text';
      assignInput.placeholder = 'Assignee ID (username, student ID, or email)';
      const assignButton = document.createElement('button');
      assignButton.type = 'button';
      assignButton.className = 'secondary-button';
      assignButton.textContent = 'Assign';
      assignButton.addEventListener('click', () => {
        const assigneeId = assignInput.value.trim();
        if (!assigneeId) {
          setMessage(taskCreateMessage, 'Enter an assignee ID before assigning.');
          return;
        }
        withButtonBusy(assignButton, 'Assigning...', async () => {
          await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}/assign`, {
            method: 'POST',
            body: { assigneeId },
          });
          setMessage(taskCreateMessage, `Task assigned to ${assigneeId}.`, 'success');
          assignInput.value = '';
          await loadTasks();
        }).catch((error) => {
          setMessage(taskCreateMessage, error.message || 'Unable to assign user.');
        });
      });
      assignRow.appendChild(assignInput);
      assignRow.appendChild(assignButton);
      item.appendChild(assignRow);
    }

    if (viewerIsAssignee || canManageTasks) {
      const submissionWrap = document.createElement('div');
      submissionWrap.className = 'task-submissions';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.maxLength = 1000;
      noteInput.placeholder = 'Submission note (optional)';
      const submitButton = document.createElement('button');
      submitButton.type = 'button';
      submitButton.className = 'secondary-button';
      submitButton.textContent = 'Upload submission';
      submitButton.addEventListener('click', () => {
        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (!file) {
          setMessage(taskCreateMessage, 'Choose a file before submitting.');
          return;
        }
        withButtonBusy(submitButton, 'Uploading...', async () => {
          const formData = new FormData();
          formData.append('file', file);
          const note = noteInput.value.trim();
          if (note) formData.append('note', note);
          await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}/submit`, {
            method: 'POST',
            body: formData,
          });
          setMessage(taskCreateMessage, `Submission uploaded for "${task.title}".`, 'success');
          fileInput.value = '';
          noteInput.value = '';
          await loadTasks();
        }).catch((error) => {
          setMessage(taskCreateMessage, error.message || 'Unable to upload submission.');
        });
      });
      submissionWrap.appendChild(fileInput);
      submissionWrap.appendChild(noteInput);
      submissionWrap.appendChild(submitButton);
      item.appendChild(submissionWrap);
    }

    if (Array.isArray(task.submissions) && task.submissions.length) {
      const links = document.createElement('div');
      links.className = 'task-submissions';
      task.submissions.forEach((submission) => {
        const line = document.createElement('p');
        line.className = 'task-meta';
        const fileName = submission.fileName || 'Submission';
        const uploader = submission.submittedByUid || 'unknown';
        if (submission.fileUrl) {
          const link = document.createElement('a');
          link.href = submission.fileUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `${fileName} (${uploader})`;
          links.appendChild(link);
          return;
        }
        line.textContent = `${fileName} (${uploader})`;
        links.appendChild(line);
      });
      item.appendChild(links);
    }

    workbenchTasksList.appendChild(item);
  });
}

function renderWorkbenchDetail() {
  const detail = state.workbenchDetail;
  if (!detail || !detail.workbench) {
    if (activeWorkbenchTitle) activeWorkbenchTitle.textContent = 'Select a workbench';
    if (activeWorkbenchDescription) activeWorkbenchDescription.textContent = 'Choose a workbench from the left panel to load nodes, notes, and tasks.';
    if (activeWorkbenchMeta) activeWorkbenchMeta.textContent = 'No workbench selected';
    if (activeWorkbenchVisibility) activeWorkbenchVisibility.textContent = 'Visibility: -';
    if (activeWorkbenchStatus) activeWorkbenchStatus.textContent = 'Status: -';
    if (activeWorkbenchOwner) activeWorkbenchOwner.textContent = 'Owner: -';
    updateWorkbenchAiUi(true, 'AI notes: select a workbench');
    toggleHidden(joinWorkbenchButton, true);
    toggleHidden(memberManageForm, true);
    toggleHidden(ownershipTransferForm, true);
    toggleHidden(ownershipTransferRespondForm, true);
    resetMemberPicker();
    resetTaskAssigneePicker();
    if (pendingTransferBox) pendingTransferBox.textContent = 'No pending transfer request.';
    setDirectoryPendingOperation(null);
    setDirectoryMenuNodeId(null);
    state.directory.creatingFile = false;
    state.directory.viewerMode = false;
    state.directory.viewerEditMode = false;
    state.directory.viewingNodeId = null;
    clearDirectoryEditorForm();
    [nodeTitleInput, nodeVisibilityInput, nodeSortOrderInput, nodeMarkdownInput, nodeCreateButton, nodeEditorCancelButton].forEach((element) => {
      if (element) element.disabled = true;
    });
    [directoryRootButton, directoryWorkspaceButton, directoryRecycleButton, addFileButton, addFolderButton, directoryPasteButton, directoryCancelPasteButton].forEach((element) => {
      if (element) element.disabled = true;
    });
    [edgeSelectedDescriptionInput, edgeUpdateButton, edgeDeleteButton].forEach((element) => {
      if (element) element.disabled = true;
    });
    [noteTargetTypeInput, noteTargetIdInput, noteContentInput, noteCreateButton, aiNoteInstructionInput, noteCreateAiButton].forEach((element) => {
      if (element) element.disabled = true;
    });
    [
      taskTitleInput,
      taskDescriptionInput,
      taskTypeInput,
      taskPriorityInput,
      taskDueAtInput,
      taskGroupTitleInput,
      taskAssigneeSearchInput,
      taskRequiresFileInput,
      taskCreateButton,
    ].forEach((element) => {
      if (element) element.disabled = true;
    });
    [boardNodeSourceSelect, boardAddNodeButton, boardResetLayoutButton, boardExpandCanvasButton, boardAiChatInput, boardAiChatSendButton].forEach((element) => {
      if (element) element.disabled = true;
    });
    state.graph.selectedEdgeId = null;
    resetGraphConnectionState();
    renderMemberList();
    renderNodeList();
    renderEdgeList();
    renderNoteList();
    renderGraphCanvas();
    updateWorkbenchSelectOptions();
    renderBoardAiChatMessages();
    updateBoardCanvasExpandedUi();
    return;
  }

  const wb = detail.workbench;
  const permissions = detail.permissions || {};
  if (activeWorkbenchTitle) activeWorkbenchTitle.textContent = wb.title || 'Untitled workbench';
  if (activeWorkbenchDescription) activeWorkbenchDescription.textContent = wb.description || 'No description yet.';
  if (activeWorkbenchMeta) activeWorkbenchMeta.textContent = `${wb.course || 'No course'} • Updated ${formatDateTime(wb.updatedAt)}`;
  if (activeWorkbenchVisibility) activeWorkbenchVisibility.textContent = `Visibility: ${wb.visibility || 'invite_only'}`;
  if (activeWorkbenchStatus) activeWorkbenchStatus.textContent = `Status: ${wb.status || 'active'}`;
  if (activeWorkbenchOwner) activeWorkbenchOwner.textContent = `Owner: ${wb.ownerName || wb.ownerUid || 'Member'}`;
  const aiEnabled = !(detail.features && detail.features.aiNoteEnabled === false);
  updateWorkbenchAiUi(aiEnabled);
  toggleHidden(joinWorkbenchButton, !permissions.canJoin);
  toggleHidden(memberManageForm, !permissions.canManageMembers);
  if (!permissions.canManageMembers) {
    resetMemberPicker();
  }
  toggleHidden(ownershipTransferForm, !permissions.canTransferOwnership);

  if (pendingTransferBox) {
    const pending = detail.pendingOwnershipTransfer;
    if (pending) {
      pendingTransferBox.textContent = `Pending transfer #${pending.id}: ${pending.fromUid} -> ${pending.toUid} (expires ${formatDateTime(pending.expiresAt)}).`;
    } else {
      pendingTransferBox.textContent = 'No pending transfer request.';
    }
  }

  const canRespondTransfer = Boolean(
    detail.pendingOwnershipTransfer &&
      state.me &&
      (detail.pendingOwnershipTransfer.toUid === state.me.uid || (permissions && permissions.isGlobalAdmin))
  );
  toggleHidden(ownershipTransferRespondForm, !canRespondTransfer);

  renderMemberList();
  renderNodeList();
  renderEdgeList();
  renderNoteList();
  renderGraphCanvas();
  updateWorkbenchSelectOptions();
  renderBoardAiChatMessages();

  const canCreateNodes = Boolean(permissions.canCreateNodes);
  [nodeTitleInput, nodeVisibilityInput, nodeSortOrderInput, nodeMarkdownInput, nodeCreateButton, nodeEditorCancelButton].forEach((element) => {
    if (element) element.disabled = !canCreateNodes;
  });
  [directoryRootButton, directoryWorkspaceButton, directoryRecycleButton].forEach((element) => {
    if (element) element.disabled = false;
  });
  if (addFolderButton) {
    addFolderButton.disabled = !canCreateNodes || state.directory.inRecycleBin;
  }
  if (addFileButton) {
    addFileButton.disabled = !canCreateNodes || state.directory.inRecycleBin;
  }
  if (directoryCancelPasteButton) {
    directoryCancelPasteButton.disabled = !canCreateNodes;
  }
  if (directoryPasteButton) {
    directoryPasteButton.disabled = !canCreateNodes || !state.directory.pendingOperation || !state.directory.currentParentId;
  }
  updateDirectoryTypeUi();

  const canManageNodes = Boolean(permissions.canManageNodes);
  [edgeSelectedDescriptionInput, edgeUpdateButton, edgeDeleteButton].forEach((element) => {
    if (element) element.disabled = !canManageNodes;
  });
  [noteTargetTypeInput, noteTargetIdInput, noteContentInput, noteCreateButton, aiNoteInstructionInput].forEach((element) => {
    if (element) element.disabled = !canCreateNodes;
  });
  if (noteCreateAiButton) {
    noteCreateAiButton.disabled = !canCreateNodes || !state.workbenchAiEnabled;
    toggleHidden(noteCreateAiButton, !state.workbenchAiEnabled);
  }
  if (boardNodeSourceSelect) {
    boardNodeSourceSelect.disabled = !canCreateNodes;
  }
  if (boardAddNodeButton) {
    boardAddNodeButton.disabled = !canCreateNodes;
  }
  if (boardResetLayoutButton) {
    boardResetLayoutButton.disabled = !canManageNodes;
  }
  if (boardExpandCanvasButton) {
    boardExpandCanvasButton.disabled = false;
  }
  const canUseBoardAi = Boolean(state.workbenchAiEnabled);
  if (boardAiChatInput) {
    boardAiChatInput.disabled = !canUseBoardAi;
  }
  if (boardAiChatSendButton) {
    boardAiChatSendButton.disabled = !canUseBoardAi;
  }
  updateBoardCanvasExpandedUi();
  if (!canUseBoardAi) {
    setMessage(boardAiChatMessage, 'Board AI is currently disabled.');
  } else {
    clearMessage(boardAiChatMessage);
  }

  const canCreateTasks = Boolean(permissions.canCreateTasks);
  [
    taskTitleInput,
    taskDescriptionInput,
    taskTypeInput,
    taskPriorityInput,
    taskDueAtInput,
    taskGroupTitleInput,
    taskAssigneeSearchInput,
    taskRequiresFileInput,
    taskCreateButton,
  ].forEach((element) => {
    if (element) element.disabled = !canCreateTasks;
  });
  if (!canCreateTasks) {
    resetTaskAssigneePicker();
  }
}

async function loadDirectory(options = {}) {
  const id = parsePositiveInt(state.selectedWorkbenchId);
  if (!id) {
    state.directory.roots = null;
    state.directory.currentParentId = null;
    state.directory.currentPath = [];
    state.directory.children = [];
    state.directory.inRecycleBin = false;
    renderNodeList();
    return;
  }
  const parentId = parsePositiveInt(options.parentId || state.directory.currentParentId);
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
  const data = await apiRequest(`/api/workbench/${encodeURIComponent(id)}/directory${query}`);
  state.directory.roots = data && data.roots ? data.roots : state.directory.roots;
  state.directory.currentParentId = data && data.currentParentId ? Number(data.currentParentId) : null;
  state.directory.currentPath = Array.isArray(data && data.path) ? data.path : [];
  state.directory.children = Array.isArray(data && data.children) ? data.children : [];
  state.directory.inRecycleBin = Boolean(data && data.inRecycleBin);
  state.directory.creatingFile = false;
  state.directory.menuNodeId = null;
  const editingNodeId = parsePositiveInt(state.directory.editingNodeId);
  if (editingNodeId) {
    const stillVisible = state.directory.children.some((entry) => Number(entry.id) === Number(editingNodeId));
    if (!stillVisible) {
      clearDirectoryEditorForm();
    }
  }
  const viewingNodeId = parsePositiveInt(state.directory.viewingNodeId);
  if (viewingNodeId) {
    const viewingNode = state.directory.children.find((entry) => Number(entry.id) === Number(viewingNodeId));
    if (!viewingNode) {
      closeMarkdownViewer();
    } else {
      openMarkdownViewer(viewingNode, { preserveMode: true });
    }
  }
  renderNodeList();
}

async function runDirectoryPendingOperation() {
  const pending = state.directory.pendingOperation;
  const id = parsePositiveInt(state.selectedWorkbenchId);
  const targetParentId = parsePositiveInt(state.directory.currentParentId);
  if (!pending || !id || !targetParentId) {
    return;
  }
  const endpoint = pending.type === 'move'
    ? `/api/workbench/${encodeURIComponent(id)}/directory/${encodeURIComponent(pending.nodeId)}/move`
    : `/api/workbench/${encodeURIComponent(id)}/directory/${encodeURIComponent(pending.nodeId)}/copy`;
  const method = 'POST';
  await apiRequest(endpoint, {
    method,
    body: { targetParentId },
  });
  setDirectoryPendingOperation(null);
  await loadWorkbenchDetail(id);
}

async function loadWorkbenchDetail(workbenchId) {
  const id = parsePositiveInt(workbenchId);
  if (!id) return;
  clearMessage(workbenchDetailMessage);
  clearMessage(noteCreateAiMessage);
  const previousWorkbenchId = parsePositiveInt(state.selectedWorkbenchId);
  const previousSelectedEdgeId = Number(state.graph.selectedEdgeId || 0);
  try {
    const data = await apiRequest(`/api/workbench/${encodeURIComponent(id)}`);
    state.workbenchDetail = data;
    state.selectedWorkbenchId = id;
    if (previousWorkbenchId && Number(previousWorkbenchId) === Number(id) && previousSelectedEdgeId) {
      state.graph.selectedEdgeId = previousSelectedEdgeId;
    } else {
      state.graph.selectedEdgeId = null;
    }
    resetGraphConnectionState();
    if (data && data.directoryRoots) {
      state.directory.roots = data.directoryRoots;
    }
    renderWorkbenchList();
    renderWorkbenchDetail();
    const defaultParentId = parsePositiveInt(
      (previousWorkbenchId && Number(previousWorkbenchId) === Number(id) ? state.directory.currentParentId : null) ||
      (data && data.directoryRoots && data.directoryRoots.workspaceFolderId)
    );
    await Promise.all([
      loadTasks(),
      loadDirectory({ parentId: defaultParentId }),
    ]);
  } catch (error) {
    state.workbenchDetail = null;
    state.tasks = [];
    state.directory.roots = null;
    state.directory.currentParentId = null;
    state.directory.currentPath = [];
    state.directory.children = [];
    state.directory.inRecycleBin = false;
    state.directory.pendingOperation = null;
    state.directory.menuNodeId = null;
    state.directory.editingNodeId = null;
    state.graph.selectedEdgeId = null;
    resetGraphConnectionState();
    renderWorkbenchDetail();
    renderTaskList();
    setMessage(workbenchDetailMessage, error.message || 'Unable to load workbench details.');
  }
}

async function selectWorkbench(workbenchId) {
  const id = parsePositiveInt(workbenchId);
  if (!id) return;
  if (Number(state.selectedWorkbenchId) !== Number(id)) {
    setDirectoryPendingOperation(null);
    setDirectoryMenuNodeId(null);
    resetMemberPicker();
    resetTaskAssigneePicker();
    state.directory.creatingFile = false;
    state.directory.viewerMode = false;
    state.directory.viewerEditMode = false;
    state.directory.viewingNodeId = null;
    state.graph.selectedEdgeId = null;
    resetGraphConnectionState();
    resetBoardChat();
    clearDirectoryEditorForm();
  }
  state.selectedWorkbenchId = id;
  renderWorkbenchList();
  await loadWorkbenchDetail(id);
}

async function loadTasks() {
  const id = parsePositiveInt(state.selectedWorkbenchId);
  if (!id) {
    state.tasks = [];
    renderTaskList();
    return;
  }
  try {
    const data = await apiRequest(`/api/workbench/${encodeURIComponent(id)}/tasks`);
    state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    state.taskboardAvailable = true;
    renderTaskList();
  } catch (error) {
    const status = Number(error && error.status);
    if (status === 404) {
      state.taskboardAvailable = false;
      state.tasks = [];
      renderTaskList();
      return;
    }
    state.taskboardAvailable = true;
    state.tasks = [];
    renderTaskList();
    setMessage(taskCreateMessage, error.message || 'Unable to load tasks.');
  }
}

async function loadProfile() {
  try {
    const data = await apiRequest('/api/profile', { retries: 0 });
    state.me = data.profile || null;
    state.canCreateWorkbenchDirect = viewerCanCreateWorkbenchDirect(state.me);
    applyCreateWorkbenchVisibility();
    if (state.me) {
      setNavAvatar(state.me.photo_link || null, state.me.display_name || '');
      if (createWorkbenchCourse && !createWorkbenchCourse.value && state.me.main_course) {
        createWorkbenchCourse.value = state.me.main_course;
      }
    }
  } catch (_error) {
    state.me = null;
    state.canCreateWorkbenchDirect = false;
    applyCreateWorkbenchVisibility();
  }
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.directory-row-menu') && state.directory.menuNodeId) {
      setDirectoryMenuNodeId(null);
      renderNodeList();
    }
  });

  window.addEventListener('resize', () => {
    if (state.activeWorkbenchView === 'board') {
      renderGraphCanvas();
    }
  });

  if (openCollaborativeTasksModalButton) {
    openCollaborativeTasksModalButton.addEventListener('click', () => {
      renderCollaborativeTaskModal();
      clearMessage(collaborativeTasksMessage);
      openWorkbenchModal(collaborativeTasksModal);
    });
  }

  if (collaborativeTasksModalClose) {
    collaborativeTasksModalClose.addEventListener('click', () => {
      closeWorkbenchModal(collaborativeTasksModal);
    });
  }

  if (collaborativeTasksModal) {
    collaborativeTasksModal.addEventListener('click', (event) => {
      if (event.target === collaborativeTasksModal) {
        closeWorkbenchModal(collaborativeTasksModal);
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!collaborativeTasksModal || collaborativeTasksModal.classList.contains('is-hidden')) return;
    closeWorkbenchModal(collaborativeTasksModal);
  });

  workbenchMenuButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.workbenchView || 'overview';
      setWorkbenchView(view);
    });
  });

  if (workbenchSearchInput) {
    workbenchSearchInput.addEventListener('input', () => {
      state.workbenchSearchQuery = workbenchSearchInput.value || '';
      renderWorkbenchList();
    });
  }

  if (toggleWorkbenchListButton) {
    toggleWorkbenchListButton.addEventListener('click', () => {
      state.ui.workbenchListCollapsed = !state.ui.workbenchListCollapsed;
      updateCollapsibleUi();
    });
  }

  if (toggleNodeEditorButton) {
    toggleNodeEditorButton.addEventListener('click', () => {
      state.ui.nodeEditorCollapsed = !state.ui.nodeEditorCollapsed;
      updateCollapsibleUi();
    });
  }

  if (nodeEditorCancelButton) {
    nodeEditorCancelButton.addEventListener('click', () => {
      clearDirectoryEditorForm();
      setMessage(nodeCreateMessage, 'Editor reset.', 'success');
    });
  }

  if (markdownViewerCloseButton) {
    markdownViewerCloseButton.addEventListener('click', () => {
      closeMarkdownViewer();
    });
  }

  if (markdownViewerToggleModeButton) {
    markdownViewerToggleModeButton.addEventListener('click', () => {
      const permissions = getActivePermissions();
      const canEditFile = Boolean(permissions && permissions.canCreateNodes);
      if (!canEditFile) {
        setMessage(markdownViewerEditMessage, 'You do not have permission to edit this file.');
        return;
      }
      const node = getCurrentViewingNode();
      if (!node) {
        setMessage(markdownViewerEditMessage, 'Selected file is no longer available in this folder.');
        return;
      }
      if (state.directory.viewerEditMode) {
        setMarkdownViewerEditMode(false);
        return;
      }
      populateMarkdownViewerEditForm(node);
      clearMessage(markdownViewerEditMessage);
      setMarkdownViewerEditMode(true);
    });
  }

  if (markdownViewerCancelEditButton) {
    markdownViewerCancelEditButton.addEventListener('click', () => {
      const node = getCurrentViewingNode();
      if (node) {
        populateMarkdownViewerEditForm(node);
      }
      clearMessage(markdownViewerEditMessage);
      setMarkdownViewerEditMode(false);
    });
  }

  if (addFileButton) {
    addFileButton.addEventListener('click', () => {
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const parentId = parsePositiveInt(state.directory.currentParentId);
      if (!id || !parentId) {
        setMessage(nodeCreateMessage, 'Select a workbench and directory first.');
        return;
      }
      if (state.directory.inRecycleBin) {
        setMessage(nodeCreateMessage, 'Cannot create files inside recycle-bin.');
        return;
      }
      state.directory.creatingFile = true;
      setDirectoryMenuNodeId(null);
      renderNodeList();
    });
  }

  if (addFolderButton) {
    addFolderButton.addEventListener('click', () => {
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const parentId = parsePositiveInt(state.directory.currentParentId);
      if (!id || !parentId) {
        setMessage(nodeCreateMessage, 'Select a workbench and directory first.');
        return;
      }
      const title = window.prompt('Folder name');
      if (!title) return;
      const trimmedTitle = String(title).trim();
      if (!trimmedTitle) {
        setMessage(nodeCreateMessage, 'Folder name is required.');
        return;
      }
      withButtonBusy(addFolderButton, 'Adding...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/directory`, {
          method: 'POST',
          body: {
            type: 'folder',
            title: trimmedTitle,
            visibility: 'private',
            parentId,
            sortOrder: 0,
          },
        });
        setMessage(nodeCreateMessage, 'Folder created.', 'success');
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        setMessage(nodeCreateMessage, error.message || 'Unable to add folder.');
      });
    });
  }

  if (directoryRootButton) {
    directoryRootButton.addEventListener('click', () => {
      const roots = state.directory.roots;
      if (!roots) return;
      loadDirectory({ parentId: parsePositiveInt(roots.rootId) }).catch((error) => {
        setMessage(nodeCreateMessage, error.message || 'Unable to open root folder.');
      });
    });
  }

  if (directoryWorkspaceButton) {
    directoryWorkspaceButton.addEventListener('click', () => {
      const roots = state.directory.roots;
      if (!roots) return;
      loadDirectory({ parentId: parsePositiveInt(roots.workspaceFolderId) }).catch((error) => {
        setMessage(nodeCreateMessage, error.message || 'Unable to open workbench folder.');
      });
    });
  }

  if (directoryRecycleButton) {
    directoryRecycleButton.addEventListener('click', () => {
      const roots = state.directory.roots;
      if (!roots) return;
      loadDirectory({ parentId: parsePositiveInt(roots.recycleBinId) }).catch((error) => {
        setMessage(nodeCreateMessage, error.message || 'Unable to open recycle-bin.');
      });
    });
  }

  if (directoryPasteButton) {
    directoryPasteButton.addEventListener('click', () => {
      withButtonBusy(directoryPasteButton, 'Pasting...', async () => {
        await runDirectoryPendingOperation();
        setMessage(nodeCreateMessage, 'Directory operation completed.', 'success');
      }).catch((error) => {
        setMessage(nodeCreateMessage, error.message || 'Unable to complete directory operation.');
      });
    });
  }

  if (directoryCancelPasteButton) {
    directoryCancelPasteButton.addEventListener('click', () => {
      setDirectoryPendingOperation(null);
      setMessage(nodeCreateMessage, 'Pending directory operation canceled.', 'success');
    });
  }

  if (refreshWorkbenchListButton) {
    refreshWorkbenchListButton.addEventListener('click', () => {
      withButtonBusy(refreshWorkbenchListButton, 'Refreshing...', async () => {
        await loadWorkbenchList({ preserveSelected: true });
      }).catch((error) => {
        setMessage(workbenchListMessage, error.message || 'Unable to refresh workbench list.');
      });
    });
  }

  if (refreshRequestQueueButton) {
    refreshRequestQueueButton.addEventListener('click', () => {
      withButtonBusy(refreshRequestQueueButton, 'Refreshing...', async () => {
        await loadRequestQueue();
      }).catch((error) => {
        setMessage(requestQueueMessage, error.message || 'Unable to refresh request queue.');
      });
    });
  }

  if (boardPanelToggles.length) {
    boardPanelToggles.forEach((button) => {
      syncBoardPanelToggleState(button);
      button.addEventListener('click', () => {
        const panel = button.closest('.board-panel');
        if (!panel) return;
        panel.classList.toggle('is-collapsed');
        syncBoardPanelToggleState(button);
      });
    });
  }

  if (boardAddNodeButton) {
    boardAddNodeButton.addEventListener('click', () => {
      const nodeId = parsePositiveInt(boardNodeSourceSelect && boardNodeSourceSelect.value);
      if (!nodeId) {
        setMessage(graphCanvasMessage, 'Select a directory item first.');
        return;
      }
      withButtonBusy(boardAddNodeButton, 'Adding...', async () => {
        await placeNodeOnBoard(nodeId, { openBoard: true });
      }).catch((error) => {
        setMessage(graphCanvasMessage, error.message || 'Unable to place node on canvas.');
      });
    });
  }

  if (boardNodeSourceSelect) {
    boardNodeSourceSelect.addEventListener('change', () => {
      renderBoardNodeQuickList();
    });
  }

  if (boardNodeSearchInput) {
    boardNodeSearchInput.addEventListener('input', () => {
      state.boardPicker.query = boardNodeSearchInput.value || '';
      renderBoardNodeQuickList();
    });
  }

  if (boardResetLayoutButton) {
    boardResetLayoutButton.addEventListener('click', () => {
      withButtonBusy(boardResetLayoutButton, 'Arranging...', async () => {
        await autoLayoutBoardNodes();
      }).catch((error) => {
        setMessage(graphCanvasMessage, error.message || 'Unable to apply auto layout.');
      });
    });
  }

  if (boardExpandCanvasButton) {
    boardExpandCanvasButton.addEventListener('click', () => {
      state.ui.boardCanvasExpanded = !state.ui.boardCanvasExpanded;
      updateBoardCanvasExpandedUi();
    });
  }

  if (graphCanvasViewport) {
    graphCanvasViewport.addEventListener('click', (event) => {
      if (event.target === graphCanvasViewport || event.target === graphCanvasNodes || event.target === graphCanvasEdges) {
        state.graph.selectedEdgeId = null;
        resetGraphConnectionState();
        window.removeEventListener('pointermove', onGraphConnectPointerMove);
        window.removeEventListener('pointerup', onGraphConnectPointerUp);
        window.removeEventListener('pointercancel', onGraphConnectPointerUp);
        renderGraphEdgeSelectionUi();
        renderGraphEdges();
        renderEdgeList();
      }
    });
  }

  if (edgeUpdateButton) {
    edgeUpdateButton.addEventListener('click', () => {
      clearMessage(edgeSelectionMessage);
      withButtonBusy(edgeUpdateButton, 'Updating...', async () => {
        await updateSelectedEdgeDescription();
      }).catch((error) => {
        setMessage(edgeSelectionMessage, error.message || 'Unable to update edge.');
      });
    });
  }

  if (edgeDeleteButton) {
    edgeDeleteButton.addEventListener('click', () => {
      clearMessage(edgeSelectionMessage);
      withButtonBusy(edgeDeleteButton, 'Deleting...', async () => {
        await deleteSelectedEdge();
      }).catch((error) => {
        setMessage(edgeSelectionMessage, error.message || 'Unable to delete edge.');
      });
    });
  }

  if (boardAiChatForm) {
    boardAiChatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(boardAiChatMessage);
      const workbenchId = parsePositiveInt(state.selectedWorkbenchId);
      const message = boardAiChatInput ? boardAiChatInput.value.trim() : '';
      if (!workbenchId || !message) {
        setMessage(boardAiChatMessage, 'Select a workbench and enter a question.');
        return;
      }

      state.boardChat.messages.push({ role: 'user', content: message });
      renderBoardAiChatMessages();
      if (boardAiChatInput) {
        boardAiChatInput.value = '';
      }

      withButtonBusy(boardAiChatSendButton, 'Thinking...', async () => {
        const history = state.boardChat.messages.slice(0, -1).slice(-10).map((entry) => ({
          role: entry.role === 'assistant' ? 'assistant' : 'user',
          content: entry.content || '',
        }));
        const data = await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/board-ai/chat`, {
          method: 'POST',
          body: {
            message,
            history,
          },
        });
        state.boardChat.messages.push({
          role: 'assistant',
          content: data.reply || 'No response from AI.',
        });
        renderBoardAiChatMessages();
        const executedActions = Array.isArray(data.executedActions) ? data.executedActions : [];
        const skippedActions = Array.isArray(data.skippedActions) ? data.skippedActions : [];
        if (executedActions.length > 0) {
          setMessage(boardAiChatMessage, `Applied ${executedActions.length} board action${executedActions.length === 1 ? '' : 's'}.`, 'success');
          await loadWorkbenchDetail(workbenchId);
        } else if (skippedActions.length > 0) {
          const firstReason = skippedActions.find((entry) => entry && entry.reason)?.reason || 'Requested board updates were skipped.';
          setMessage(boardAiChatMessage, firstReason);
        }
      }).catch((error) => {
        setMessage(boardAiChatMessage, error.message || 'Unable to ask board AI.');
      });
    });
  }

  if (createWorkbenchForm) {
    createWorkbenchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(createWorkbenchMessage);
      const title = createWorkbenchTitle ? createWorkbenchTitle.value.trim() : '';
      if (!title) {
        setMessage(createWorkbenchMessage, 'Workbench title is required.');
        return;
      }
      withButtonBusy(createWorkbenchButton, 'Creating...', async () => {
        const data = await apiRequest('/api/workbench', {
          method: 'POST',
          body: {
            title,
            description: createWorkbenchDescription ? createWorkbenchDescription.value.trim() : '',
            course: createWorkbenchCourse ? createWorkbenchCourse.value.trim() : '',
            visibility: createWorkbenchVisibility ? createWorkbenchVisibility.value : 'invite_only',
            status: 'active',
          },
          retries: 0,
        });
        setMessage(createWorkbenchMessage, 'Workbench created.', 'success');
        if (createWorkbenchTitle) createWorkbenchTitle.value = '';
        if (createWorkbenchDescription) createWorkbenchDescription.value = '';
        await loadWorkbenchList({ focusWorkbenchId: data.workbench && data.workbench.id });
      }).catch((error) => {
        const status = Number(error && error.status);
        if (status === 403) {
          setMessage(createWorkbenchMessage, `${error.message} Use request form below.`);
          return;
        }
        setMessage(createWorkbenchMessage, error.message || 'Unable to create workbench.');
      });
    });
  }

  if (requestWorkbenchForm) {
    requestWorkbenchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(requestWorkbenchMessage);
      const title = requestWorkbenchTitle ? requestWorkbenchTitle.value.trim() : '';
      if (!title) {
        setMessage(requestWorkbenchMessage, 'Request title is required.');
        return;
      }
      withButtonBusy(requestWorkbenchButton, 'Submitting...', async () => {
        await apiRequest('/api/workbench/requests', {
          method: 'POST',
          body: {
            title,
            description: requestWorkbenchDescription ? requestWorkbenchDescription.value.trim() : '',
            visibility: createWorkbenchVisibility ? createWorkbenchVisibility.value : 'invite_only',
            course: createWorkbenchCourse ? createWorkbenchCourse.value.trim() : '',
          },
          retries: 0,
        });
        setMessage(requestWorkbenchMessage, 'Request submitted for review.', 'success');
        if (requestWorkbenchTitle) requestWorkbenchTitle.value = '';
        if (requestWorkbenchDescription) requestWorkbenchDescription.value = '';
      }).catch((error) => {
        setMessage(requestWorkbenchMessage, error.message || 'Unable to submit request.');
      });
    });
  }

  if (joinWorkbenchButton) {
    joinWorkbenchButton.addEventListener('click', () => {
      const id = parsePositiveInt(state.selectedWorkbenchId);
      if (!id) return;
      withButtonBusy(joinWorkbenchButton, 'Joining...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/join`, {
          method: 'POST',
          body: {},
        });
        setMessage(workbenchDetailMessage, 'Joined workbench.', 'success');
        await Promise.all([
          loadWorkbenchList({ preserveSelected: true }),
          loadWorkbenchDetail(id),
        ]);
      }).catch((error) => {
        setMessage(workbenchDetailMessage, error.message || 'Unable to join workbench.');
      });
    });
  }

  if (refreshWorkbenchDetailButton) {
    refreshWorkbenchDetailButton.addEventListener('click', () => {
      const id = parsePositiveInt(state.selectedWorkbenchId);
      if (!id) {
        setMessage(workbenchDetailMessage, 'Select a workbench first.');
        return;
      }
      withButtonBusy(refreshWorkbenchDetailButton, 'Refreshing...', async () => {
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        setMessage(workbenchDetailMessage, error.message || 'Unable to refresh workbench details.');
      });
    });
  }

  if (memberSearchInput) {
    memberSearchInput.addEventListener('input', () => {
      const query = memberSearchInput.value.trim();
      const selectedLabel = state.memberPicker.selected
        ? getMemberCandidateSearchLabel(state.memberPicker.selected)
        : '';
      if (state.memberPicker.selected && query.toLowerCase() !== selectedLabel.toLowerCase()) {
        setSelectedMemberCandidate(null, { keepSearchText: true });
      }
      queueMemberCandidateSearch();
    });

    memberSearchInput.addEventListener('focus', () => {
      if (state.memberPicker.results.length) {
        renderMemberSearchResults();
        return;
      }
      queueMemberCandidateSearch();
    });

    memberSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        toggleHidden(memberSearchResults, true);
      }
    });
  }

  if (taskAssigneeSearchInput) {
    taskAssigneeSearchInput.addEventListener('input', () => {
      queueTaskAssigneeSearch();
    });

    taskAssigneeSearchInput.addEventListener('focus', () => {
      if (state.taskAssigneePicker.results.length) {
        renderTaskAssigneeSearchResults();
        return;
      }
      queueTaskAssigneeSearch();
    });

    taskAssigneeSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        toggleHidden(taskAssigneeSearchResults, true);
        return;
      }
      if (event.key !== 'Enter') return;
      if (!state.taskAssigneePicker.results.length) return;
      event.preventDefault();
      const first = state.taskAssigneePicker.results[0];
      if (!first || !first.uid) return;
      const exists = (state.taskAssigneePicker.selected || []).some((entry) => String(entry.uid || '') === String(first.uid));
      if (!exists) {
        state.taskAssigneePicker.selected.push({
          uid: String(first.uid),
          assigneeId: getTaskAssigneeId(first),
          displayName: getTaskAssigneeDisplayName(first),
          username: String(first.username || '').trim(),
          studentNumber: String(first.studentNumber || '').trim(),
          email: String(first.email || '').trim(),
          role: String(first.role || '').trim(),
        });
        renderTaskAssigneeSelectedList();
      }
      taskAssigneeSearchInput.value = '';
      state.taskAssigneePicker.query = '';
      state.taskAssigneePicker.results = [];
      renderTaskAssigneeSearchResults();
    });
  }

  if (memberManageForm) {
    memberManageForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(memberManageMessage);
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const selectedMember = state.memberPicker.selected;
      const uid = selectedMember ? String(selectedMember.uid || '').trim() : '';
      if (!id || !uid) {
        setMessage(memberManageMessage, 'Select a workbench and choose a user from search results.');
        return;
      }
      withButtonBusy(memberManageButton, 'Saving...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/members`, {
          method: 'POST',
          body: {
            uid,
            role: memberRoleInput ? memberRoleInput.value : 'member',
          },
        });
        const display = selectedMember && selectedMember.displayName ? selectedMember.displayName : uid;
        setMessage(memberManageMessage, `${display} added/updated successfully.`, 'success');
        resetMemberPicker();
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        setMessage(memberManageMessage, error.message || 'Unable to update member.');
      });
    });
  }

  if (ownershipTransferForm) {
    ownershipTransferForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(transferRequestMessage);
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const toUid = transferToUidInput ? transferToUidInput.value.trim() : '';
      const hours = transferHoursInput ? Number(transferHoursInput.value || 72) : 72;
      if (!id || !toUid) {
        setMessage(transferRequestMessage, 'Provide a target user UID.');
        return;
      }
      withButtonBusy(transferRequestButton, 'Requesting...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/ownership-transfer`, {
          method: 'POST',
          body: {
            toUid,
            tempPrivilegeHours: hours,
            note: transferNoteInput ? transferNoteInput.value.trim() : '',
          },
        });
        setMessage(transferRequestMessage, 'Ownership transfer request created.', 'success');
        if (transferToUidInput) transferToUidInput.value = '';
        if (transferNoteInput) transferNoteInput.value = '';
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        setMessage(transferRequestMessage, error.message || 'Unable to request transfer.');
      });
    });
  }

  const handleTransferResponse = (action, button) => {
    const id = parsePositiveInt(state.selectedWorkbenchId);
    const transferId = parsePositiveInt(
      state.workbenchDetail &&
      state.workbenchDetail.pendingOwnershipTransfer &&
      state.workbenchDetail.pendingOwnershipTransfer.id
    );
    if (!id || !transferId) {
      setMessage(transferRespondMessage, 'No pending transfer found.');
      return;
    }
    withButtonBusy(button, action === 'accept' ? 'Accepting...' : 'Rejecting...', async () => {
      await apiRequest(`/api/workbench/${encodeURIComponent(id)}/ownership-transfer/respond`, {
        method: 'POST',
        body: {
          transferId,
          action,
          note: transferRespondNoteInput ? transferRespondNoteInput.value.trim() : '',
        },
      });
      setMessage(transferRespondMessage, `Transfer ${action}ed.`, 'success');
      if (transferRespondNoteInput) transferRespondNoteInput.value = '';
      await Promise.all([
        loadWorkbenchList({ preserveSelected: true }),
        loadWorkbenchDetail(id),
      ]);
    }).catch((error) => {
      setMessage(transferRespondMessage, error.message || 'Unable to process transfer response.');
    });
  };

  if (transferAcceptButton) {
    transferAcceptButton.addEventListener('click', () => handleTransferResponse('accept', transferAcceptButton));
  }
  if (transferRejectButton) {
    transferRejectButton.addEventListener('click', () => handleTransferResponse('reject', transferRejectButton));
  }

  if (nodeCreateForm) {
    nodeCreateForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(nodeCreateMessage);
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const editingNodeId = parsePositiveInt(state.directory.editingNodeId);
      const title = nodeTitleInput ? nodeTitleInput.value.trim() : '';
      const visibility = nodeVisibilityInput ? nodeVisibilityInput.value : 'private';
      const parentId = parsePositiveInt(state.directory.currentParentId);
      if (!id || !title) {
        setMessage(nodeCreateMessage, 'Select a workbench and provide a file title.');
        return;
      }
      const busyLabel = editingNodeId ? 'Saving...' : 'Adding...';
      withButtonBusy(nodeCreateButton, busyLabel, async () => {
        if (editingNodeId) {
          await apiRequest(`/api/workbench/${encodeURIComponent(id)}/nodes/${encodeURIComponent(editingNodeId)}`, {
            method: 'PATCH',
            body: {
              title,
              markdown: nodeMarkdownInput ? nodeMarkdownInput.value : '',
              sortOrder: nodeSortOrderInput ? Number(nodeSortOrderInput.value || 0) : 0,
            },
          });
          await setDirectoryVisibility({ id: editingNodeId, nodeType: 'file' }, visibility);
          setMessage(nodeCreateMessage, 'File updated.', 'success');
          clearDirectoryEditorForm();
          await loadWorkbenchDetail(id);
          return;
        }

        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/directory`, {
          method: 'POST',
          body: {
            type: 'file',
            title,
            visibility,
            parentId,
            markdown: nodeMarkdownInput ? nodeMarkdownInput.value : '',
            sortOrder: nodeSortOrderInput ? Number(nodeSortOrderInput.value || 0) : 0,
          },
        });
        setMessage(nodeCreateMessage, 'File created.', 'success');
        clearDirectoryEditorForm();
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        const fallback = editingNodeId ? 'Unable to save file.' : 'Unable to create item.';
        setMessage(nodeCreateMessage, error.message || fallback);
      });
    });
  }

  if (markdownViewerEditForm) {
    markdownViewerEditForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(markdownViewerEditMessage);
      const permissions = getActivePermissions();
      const canEditFile = Boolean(permissions && permissions.canCreateNodes);
      if (!canEditFile) {
        setMessage(markdownViewerEditMessage, 'You do not have permission to edit this file.');
        return;
      }
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const node = getCurrentViewingNode();
      const title = String(markdownViewerTitleInput ? markdownViewerTitleInput.value : '').trim();
      const visibility = markdownViewerVisibilityInput ? markdownViewerVisibilityInput.value : 'private';
      const sortOrder = markdownViewerSortOrderInput ? Number(markdownViewerSortOrderInput.value || 0) : 0;
      const markdown = markdownViewerMarkdownInput ? markdownViewerMarkdownInput.value : '';
      if (!id || !node || node.nodeType !== 'file') {
        setMessage(markdownViewerEditMessage, 'File is no longer available.');
        return;
      }
      if (!title) {
        setMessage(markdownViewerEditMessage, 'File title is required.');
        return;
      }

      withButtonBusy(markdownViewerSaveButton, 'Saving...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/nodes/${encodeURIComponent(node.id)}`, {
          method: 'PATCH',
          body: {
            title,
            markdown,
            sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          },
        });
        await setDirectoryVisibility({ id: node.id, nodeType: 'file' }, visibility);
        state.directory.viewerEditMode = true;
        await loadWorkbenchDetail(id);
        setMessage(markdownViewerEditMessage, 'File updated.', 'success');
      }).catch((error) => {
        setMessage(markdownViewerEditMessage, error.message || 'Unable to save file.');
      });
    });
  }

  if (noteTargetTypeInput) {
    noteTargetTypeInput.addEventListener('change', () => {
      updateWorkbenchSelectOptions();
    });
  }

  if (noteCreateForm) {
    noteCreateForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(noteCreateMessage);
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const targetType = noteTargetTypeInput ? noteTargetTypeInput.value : 'node';
      const targetId = parsePositiveInt(noteTargetIdInput && noteTargetIdInput.value);
      const content = noteContentInput ? noteContentInput.value.trim() : '';
      if (!id || !targetId || !content) {
        setMessage(noteCreateMessage, 'Provide note content and select a valid target.');
        return;
      }
      const body = targetType === 'edge'
        ? { edgeId: targetId, content }
        : { nodeId: targetId, content };
      withButtonBusy(noteCreateButton, 'Adding...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/notes`, {
          method: 'POST',
          body,
        });
        setMessage(noteCreateMessage, 'Note added.', 'success');
        if (noteContentInput) noteContentInput.value = '';
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        setMessage(noteCreateMessage, error.message || 'Unable to add note.');
      });
    });
  }

  if (noteCreateAiButton) {
    noteCreateAiButton.addEventListener('click', () => {
      clearMessage(noteCreateAiMessage);
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const targetType = noteTargetTypeInput ? noteTargetTypeInput.value : 'node';
      const targetId = parsePositiveInt(noteTargetIdInput && noteTargetIdInput.value);
      if (!id || !targetId) {
        setMessage(noteCreateAiMessage, 'Select a valid target node/edge first.');
        return;
      }
      const body = targetType === 'edge'
        ? { edgeId: targetId }
        : { nodeId: targetId };
      const instruction = aiNoteInstructionInput ? aiNoteInstructionInput.value.trim() : '';
      if (instruction) {
        body.instruction = instruction;
      }
      withButtonBusy(noteCreateAiButton, 'Generating...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/ai-note`, {
          method: 'POST',
          body,
        });
        setMessage(noteCreateAiMessage, 'AI note created.', 'success');
        if (aiNoteInstructionInput) aiNoteInstructionInput.value = '';
        await loadWorkbenchDetail(id);
      }).catch((error) => {
        if (Number(error && error.status) === 404) {
          updateWorkbenchAiUi(false);
        }
        setMessage(noteCreateAiMessage, error.message || 'Unable to generate AI note.');
      });
    });
  }

  if (taskCreateForm) {
    taskCreateForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearMessage(taskCreateMessage);
      const id = parsePositiveInt(state.selectedWorkbenchId);
      const title = taskTitleInput ? taskTitleInput.value.trim() : '';
      if (!id || !title) {
        setMessage(taskCreateMessage, 'Select a workbench and provide a task title.');
        return;
      }
      const selectedAssigneeIds = Array.from(
        new Set(
          (state.taskAssigneePicker.selected || [])
            .map((entry) => getTaskAssigneeId(entry))
            .filter(Boolean)
        )
      );
      const pendingTyped = taskAssigneeSearchInput
        ? taskAssigneeSearchInput.value
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      const assigneeIds = Array.from(new Set([...selectedAssigneeIds, ...pendingTyped]));

      withButtonBusy(taskCreateButton, 'Creating...', async () => {
        await apiRequest(`/api/workbench/${encodeURIComponent(id)}/tasks`, {
          method: 'POST',
          body: {
            title,
            description: taskDescriptionInput ? taskDescriptionInput.value.trim() : '',
            taskType: taskTypeInput ? taskTypeInput.value : 'collaborative',
            priority: taskPriorityInput ? taskPriorityInput.value : 'normal',
            dueAt: taskDueAtInput && taskDueAtInput.value ? taskDueAtInput.value : null,
            groupTitle: taskGroupTitleInput ? taskGroupTitleInput.value.trim() || 'General' : 'General',
            assigneeIds,
            requiresSubmissionFile: Boolean(taskRequiresFileInput && taskRequiresFileInput.checked),
          },
        });
        setMessage(taskCreateMessage, 'Task created.', 'success');
        if (taskTitleInput) taskTitleInput.value = '';
        if (taskDescriptionInput) taskDescriptionInput.value = '';
        resetTaskAssigneePicker();
        if (taskRequiresFileInput) taskRequiresFileInput.checked = false;
        await loadTasks();
      }).catch((error) => {
        setMessage(taskCreateMessage, error.message || 'Unable to create task.');
      });
    });
  }
}

function getInitialWorkbenchId() {
  const params = new URLSearchParams(window.location.search);
  const id = parsePositiveInt(params.get('id'));
  return id;
}

async function tryOpenSharedMarkdownLink() {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();
  if (!token) return;
  const workbenchId = parsePositiveInt(params.get('id') || state.selectedWorkbenchId);
  if (!workbenchId) return;
  try {
    if (Number(state.selectedWorkbenchId) !== Number(workbenchId)) {
      await selectWorkbench(workbenchId);
    }
    const data = await apiRequest(`/api/workbench/${encodeURIComponent(workbenchId)}/directory/shared/${encodeURIComponent(token)}`);
    const path = Array.isArray(data && data.path) ? data.path : [];
    const parent = path.length >= 2 ? parsePositiveInt(path[path.length - 2].id) : null;
    if (parent) {
      await loadDirectory({ parentId: parent });
    }
    setWorkbenchView('markdown');
    if (data && data.node && data.node.title) {
      setMessage(nodeCreateMessage, `Opened shared file: ${data.node.title}`, 'success');
    }
  } catch (error) {
    setMessage(nodeCreateMessage, error.message || 'Unable to open shared file.');
  }
}

async function bootstrap() {
  bindEvents();
  setWorkbenchView('overview');
  updateWorkbenchAiUi(true, 'AI notes: select a workbench');
  clearDirectoryEditorForm();
  setDirectoryPendingOperation(null);
  resetTaskAssigneePicker();
  updateCollapsibleUi();
  updateBoardCanvasExpandedUi();
  renderBoardAiChatMessages();
  renderGraphCanvas();
  await loadProfile();
  await Promise.all([
    loadRequestQueue(),
    loadWorkbenchList({ preserveSelected: false }),
  ]);

  const initialId = getInitialWorkbenchId();
  if (initialId) {
    await selectWorkbench(initialId);
  }
  await tryOpenSharedMarkdownLink();
}

bootstrap();
