const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuthApi = require('../middleware/requireAuthApi');
const { uploadToStorage, getSignedUrl } = require('../services/storage');
const { getOpenAIClient, getOpenAIModel } = require('../services/openaiClient');
const { getPlatformRole, hasProfessorPrivileges } = require('../services/roleAccess');
const {
  ensureAiGovernanceReady,
  logAiAuditEvent,
  incrementAiUsage,
  checkAiDailyQuota,
} = require('../services/aiGovernanceService');
const {
  isWorkbenchEnabled,
  isTaskboardEnabled,
  isWorkbenchTransferEnabled,
  isAiScanEnabled,
} = require('../services/featureFlags');

const router = express.Router();
const SUBMISSION_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SUBMISSION_UPLOAD_MAX_BYTES },
});

const SIGNED_TTL = Number(process.env.GCS_SIGNED_URL_TTL_MINUTES || 60);
const DEFAULT_TRANSFER_EXPIRY_HOURS = Math.max(1, Number(process.env.WORKBENCH_TRANSFER_EXPIRY_HOURS || 72));
const MAX_SCOPED_PRIVILEGE_HOURS = Math.max(1, Number(process.env.WORKBENCH_SCOPED_PRIVILEGE_MAX_HOURS || 168));
const DEFAULT_WORKBENCH_AI_NOTE_DAILY_LIMIT = 20;
const DEFAULT_WORKBENCH_AI_CHAT_DAILY_LIMIT = 60;
const MAX_BOARD_AI_ACTIONS = 5;
const WORKBENCH_ROOT_FOLDER_NAME = 'root';
const WORKBENCH_WORKSPACE_FOLDER_NAME = 'workbench';
const WORKBENCH_RECYCLE_BIN_NAME = 'recycle-bin';
let ensureWorkbenchTablesPromise = null;

function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function escapeLikePattern(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeWorkbenchNodeType(value) {
  const normalized = sanitizeText(value, 20).toLowerCase();
  return normalized === 'folder' ? 'folder' : 'file';
}

function normalizeWorkbenchNodeVisibility(value) {
  const normalized = sanitizeText(value, 20).toLowerCase();
  return normalized === 'members' ? 'members' : 'private';
}

function normalizeEdgeAnchor(value, fallback = 'right') {
  const normalized = sanitizeText(value, 12).toLowerCase();
  if (['top', 'right', 'bottom', 'left'].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function canManageNodeEntity({ permissions, node, viewerUid }) {
  if (!node || !viewerUid) return false;
  if (permissions && permissions.canManageNodes) return true;
  return node.created_by_uid === viewerUid;
}

function canViewNodeEntity({ permissions, node, viewerUid }) {
  if (!node || !viewerUid) return false;
  if (permissions && permissions.canManageNodes) return true;
  if (node.visibility === 'members') return true;
  return node.created_by_uid === viewerUid;
}

function isProtectedSystemFolder(node, roots) {
  if (!node) return false;
  if (node.title === WORKBENCH_ROOT_FOLDER_NAME && node.parent_node_id == null) return true;
  if (!roots) return false;
  const id = Number(node.id);
  return (
    id === Number(roots.rootId) ||
    id === Number(roots.workspaceFolderId) ||
    id === Number(roots.recycleBinId)
  );
}

function normalizeWorkbenchVisibility(value) {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (normalized === 'open' || normalized === 'invite_only') return normalized;
  return 'invite_only';
}

function normalizeWorkbenchStatus(value) {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (normalized === 'pending' || normalized === 'active' || normalized === 'archived') return normalized;
  return 'active';
}

function normalizeTaskType(value) {
  const normalized = sanitizeText(value, 30).toLowerCase();
  if (normalized === 'personal' || normalized === 'collaborative') return normalized;
  return 'collaborative';
}

function normalizeTaskPriority(value) {
  const normalized = sanitizeText(value, 20).toLowerCase();
  if (normalized === 'low' || normalized === 'normal' || normalized === 'urgent') return normalized;
  return 'normal';
}

function normalizeTaskStatus(value) {
  const normalized = sanitizeText(value, 30).toLowerCase();
  if (['pending', 'in_progress', 'completed', 'archived'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
}

function normalizeTransferStatus(value) {
  const normalized = sanitizeText(value, 40).toLowerCase();
  if (['pending', 'accepted', 'rejected', 'canceled', 'expired'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
}

function parseDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function extractOpenAiText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const chunks = [];
  output.forEach((item) => {
    const contentItems = Array.isArray(item && item.content) ? item.content : [];
    contentItems.forEach((content) => {
      const text = typeof content && typeof content.text === 'string' ? content.text.trim() : '';
      if (text) chunks.push(text);
    });
  });
  return chunks.join('\n\n').trim();
}

function looksLikeBoardMutationRequest(value) {
  const text = sanitizeText(value, 4000).toLowerCase();
  if (!text) return false;
  const mutationPattern =
    /\b(create|add|make|insert|generate|draft|place|put|pin|spawn|drop|attach|publish)\b[\s\S]{0,140}\b(markdown|file|note|document|node|canvas|board)\b|\b(canvas|board)\b[\s\S]{0,140}\b(add|place|pin|put|create|insert|show|drop)\b/i;
  return mutationPattern.test(text);
}

function normalizeBoardActionKey(value) {
  const normalized = sanitizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized;
}

function cleanBoardTitleCandidate(value, maxLen = 220) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/[`"'“”]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitizeText(cleaned, maxLen);
}

function extractBoardCreateTitleFromMessage(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  const namedMatch = text.match(/\b(?:called|named|titled|title)\s+["“]?([^"”\n,.]{2,220})/i);
  if (namedMatch && namedMatch[1]) {
    return cleanBoardTitleCandidate(namedMatch[1]);
  }
  const explicitMatch = text.match(/\b(?:create|add|make|generate|draft)\s+(?:a|an)?\s*(?:new\s+)?(?:markdown\s+)?(?:file|note|document|node)\s+["“]?([^"”\n]{2,220})/i);
  if (explicitMatch && explicitMatch[1]) {
    const candidate = explicitMatch[1].split(/\b(?:in|inside|under|on|to)\b/i)[0] || explicitMatch[1];
    return cleanBoardTitleCandidate(candidate, 120);
  }
  const topicMatch = text.match(/\b(?:about|for|on)\s+["“]?([^"”\n,.]{2,220})/i);
  if (topicMatch && topicMatch[1]) {
    return cleanBoardTitleCandidate(topicMatch[1], 120);
  }
  return '';
}

function extractBoardParentTitleFromMessage(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  const parentMatch = text.match(/\b(?:in|inside|under)\s+(?:folder\s+)?["“]?([^"”\n,.]{2,220})/i);
  if (!parentMatch || !parentMatch[1]) return '';
  return cleanBoardTitleCandidate(parentMatch[1], 220);
}

function extractBoardMarkdownBodyFromMessage(message) {
  const text = String(message || '');
  if (!text) return '';
  const fenced = text.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim().slice(0, 250000);
  }
  const bodyMatch = text.match(/\b(?:content|markdown|body|notes?)\s*:\s*([\s\S]{2,250000})$/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1].trim().slice(0, 250000);
  }
  return '';
}

function extractPlacementTargetFromMessage(message) {
  const text = String(message || '').trim();
  if (!text) return { nodeId: null, nodeTitle: '' };
  const idMatch = text.match(/(?:node|file|item)?\s*#(\d{1,12})/i) || text.match(/\bid\s*[:#]?\s*(\d{1,12})\b/i);
  const nodeId = idMatch ? parsePositiveInt(idMatch[1]) : null;

  const byNameMatch =
    text.match(/\b(?:node|file|folder)\s+(?:named|called|titled)\s+["“]?([^"”\n,.]{2,220})/i)
    || text.match(/\b(?:place|put|pin|show|add)\s+["“]?([^"”\n,.]{2,220})["”]?\s+(?:on|into)\s+(?:the\s+)?(?:canvas|board)/i);
  const nodeTitle = byNameMatch && byNameMatch[1]
    ? cleanBoardTitleCandidate(byNameMatch[1], 220)
    : '';
  return { nodeId, nodeTitle };
}

function deriveBoardAiActionsFromMessage({ message, canCreateNodes }) {
  if (!canCreateNodes) return [];
  const text = sanitizeText(message, 4000);
  if (!text || !looksLikeBoardMutationRequest(text)) return [];

  const lower = text.toLowerCase();
  const actions = [];
  const wantsCreate =
    /\b(create|add|make|generate|draft|new)\b/.test(lower)
    && /\b(markdown|file|note|document|node)\b/.test(lower);
  const wantsPlaceOnCanvas =
    /\b(place|put|pin|drop|show|add)\b[\s\S]{0,140}\b(canvas|board)\b/i.test(text)
    || /\bon\s+(?:the\s+)?(?:canvas|board)\b/i.test(text);

  if (wantsCreate) {
    const title = extractBoardCreateTitleFromMessage(text);
    if (title) {
      const visibility = /\b(members?|shared|team|everyone|all members|workbench members)\b/i.test(text)
        ? 'members'
        : 'private';
      actions.push({
        type: 'create_markdown_file',
        title,
        markdown: extractBoardMarkdownBodyFromMessage(text),
        visibility,
        parentTitle: extractBoardParentTitleFromMessage(text),
        placeOnCanvas: wantsPlaceOnCanvas,
      });
    }
  }

  const wantsPlaceExisting =
    wantsPlaceOnCanvas
    && (/\b(existing|already)\b/i.test(text) || !wantsCreate || /\bnode\b/i.test(text));
  if (wantsPlaceExisting) {
    const target = extractPlacementTargetFromMessage(text);
    if (target.nodeId || target.nodeTitle) {
      actions.push({
        type: 'place_node_on_canvas',
        nodeId: target.nodeId,
        nodeTitle: target.nodeTitle,
        force: /\b(force|reposition|move again|override)\b/i.test(text),
      });
    }
  }

  return actions
    .slice(0, MAX_BOARD_AI_ACTIONS)
    .map((action) => normalizeBoardAiAction(action))
    .filter(Boolean);
}

function extractJsonObjectFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [];
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    candidates.push(fencedMatch[1].trim());
  }
  candidates.push(raw);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = candidate.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(sliced);
        } catch (_nestedError) {
          // continue
        }
      }
    }
  }
  return null;
}

function normalizeBoardAiActionType(value) {
  const normalized = normalizeBoardActionKey(value);
  if (!normalized) return '';
  const mapping = {
    create_markdown_file: 'create_markdown_file',
    create_markdown: 'create_markdown_file',
    create_markdown_note: 'create_markdown_file',
    create_file: 'create_markdown_file',
    create_note: 'create_markdown_file',
    create_document: 'create_markdown_file',
    add_markdown_file: 'create_markdown_file',
    add_markdown_note: 'create_markdown_file',
    add_markdown: 'create_markdown_file',
    create_node: 'create_markdown_file',
    add_node: 'create_markdown_file',
    make_file: 'create_markdown_file',
    make_markdown_file: 'create_markdown_file',
    generate_markdown_file: 'create_markdown_file',
    place_node_on_canvas: 'place_node_on_canvas',
    place_on_canvas: 'place_node_on_canvas',
    add_node_to_canvas: 'place_node_on_canvas',
    place_existing_node_on_canvas: 'place_node_on_canvas',
    pin_node: 'place_node_on_canvas',
    pin_node_to_canvas: 'place_node_on_canvas',
    move_node_to_canvas: 'place_node_on_canvas',
    add_to_canvas: 'place_node_on_canvas',
  };
  if (mapping[normalized]) return mapping[normalized];
  if (normalized.includes('create') && (normalized.includes('file') || normalized.includes('markdown') || normalized.includes('note') || normalized.includes('document') || normalized.includes('node'))) {
    return 'create_markdown_file';
  }
  if ((normalized.includes('place') || normalized.includes('pin') || normalized.includes('add') || normalized.includes('put') || normalized.includes('move')) && normalized.includes('canvas')) {
    return 'place_node_on_canvas';
  }
  return '';
}

function normalizeBoardAiAction(rawAction) {
  if (!rawAction || typeof rawAction !== 'object') return null;
  const type = normalizeBoardAiActionType(rawAction.type || rawAction.action || rawAction.actionType || rawAction.intent || rawAction.operation);
  if (!type) return null;

  if (type === 'create_markdown_file') {
    return {
      type,
      title: sanitizeText(
        rawAction.title
          || rawAction.name
          || rawAction.fileName
          || rawAction.file_title
          || rawAction.nodeTitle
          || rawAction.node_name,
        220
      ),
      markdown: typeof rawAction.markdown === 'string'
        ? rawAction.markdown.slice(0, 250000)
        : (typeof rawAction.content === 'string'
          ? rawAction.content.slice(0, 250000)
          : (typeof rawAction.body === 'string'
            ? rawAction.body.slice(0, 250000)
            : (typeof rawAction.text === 'string' ? rawAction.text.slice(0, 250000) : ''))),
      visibility: normalizeWorkbenchNodeVisibility(rawAction.visibility || rawAction.access || rawAction.shareWith || 'private'),
      parentNodeId: parsePositiveInt(
        rawAction.parentNodeId ||
        rawAction.parentId ||
        rawAction.parent_id ||
        rawAction.folderId ||
        rawAction.parent_folder_id ||
        rawAction.parentNode
      ),
      parentTitle: sanitizeText(
        rawAction.parentTitle
          || rawAction.parentFolderName
          || rawAction.folderTitle
          || rawAction.parent_folder_title
          || rawAction.folder_name,
        220
      ),
      placeOnCanvas: parseBoolean(
        rawAction.placeOnCanvas != null
          ? rawAction.placeOnCanvas
          : (rawAction.place_on_canvas != null
            ? rawAction.place_on_canvas
            : (rawAction.addToCanvas != null
              ? rawAction.addToCanvas
              : rawAction.onCanvas)),
        false
      ),
      positionX: Number.isFinite(Number(rawAction.positionX != null ? rawAction.positionX : rawAction.x))
        ? Number(rawAction.positionX != null ? rawAction.positionX : rawAction.x)
        : null,
      positionY: Number.isFinite(Number(rawAction.positionY != null ? rawAction.positionY : rawAction.y))
        ? Number(rawAction.positionY != null ? rawAction.positionY : rawAction.y)
        : null,
    };
  }

  return {
    type,
    nodeId: parsePositiveInt(
      rawAction.nodeId
      || rawAction.id
      || rawAction.targetNodeId
      || rawAction.node_id
      || (rawAction.node && rawAction.node.id)
    ),
    nodeTitle: sanitizeText(
      rawAction.nodeTitle
      || rawAction.title
      || rawAction.targetTitle
      || rawAction.node_name
      || (rawAction.node && rawAction.node.title),
      220
    ),
    positionX: Number.isFinite(Number(rawAction.positionX != null ? rawAction.positionX : rawAction.x))
      ? Number(rawAction.positionX != null ? rawAction.positionX : rawAction.x)
      : null,
    positionY: Number.isFinite(Number(rawAction.positionY != null ? rawAction.positionY : rawAction.y))
      ? Number(rawAction.positionY != null ? rawAction.positionY : rawAction.y)
      : null,
    force: parseBoolean(rawAction.force != null ? rawAction.force : rawAction.reposition, false),
  };
}

function normalizeBoardAiActionPlan(plan) {
  const payload = plan && typeof plan === 'object' ? plan : {};
  const isTopLevelArray = Array.isArray(plan);
  const assistantMessage = sanitizeText(
    payload.assistantMessage
      || payload.assistant_message
      || payload.reply
      || payload.response
      || payload.message
      || payload.summary
      || '',
    2200
  );
  const rawActions = isTopLevelArray
    ? plan
    : (Array.isArray(payload.actions)
      ? payload.actions
      : (Array.isArray(payload.operations)
        ? payload.operations
        : (Array.isArray(payload.mutations)
          ? payload.mutations
          : (Array.isArray(payload.steps) ? payload.steps : []))));
  const actions = rawActions
    .slice(0, MAX_BOARD_AI_ACTIONS)
    .map((entry) => normalizeBoardAiAction(entry))
    .filter(Boolean);
  return { assistantMessage, actions };
}

function computeNextCanvasPosition(nodeRows) {
  const placed = Array.isArray(nodeRows)
    ? nodeRows.filter((node) => Number.isFinite(Number(node.position_x)) && Number.isFinite(Number(node.position_y)))
    : [];
  const index = placed.length;
  const columns = 4;
  return {
    x: 56 + (index % columns) * 220,
    y: 48 + Math.floor(index / columns) * 138,
  };
}

function findNodeForPlacement(action, nodes, roots) {
  const list = Array.isArray(nodes) ? nodes : [];
  const blockedIds = new Set(
    [roots && roots.rootId, roots && roots.workspaceFolderId, roots && roots.recycleBinId]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

  if (action && action.nodeId) {
    const byId = list.find((node) => Number(node.id) === Number(action.nodeId));
    if (byId && !blockedIds.has(Number(byId.id))) return byId;
  }

  const wanted = sanitizeText(action && action.nodeTitle, 220).toLowerCase();
  if (!wanted) return null;

  const exact = list.find((node) => !blockedIds.has(Number(node.id)) && String(node.title || '').trim().toLowerCase() === wanted);
  if (exact) return exact;

  return list.find((node) => !blockedIds.has(Number(node.id)) && String(node.title || '').toLowerCase().includes(wanted)) || null;
}

function buildBoardActionSummary(executedActions, skippedActions) {
  const executed = Array.isArray(executedActions) ? executedActions : [];
  const skipped = Array.isArray(skippedActions) ? skippedActions : [];
  const lines = [];
  if (executed.length) {
    lines.push('Executed actions:');
    executed.forEach((entry) => {
      if (entry.type === 'create_markdown_file') {
        lines.push(`- Created markdown file "${entry.title}" (id: ${entry.nodeId})${entry.placedOnCanvas ? ' and placed on canvas' : ''}.`);
        return;
      }
      if (entry.type === 'place_node_on_canvas') {
        lines.push(`- Placed node "${entry.title}" (id: ${entry.nodeId}) on canvas.`);
        return;
      }
      lines.push(`- Executed ${entry.type || 'action'}.`);
    });
  }
  if (skipped.length) {
    lines.push('Skipped actions:');
    skipped.forEach((entry) => {
      lines.push(`- ${entry.reason || 'Action skipped.'}`);
    });
  }
  return lines.join('\n').trim();
}

async function executeBoardAiActions({
  client,
  workbenchId,
  viewerUid,
  permissions,
  roots,
  nodes,
  actions,
  aiModel,
}) {
  const executedActions = [];
  const skippedActions = [];
  const canCreateNodes = Boolean(permissions && permissions.canCreateNodes === true);
  const list = Array.isArray(nodes) ? nodes.map((node) => ({ ...node })) : [];

  if (!canCreateNodes) {
    skippedActions.push({ reason: 'You do not have permission to create or place nodes in this workbench.' });
    return { executedActions, skippedActions };
  }

  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;

    if (action.type === 'create_markdown_file') {
      const title = sanitizeText(action.title, 220);
      if (!title) {
        skippedActions.push({ reason: 'Skipped create action because the title is missing.' });
        continue;
      }

      let parentNodeId = parsePositiveInt(action.parentNodeId) || Number(roots && roots.workspaceFolderId);
      if (action.parentTitle) {
        const wantedParent = String(action.parentTitle).toLowerCase();
        const folderMatch = list.find((node) =>
          String(node.node_type || '').toLowerCase() === 'folder' &&
          String(node.title || '').trim().toLowerCase() === wantedParent
        );
        if (folderMatch) {
          parentNodeId = Number(folderMatch.id);
        }
      }

      let parentNode = await getWorkbenchNodeById(workbenchId, parentNodeId, client);
      const recycleBinId = Number(roots && roots.recycleBinId);
      if (!parentNode || parentNode.node_type !== 'folder' || parentNode.is_deleted === true || Number(parentNode.id) === recycleBinId) {
        parentNodeId = Number(roots && roots.workspaceFolderId);
        parentNode = await getWorkbenchNodeById(workbenchId, parentNodeId, client);
      }
      if (!parentNode || parentNode.node_type !== 'folder' || parentNode.is_deleted === true) {
        skippedActions.push({ reason: `Skipped "${title}" because no valid parent folder is available.` });
        continue;
      }

      let positionX = null;
      let positionY = null;
      const wantsCanvasPlacement = action.placeOnCanvas === true;
      if (wantsCanvasPlacement) {
        positionX = Number.isFinite(action.positionX) ? action.positionX : null;
        positionY = Number.isFinite(action.positionY) ? action.positionY : null;
        if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) {
          const next = computeNextCanvasPosition(list);
          positionX = next.x;
          positionY = next.y;
        }
      }

      const inserted = await client.query(
        `INSERT INTO workbench_nodes
          (workbench_id, created_by_uid, title, markdown_content, node_type, parent_node_id, visibility, is_deleted, position_x, position_y, sort_order, source, ai_model, created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, 'file', $5, $6, false, $7, $8, 0, 'ai', $9, NOW(), NOW())
         RETURNING id, title, node_type, markdown_content, visibility, parent_node_id, position_x, position_y`,
        [
          workbenchId,
          viewerUid,
          title,
          typeof action.markdown === 'string' ? action.markdown : '',
          Number(parentNode.id),
          normalizeWorkbenchNodeVisibility(action.visibility),
          wantsCanvasPlacement ? positionX : null,
          wantsCanvasPlacement ? positionY : null,
          aiModel || null,
        ]
      );
      const row = inserted.rows[0];
      list.push(row);
      executedActions.push({
        type: 'create_markdown_file',
        nodeId: Number(row.id),
        title: row.title || title,
        placedOnCanvas: wantsCanvasPlacement,
      });
      continue;
    }

    if (action.type === 'place_node_on_canvas') {
      const targetNode = findNodeForPlacement(action, list, roots);
      if (!targetNode) {
        skippedActions.push({ reason: 'Skipped place action because the target node was not found.' });
        continue;
      }
      if (
        Number(targetNode.id) === Number(roots && roots.rootId) ||
        Number(targetNode.id) === Number(roots && roots.workspaceFolderId) ||
        Number(targetNode.id) === Number(roots && roots.recycleBinId)
      ) {
        skippedActions.push({ reason: `Skipped "${targetNode.title || 'node'}" because system folders cannot be placed.` });
        continue;
      }

      const alreadyPlaced = Number.isFinite(Number(targetNode.position_x)) && Number.isFinite(Number(targetNode.position_y));
      if (alreadyPlaced && !action.force) {
        skippedActions.push({ reason: `Skipped "${targetNode.title || 'node'}" because it is already on canvas.` });
        continue;
      }

      let positionX = Number.isFinite(action.positionX) ? action.positionX : null;
      let positionY = Number.isFinite(action.positionY) ? action.positionY : null;
      if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) {
        const next = computeNextCanvasPosition(list);
        positionX = next.x;
        positionY = next.y;
      }

      const updated = await client.query(
        `UPDATE workbench_nodes
         SET position_x = $3,
             position_y = $4,
             updated_at = NOW()
         WHERE workbench_id = $1
           AND id = $2
           AND node_type IN ('file', 'folder')
           AND COALESCE(is_deleted, false) = false
         RETURNING id, title, position_x, position_y`,
        [workbenchId, Number(targetNode.id), positionX, positionY]
      );
      if (!updated.rows.length) {
        skippedActions.push({ reason: `Skipped "${targetNode.title || 'node'}" because it is no longer available.` });
        continue;
      }

      const placed = updated.rows[0];
      const index = list.findIndex((entry) => Number(entry.id) === Number(placed.id));
      if (index >= 0) {
        list[index] = {
          ...list[index],
          position_x: placed.position_x,
          position_y: placed.position_y,
        };
      }
      executedActions.push({
        type: 'place_node_on_canvas',
        nodeId: Number(placed.id),
        title: placed.title || targetNode.title || `Node #${placed.id}`,
      });
      continue;
    }

    skippedActions.push({ reason: `Skipped unsupported action type "${action.type}".` });
  }

  return { executedActions, skippedActions };
}

async function planBoardAiActions({
  openAiClient,
  aiModel,
  workbench,
  message,
  history,
  nodes,
  canCreateNodes,
}) {
  const recent = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = recent
    .map((entry) => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
    .join('\n');
  const nodeHints = (Array.isArray(nodes) ? nodes : [])
    .slice(0, 70)
    .map((node) => `- #${node.id} [${node.node_type === 'folder' ? 'folder' : 'file'}] ${sanitizeText(node.title || '', 120) || 'Untitled'}`)
    .join('\n');

  const plannerPrompt = [
    'You are the Workbench MCP action planner.',
    'Decide if the user is requesting board mutations.',
    'Allowed actions:',
    '1) create_markdown_file',
    '   fields: title (required), markdown (optional), visibility ("private" or "members"), placeOnCanvas (boolean, optional), parentNodeId (optional), parentTitle (optional)',
    '2) place_node_on_canvas',
    '   fields: nodeId (preferred), nodeTitle (fallback), positionX/positionY (optional), force (optional)',
    '',
    'Return JSON only with this shape:',
    '{"assistantMessage":"...","actions":[...]}',
    '',
    `Workbench title: ${workbench && workbench.title ? workbench.title : 'Untitled workbench'}`,
    `Course: ${workbench && workbench.course ? workbench.course : 'Unknown course'}`,
    `Can mutate nodes: ${canCreateNodes ? 'yes' : 'no'}`,
    '',
    'Known visible nodes:',
    nodeHints || '- none',
    '',
    'Recent chat:',
    historyText || '- none',
    '',
    `Latest user message: ${message}`,
    '',
    'Rules:',
    '- Keep actions empty if the user is only asking a question.',
    '- Never output more than 5 actions.',
    '- If required fields are missing, ask a concise clarifying assistantMessage and keep actions empty.',
  ].join('\n');

  const response = await openAiClient.responses.create({
    model: aiModel,
    input: plannerPrompt,
    max_output_tokens: 900,
  });
  const text = extractOpenAiText(response);
  const parsed = extractJsonObjectFromText(text);
  const normalized = normalizeBoardAiActionPlan(parsed || {});
  return {
    ...normalized,
    rawText: text,
    requestId: response && response.id ? response.id : null,
    promptLength: plannerPrompt.length,
  };
}

function displayNameFromRow(row) {
  if (!row || typeof row !== 'object') return 'Member';
  return (
    row.profile_display_name ||
    row.account_display_name ||
    row.username ||
    row.email ||
    row.uid ||
    'Member'
  );
}

async function ensureWorkbenchTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS workbenches (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      course TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'invite_only'
        CHECK (visibility IN ('open', 'invite_only')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'archived')),
      owner_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      approved_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workbench_members (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'manager', 'member', 'viewer')),
      state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('pending', 'active', 'removed')),
      invited_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workbench_id, user_uid)
    );

    CREATE TABLE IF NOT EXISTS workbench_nodes (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      title TEXT NOT NULL,
      markdown_content TEXT NOT NULL DEFAULT '',
      node_type TEXT NOT NULL DEFAULT 'file' CHECK (node_type IN ('file', 'folder')),
      parent_node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE SET NULL,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'members')),
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ,
      deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      shared_token TEXT,
      shared_at TIMESTAMPTZ,
      copied_from_node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE SET NULL,
      position_x DOUBLE PRECISION,
      position_y DOUBLE PRECISION,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
      ai_model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workbench_edges (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      from_node_id BIGINT NOT NULL REFERENCES workbench_nodes(id) ON DELETE CASCADE,
      to_node_id BIGINT NOT NULL REFERENCES workbench_nodes(id) ON DELETE CASCADE,
      from_anchor TEXT NOT NULL DEFAULT 'right' CHECK (from_anchor IN ('top', 'right', 'bottom', 'left')),
      to_anchor TEXT NOT NULL DEFAULT 'left' CHECK (to_anchor IN ('top', 'right', 'bottom', 'left')),
      description TEXT NOT NULL DEFAULT '',
      created_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (from_node_id <> to_node_id),
      UNIQUE (workbench_id, from_node_id, to_node_id)
    );

    CREATE TABLE IF NOT EXISTS workbench_notes (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE CASCADE,
      edge_id BIGINT REFERENCES workbench_edges(id) ON DELETE CASCADE,
      author_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai')),
      ai_model TEXT,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((CASE WHEN node_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN edge_id IS NULL THEN 0 ELSE 1 END) = 1)
    );

    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS node_type TEXT NOT NULL DEFAULT 'file';
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS parent_node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE SET NULL;
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS deleted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL;
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS shared_token TEXT;
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
    ALTER TABLE workbench_nodes
      ADD COLUMN IF NOT EXISTS copied_from_node_id BIGINT REFERENCES workbench_nodes(id) ON DELETE SET NULL;

    UPDATE workbench_nodes
    SET node_type = 'file'
    WHERE node_type IS NULL
       OR node_type NOT IN ('file', 'folder');

    UPDATE workbench_nodes
    SET visibility = 'private'
    WHERE visibility IS NULL
       OR visibility NOT IN ('private', 'members');

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workbench_nodes_node_type_check'
      ) THEN
        ALTER TABLE workbench_nodes
          ADD CONSTRAINT workbench_nodes_node_type_check CHECK (node_type IN ('file', 'folder'));
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workbench_nodes_visibility_check'
      ) THEN
        ALTER TABLE workbench_nodes
          ADD CONSTRAINT workbench_nodes_visibility_check CHECK (visibility IN ('private', 'members'));
      END IF;
    END $$;

    ALTER TABLE workbench_edges
      ADD COLUMN IF NOT EXISTS from_anchor TEXT NOT NULL DEFAULT 'right';
    ALTER TABLE workbench_edges
      ADD COLUMN IF NOT EXISTS to_anchor TEXT NOT NULL DEFAULT 'left';

    UPDATE workbench_edges
    SET from_anchor = 'right'
    WHERE from_anchor IS NULL
       OR from_anchor NOT IN ('top', 'right', 'bottom', 'left');

    UPDATE workbench_edges
    SET to_anchor = 'left'
    WHERE to_anchor IS NULL
       OR to_anchor NOT IN ('top', 'right', 'bottom', 'left');

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workbench_edges_from_anchor_check'
      ) THEN
        ALTER TABLE workbench_edges
          ADD CONSTRAINT workbench_edges_from_anchor_check CHECK (from_anchor IN ('top', 'right', 'bottom', 'left'));
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workbench_edges_to_anchor_check'
      ) THEN
        ALTER TABLE workbench_edges
          ADD CONSTRAINT workbench_edges_to_anchor_check CHECK (to_anchor IN ('top', 'right', 'bottom', 'left'));
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS workbench_professor_assignments (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      professor_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workbench_scoped_privileges (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      granted_role TEXT NOT NULL CHECK (granted_role IN ('manager', 'professor_scoped')),
      granted_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      reason TEXT,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workbench_requests (
      id BIGSERIAL PRIMARY KEY,
      requester_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      course TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'invite_only'
        CHECK (visibility IN ('open', 'invite_only')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
      review_note TEXT,
      reviewed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_workbench_id BIGINT REFERENCES workbenches(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workbench_ownership_transfers (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT NOT NULL REFERENCES workbenches(id) ON DELETE CASCADE,
      from_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      to_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      requested_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled', 'expired')),
      temp_privilege_hours INTEGER NOT NULL DEFAULT 72 CHECK (temp_privilege_hours >= 0),
      expires_at TIMESTAMPTZ NOT NULL,
      responded_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_groups (
      id BIGSERIAL PRIMARY KEY,
      workbench_id BIGINT REFERENCES workbenches(id) ON DELETE CASCADE,
      owner_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      visibility TEXT NOT NULL DEFAULT 'workbench'
        CHECK (visibility IN ('personal', 'workbench')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id BIGSERIAL PRIMARY KEY,
      task_group_id BIGINT NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
      workbench_id BIGINT REFERENCES workbenches(id) ON DELETE CASCADE,
      creator_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL DEFAULT 'collaborative'
        CHECK (task_type IN ('personal', 'collaborative')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'urgent')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
      requires_submission_file BOOLEAN NOT NULL DEFAULT false,
      due_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      id BIGSERIAL PRIMARY KEY,
      task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      assigned_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      state TEXT NOT NULL DEFAULT 'assigned'
        CHECK (state IN ('assigned', 'accepted', 'declined', 'completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, user_uid)
    );

    CREATE TABLE IF NOT EXISTS task_submissions (
      id BIGSERIAL PRIMARY KEY,
      task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      submitted_by_uid TEXT NOT NULL REFERENCES accounts(uid) ON DELETE CASCADE,
      storage_key TEXT NOT NULL,
      original_filename TEXT,
      mime_type TEXT,
      size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, submitted_by_uid)
    );

    CREATE TABLE IF NOT EXISTS task_status_history (
      id BIGSERIAL PRIMARY KEY,
      task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      changed_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS workbenches_owner_idx ON workbenches(owner_uid, created_at DESC);
    CREATE INDEX IF NOT EXISTS workbenches_course_idx ON workbenches(course, visibility, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_members_user_idx ON workbench_members(user_uid, state, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_nodes_workbench_idx ON workbench_nodes(workbench_id, sort_order, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_nodes_parent_idx ON workbench_nodes(workbench_id, parent_node_id, is_deleted, sort_order, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_nodes_deleted_idx ON workbench_nodes(workbench_id, is_deleted, deleted_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS workbench_nodes_shared_token_unique_idx
      ON workbench_nodes(shared_token)
      WHERE shared_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS workbench_edges_workbench_idx ON workbench_edges(workbench_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_notes_workbench_idx ON workbench_notes(workbench_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_professor_assignments_active_idx
      ON workbench_professor_assignments(workbench_id, professor_uid, active, expires_at);
    CREATE INDEX IF NOT EXISTS workbench_scoped_privileges_active_idx
      ON workbench_scoped_privileges(workbench_id, user_uid, active, expires_at);
    CREATE INDEX IF NOT EXISTS workbench_requests_status_course_idx
      ON workbench_requests(status, course, created_at DESC);
    CREATE INDEX IF NOT EXISTS workbench_ownership_transfers_workbench_idx
      ON workbench_ownership_transfers(workbench_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS task_groups_workbench_idx ON task_groups(workbench_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS tasks_workbench_status_idx ON tasks(workbench_id, status, due_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS task_assignees_user_state_idx ON task_assignees(user_uid, state, created_at DESC);
    CREATE INDEX IF NOT EXISTS task_submissions_task_idx ON task_submissions(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS task_status_history_task_idx ON task_status_history(task_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS workbench_professor_assignments_active_unique_idx
      ON workbench_professor_assignments(workbench_id, professor_uid)
      WHERE active = true;
    CREATE UNIQUE INDEX IF NOT EXISTS workbench_scoped_privileges_active_unique_idx
      ON workbench_scoped_privileges(workbench_id, user_uid, granted_role)
      WHERE active = true;
    CREATE UNIQUE INDEX IF NOT EXISTS workbench_ownership_transfer_pending_idx
      ON workbench_ownership_transfers(workbench_id)
      WHERE status = 'pending';
  `;
  await pool.query(sql);
}

async function ensureWorkbenchReady() {
  if (!ensureWorkbenchTablesPromise) {
    ensureWorkbenchTablesPromise = ensureWorkbenchTables().catch((error) => {
      ensureWorkbenchTablesPromise = null;
      throw error;
    });
  }
  await ensureWorkbenchTablesPromise;
}

async function getViewer(uid, client = pool) {
  const result = await client.query(
    `SELECT
      a.uid,
      a.email,
      a.username,
      a.display_name AS account_display_name,
      a.course,
      COALESCE(a.platform_role, 'member') AS platform_role,
      COALESCE(a.is_banned, false) AS is_banned,
      p.display_name AS profile_display_name
     FROM accounts a
     LEFT JOIN profiles p ON p.uid = a.uid
     WHERE a.uid = $1
     LIMIT 1`,
    [uid]
  );
  return result.rows[0] || null;
}

async function getWorkbenchById(id, client = pool) {
  const workbenchId = parsePositiveInt(id);
  if (!workbenchId) return null;
  const result = await client.query(
    `SELECT
      w.*,
      COALESCE(op.display_name, oa.display_name, oa.username, oa.email) AS owner_name
     FROM workbenches w
     LEFT JOIN accounts oa ON oa.uid = w.owner_uid
     LEFT JOIN profiles op ON op.uid = w.owner_uid
     WHERE w.id = $1
     LIMIT 1`,
    [workbenchId]
  );
  return result.rows[0] || null;
}

async function getWorkbenchMembership(workbenchId, uid, client = pool) {
  const result = await client.query(
    `SELECT workbench_id, user_uid, role, state, joined_at, invited_by_uid, updated_at
     FROM workbench_members
     WHERE workbench_id = $1 AND user_uid = $2
     LIMIT 1`,
    [workbenchId, uid]
  );
  return result.rows[0] || null;
}

async function hasActiveProfessorAssignment(workbenchId, uid, client = pool) {
  const result = await client.query(
    `SELECT 1
     FROM workbench_professor_assignments
     WHERE workbench_id = $1
       AND professor_uid = $2
       AND active = true
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [workbenchId, uid]
  );
  return Boolean(result.rows.length);
}

async function hasActiveScopedPrivilege(workbenchId, uid, client = pool) {
  const result = await client.query(
    `SELECT granted_role
     FROM workbench_scoped_privileges
     WHERE workbench_id = $1
       AND user_uid = $2
       AND active = true
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [workbenchId, uid]
  );
  return result.rows[0] || null;
}

function sameCourse(left, right) {
  return sanitizeText(left, 160).toLowerCase() && sanitizeText(left, 160).toLowerCase() === sanitizeText(right, 160).toLowerCase();
}

function computeWorkbenchPermissions({
  viewer,
  workbench,
  membership,
  professorAssigned,
  scopedPrivilege,
}) {
  const role = getPlatformRole(viewer);
  const isGlobalAdmin = role === 'owner' || role === 'admin';
  const isOwner = Boolean(workbench && viewer && workbench.owner_uid === viewer.uid);
  const memberRole = membership && membership.state === 'active' ? membership.role : '';
  const isMember = Boolean(memberRole);
  const isManagerRole = memberRole === 'owner' || memberRole === 'manager';
  const isProfessorScoped = Boolean(scopedPrivilege && scopedPrivilege.granted_role === 'professor_scoped');
  const isOpenCourseViewer =
    workbench &&
    workbench.visibility === 'open' &&
    sameCourse(viewer && viewer.course, workbench.course);

  const canView = isGlobalAdmin || isOwner || isMember || professorAssigned || isProfessorScoped || isOpenCourseViewer;
  const canJoin = canView && !isMember && !isOwner && workbench && workbench.visibility === 'open';
  const canEditWorkbench = isGlobalAdmin || isOwner || isManagerRole || professorAssigned || isProfessorScoped;
  const canManageMembers = canEditWorkbench;
  const canCreateNodes = canEditWorkbench || (isMember && memberRole === 'member');
  const canManageNodes = canEditWorkbench;
  const canCreateTasks = canEditWorkbench || isMember || isProfessorScoped;
  const canManageTasks = canEditWorkbench || isProfessorScoped;
  const canTransferOwnership = isGlobalAdmin || isOwner;
  const canReviewRequests = isGlobalAdmin || role === 'professor';

  return {
    role,
    canView,
    canJoin,
    canEditWorkbench,
    canManageMembers,
    canCreateNodes,
    canManageNodes,
    canCreateTasks,
    canManageTasks,
    canTransferOwnership,
    canReviewRequests,
    isGlobalAdmin,
    isOwner,
    isMember,
    memberRole: memberRole || null,
    professorAssigned,
    scopedPrivilege: scopedPrivilege ? scopedPrivilege.granted_role : null,
  };
}

async function resolveWorkbenchAccess(workbenchId, viewer, client = pool) {
  const workbench = await getWorkbenchById(workbenchId, client);
  if (!workbench) return null;
  const [membership, professorAssigned, scopedPrivilege] = await Promise.all([
    getWorkbenchMembership(Number(workbench.id), viewer.uid, client),
    hasActiveProfessorAssignment(Number(workbench.id), viewer.uid, client),
    hasActiveScopedPrivilege(Number(workbench.id), viewer.uid, client),
  ]);
  const permissions = computeWorkbenchPermissions({
    viewer,
    workbench,
    membership,
    professorAssigned,
    scopedPrivilege,
  });
  return { workbench, membership, permissions };
}

async function getWorkbenchNodeById(workbenchId, nodeId, client = pool) {
  const numericWorkbenchId = parsePositiveInt(workbenchId);
  const numericNodeId = parsePositiveInt(nodeId);
  if (!numericWorkbenchId || !numericNodeId) return null;
  const result = await client.query(
    `SELECT
      id,
      workbench_id,
      created_by_uid,
      title,
      markdown_content,
      node_type,
      parent_node_id,
      visibility,
      is_deleted,
      deleted_at,
      deleted_by_uid,
      shared_token,
      shared_at,
      copied_from_node_id,
      position_x,
      position_y,
      sort_order,
      source,
      ai_model,
      created_at,
      updated_at
     FROM workbench_nodes
     WHERE workbench_id = $1
       AND id = $2
     LIMIT 1`,
    [numericWorkbenchId, numericNodeId]
  );
  return result.rows[0] || null;
}

async function ensureWorkbenchRootStructure(workbenchId, actorUid, client = pool) {
  const numericWorkbenchId = parsePositiveInt(workbenchId);
  if (!numericWorkbenchId) return null;

  let rootResult = await client.query(
    `SELECT id
     FROM workbench_nodes
     WHERE workbench_id = $1
       AND node_type = 'folder'
       AND parent_node_id IS NULL
       AND lower(title) = lower($2)
       AND COALESCE(is_deleted, false) = false
     ORDER BY id ASC
     LIMIT 1`,
    [numericWorkbenchId, WORKBENCH_ROOT_FOLDER_NAME]
  );

  if (!rootResult.rows.length) {
    rootResult = await client.query(
      `INSERT INTO workbench_nodes
        (workbench_id, created_by_uid, title, markdown_content, node_type, parent_node_id, visibility, is_deleted, sort_order, source, created_at, updated_at)
       VALUES
        ($1, $2, $3, '', 'folder', NULL, 'members', false, -1000, 'user', NOW(), NOW())
       RETURNING id`,
      [numericWorkbenchId, actorUid, WORKBENCH_ROOT_FOLDER_NAME]
    );
  }
  const rootId = Number(rootResult.rows[0].id);

  const ensureChildFolder = async (title, sortOrder) => {
    let existing = await client.query(
      `SELECT id
       FROM workbench_nodes
       WHERE workbench_id = $1
         AND node_type = 'folder'
         AND parent_node_id = $2
         AND lower(title) = lower($3)
         AND COALESCE(is_deleted, false) = false
       ORDER BY id ASC
       LIMIT 1`,
      [numericWorkbenchId, rootId, title]
    );
    if (existing.rows.length) return Number(existing.rows[0].id);
    existing = await client.query(
      `INSERT INTO workbench_nodes
        (workbench_id, created_by_uid, title, markdown_content, node_type, parent_node_id, visibility, is_deleted, sort_order, source, created_at, updated_at)
       VALUES
        ($1, $2, $3, '', 'folder', $4, 'members', false, $5, 'user', NOW(), NOW())
       RETURNING id`,
      [numericWorkbenchId, actorUid, title, rootId, sortOrder]
    );
    return Number(existing.rows[0].id);
  };

  const workspaceFolderId = await ensureChildFolder(WORKBENCH_WORKSPACE_FOLDER_NAME, -900);
  const recycleBinId = await ensureChildFolder(WORKBENCH_RECYCLE_BIN_NAME, -800);

  await client.query(
    `UPDATE workbench_nodes
     SET parent_node_id = $2,
         updated_at = NOW()
     WHERE workbench_id = $1
       AND parent_node_id IS NULL
       AND id <> ALL($3::bigint[])
       AND node_type = 'file'`,
    [numericWorkbenchId, workspaceFolderId, [rootId, workspaceFolderId, recycleBinId]]
  );

  return {
    rootId,
    workspaceFolderId,
    recycleBinId,
  };
}

async function getNodePath(workbenchId, nodeId, client = pool) {
  const numericWorkbenchId = parsePositiveInt(workbenchId);
  const numericNodeId = parsePositiveInt(nodeId);
  if (!numericWorkbenchId || !numericNodeId) return [];
  const result = await client.query(
    `WITH RECURSIVE ancestry AS (
      SELECT
        wn.id,
        wn.parent_node_id,
        wn.title,
        wn.node_type,
        wn.visibility,
        wn.is_deleted,
        0 AS depth
      FROM workbench_nodes wn
      WHERE wn.workbench_id = $1
        AND wn.id = $2
      UNION ALL
      SELECT
        parent.id,
        parent.parent_node_id,
        parent.title,
        parent.node_type,
        parent.visibility,
        parent.is_deleted,
        ancestry.depth + 1 AS depth
      FROM workbench_nodes parent
      JOIN ancestry ON ancestry.parent_node_id = parent.id
      WHERE parent.workbench_id = $1
    )
    SELECT id, parent_node_id, title, node_type, visibility, is_deleted, depth
    FROM ancestry
    ORDER BY depth DESC`,
    [numericWorkbenchId, numericNodeId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    parentNodeId: row.parent_node_id == null ? null : Number(row.parent_node_id),
    title: row.title || '',
    nodeType: row.node_type || 'file',
    visibility: row.visibility || 'private',
    isDeleted: row.is_deleted === true,
  }));
}

function mapDirectoryNodePayload(row) {
  return {
    id: Number(row.id),
    workbenchId: Number(row.workbench_id),
    title: row.title || '',
    markdown: row.markdown_content || '',
    nodeType: row.node_type || 'file',
    parentNodeId: row.parent_node_id == null ? null : Number(row.parent_node_id),
    visibility: row.visibility || 'private',
    isDeleted: row.is_deleted === true,
    deletedAt: row.deleted_at || null,
    deletedByUid: row.deleted_by_uid || null,
    sharedToken: row.shared_token || null,
    sharedAt: row.shared_at || null,
    copiedFromNodeId: row.copied_from_node_id == null ? null : Number(row.copied_from_node_id),
    createdByUid: row.created_by_uid,
    sortOrder: Number(row.sort_order || 0),
    source: row.source || 'user',
    aiModel: row.ai_model || null,
    positionX: row.position_x == null ? null : Number(row.position_x),
    positionY: row.position_y == null ? null : Number(row.position_y),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildShareLink(req, workbenchId, nodeId, sharedToken) {
  const protocol = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : req.protocol;
  const host = req.get('host');
  const base = `${protocol}://${host}`;
  return `${base}/workbench?id=${encodeURIComponent(workbenchId)}&sharedNode=${encodeURIComponent(nodeId)}&token=${encodeURIComponent(sharedToken)}`;
}

async function ensureViewerOrReject(req, res, client = pool) {
  const viewer = await getViewer(req.user.uid, client);
  if (!viewer) {
    res.status(401).json({ ok: false, message: 'Unauthorized.' });
    return null;
  }
  if (viewer.is_banned === true) {
    res.status(403).json({ ok: false, message: 'Account is banned.' });
    return null;
  }
  return viewer;
}

async function ensureWorkbenchDirectoryAccess(req, res, workbenchId, client = pool) {
  const viewer = await ensureViewerOrReject(req, res, client);
  if (!viewer) return null;
  const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
  if (!access) {
    res.status(404).json({ ok: false, message: 'Workbench not found.' });
    return null;
  }
  if (!access.permissions.canView) {
    res.status(403).json({ ok: false, message: 'You do not have access to this workbench.' });
    return null;
  }
  const roots = await ensureWorkbenchRootStructure(workbenchId, viewer.uid, client);
  return { viewer, access, roots };
}

async function ensureFolderNodeOrReject(req, res, workbenchId, nodeId, context, client = pool) {
  const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
  if (!node) {
    res.status(404).json({ ok: false, message: `${context || 'Folder'} not found.` });
    return null;
  }
  if (node.node_type !== 'folder') {
    res.status(400).json({ ok: false, message: `${context || 'Node'} must be a folder.` });
    return null;
  }
  return node;
}

async function ensureTaskBelongsToWorkbench(workbenchId, taskId, client = pool) {
  const numericTaskId = parsePositiveInt(taskId);
  if (!numericTaskId) return null;
  const result = await client.query(
    `SELECT
      t.id,
      t.task_group_id,
      t.workbench_id,
      t.creator_uid,
      t.title,
      t.description,
      t.task_type,
      t.priority,
      t.status,
      t.requires_submission_file,
      t.due_at,
      t.completed_at,
      t.created_at,
      t.updated_at
     FROM tasks t
     WHERE t.id = $1
       AND t.workbench_id = $2
     LIMIT 1`,
    [numericTaskId, workbenchId]
  );
  return result.rows[0] || null;
}

async function insertTaskStatusHistory(client, { taskId, changedByUid, fromStatus, toStatus, note }) {
  await client.query(
    `INSERT INTO task_status_history
      (task_id, changed_by_uid, from_status, to_status, note, created_at)
     VALUES
      ($1, $2, $3, $4, $5, NOW())`,
    [taskId, changedByUid || null, fromStatus || null, toStatus, note || null]
  );
}

async function listAssignableTaskUsers(workbenchId, client = pool, options = {}) {
  const numericWorkbenchId = parsePositiveInt(workbenchId);
  if (!numericWorkbenchId) return [];
  const query = sanitizeText(options && options.query, 160);
  const requestedLimit = parsePositiveInt(options && options.limit);
  const limit = Math.min(Math.max(requestedLimit || 30, 1), 100);
  const params = [numericWorkbenchId];
  const whereParts = ['COALESCE(a.is_banned, false) = false'];
  if (query) {
    const escaped = `%${escapeLikePattern(query)}%`;
    params.push(escaped);
    const searchIndex = params.length;
    whereParts.push(`(
      COALESCE(pp.display_name, a.display_name, a.username, a.email, a.uid) ILIKE $${searchIndex} ESCAPE '\\'
      OR COALESCE(a.username, '') ILIKE $${searchIndex} ESCAPE '\\'
      OR COALESCE(a.student_number, '') ILIKE $${searchIndex} ESCAPE '\\'
      OR COALESCE(a.email, '') ILIKE $${searchIndex} ESCAPE '\\'
      OR a.uid ILIKE $${searchIndex} ESCAPE '\\'
    )`);
  }
  params.push(limit);
  const limitIndex = params.length;

  const result = await client.query(
    `WITH assignable AS (
      SELECT w.owner_uid AS uid, 'owner'::text AS role
      FROM workbenches w
      WHERE w.id = $1
      UNION ALL
      SELECT wm.user_uid AS uid, wm.role
      FROM workbench_members wm
      WHERE wm.workbench_id = $1
        AND wm.state = 'active'
    )
    SELECT
      a.uid,
      COALESCE(pp.display_name, a.display_name, a.username, a.email, a.uid) AS display_name,
      NULLIF(a.username, '') AS username,
      NULLIF(a.student_number, '') AS student_number,
      a.email,
      COALESCE(NULLIF(a.username, ''), NULLIF(a.student_number, ''), a.uid) AS assignee_id,
      CASE
        WHEN MIN(CASE assignable.role
          WHEN 'owner' THEN 0
          WHEN 'manager' THEN 1
          WHEN 'member' THEN 2
          ELSE 3
        END) = 0 THEN 'owner'
        WHEN MIN(CASE assignable.role
          WHEN 'owner' THEN 0
          WHEN 'manager' THEN 1
          WHEN 'member' THEN 2
          ELSE 3
        END) = 1 THEN 'manager'
        WHEN MIN(CASE assignable.role
          WHEN 'owner' THEN 0
          WHEN 'manager' THEN 1
          WHEN 'member' THEN 2
          ELSE 3
        END) = 2 THEN 'member'
        ELSE 'viewer'
      END AS role
    FROM assignable
    JOIN accounts a ON a.uid = assignable.uid
    LEFT JOIN profiles pp ON pp.uid = a.uid
    WHERE ${whereParts.join(' AND ')}
    GROUP BY
      a.uid,
      pp.display_name,
      a.display_name,
      a.username,
      a.student_number,
      a.email
    ORDER BY
      MIN(CASE assignable.role
        WHEN 'owner' THEN 0
        WHEN 'manager' THEN 1
        WHEN 'member' THEN 2
        ELSE 3
      END) ASC,
      LOWER(COALESCE(pp.display_name, a.display_name, a.username, a.email, a.uid)) ASC,
      LOWER(a.uid) ASC
    LIMIT $${limitIndex}`,
    params
  );
  return result.rows.map((row) => ({
    uid: row.uid,
    displayName: row.display_name || row.uid || 'Member',
    username: row.username || '',
    studentNumber: row.student_number || '',
    email: row.email || '',
    assigneeId: row.assignee_id || row.uid || '',
    role: row.role || 'member',
  }));
}

async function resolveTaskAssigneeUids(workbenchId, identifiers, client = pool) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(identifiers) ? identifiers : [])
        .map((value) => sanitizeText(value, 160).toLowerCase())
        .filter(Boolean)
    )
  );
  if (!normalized.length) return [];
  const candidates = await listAssignableTaskUsers(workbenchId, client, { limit: 100 });
  if (!candidates.length) return [];
  const lookup = new Map();
  candidates.forEach((candidate) => {
    const uid = String(candidate.uid || '').trim();
    if (!uid) return;
    [
      uid,
      candidate.assigneeId,
      candidate.username,
      candidate.studentNumber,
      candidate.email,
    ].forEach((rawKey) => {
      const key = String(rawKey || '').trim().toLowerCase();
      if (!key || lookup.has(key)) return;
      lookup.set(key, uid);
    });
  });
  return Array.from(
    new Set(
      normalized
        .map((key) => lookup.get(key))
        .filter(Boolean)
    )
  );
}

async function mapTaskRowsWithAssignees(rows, viewerUid) {
  const taskIds = rows.map((row) => Number(row.id)).filter(Boolean);
  if (!taskIds.length) return [];

  const [assigneesResult, submissionsResult] = await Promise.all([
    pool.query(
      `SELECT
        ta.task_id,
        ta.user_uid,
        ta.state,
        COALESCE(p.display_name, a.display_name, a.username, a.email, a.uid) AS user_name,
        COALESCE(NULLIF(a.username, ''), NULLIF(a.student_number, ''), a.uid) AS assignee_id
       FROM task_assignees ta
       JOIN accounts a ON a.uid = ta.user_uid
       LEFT JOIN profiles p ON p.uid = ta.user_uid
       WHERE ta.task_id = ANY($1::bigint[])
       ORDER BY ta.created_at ASC`,
      [taskIds]
    ),
    pool.query(
      `SELECT
        ts.task_id,
        ts.submitted_by_uid,
        ts.storage_key,
        ts.original_filename,
        ts.mime_type,
        ts.size_bytes,
        ts.note,
        ts.updated_at
       FROM task_submissions ts
       WHERE ts.task_id = ANY($1::bigint[])`,
      [taskIds]
    ),
  ]);

  const assigneesMap = new Map();
  assigneesResult.rows.forEach((row) => {
    const key = Number(row.task_id);
    if (!assigneesMap.has(key)) assigneesMap.set(key, []);
    assigneesMap.get(key).push({
      uid: row.user_uid,
      name: row.user_name || row.user_uid,
      assigneeId: row.assignee_id || row.user_uid,
      state: row.state,
    });
  });

  const submissionMap = new Map();
  for (const row of submissionsResult.rows) {
    const key = Number(row.task_id);
    if (!submissionMap.has(key)) submissionMap.set(key, []);
    let signedUrl = null;
    if (row.storage_key && row.submitted_by_uid === viewerUid) {
      try {
        signedUrl = await getSignedUrl(row.storage_key, SIGNED_TTL);
      } catch (error) {
        signedUrl = null;
      }
    }
    submissionMap.get(key).push({
      submittedByUid: row.submitted_by_uid,
      fileName: row.original_filename || null,
      mimeType: row.mime_type || null,
      sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
      note: row.note || '',
      updatedAt: row.updated_at,
      fileUrl: signedUrl,
    });
  }

  return rows.map((row) => ({
    id: Number(row.id),
    workbenchId: row.workbench_id ? Number(row.workbench_id) : null,
    groupId: Number(row.task_group_id),
    creatorUid: row.creator_uid,
    title: row.title || '',
    description: row.description || '',
    taskType: row.task_type,
    priority: row.priority,
    status: row.status,
    requiresSubmissionFile: row.requires_submission_file === true,
    dueAt: row.due_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignees: assigneesMap.get(Number(row.id)) || [],
    submissions: submissionMap.get(Number(row.id)) || [],
  }));
}

router.use('/api/workbench', requireAuthApi);
router.use('/api/tasks', requireAuthApi);

router.use(['/api/workbench', '/api/tasks'], async (req, res, next) => {
  try {
    await ensureWorkbenchReady();
    return next();
  } catch (error) {
    console.error('Workbench bootstrap failed:', error);
    return res.status(500).json({ ok: false, message: 'Collaboration service not available.' });
  }
});

router.use('/api/workbench', (req, res, next) => {
  if (!isWorkbenchEnabled()) {
    return res.status(404).json({ ok: false, message: 'Workbench feature is disabled.' });
  }
  return next();
});

router.get('/api/workbench', async (req, res) => {
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    const params = [viewer.uid];
    let whereClause = `
      WHERE (
        w.owner_uid = $1
        OR EXISTS (
          SELECT 1
          FROM workbench_members wm
          WHERE wm.workbench_id = w.id
            AND wm.user_uid = $1
            AND wm.state = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM workbench_professor_assignments wpa
          WHERE wpa.workbench_id = w.id
            AND wpa.professor_uid = $1
            AND wpa.active = true
            AND (wpa.expires_at IS NULL OR wpa.expires_at > NOW())
        )
        OR EXISTS (
          SELECT 1
          FROM workbench_scoped_privileges wsp
          WHERE wsp.workbench_id = w.id
            AND wsp.user_uid = $1
            AND wsp.active = true
            AND wsp.expires_at > NOW()
        )
      )
    `;
    if (role === 'owner' || role === 'admin') {
      whereClause = 'WHERE 1=1';
      params.length = 0;
    } else {
      params.push(viewer.course || '');
      whereClause = `
        WHERE (
          w.owner_uid = $1
          OR EXISTS (
            SELECT 1
            FROM workbench_members wm
            WHERE wm.workbench_id = w.id
              AND wm.user_uid = $1
              AND wm.state = 'active'
          )
          OR EXISTS (
            SELECT 1
            FROM workbench_professor_assignments wpa
            WHERE wpa.workbench_id = w.id
              AND wpa.professor_uid = $1
              AND wpa.active = true
              AND (wpa.expires_at IS NULL OR wpa.expires_at > NOW())
          )
          OR EXISTS (
            SELECT 1
            FROM workbench_scoped_privileges wsp
            WHERE wsp.workbench_id = w.id
              AND wsp.user_uid = $1
              AND wsp.active = true
              AND wsp.expires_at > NOW()
          )
          OR (w.visibility = 'open' AND lower(w.course) = lower($2))
        )
      `;
    }

    const result = await pool.query(
      `SELECT
        w.id,
        w.title,
        w.description,
        w.course,
        w.visibility,
        w.status,
        w.owner_uid,
        w.created_at,
        w.updated_at,
        COALESCE(op.display_name, oa.display_name, oa.username, oa.email) AS owner_name
       FROM workbenches w
       LEFT JOIN accounts oa ON oa.uid = w.owner_uid
       LEFT JOIN profiles op ON op.uid = w.owner_uid
       ${whereClause}
       ORDER BY w.updated_at DESC, w.id DESC`,
      params
    );

    return res.json({
      ok: true,
      workbenches: result.rows.map((row) => ({
        id: Number(row.id),
        title: row.title || '',
        description: row.description || '',
        course: row.course || '',
        visibility: row.visibility,
        status: row.status,
        ownerUid: row.owner_uid,
        ownerName: row.owner_name || row.owner_uid || 'Member',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('Workbench list failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load workbenches.' });
  }
});

router.post('/api/workbench/requests', async (req, res) => {
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;

    const title = sanitizeText(req.body && req.body.title, 200);
    const description = sanitizeText(req.body && req.body.description, 4000);
    const course = sanitizeText((req.body && req.body.course) || viewer.course || '', 160);
    const visibility = normalizeWorkbenchVisibility(req.body && req.body.visibility);

    if (!title) {
      return res.status(400).json({ ok: false, message: 'Title is required.' });
    }
    if (!course) {
      return res.status(400).json({ ok: false, message: 'Course is required for request.' });
    }

    const duplicateResult = await pool.query(
      `SELECT id
       FROM workbench_requests
       WHERE requester_uid = $1
         AND status = 'pending'
         AND lower(title) = lower($2)
         AND lower(course) = lower($3)
       LIMIT 1`,
      [viewer.uid, title, course]
    );
    if (duplicateResult.rows.length) {
      return res.status(409).json({ ok: false, message: 'A similar pending request already exists.' });
    }

    const insertResult = await pool.query(
      `INSERT INTO workbench_requests
        (requester_uid, title, description, course, visibility, status, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
       RETURNING id, requester_uid, title, course, visibility, status, created_at`,
      [viewer.uid, title, description || null, course, visibility]
    );
    const row = insertResult.rows[0];
    return res.status(201).json({
      ok: true,
      request: {
        id: Number(row.id),
        requesterUid: row.requester_uid,
        title: row.title,
        course: row.course,
        visibility: row.visibility,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error('Workbench request create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create workbench request.' });
  }
});

router.get('/api/workbench/requests', async (req, res) => {
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    if (!(role === 'owner' || role === 'admin' || role === 'professor')) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin/professor can review requests.' });
    }

    const status = sanitizeText(req.query.status, 30).toLowerCase();
    const course = sanitizeText(req.query.course, 160);
    const where = [];
    const params = [];

    if (status && ['pending', 'approved', 'rejected', 'withdrawn'].includes(status)) {
      params.push(status);
      where.push(`wr.status = $${params.length}`);
    }
    if (course) {
      params.push(course);
      where.push(`wr.course = $${params.length}`);
    }
    if (role === 'professor') {
      params.push(viewer.course || '');
      where.push(`lower(wr.course) = lower($${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT
        wr.id,
        wr.requester_uid,
        wr.title,
        wr.description,
        wr.course,
        wr.visibility,
        wr.status,
        wr.review_note,
        wr.reviewed_by_uid,
        wr.reviewed_at,
        wr.created_workbench_id,
        wr.created_at,
        wr.updated_at,
        COALESCE(rp.display_name, ra.display_name, ra.username, ra.email) AS requester_name,
        COALESCE(pp.display_name, pa.display_name, pa.username, pa.email) AS reviewer_name
       FROM workbench_requests wr
       JOIN accounts ra ON ra.uid = wr.requester_uid
       LEFT JOIN profiles rp ON rp.uid = wr.requester_uid
       LEFT JOIN accounts pa ON pa.uid = wr.reviewed_by_uid
       LEFT JOIN profiles pp ON pp.uid = wr.reviewed_by_uid
       ${whereClause}
       ORDER BY wr.created_at DESC, wr.id DESC`,
      params
    );

    return res.json({
      ok: true,
      requests: result.rows.map((row) => ({
        id: Number(row.id),
        requesterUid: row.requester_uid,
        requesterName: row.requester_name || row.requester_uid,
        title: row.title || '',
        description: row.description || '',
        course: row.course || '',
        visibility: row.visibility,
        status: row.status,
        reviewNote: row.review_note || '',
        reviewedByUid: row.reviewed_by_uid || null,
        reviewedByName: row.reviewer_name || null,
        reviewedAt: row.reviewed_at || null,
        createdWorkbenchId: row.created_workbench_id ? Number(row.created_workbench_id) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('Workbench requests list failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load workbench requests.' });
  }
});

router.post('/api/workbench/requests/:id/review', async (req, res) => {
  const requestId = parsePositiveInt(req.params.id);
  if (!requestId) {
    return res.status(400).json({ ok: false, message: 'Invalid request id.' });
  }
  const action = sanitizeText(req.body && req.body.action, 20).toLowerCase();
  const note = sanitizeText(req.body && req.body.note, 1000);
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Action must be approve or reject.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const role = getPlatformRole(viewer);
    if (!(role === 'owner' || role === 'admin' || role === 'professor')) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin/professor can review requests.' });
    }

    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT *
       FROM workbench_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );
    if (!requestResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Request not found.' });
    }
    const requestRow = requestResult.rows[0];
    if (requestRow.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Request is already reviewed.' });
    }

    if (role === 'professor' && !sameCourse(viewer.course, requestRow.course)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Professors can only review requests in their own course.' });
    }

    let createdWorkbenchId = null;
    if (action === 'approve') {
      const wbResult = await client.query(
        `INSERT INTO workbenches
          (title, description, course, visibility, status, owner_uid, created_by_uid, approved_by_uid, created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, 'active', $5, $5, $6, NOW(), NOW())
         RETURNING id`,
        [requestRow.title, requestRow.description, requestRow.course, requestRow.visibility, requestRow.requester_uid, viewer.uid]
      );
      createdWorkbenchId = Number(wbResult.rows[0].id);

      await client.query(
        `INSERT INTO workbench_members
          (workbench_id, user_uid, role, state, invited_by_uid, joined_at, created_at, updated_at)
         VALUES
          ($1, $2, 'owner', 'active', $3, NOW(), NOW(), NOW())
         ON CONFLICT (workbench_id, user_uid)
         DO UPDATE SET role = 'owner', state = 'active', joined_at = NOW(), updated_at = NOW()`,
        [createdWorkbenchId, requestRow.requester_uid, viewer.uid]
      );
    }

    await client.query(
      `UPDATE workbench_requests
       SET
         status = $2,
         review_note = $3,
         reviewed_by_uid = $4,
         reviewed_at = NOW(),
         created_workbench_id = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [requestId, action === 'approve' ? 'approved' : 'rejected', note || null, viewer.uid, createdWorkbenchId]
    );
    await client.query('COMMIT');

    return res.json({
      ok: true,
      request: {
        id: requestId,
        status: action === 'approve' ? 'approved' : 'rejected',
        createdWorkbenchId,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback errors
    }
    console.error('Workbench request review failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to review workbench request.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench', async (req, res) => {
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    if (!hasProfessorPrivileges(viewer)) {
      return res.status(403).json({ ok: false, message: 'Members must request workbench creation for approval.' });
    }

    const title = sanitizeText(req.body && req.body.title, 200);
    const description = sanitizeText(req.body && req.body.description, 4000);
    const visibility = normalizeWorkbenchVisibility(req.body && req.body.visibility);
    const status = normalizeWorkbenchStatus(req.body && req.body.status);
    const course = sanitizeText((req.body && req.body.course) || viewer.course || '', 160);
    if (!title) {
      return res.status(400).json({ ok: false, message: 'Title is required.' });
    }
    if (!course) {
      return res.status(400).json({ ok: false, message: 'Course is required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertResult = await client.query(
        `INSERT INTO workbenches
          (title, description, course, visibility, status, owner_uid, created_by_uid, approved_by_uid, created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $6, $6, NOW(), NOW())
         RETURNING id, title, course, visibility, status, owner_uid, created_at, updated_at`,
        [title, description || null, course, visibility, status, viewer.uid]
      );
      const wb = insertResult.rows[0];
      await client.query(
        `INSERT INTO workbench_members
          (workbench_id, user_uid, role, state, invited_by_uid, joined_at, created_at, updated_at)
         VALUES
          ($1, $2, 'owner', 'active', $2, NOW(), NOW(), NOW())
         ON CONFLICT (workbench_id, user_uid)
         DO UPDATE SET role = 'owner', state = 'active', joined_at = NOW(), updated_at = NOW()`,
        [wb.id, viewer.uid]
      );
      await client.query('COMMIT');
      return res.status(201).json({
        ok: true,
        workbench: {
          id: Number(wb.id),
          title: wb.title,
          course: wb.course,
          visibility: wb.visibility,
          status: wb.status,
          ownerUid: wb.owner_uid,
          createdAt: wb.created_at,
          updatedAt: wb.updated_at,
        },
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackError) {
        // ignore rollback errors
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Workbench create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create workbench.' });
  }
});

router.post('/api/workbench/:id/join', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canJoin) {
      return res.status(403).json({ ok: false, message: 'Only open workbench in your course can be joined directly.' });
    }

    await client.query(
      `INSERT INTO workbench_members
        (workbench_id, user_uid, role, state, invited_by_uid, joined_at, created_at, updated_at)
       VALUES
        ($1, $2, 'member', 'active', $2, NOW(), NOW(), NOW())
       ON CONFLICT (workbench_id, user_uid)
       DO UPDATE SET state = 'active', role = CASE WHEN workbench_members.role = 'owner' THEN 'owner' ELSE 'member' END, joined_at = NOW(), updated_at = NOW()`,
      [workbenchId, viewer.uid]
    );
    return res.json({ ok: true, message: 'Joined workbench.' });
  } catch (error) {
    console.error('Workbench join failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to join workbench.' });
  } finally {
    client.release();
  }
});

router.get('/api/workbench/:id', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }

  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canView) {
      return res.status(403).json({ ok: false, message: 'You do not have access to this workbench.' });
    }

    const roots = await ensureWorkbenchRootStructure(workbenchId, viewer.uid);
    const canManageNodes = access.permissions && access.permissions.canManageNodes === true;
    const commonParams = canManageNodes ? [workbenchId] : [workbenchId, viewer.uid];
    const memberQuery = pool.query(
      `SELECT
        wm.user_uid,
        wm.role,
        wm.state,
        wm.joined_at,
        COALESCE(pp.display_name, pa.display_name, pa.username, pa.email) AS display_name
       FROM workbench_members wm
       JOIN accounts pa ON pa.uid = wm.user_uid
       LEFT JOIN profiles pp ON pp.uid = wm.user_uid
       WHERE wm.workbench_id = $1
       ORDER BY wm.role DESC, wm.joined_at ASC`,
      [workbenchId]
    );

    const nodesQuery = pool.query(
      `SELECT
        wn.id,
        wn.title,
        wn.markdown_content,
        wn.node_type,
        wn.position_x,
        wn.position_y,
        wn.sort_order,
        wn.source,
        wn.ai_model,
        wn.created_by_uid,
        wn.visibility,
        wn.created_at,
        wn.updated_at
       FROM workbench_nodes wn
       WHERE wn.workbench_id = $1
         AND wn.node_type IN ('file', 'folder')
         AND COALESCE(wn.is_deleted, false) = false
         ${canManageNodes ? '' : 'AND (wn.visibility = \'members\' OR wn.created_by_uid = $2)'}
       ORDER BY wn.sort_order ASC, wn.id ASC`,
      commonParams
    );

    const edgesQuery = pool.query(
      `SELECT
        we.id,
        we.from_node_id,
        we.to_node_id,
        we.from_anchor,
        we.to_anchor,
        we.description,
        we.created_by_uid,
        we.created_at,
        we.updated_at
       FROM workbench_edges we
       JOIN workbench_nodes fn ON fn.id = we.from_node_id
         AND fn.workbench_id = $1
         AND fn.node_type IN ('file', 'folder')
         AND COALESCE(fn.is_deleted, false) = false
       JOIN workbench_nodes tn ON tn.id = we.to_node_id
         AND tn.workbench_id = $1
         AND tn.node_type IN ('file', 'folder')
         AND COALESCE(tn.is_deleted, false) = false
       WHERE we.workbench_id = $1
         ${canManageNodes ? '' : 'AND (fn.visibility = \'members\' OR fn.created_by_uid = $2) AND (tn.visibility = \'members\' OR tn.created_by_uid = $2)'}
       ORDER BY we.id ASC`,
      commonParams
    );

    const notesQuery = pool.query(
      `SELECT
        wnote.id,
        wnote.node_id,
        wnote.edge_id,
        wnote.author_uid,
        wnote.source,
        wnote.ai_model,
        wnote.content,
        wnote.created_at,
        wnote.updated_at
       FROM workbench_notes wnote
       LEFT JOIN workbench_nodes nn ON nn.id = wnote.node_id
         AND nn.workbench_id = $1
         AND nn.node_type IN ('file', 'folder')
       LEFT JOIN workbench_edges ee ON ee.id = wnote.edge_id
         AND ee.workbench_id = $1
       LEFT JOIN workbench_nodes fn ON fn.id = ee.from_node_id
         AND fn.workbench_id = $1
         AND fn.node_type IN ('file', 'folder')
       LEFT JOIN workbench_nodes tn ON tn.id = ee.to_node_id
         AND tn.workbench_id = $1
         AND tn.node_type IN ('file', 'folder')
       WHERE wnote.workbench_id = $1
         AND (
           (
             wnote.node_id IS NOT NULL
             AND nn.id IS NOT NULL
             AND COALESCE(nn.is_deleted, false) = false
             ${canManageNodes ? '' : 'AND (nn.visibility = \'members\' OR nn.created_by_uid = $2)'}
           )
           OR
           (
             wnote.edge_id IS NOT NULL
             AND ee.id IS NOT NULL
             AND fn.id IS NOT NULL
             AND tn.id IS NOT NULL
             AND COALESCE(fn.is_deleted, false) = false
             AND COALESCE(tn.is_deleted, false) = false
             ${canManageNodes ? '' : 'AND (fn.visibility = \'members\' OR fn.created_by_uid = $2) AND (tn.visibility = \'members\' OR tn.created_by_uid = $2)'}
           )
         )
       ORDER BY wnote.created_at DESC, wnote.id DESC
       LIMIT 200`,
      commonParams
    );

    const transferQuery = pool.query(
      `SELECT
        wot.id,
        wot.from_uid,
        wot.to_uid,
        wot.note,
        wot.status,
        wot.expires_at,
        wot.temp_privilege_hours,
        wot.created_at
       FROM workbench_ownership_transfers wot
       WHERE wot.workbench_id = $1
         AND wot.status = 'pending'
       LIMIT 1`,
      [workbenchId]
    );

    const [membersResult, nodesResult, edgesResult, notesResult, transferResult] = await Promise.all([
      memberQuery,
      nodesQuery,
      edgesQuery,
      notesQuery,
      transferQuery,
    ]);

    return res.json({
      ok: true,
      workbench: {
        id: Number(access.workbench.id),
        title: access.workbench.title || '',
        description: access.workbench.description || '',
        course: access.workbench.course || '',
        visibility: access.workbench.visibility,
        status: access.workbench.status,
        ownerUid: access.workbench.owner_uid,
        ownerName: access.workbench.owner_name || access.workbench.owner_uid || 'Member',
        createdAt: access.workbench.created_at,
        updatedAt: access.workbench.updated_at,
      },
      permissions: access.permissions,
      features: {
        aiNoteEnabled: isAiScanEnabled(),
      },
      directoryRoots: roots
        ? {
            rootId: Number(roots.rootId),
            workspaceFolderId: Number(roots.workspaceFolderId),
            recycleBinId: Number(roots.recycleBinId),
          }
        : null,
      members: membersResult.rows.map((row) => ({
        uid: row.user_uid,
        role: row.role,
        state: row.state,
        joinedAt: row.joined_at,
        name: row.display_name || row.user_uid,
      })),
      nodes: nodesResult.rows.map((row) => ({
        id: Number(row.id),
        title: row.title || '',
        markdown: row.markdown_content || '',
        nodeType: row.node_type || 'file',
        positionX: row.position_x == null ? null : Number(row.position_x),
        positionY: row.position_y == null ? null : Number(row.position_y),
        sortOrder: Number(row.sort_order || 0),
        source: row.source,
        aiModel: row.ai_model || null,
        visibility: row.visibility || 'private',
        createdByUid: row.created_by_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      edges: edgesResult.rows.map((row) => ({
        id: Number(row.id),
        fromNodeId: Number(row.from_node_id),
        toNodeId: Number(row.to_node_id),
        fromAnchor: normalizeEdgeAnchor(row.from_anchor, 'right'),
        toAnchor: normalizeEdgeAnchor(row.to_anchor, 'left'),
        description: row.description || '',
        createdByUid: row.created_by_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      notes: notesResult.rows.map((row) => ({
        id: Number(row.id),
        nodeId: row.node_id ? Number(row.node_id) : null,
        edgeId: row.edge_id ? Number(row.edge_id) : null,
        authorUid: row.author_uid || null,
        source: row.source,
        aiModel: row.ai_model || null,
        content: row.content || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pendingOwnershipTransfer: transferResult.rows[0]
        ? {
            id: Number(transferResult.rows[0].id),
            fromUid: transferResult.rows[0].from_uid,
            toUid: transferResult.rows[0].to_uid,
            note: transferResult.rows[0].note || '',
            status: transferResult.rows[0].status,
            expiresAt: transferResult.rows[0].expires_at,
            tempPrivilegeHours: Number(transferResult.rows[0].temp_privilege_hours || 0),
            createdAt: transferResult.rows[0].created_at,
          }
        : null,
    });
  } catch (error) {
    console.error('Workbench details failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load workbench details.' });
  }
});

router.patch('/api/workbench/:id', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canEditWorkbench) {
      return res.status(403).json({ ok: false, message: 'You cannot edit this workbench.' });
    }

    const title = sanitizeText(req.body && req.body.title, 200);
    const description = sanitizeText(req.body && req.body.description, 4000);
    const visibility = req.body && req.body.visibility ? normalizeWorkbenchVisibility(req.body.visibility) : null;
    const status = req.body && req.body.status ? normalizeWorkbenchStatus(req.body.status) : null;
    const updates = [];
    const params = [workbenchId];
    if (title) {
      params.push(title);
      updates.push(`title = $${params.length}`);
    }
    if (typeof req.body?.description === 'string') {
      params.push(description || null);
      updates.push(`description = $${params.length}`);
    }
    if (visibility) {
      params.push(visibility);
      updates.push(`visibility = $${params.length}`);
    }
    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: 'No editable fields were provided.' });
    }
    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE workbenches
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, title, description, course, visibility, status, owner_uid, created_at, updated_at`,
      params
    );
    const row = result.rows[0];
    return res.json({
      ok: true,
      workbench: {
        id: Number(row.id),
        title: row.title || '',
        description: row.description || '',
        course: row.course || '',
        visibility: row.visibility,
        status: row.status,
        ownerUid: row.owner_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench patch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update workbench.' });
  }
});

router.get('/api/workbench/:id/member-candidates', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const query = sanitizeText(req.query && req.query.q, 160);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  if (query.length < 2) {
    return res.json({ ok: true, candidates: [] });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canManageMembers) {
      return res.status(403).json({ ok: false, message: 'You cannot manage members in this workbench.' });
    }

    const workbenchCourse = sanitizeText(access.workbench && access.workbench.course, 160);
    if (!access.permissions.isGlobalAdmin && !workbenchCourse) {
      return res.json({ ok: true, candidates: [] });
    }

    const escaped = escapeLikePattern(query);
    const likePattern = `%${escaped}%`;
    const whereParts = [
      `COALESCE(a.is_banned, false) = false`,
      `(COALESCE(pp.display_name, a.display_name, a.username, a.email, a.uid) ILIKE $2 ESCAPE '\\'
        OR COALESCE(a.username, '') ILIKE $2 ESCAPE '\\'
        OR COALESCE(a.email, '') ILIKE $2 ESCAPE '\\'
        OR a.uid ILIKE $2 ESCAPE '\\')`,
    ];
    const params = [workbenchId, likePattern];
    if (!access.permissions.isGlobalAdmin) {
      params.push(workbenchCourse);
      whereParts.push(`LOWER(COALESCE(a.course, '')) = LOWER($${params.length})`);
    }

    const result = await client.query(
      `SELECT
        a.uid,
        COALESCE(pp.display_name, a.display_name, a.username, a.email, a.uid) AS display_name,
        a.username,
        a.email,
        a.course,
        wm.role AS member_role,
        wm.state AS member_state
       FROM accounts a
       LEFT JOIN profiles pp ON pp.uid = a.uid
       LEFT JOIN workbench_members wm
         ON wm.workbench_id = $1
        AND wm.user_uid = a.uid
       WHERE ${whereParts.join(' AND ')}
       ORDER BY
         CASE WHEN wm.state = 'active' THEN 0 ELSE 1 END,
         LOWER(COALESCE(pp.display_name, a.display_name, a.username, a.email, a.uid)) ASC
       LIMIT 20`,
      params
    );

    return res.json({
      ok: true,
      candidates: result.rows.map((row) => ({
        uid: row.uid,
        displayName: row.display_name || row.uid || 'Member',
        username: row.username || '',
        email: row.email || '',
        course: row.course || '',
        memberRole: row.member_role || null,
        memberState: row.member_state || null,
      })),
    });
  } catch (error) {
    console.error('Workbench member candidate search failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to search users.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/members', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.body && req.body.uid, 120);
  const role = sanitizeText(req.body && req.body.role, 20).toLowerCase();
  if (!workbenchId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench or target user.' });
  }
  if (!['manager', 'member', 'viewer'].includes(role)) {
    return res.status(400).json({ ok: false, message: 'Role must be manager, member, or viewer.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canManageMembers) {
      return res.status(403).json({ ok: false, message: 'You cannot manage members in this workbench.' });
    }

    const targetResult = await client.query(
      `SELECT uid, COALESCE(is_banned, false) AS is_banned, course
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [targetUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target account not found.' });
    }
    if (targetResult.rows[0].is_banned === true) {
      return res.status(400).json({ ok: false, message: 'Banned accounts cannot be added to workbench.' });
    }
    if (!sameCourse(targetResult.rows[0].course, access.workbench.course) && !access.permissions.isGlobalAdmin) {
      return res.status(403).json({ ok: false, message: 'Target user must be in the same course as the workbench.' });
    }

    await client.query(
      `INSERT INTO workbench_members
        (workbench_id, user_uid, role, state, invited_by_uid, joined_at, created_at, updated_at)
       VALUES
        ($1, $2, $3, 'active', $4, NOW(), NOW(), NOW())
       ON CONFLICT (workbench_id, user_uid)
       DO UPDATE SET role = EXCLUDED.role, state = 'active', invited_by_uid = EXCLUDED.invited_by_uid, updated_at = NOW()`,
      [workbenchId, targetUid, role, viewer.uid]
    );
    return res.json({ ok: true, message: 'Workbench member updated.' });
  } catch (error) {
    console.error('Workbench add member failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update workbench member.' });
  } finally {
    client.release();
  }
});

router.patch('/api/workbench/:id/members/:uid', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const targetUid = sanitizeText(req.params.uid, 120);
  const state = sanitizeText(req.body && req.body.state, 20).toLowerCase();
  const role = sanitizeText(req.body && req.body.role, 20).toLowerCase();
  if (!workbenchId || !targetUid) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench/member.' });
  }

  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canManageMembers) {
      return res.status(403).json({ ok: false, message: 'You cannot manage members in this workbench.' });
    }
    if (targetUid === access.workbench.owner_uid && state === 'removed') {
      return res.status(400).json({ ok: false, message: 'Owner cannot be removed via member patch.' });
    }

    const updates = [];
    const params = [workbenchId, targetUid];
    if (state && ['pending', 'active', 'removed'].includes(state)) {
      params.push(state);
      updates.push(`state = $${params.length}`);
    }
    if (role && ['manager', 'member', 'viewer', 'owner'].includes(role)) {
      params.push(role);
      updates.push(`role = $${params.length}`);
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: 'No valid member updates provided.' });
    }
    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE workbench_members
       SET ${updates.join(', ')}
       WHERE workbench_id = $1
         AND user_uid = $2
       RETURNING workbench_id`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Member not found in this workbench.' });
    }
    return res.json({ ok: true, message: 'Workbench member updated.' });
  } catch (error) {
    console.error('Workbench patch member failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update workbench member.' });
  }
});

router.get('/api/workbench/:id/directory', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    const requestedParentId = parsePositiveInt(req.query && req.query.parentId);
    const parentId = requestedParentId || Number(roots.workspaceFolderId);

    const parentNode = await ensureFolderNodeOrReject(req, res, workbenchId, parentId, 'Directory folder', client);
    if (!parentNode) return;

    const parentIsProtected = isProtectedSystemFolder(parentNode, roots);
    if (!parentIsProtected && !canViewNodeEntity({ permissions: access.permissions, node: parentNode, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot view this directory.' });
    }

    const inRecycleBin = Number(parentNode.id) === Number(roots.recycleBinId);
    const childParams = access.permissions.canManageNodes ? [workbenchId, parentId] : [workbenchId, parentId, viewer.uid];
    const childrenResult = await client.query(
      `SELECT
        wn.id,
        wn.workbench_id,
        wn.created_by_uid,
        wn.title,
        wn.markdown_content,
        wn.node_type,
        wn.parent_node_id,
        wn.visibility,
        wn.is_deleted,
        wn.deleted_at,
        wn.deleted_by_uid,
        wn.shared_token,
        wn.shared_at,
        wn.copied_from_node_id,
        wn.position_x,
        wn.position_y,
        wn.sort_order,
        wn.source,
        wn.ai_model,
        wn.created_at,
        wn.updated_at
       FROM workbench_nodes wn
       WHERE wn.workbench_id = $1
         AND wn.parent_node_id = $2
         AND COALESCE(wn.is_deleted, false) = ${inRecycleBin ? 'true' : 'false'}
         ${access.permissions.canManageNodes ? '' : 'AND (wn.visibility = \'members\' OR wn.created_by_uid = $3)'}
       ORDER BY (CASE WHEN wn.node_type = 'folder' THEN 0 ELSE 1 END), wn.sort_order ASC, wn.title ASC, wn.id ASC`,
      childParams
    );

    const path = await getNodePath(workbenchId, parentId, client);
    return res.json({
      ok: true,
      roots: {
        rootId: Number(roots.rootId),
        workspaceFolderId: Number(roots.workspaceFolderId),
        recycleBinId: Number(roots.recycleBinId),
      },
      currentParentId: Number(parentId),
      inRecycleBin,
      path,
      children: childrenResult.rows.map((row) => mapDirectoryNodePayload(row)),
    });
  } catch (error) {
    console.error('Workbench directory list failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load directory.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/directory', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot create files or folders in this workbench.' });
    }

    const nodeType = normalizeWorkbenchNodeType(req.body && req.body.type);
    const title = sanitizeText(req.body && req.body.title, 220);
    const visibility = normalizeWorkbenchNodeVisibility(req.body && req.body.visibility);
    const sortOrder = Number.isFinite(Number(req.body && req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const parentId = parsePositiveInt(req.body && req.body.parentId) || Number(roots.workspaceFolderId);
    const markdown = nodeType === 'file' && typeof req.body?.markdown === 'string'
      ? req.body.markdown.slice(0, 250000)
      : '';

    if (!title) {
      return res.status(400).json({ ok: false, message: 'A title is required.' });
    }

    const parentNode = await ensureFolderNodeOrReject(req, res, workbenchId, parentId, 'Target folder', client);
    if (!parentNode) return;
    if (Number(parentNode.id) === Number(roots.recycleBinId)) {
      return res.status(400).json({ ok: false, message: 'Cannot create new items inside recycle-bin.' });
    }
    if (parentNode.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Cannot create inside a deleted folder.' });
    }
    if (!isProtectedSystemFolder(parentNode, roots) && !canViewNodeEntity({ permissions: access.permissions, node: parentNode, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot create inside this folder.' });
    }

    const result = await client.query(
      `INSERT INTO workbench_nodes
        (workbench_id, created_by_uid, title, markdown_content, node_type, parent_node_id, visibility, is_deleted, sort_order, source, ai_model, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, false, $8, 'user', NULL, NOW(), NOW())
       RETURNING *`,
      [workbenchId, viewer.uid, title, markdown, nodeType, parentId, visibility, sortOrder]
    );
    return res.status(201).json({
      ok: true,
      node: mapDirectoryNodePayload(result.rows[0]),
    });
  } catch (error) {
    console.error('Workbench directory create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create directory item.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/directory/:nodeId/move', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  const targetParentId = parsePositiveInt(req.body && req.body.targetParentId);
  if (!workbenchId || !nodeId || !targetParentId) {
    return res.status(400).json({ ok: false, message: 'Invalid move payload.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot move items in this workbench.' });
    }

    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (node.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Use restore for deleted items.' });
    }
    if (isProtectedSystemFolder(node, roots)) {
      return res.status(400).json({ ok: false, message: 'System folders cannot be moved.' });
    }
    if (!canManageNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot move this item.' });
    }

    const targetFolder = await ensureFolderNodeOrReject(req, res, workbenchId, targetParentId, 'Target folder', client);
    if (!targetFolder) return;
    if (targetFolder.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Cannot move into a deleted folder.' });
    }

    const ancestryResult = await client.query(
      `WITH RECURSIVE ancestry AS (
        SELECT id, parent_node_id
        FROM workbench_nodes
        WHERE workbench_id = $1
          AND id = $2
        UNION ALL
        SELECT parent.id, parent.parent_node_id
        FROM workbench_nodes parent
        JOIN ancestry ON ancestry.parent_node_id = parent.id
        WHERE parent.workbench_id = $1
      )
      SELECT 1 AS blocked
      FROM ancestry
      WHERE id = $3
      LIMIT 1`,
      [workbenchId, targetParentId, nodeId]
    );
    if (ancestryResult.rows.length) {
      return res.status(400).json({ ok: false, message: 'Cannot move a folder into itself or its descendants.' });
    }

    await client.query(
      `UPDATE workbench_nodes
       SET parent_node_id = $3,
           updated_at = NOW()
       WHERE workbench_id = $1
         AND id = $2`,
      [workbenchId, nodeId, targetParentId]
    );
    return res.json({ ok: true, message: 'Item moved.' });
  } catch (error) {
    console.error('Workbench directory move failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to move item.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/directory/:nodeId/copy', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  const targetParentIdRaw = parsePositiveInt(req.body && req.body.targetParentId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid copy request.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot copy items in this workbench.' });
    }

    const sourceNode = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!sourceNode) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (sourceNode.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Cannot copy deleted items.' });
    }
    if (isProtectedSystemFolder(sourceNode, roots)) {
      return res.status(400).json({ ok: false, message: 'System folders cannot be copied.' });
    }
    if (!canViewNodeEntity({ permissions: access.permissions, node: sourceNode, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot copy this item.' });
    }

    const targetParentId = targetParentIdRaw || Number(sourceNode.parent_node_id) || Number(roots.workspaceFolderId);
    const targetFolder = await ensureFolderNodeOrReject(req, res, workbenchId, targetParentId, 'Target folder', client);
    if (!targetFolder) return;
    if (targetFolder.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Cannot copy into a deleted folder.' });
    }

    const subtreeResult = await client.query(
      `WITH RECURSIVE subtree AS (
        SELECT
          wn.*,
          0::INT AS depth
        FROM workbench_nodes wn
        WHERE wn.workbench_id = $1
          AND wn.id = $2
        UNION ALL
        SELECT
          child.*,
          subtree.depth + 1 AS depth
        FROM workbench_nodes child
        JOIN subtree ON child.parent_node_id = subtree.id
        WHERE child.workbench_id = $1
      )
      SELECT *
      FROM subtree
      ORDER BY depth ASC, id ASC`,
      [workbenchId, nodeId]
    );
    if (!subtreeResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }

    const idMap = new Map();
    let copiedRootId = null;
    for (const row of subtreeResult.rows) {
      const oldId = Number(row.id);
      const oldParentId = row.parent_node_id == null ? null : Number(row.parent_node_id);
      const newParentId = oldId === nodeId ? targetParentId : idMap.get(oldParentId);
      const isRootCopy = oldId === nodeId;
      const copyTitle = isRootCopy ? `${row.title || 'Untitled'} (copy)` : (row.title || 'Untitled');
      const inserted = await client.query(
        `INSERT INTO workbench_nodes
          (workbench_id, created_by_uid, title, markdown_content, node_type, parent_node_id, visibility, is_deleted, deleted_at, deleted_by_uid, shared_token, shared_at, copied_from_node_id, position_x, position_y, sort_order, source, ai_model, created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, false, NULL, NULL, NULL, NULL, $8, $9, $10, $11, $12, $13, NOW(), NOW())
         RETURNING id`,
        [
          workbenchId,
          viewer.uid,
          copyTitle.slice(0, 220),
          row.markdown_content || '',
          row.node_type || 'file',
          newParentId || null,
          normalizeWorkbenchNodeVisibility(row.visibility),
          oldId,
          row.position_x == null ? null : Number(row.position_x),
          row.position_y == null ? null : Number(row.position_y),
          Number(row.sort_order || 0),
          row.source === 'ai' ? 'ai' : 'user',
          row.ai_model || null,
        ]
      );
      const newId = Number(inserted.rows[0].id);
      idMap.set(oldId, newId);
      if (isRootCopy) copiedRootId = newId;
    }

    const copiedNode = await getWorkbenchNodeById(workbenchId, copiedRootId, client);
    return res.status(201).json({
      ok: true,
      copiedNode: copiedNode ? mapDirectoryNodePayload(copiedNode) : null,
      message: 'Item copied.',
    });
  } catch (error) {
    console.error('Workbench directory copy failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to copy item.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/directory/:nodeId/trash', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid item id.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot delete items in this workbench.' });
    }

    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (isProtectedSystemFolder(node, roots)) {
      return res.status(400).json({ ok: false, message: 'System folders cannot be moved to recycle-bin.' });
    }
    if (!canManageNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot delete this item.' });
    }

    await client.query(
      `WITH RECURSIVE subtree AS (
        SELECT id
        FROM workbench_nodes
        WHERE workbench_id = $1
          AND id = $2
        UNION ALL
        SELECT child.id
        FROM workbench_nodes child
        JOIN subtree ON child.parent_node_id = subtree.id
        WHERE child.workbench_id = $1
      )
      UPDATE workbench_nodes wn
      SET is_deleted = true,
          deleted_at = NOW(),
          deleted_by_uid = $3,
          parent_node_id = CASE WHEN wn.id = $2 THEN $4 ELSE wn.parent_node_id END,
          updated_at = NOW()
      WHERE wn.id IN (SELECT id FROM subtree)`,
      [workbenchId, nodeId, viewer.uid, roots.recycleBinId]
    );
    return res.json({ ok: true, message: 'Item moved to recycle-bin.' });
  } catch (error) {
    console.error('Workbench directory trash failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to move item to recycle-bin.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/directory/:nodeId/restore', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid item id.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot restore items in this workbench.' });
    }

    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (node.is_deleted !== true) {
      return res.status(400).json({ ok: false, message: 'Item is not in recycle-bin.' });
    }
    if (!canManageNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot restore this item.' });
    }

    const requestedTargetParentId = parsePositiveInt(req.body && req.body.targetParentId);
    const targetParentId = requestedTargetParentId || Number(roots.workspaceFolderId);
    const targetFolder = await ensureFolderNodeOrReject(req, res, workbenchId, targetParentId, 'Restore target folder', client);
    if (!targetFolder) return;
    if (Number(targetFolder.id) === Number(roots.recycleBinId)) {
      return res.status(400).json({ ok: false, message: 'Restore target cannot be recycle-bin.' });
    }
    if (targetFolder.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Cannot restore into a deleted folder.' });
    }

    await client.query(
      `WITH RECURSIVE subtree AS (
        SELECT id
        FROM workbench_nodes
        WHERE workbench_id = $1
          AND id = $2
        UNION ALL
        SELECT child.id
        FROM workbench_nodes child
        JOIN subtree ON child.parent_node_id = subtree.id
        WHERE child.workbench_id = $1
      )
      UPDATE workbench_nodes wn
      SET is_deleted = false,
          deleted_at = NULL,
          deleted_by_uid = NULL,
          parent_node_id = CASE WHEN wn.id = $2 THEN $3 ELSE wn.parent_node_id END,
          updated_at = NOW()
      WHERE wn.id IN (SELECT id FROM subtree)`,
      [workbenchId, nodeId, targetParentId]
    );

    return res.json({ ok: true, message: 'Item restored.' });
  } catch (error) {
    console.error('Workbench directory restore failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to restore item.' });
  } finally {
    client.release();
  }
});

router.delete('/api/workbench/:id/directory/:nodeId/permanent', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid item id.' });
  }

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;

    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (isProtectedSystemFolder(node, roots)) {
      return res.status(400).json({ ok: false, message: 'System folders cannot be deleted.' });
    }
    const canManage = canManageNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid });
    if (!canManage) {
      return res.status(403).json({ ok: false, message: 'You cannot permanently delete this item.' });
    }
    if (node.is_deleted !== true && !access.permissions.canManageNodes) {
      return res.status(400).json({ ok: false, message: 'Move item to recycle-bin first before permanent delete.' });
    }

    const deleteResult = await client.query(
      `WITH RECURSIVE subtree AS (
        SELECT id
        FROM workbench_nodes
        WHERE workbench_id = $1
          AND id = $2
        UNION ALL
        SELECT child.id
        FROM workbench_nodes child
        JOIN subtree ON child.parent_node_id = subtree.id
        WHERE child.workbench_id = $1
      )
      DELETE FROM workbench_nodes
      WHERE id IN (SELECT id FROM subtree)
      RETURNING id`,
      [workbenchId, nodeId]
    );

    return res.json({
      ok: true,
      deletedCount: deleteResult.rows.length,
      message: 'Item permanently deleted.',
    });
  } catch (error) {
    console.error('Workbench directory permanent delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to permanently delete item.' });
  } finally {
    client.release();
  }
});

router.get('/api/workbench/:id/directory/:nodeId/properties', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid item id.' });
  }
  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access } = auth;
    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (!canViewNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot view this item.' });
    }

    const [childCountResult, path] = await Promise.all([
      client.query(
        `SELECT COUNT(*)::INT AS total
         FROM workbench_nodes
         WHERE workbench_id = $1
           AND parent_node_id = $2`,
        [workbenchId, nodeId]
      ),
      getNodePath(workbenchId, nodeId, client),
    ]);

    const markdownBytes = Buffer.byteLength(node.markdown_content || '', 'utf8');
    return res.json({
      ok: true,
      properties: {
        id: Number(node.id),
        title: node.title || '',
        nodeType: node.node_type || 'file',
        parentNodeId: node.parent_node_id == null ? null : Number(node.parent_node_id),
        visibility: node.visibility || 'private',
        isDeleted: node.is_deleted === true,
        childCount: Number(childCountResult.rows[0] && childCountResult.rows[0].total ? childCountResult.rows[0].total : 0),
        markdownBytes,
        createdByUid: node.created_by_uid,
        copiedFromNodeId: node.copied_from_node_id == null ? null : Number(node.copied_from_node_id),
        createdAt: node.created_at,
        updatedAt: node.updated_at,
        deletedAt: node.deleted_at || null,
        deletedByUid: node.deleted_by_uid || null,
        path,
      },
    });
  } catch (error) {
    console.error('Workbench directory properties failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load item properties.' });
  } finally {
    client.release();
  }
});

router.patch('/api/workbench/:id/directory/:nodeId/visibility', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid item id.' });
  }
  const visibility = normalizeWorkbenchNodeVisibility(req.body && req.body.visibility);
  const applyRecursively = parseBoolean(req.body && req.body.applyRecursively, false);

  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access, roots } = auth;
    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'Item not found.' });
    }
    if (isProtectedSystemFolder(node, roots)) {
      return res.status(400).json({ ok: false, message: 'System folder visibility cannot be changed.' });
    }
    if (!canManageNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot update this item visibility.' });
    }

    let updateResult;
    if (applyRecursively && node.node_type === 'folder') {
      updateResult = await client.query(
        `WITH RECURSIVE subtree AS (
          SELECT id
          FROM workbench_nodes
          WHERE workbench_id = $1
            AND id = $2
          UNION ALL
          SELECT child.id
          FROM workbench_nodes child
          JOIN subtree ON child.parent_node_id = subtree.id
          WHERE child.workbench_id = $1
        )
        UPDATE workbench_nodes wn
        SET visibility = $3,
            updated_at = NOW()
        WHERE wn.id IN (SELECT id FROM subtree)
        RETURNING id`,
        [workbenchId, nodeId, visibility]
      );
    } else {
      updateResult = await client.query(
        `UPDATE workbench_nodes
         SET visibility = $3,
             updated_at = NOW()
         WHERE workbench_id = $1
           AND id = $2
         RETURNING id`,
        [workbenchId, nodeId, visibility]
      );
    }
    return res.json({
      ok: true,
      updatedCount: updateResult.rows.length,
      visibility,
      message: 'Visibility updated.',
    });
  } catch (error) {
    console.error('Workbench directory visibility failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update visibility.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/directory/:nodeId/share', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid item id.' });
  }
  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const { viewer, access } = auth;
    const node = await getWorkbenchNodeById(workbenchId, nodeId, client);
    if (!node) {
      return res.status(404).json({ ok: false, message: 'File not found.' });
    }
    if (node.node_type !== 'file') {
      return res.status(400).json({ ok: false, message: 'Only markdown files can be shared.' });
    }
    if (node.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Cannot share deleted file.' });
    }
    if (!canManageNodeEntity({ permissions: access.permissions, node, viewerUid: viewer.uid })) {
      return res.status(403).json({ ok: false, message: 'You cannot share this file.' });
    }

    const token = node.shared_token || crypto.randomBytes(18).toString('hex');
    await client.query(
      `UPDATE workbench_nodes
       SET shared_token = $3,
           shared_at = NOW(),
           updated_at = NOW()
       WHERE workbench_id = $1
         AND id = $2`,
      [workbenchId, nodeId, token]
    );
    const shareLink = buildShareLink(req, workbenchId, nodeId, token);
    return res.json({
      ok: true,
      shareToken: token,
      shareLink,
    });
  } catch (error) {
    console.error('Workbench directory share failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to generate share link.' });
  } finally {
    client.release();
  }
});

router.get('/api/workbench/:id/directory/shared/:token', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const token = sanitizeText(req.params.token, 128);
  if (!workbenchId || !token) {
    return res.status(400).json({ ok: false, message: 'Invalid shared link payload.' });
  }
  const client = await pool.connect();
  try {
    const auth = await ensureWorkbenchDirectoryAccess(req, res, workbenchId, client);
    if (!auth) return;
    const sharedResult = await client.query(
      `SELECT *
       FROM workbench_nodes
       WHERE workbench_id = $1
         AND node_type = 'file'
         AND shared_token = $2
         AND COALESCE(is_deleted, false) = false
       LIMIT 1`,
      [workbenchId, token]
    );
    if (!sharedResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Shared file not found.' });
    }
    const node = sharedResult.rows[0];
    const path = await getNodePath(workbenchId, Number(node.id), client);
    return res.json({
      ok: true,
      node: mapDirectoryNodePayload(node),
      path,
    });
  } catch (error) {
    console.error('Workbench shared file fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load shared file.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/nodes', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot create nodes in this workbench.' });
    }
    const roots = await ensureWorkbenchRootStructure(workbenchId, viewer.uid);

    const title = sanitizeText(req.body && req.body.title, 220);
    const markdown = typeof req.body?.markdown === 'string' ? req.body.markdown.slice(0, 250000) : '';
    const visibility = normalizeWorkbenchNodeVisibility(req.body && req.body.visibility);
    const positionX = req.body?.positionX == null ? null : Number(req.body.positionX);
    const positionY = req.body?.positionY == null ? null : Number(req.body.positionY);
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const source = sanitizeText(req.body && req.body.source, 10).toLowerCase() === 'ai' ? 'ai' : 'user';
    const aiModel = source === 'ai' ? sanitizeText(req.body && req.body.aiModel, 80) : null;
    const parentNodeId = parsePositiveInt(req.body && req.body.parentId) || Number(roots.workspaceFolderId);

    if (!title) {
      return res.status(400).json({ ok: false, message: 'Node title is required.' });
    }
    const parentNode = await getWorkbenchNodeById(workbenchId, parentNodeId);
    if (!parentNode || parentNode.node_type !== 'folder' || parentNode.is_deleted === true) {
      return res.status(400).json({ ok: false, message: 'Target parent folder is invalid.' });
    }

    const result = await pool.query(
      `INSERT INTO workbench_nodes
        (workbench_id, created_by_uid, title, markdown_content, node_type, parent_node_id, visibility, is_deleted, position_x, position_y, sort_order, source, ai_model, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, 'file', $5, $6, false, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING id, title, markdown_content, node_type, parent_node_id, visibility, position_x, position_y, sort_order, source, ai_model, created_by_uid, created_at, updated_at`,
      [
        workbenchId,
        viewer.uid,
        title,
        markdown,
        parentNodeId,
        visibility,
        Number.isFinite(positionX) ? positionX : null,
        Number.isFinite(positionY) ? positionY : null,
        sortOrder,
        source,
        aiModel || null,
      ]
    );
    const row = result.rows[0];
    return res.status(201).json({
      ok: true,
      node: {
        id: Number(row.id),
        title: row.title || '',
        markdown: row.markdown_content || '',
        nodeType: row.node_type || 'file',
        parentNodeId: row.parent_node_id == null ? null : Number(row.parent_node_id),
        visibility: row.visibility || 'private',
        positionX: row.position_x == null ? null : Number(row.position_x),
        positionY: row.position_y == null ? null : Number(row.position_y),
        sortOrder: Number(row.sort_order || 0),
        source: row.source,
        aiModel: row.ai_model || null,
        createdByUid: row.created_by_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench node create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create node.' });
  }
});

router.patch('/api/workbench/:id/nodes/:nodeId', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const nodeId = parsePositiveInt(req.params.nodeId);
  if (!workbenchId || !nodeId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench or node id.' });
  }

  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    const canManageNodes = access.permissions && access.permissions.canManageNodes === true;
    const currentNodeResult = await pool.query(
      `SELECT *
       FROM workbench_nodes
       WHERE workbench_id = $1
         AND id = $2
         AND node_type IN ('file', 'folder')
         AND COALESCE(is_deleted, false) = false
       LIMIT 1`,
      [workbenchId, nodeId]
    );
    if (!currentNodeResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Node not found.' });
    }
    const currentNode = currentNodeResult.rows[0];
    const requestKeys = Object.keys(req.body || {}).filter(Boolean);
    const positionOnlyRequest =
      requestKeys.length > 0 && requestKeys.every((key) => key === 'positionX' || key === 'positionY');
    if (!canManageNodes) {
      if (!positionOnlyRequest || !canViewNodeEntity({ permissions: access.permissions, node: currentNode, viewerUid: viewer.uid })) {
        return res.status(403).json({ ok: false, message: 'You cannot edit nodes in this workbench.' });
      }
    }

    const updates = [];
    const params = [workbenchId, nodeId];
    if (typeof req.body?.title === 'string') {
      params.push(sanitizeText(req.body.title, 220));
      updates.push(`title = $${params.length}`);
    }
    if (typeof req.body?.markdown === 'string') {
      params.push(req.body.markdown.slice(0, 250000));
      updates.push(`markdown_content = $${params.length}`);
    }
    if (typeof req.body?.visibility === 'string') {
      params.push(normalizeWorkbenchNodeVisibility(req.body.visibility));
      updates.push(`visibility = $${params.length}`);
    }
    if (req.body?.parentId != null) {
      const parentId = parsePositiveInt(req.body.parentId);
      if (parentId) {
        const parentNode = await getWorkbenchNodeById(workbenchId, parentId);
        if (!parentNode || parentNode.node_type !== 'folder' || parentNode.is_deleted === true) {
          return res.status(400).json({ ok: false, message: 'Invalid target parent folder.' });
        }
        params.push(parentId);
        updates.push(`parent_node_id = $${params.length}`);
      }
    }
    const hasPositionX = Object.prototype.hasOwnProperty.call(req.body || {}, 'positionX');
    if (hasPositionX) {
      if (req.body.positionX == null || req.body.positionX === '') {
        updates.push('position_x = NULL');
      } else {
        const value = Number(req.body.positionX);
        if (!Number.isFinite(value)) {
          return res.status(400).json({ ok: false, message: 'Invalid positionX value.' });
        }
        params.push(value);
        updates.push(`position_x = $${params.length}`);
      }
    }
    const hasPositionY = Object.prototype.hasOwnProperty.call(req.body || {}, 'positionY');
    if (hasPositionY) {
      if (req.body.positionY == null || req.body.positionY === '') {
        updates.push('position_y = NULL');
      } else {
        const value = Number(req.body.positionY);
        if (!Number.isFinite(value)) {
          return res.status(400).json({ ok: false, message: 'Invalid positionY value.' });
        }
        params.push(value);
        updates.push(`position_y = $${params.length}`);
      }
    }
    if (req.body?.sortOrder != null && Number.isFinite(Number(req.body.sortOrder))) {
      params.push(Number(req.body.sortOrder));
      updates.push(`sort_order = $${params.length}`);
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: 'No valid node updates provided.' });
    }
    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE workbench_nodes
       SET ${updates.join(', ')}
       WHERE workbench_id = $1
         AND id = $2
         AND node_type IN ('file', 'folder')
         AND COALESCE(is_deleted, false) = false
       RETURNING id, title, markdown_content, node_type, parent_node_id, visibility, position_x, position_y, sort_order, source, ai_model, created_by_uid, created_at, updated_at`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Node not found.' });
    }
    const row = result.rows[0];
    return res.json({
      ok: true,
      node: {
        id: Number(row.id),
        title: row.title || '',
        markdown: row.markdown_content || '',
        nodeType: row.node_type || 'file',
        parentNodeId: row.parent_node_id == null ? null : Number(row.parent_node_id),
        visibility: row.visibility || 'private',
        positionX: row.position_x == null ? null : Number(row.position_x),
        positionY: row.position_y == null ? null : Number(row.position_y),
        sortOrder: Number(row.sort_order || 0),
        source: row.source,
        aiModel: row.ai_model || null,
        createdByUid: row.created_by_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench node patch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update node.' });
  }
});

router.post('/api/workbench/:id/edges', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  const fromNodeId = parsePositiveInt(req.body && req.body.fromNodeId);
  const toNodeId = parsePositiveInt(req.body && req.body.toNodeId);
  const description = sanitizeText(req.body && req.body.description, 4000);
  const fromAnchor = normalizeEdgeAnchor(req.body && req.body.fromAnchor, 'right');
  const toAnchor = normalizeEdgeAnchor(req.body && req.body.toAnchor, 'left');
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    return res.status(400).json({ ok: false, message: 'Valid from/to node ids are required.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canManageNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot create edges in this workbench.' });
    }

    const nodesCheck = await client.query(
      `SELECT id
       FROM workbench_nodes
       WHERE workbench_id = $1
         AND node_type IN ('file', 'folder')
         AND COALESCE(is_deleted, false) = false
         AND id = ANY($2::bigint[])`,
      [workbenchId, [fromNodeId, toNodeId]]
    );
    if (nodesCheck.rows.length !== 2) {
      return res.status(400).json({ ok: false, message: 'Both nodes must belong to this workbench.' });
    }

    const result = await client.query(
      `INSERT INTO workbench_edges
        (workbench_id, from_node_id, to_node_id, from_anchor, to_anchor, description, created_by_uid, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (workbench_id, from_node_id, to_node_id)
       DO UPDATE SET
        from_anchor = EXCLUDED.from_anchor,
        to_anchor = EXCLUDED.to_anchor,
        description = EXCLUDED.description,
        updated_at = NOW()
       RETURNING id, from_node_id, to_node_id, from_anchor, to_anchor, description, created_by_uid, created_at, updated_at`,
      [workbenchId, fromNodeId, toNodeId, fromAnchor, toAnchor, description || '', viewer.uid]
    );
    const row = result.rows[0];
    return res.status(201).json({
      ok: true,
      edge: {
        id: Number(row.id),
        fromNodeId: Number(row.from_node_id),
        toNodeId: Number(row.to_node_id),
        fromAnchor: normalizeEdgeAnchor(row.from_anchor, 'right'),
        toAnchor: normalizeEdgeAnchor(row.to_anchor, 'left'),
        description: row.description || '',
        createdByUid: row.created_by_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench edge create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create edge.' });
  } finally {
    client.release();
  }
});

router.patch('/api/workbench/:id/edges/:edgeId', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const edgeId = parsePositiveInt(req.params.edgeId);
  if (!workbenchId || !edgeId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench or edge id.' });
  }
  const description = sanitizeText(req.body && req.body.description, 4000);

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canManageNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot edit edges in this workbench.' });
    }

    const edgeExists = await client.query(
      `SELECT we.id
       FROM workbench_edges we
       JOIN workbench_nodes fn ON fn.id = we.from_node_id
         AND fn.workbench_id = $1
         AND fn.node_type IN ('file', 'folder')
         AND COALESCE(fn.is_deleted, false) = false
       JOIN workbench_nodes tn ON tn.id = we.to_node_id
         AND tn.workbench_id = $1
         AND tn.node_type IN ('file', 'folder')
         AND COALESCE(tn.is_deleted, false) = false
       WHERE we.workbench_id = $1
         AND we.id = $2
       LIMIT 1`,
      [workbenchId, edgeId]
    );
    if (!edgeExists.rows.length) {
      return res.status(404).json({ ok: false, message: 'Edge not found.' });
    }

    const result = await client.query(
      `UPDATE workbench_edges
       SET description = $3,
           updated_at = NOW()
       WHERE workbench_id = $1
         AND id = $2
       RETURNING id, from_node_id, to_node_id, from_anchor, to_anchor, description, created_by_uid, created_at, updated_at`,
      [workbenchId, edgeId, description || '']
    );
    const row = result.rows[0];
    return res.json({
      ok: true,
      edge: {
        id: Number(row.id),
        fromNodeId: Number(row.from_node_id),
        toNodeId: Number(row.to_node_id),
        fromAnchor: normalizeEdgeAnchor(row.from_anchor, 'right'),
        toAnchor: normalizeEdgeAnchor(row.to_anchor, 'left'),
        description: row.description || '',
        createdByUid: row.created_by_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench edge patch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update edge.' });
  } finally {
    client.release();
  }
});

router.delete('/api/workbench/:id/edges/:edgeId', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  const edgeId = parsePositiveInt(req.params.edgeId);
  if (!workbenchId || !edgeId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench or edge id.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canManageNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot delete edges in this workbench.' });
    }

    const result = await client.query(
      `DELETE FROM workbench_edges
       WHERE workbench_id = $1
         AND id = $2
       RETURNING id`,
      [workbenchId, edgeId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: 'Edge not found.' });
    }

    return res.json({ ok: true, deletedEdgeId: Number(result.rows[0].id) });
  } catch (error) {
    console.error('Workbench edge delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete edge.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/notes', async (req, res) => {
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  const nodeId = parsePositiveInt(req.body && req.body.nodeId);
  const edgeId = parsePositiveInt(req.body && req.body.edgeId);
  const content = sanitizeText(req.body && req.body.content, 20000);
  const source = sanitizeText(req.body && req.body.source, 10).toLowerCase() === 'ai' ? 'ai' : 'user';
  const aiModel = source === 'ai' ? sanitizeText(req.body && req.body.aiModel, 120) : '';

  if (!content) {
    return res.status(400).json({ ok: false, message: 'Note content is required.' });
  }
  if ((nodeId && edgeId) || (!nodeId && !edgeId)) {
    return res.status(400).json({ ok: false, message: 'Provide either nodeId or edgeId.' });
  }

  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot add notes in this workbench.' });
    }

    if (nodeId) {
      const nodeCheck = await pool.query(
        `SELECT id
         FROM workbench_nodes
         WHERE workbench_id = $1
           AND id = $2
           AND node_type IN ('file', 'folder')
           AND COALESCE(is_deleted, false) = false
         LIMIT 1`,
        [workbenchId, nodeId]
      );
      if (!nodeCheck.rows.length) {
        return res.status(404).json({ ok: false, message: 'Node not found.' });
      }
    } else if (edgeId) {
      const edgeCheck = await pool.query(
        `SELECT we.id
         FROM workbench_edges we
         JOIN workbench_nodes fn ON fn.id = we.from_node_id
           AND fn.workbench_id = $1
           AND fn.node_type IN ('file', 'folder')
           AND COALESCE(fn.is_deleted, false) = false
         JOIN workbench_nodes tn ON tn.id = we.to_node_id
           AND tn.workbench_id = $1
           AND tn.node_type IN ('file', 'folder')
           AND COALESCE(tn.is_deleted, false) = false
         WHERE we.workbench_id = $1
           AND we.id = $2
         LIMIT 1`,
        [workbenchId, edgeId]
      );
      if (!edgeCheck.rows.length) {
        return res.status(404).json({ ok: false, message: 'Edge not found.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO workbench_notes
        (workbench_id, node_id, edge_id, author_uid, source, ai_model, content, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, node_id, edge_id, author_uid, source, ai_model, content, created_at, updated_at`,
      [workbenchId, nodeId || null, edgeId || null, viewer.uid, source, aiModel || null, content]
    );
    const row = result.rows[0];
    return res.status(201).json({
      ok: true,
      note: {
        id: Number(row.id),
        nodeId: row.node_id ? Number(row.node_id) : null,
        edgeId: row.edge_id ? Number(row.edge_id) : null,
        authorUid: row.author_uid || null,
        source: row.source,
        aiModel: row.ai_model || null,
        content: row.content || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench note create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create note.' });
  }
});

router.post('/api/workbench/:id/ai-note', async (req, res) => {
  if (!isAiScanEnabled()) {
    return res.status(404).json({ ok: false, message: 'Workbench AI notes feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  const nodeId = parsePositiveInt(req.body && req.body.nodeId);
  const edgeId = parsePositiveInt(req.body && req.body.edgeId);
  const instruction = sanitizeText(req.body && req.body.instruction, 1200);
  if ((nodeId && edgeId) || (!nodeId && !edgeId)) {
    return res.status(400).json({ ok: false, message: 'Provide either nodeId or edgeId.' });
  }

  const client = await pool.connect();
  const startedAt = Date.now();
  try {
    await ensureAiGovernanceReady();
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canCreateNodes) {
      return res.status(403).json({ ok: false, message: 'You cannot create AI notes in this workbench.' });
    }

    const quota = await checkAiDailyQuota(
      {
        uid: viewer.uid,
        provider: 'openai',
        metricKey: 'workbench_ai_note',
        limit: Number(process.env.AI_WORKBENCH_NOTE_DAILY_LIMIT || DEFAULT_WORKBENCH_AI_NOTE_DAILY_LIMIT),
      },
      client
    );
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        message: `Daily workbench AI note limit reached (${quota.limit}).`,
      });
    }

    let contextLabel = '';
    let contextBody = '';
    if (nodeId) {
      const nodeResult = await client.query(
        `SELECT id, title, node_type, markdown_content
         FROM workbench_nodes
         WHERE workbench_id = $1
           AND id = $2
           AND node_type IN ('file', 'folder')
           AND COALESCE(is_deleted, false) = false
         LIMIT 1`,
        [workbenchId, nodeId]
      );
      if (!nodeResult.rows.length) {
        return res.status(404).json({ ok: false, message: 'Node not found.' });
      }
      const node = nodeResult.rows[0];
      const nodeTypeLabel = node.node_type === 'folder' ? 'Folder' : 'File';
      contextLabel = `${nodeTypeLabel} #${node.id}: ${node.title || 'Untitled node'}`;
      contextBody = sanitizeText(node.markdown_content || '', 20000);
    } else {
      const edgeResult = await client.query(
        `SELECT
          we.id,
          we.description,
          fn.node_type AS from_node_type,
          fn.title AS from_title,
          tn.node_type AS to_node_type,
          tn.title AS to_title
         FROM workbench_edges we
         JOIN workbench_nodes fn ON fn.id = we.from_node_id
           AND fn.workbench_id = $1
           AND fn.node_type IN ('file', 'folder')
           AND COALESCE(fn.is_deleted, false) = false
         JOIN workbench_nodes tn ON tn.id = we.to_node_id
           AND tn.workbench_id = $1
           AND tn.node_type IN ('file', 'folder')
           AND COALESCE(tn.is_deleted, false) = false
         WHERE we.workbench_id = $1
           AND we.id = $2
         LIMIT 1`,
        [workbenchId, edgeId]
      );
      if (!edgeResult.rows.length) {
        return res.status(404).json({ ok: false, message: 'Edge not found.' });
      }
      const edge = edgeResult.rows[0];
      const fromType = edge.from_node_type === 'folder' ? 'Folder' : 'File';
      const toType = edge.to_node_type === 'folder' ? 'Folder' : 'File';
      contextLabel = `Edge #${edge.id}: ${fromType} ${edge.from_title || 'Node'} -> ${toType} ${edge.to_title || 'Node'}`;
      contextBody = sanitizeText(edge.description || '', 20000);
    }

    const openAiClient = await getOpenAIClient();
    if (!openAiClient) {
      return res.status(503).json({
        ok: false,
        message: 'AI is not configured. Add OPENAI_API_KEY to enable Workbench AI notes.',
      });
    }
    const aiModel = getOpenAIModel();
    const prompt = [
      'You are assisting a collaborative workbench.',
      'Generate a concise, actionable note from the context below.',
      'Keep it factual and practical (max 8 bullets or a short paragraph).',
      instruction ? `User instruction: ${instruction}` : '',
      '',
      `Context label: ${contextLabel}`,
      `Context content: ${contextBody || 'No content provided.'}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await openAiClient.responses.create({
      model: aiModel,
      input: prompt,
      max_output_tokens: 900,
    });
    const aiText = extractOpenAiText(response);
    if (!aiText) {
      return res.status(500).json({ ok: false, message: 'AI returned no note content.' });
    }

    const noteResult = await client.query(
      `INSERT INTO workbench_notes
        (workbench_id, node_id, edge_id, author_uid, source, ai_model, content, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, 'ai', $5, $6, NOW(), NOW())
       RETURNING id, node_id, edge_id, author_uid, source, ai_model, content, created_at, updated_at`,
      [workbenchId, nodeId || null, edgeId || null, viewer.uid, aiModel, aiText]
    );
    const row = noteResult.rows[0];

    const durationMs = Date.now() - startedAt;
    await Promise.all([
      incrementAiUsage(
        {
          uid: viewer.uid,
          provider: 'openai',
          metricKey: 'workbench_ai_note',
          callCount: 1,
          inputChars: prompt.length,
          outputChars: aiText.length,
        },
        client
      ),
      logAiAuditEvent(
        {
          actorUid: viewer.uid,
          provider: 'openai',
          eventType: 'workbench_ai_note',
          scopeType: 'workbench',
          scopeId: String(workbenchId),
          status: 'success',
          model: aiModel,
          requestId: response && response.id ? response.id : null,
          inputChars: prompt.length,
          outputChars: aiText.length,
          latencyMs: durationMs,
          metadata: {
            nodeId: nodeId || null,
            edgeId: edgeId || null,
          },
        },
        client
      ),
    ]);

    return res.status(201).json({
      ok: true,
      note: {
        id: Number(row.id),
        nodeId: row.node_id ? Number(row.node_id) : null,
        edgeId: row.edge_id ? Number(row.edge_id) : null,
        authorUid: row.author_uid || null,
        source: row.source,
        aiModel: row.ai_model || null,
        content: row.content || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Workbench AI note create failed:', error);
    try {
      await logAiAuditEvent(
        {
          actorUid: req.user && req.user.uid ? req.user.uid : null,
          provider: 'openai',
          eventType: 'workbench_ai_note',
          scopeType: 'workbench',
          scopeId: String(workbenchId),
          status: 'error',
          model: getOpenAIModel(),
          metadata: {
            nodeId: nodeId || null,
            edgeId: edgeId || null,
            error: error && error.message ? error.message : 'Unknown error',
          },
        },
        client
      );
    } catch (_auditError) {
      // ignore audit failures
    }
    return res.status(500).json({ ok: false, message: 'Unable to create AI note.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/board-ai/chat', async (req, res) => {
  if (!isAiScanEnabled()) {
    return res.status(404).json({ ok: false, message: 'Workbench AI feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  const message = sanitizeText(req.body && req.body.message, 4000);
  if (!message) {
    return res.status(400).json({ ok: false, message: 'Message is required.' });
  }

  const rawHistory = Array.isArray(req.body && req.body.history) ? req.body.history : [];
  const history = rawHistory
    .slice(-10)
    .map((entry) => {
      const role = sanitizeText(entry && entry.role, 20).toLowerCase();
      const content = sanitizeText(entry && entry.content, 2000);
      if (!content) return null;
      if (role !== 'assistant') {
        return { role: 'user', content };
      }
      return { role: 'assistant', content };
    })
    .filter(Boolean);

  const client = await pool.connect();
  const startedAt = Date.now();
  try {
    await ensureAiGovernanceReady();
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions || access.permissions.canView !== true) {
      return res.status(403).json({ ok: false, message: 'You do not have access to this workbench.' });
    }

    const quota = await checkAiDailyQuota(
      {
        uid: viewer.uid,
        provider: 'openai',
        metricKey: 'workbench_ai_chat',
        limit: Number(process.env.AI_WORKBENCH_CHAT_DAILY_LIMIT || DEFAULT_WORKBENCH_AI_CHAT_DAILY_LIMIT),
      },
      client
    );
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        message: `Daily workbench AI chat limit reached (${quota.limit}).`,
      });
    }

    const canManageNodes = access.permissions.canManageNodes === true;
    const canCreateNodes = access.permissions.canCreateNodes === true;
    const nodeParams = canManageNodes ? [workbenchId] : [workbenchId, viewer.uid];
    const nodeVisibilityClause = canManageNodes
      ? ''
      : `AND (wn.visibility = 'members' OR wn.created_by_uid = $2)`;

    const edgeParams = canManageNodes ? [workbenchId] : [workbenchId, viewer.uid];
    const edgeVisibilityClause = canManageNodes
      ? ''
      : `AND (fn.visibility = 'members' OR fn.created_by_uid = $2) AND (tn.visibility = 'members' OR tn.created_by_uid = $2)`;

    const [nodesResult, edgesResult] = await Promise.all([
      client.query(
        `SELECT
           wn.id,
           wn.title,
           wn.node_type,
           wn.markdown_content,
           wn.position_x,
           wn.position_y
         FROM workbench_nodes wn
         WHERE wn.workbench_id = $1
           AND wn.node_type IN ('file', 'folder')
           AND COALESCE(wn.is_deleted, false) = false
           ${nodeVisibilityClause}
         ORDER BY wn.updated_at DESC, wn.id DESC
         LIMIT 120`,
        nodeParams
      ),
      client.query(
        `SELECT
           we.id,
           we.from_node_id,
           we.to_node_id,
           we.description,
           fn.title AS from_title,
           fn.node_type AS from_node_type,
           tn.title AS to_title,
           tn.node_type AS to_node_type
         FROM workbench_edges we
         JOIN workbench_nodes fn ON fn.id = we.from_node_id
           AND fn.workbench_id = $1
           AND fn.node_type IN ('file', 'folder')
           AND COALESCE(fn.is_deleted, false) = false
         JOIN workbench_nodes tn ON tn.id = we.to_node_id
           AND tn.workbench_id = $1
           AND tn.node_type IN ('file', 'folder')
           AND COALESCE(tn.is_deleted, false) = false
         WHERE we.workbench_id = $1
           ${edgeVisibilityClause}
         ORDER BY we.updated_at DESC, we.id DESC
         LIMIT 180`,
        edgeParams
      ),
    ]);

    const nodes = nodesResult.rows || [];
    const edges = edgesResult.rows || [];

    const openAiClient = await getOpenAIClient();
    const aiModel = getOpenAIModel();

    const mutationRequested = looksLikeBoardMutationRequest(message);
    if (mutationRequested) {
      if (!canCreateNodes) {
        return res.status(403).json({
          ok: false,
          message: 'You do not have permission to create markdown files or place nodes on this board.',
        });
      }

      let actionPlan = {
        assistantMessage: '',
        actions: [],
        rawText: '',
        requestId: null,
        promptLength: 0,
      };
      let plannerError = null;
      let usedFallbackPlanner = false;
      if (openAiClient) {
        try {
          actionPlan = await planBoardAiActions({
            openAiClient,
            aiModel,
            workbench: access.workbench,
            message,
            history,
            nodes,
            canCreateNodes,
          });
        } catch (error) {
          plannerError = error;
        }
      } else {
        plannerError = new Error('AI planner unavailable because OPENAI_API_KEY is not configured.');
      }

      const fallbackActions = deriveBoardAiActionsFromMessage({
        message,
        canCreateNodes,
      });
      if ((!Array.isArray(actionPlan.actions) || actionPlan.actions.length === 0) && fallbackActions.length) {
        actionPlan.actions = fallbackActions;
        usedFallbackPlanner = true;
        if (!sanitizeText(actionPlan.assistantMessage, 2200)) {
          actionPlan.assistantMessage = 'I interpreted your request and prepared board updates.';
        }
      }

      if ((!Array.isArray(actionPlan.actions) || actionPlan.actions.length === 0) && !sanitizeText(actionPlan.assistantMessage, 2200)) {
        actionPlan.assistantMessage = 'I detected a board update request, but I need a specific file title or node target. Example: "Create markdown file called Research Plan and place it on the canvas."';
      }

      if (Array.isArray(actionPlan.actions) && actionPlan.actions.length) {
        const roots = await ensureWorkbenchRootStructure(workbenchId, viewer.uid, client);
        const { executedActions, skippedActions } = await executeBoardAiActions({
          client,
          workbenchId,
          viewerUid: viewer.uid,
          permissions: access.permissions,
          roots,
          nodes,
          actions: actionPlan.actions,
          aiModel,
        });
        const summary = buildBoardActionSummary(executedActions, skippedActions);
        const reply = [
          actionPlan.assistantMessage || (executedActions.length ? 'Requested board updates were processed.' : 'No board updates were applied.'),
          summary,
        ]
          .filter(Boolean)
          .join('\n\n')
          .trim();

        const durationMs = Date.now() - startedAt;
        await Promise.all([
          incrementAiUsage(
            {
              uid: viewer.uid,
              provider: 'openai',
              metricKey: 'workbench_ai_chat',
              callCount: 1,
              inputChars: Number(actionPlan.promptLength || message.length || 0),
              outputChars: reply.length,
            },
            client
          ),
          logAiAuditEvent(
            {
              actorUid: viewer.uid,
              provider: 'openai',
              eventType: 'workbench_ai_chat',
              scopeType: 'workbench',
              scopeId: String(workbenchId),
              status: 'success',
              model: aiModel,
              requestId: actionPlan.requestId || null,
              inputChars: Number(actionPlan.promptLength || message.length || 0),
              outputChars: reply.length,
              latencyMs: durationMs,
              metadata: {
                visibleNodeCount: nodes.length,
                visibleEdgeCount: edges.length,
                executedActionCount: executedActions.length,
                skippedActionCount: skippedActions.length,
                actionPlanSource: usedFallbackPlanner ? 'heuristic_fallback' : 'llm_planner',
                plannerError: plannerError && plannerError.message ? plannerError.message : null,
                actionsExecuted: executedActions.map((entry) => ({
                  type: entry.type,
                  nodeId: entry.nodeId,
                  title: entry.title,
                })),
              },
            },
            client
          ),
        ]);

        return res.json({
          ok: true,
          model: aiModel,
          reply: reply || 'No response from AI.',
          executedActions,
          skippedActions,
        });
      }

      if (actionPlan.assistantMessage) {
        const durationMs = Date.now() - startedAt;
        await Promise.all([
          incrementAiUsage(
            {
              uid: viewer.uid,
              provider: 'openai',
              metricKey: 'workbench_ai_chat',
              callCount: 1,
              inputChars: Number(actionPlan.promptLength || message.length || 0),
              outputChars: actionPlan.assistantMessage.length,
            },
            client
          ),
          logAiAuditEvent(
            {
              actorUid: viewer.uid,
              provider: 'openai',
              eventType: 'workbench_ai_chat',
              scopeType: 'workbench',
              scopeId: String(workbenchId),
              status: 'success',
              model: aiModel,
              requestId: actionPlan.requestId || null,
              inputChars: Number(actionPlan.promptLength || message.length || 0),
              outputChars: actionPlan.assistantMessage.length,
              latencyMs: durationMs,
              metadata: {
                visibleNodeCount: nodes.length,
                visibleEdgeCount: edges.length,
                executedActionCount: 0,
                actionPlanSource: usedFallbackPlanner ? 'heuristic_fallback' : 'llm_planner',
                plannerError: plannerError && plannerError.message ? plannerError.message : null,
              },
            },
            client
          ),
        ]);

        return res.json({
          ok: true,
          model: aiModel,
          reply: actionPlan.assistantMessage,
          executedActions: [],
          skippedActions: [],
        });
      }
    }

    if (!openAiClient) {
      return res.status(503).json({
        ok: false,
        message: 'AI is not configured. Add OPENAI_API_KEY to enable board chat.',
      });
    }

    const nodeSummaryLines = nodes.map((node) => {
      const typeLabel = node.node_type === 'folder' ? 'folder' : 'file';
      const title = sanitizeText(node.title || '', 220) || `untitled-${node.id}`;
      const markdownExcerpt = sanitizeText(node.markdown_content || '', 280);
      const positionLabel =
        node.position_x != null && node.position_y != null
          ? `@(${Number(node.position_x).toFixed(1)}, ${Number(node.position_y).toFixed(1)})`
          : '@(unplaced)';
      return `- Node #${node.id} [${typeLabel}] "${title}" ${positionLabel}${markdownExcerpt ? ` | excerpt: ${markdownExcerpt}` : ''}`;
    });
    const edgeSummaryLines = edges.map((edge) => {
      const fromType = edge.from_node_type === 'folder' ? 'folder' : 'file';
      const toType = edge.to_node_type === 'folder' ? 'folder' : 'file';
      const fromTitle = sanitizeText(edge.from_title || '', 140) || `#${edge.from_node_id}`;
      const toTitle = sanitizeText(edge.to_title || '', 140) || `#${edge.to_node_id}`;
      const desc = sanitizeText(edge.description || '', 260);
      return `- Edge #${edge.id}: [${fromType}] ${fromTitle} -> [${toType}] ${toTitle}${desc ? ` | desc: ${desc}` : ''}`;
    });

    const conversationLines = history.map((entry) => {
      const roleLabel = entry.role === 'assistant' ? 'Assistant' : 'User';
      return `${roleLabel}: ${entry.content}`;
    });

    const prompt = [
      'You are an academic workbench graph assistant.',
      'Answer using ONLY the provided node-board context and conversation.',
      'If data is missing, state what is missing instead of inventing details.',
      'Keep responses concise, structured, and actionable.',
      '',
      `Workbench title: ${access.workbench.title || 'Untitled workbench'}`,
      `Course: ${access.workbench.course || 'Unknown course'}`,
      `Visible nodes count: ${nodes.length}`,
      `Visible edges count: ${edges.length}`,
      '',
      'Node board context:',
      nodeSummaryLines.length ? nodeSummaryLines.join('\n') : '- No visible nodes',
      '',
      'Connection context:',
      edgeSummaryLines.length ? edgeSummaryLines.join('\n') : '- No visible edges',
      '',
      'Recent conversation:',
      conversationLines.length ? conversationLines.join('\n') : '- No prior messages',
      '',
      `User question: ${message}`,
    ].join('\n');

    const response = await openAiClient.responses.create({
      model: aiModel,
      input: prompt,
      max_output_tokens: 1100,
    });
    const reply = extractOpenAiText(response);
    if (!reply) {
      return res.status(500).json({ ok: false, message: 'AI returned no response.' });
    }

    const durationMs = Date.now() - startedAt;
    await Promise.all([
      incrementAiUsage(
        {
          uid: viewer.uid,
          provider: 'openai',
          metricKey: 'workbench_ai_chat',
          callCount: 1,
          inputChars: prompt.length,
          outputChars: reply.length,
        },
        client
      ),
      logAiAuditEvent(
        {
          actorUid: viewer.uid,
          provider: 'openai',
          eventType: 'workbench_ai_chat',
          scopeType: 'workbench',
          scopeId: String(workbenchId),
          status: 'success',
          model: aiModel,
          requestId: response && response.id ? response.id : null,
          inputChars: prompt.length,
          outputChars: reply.length,
          latencyMs: durationMs,
          metadata: {
            visibleNodeCount: nodes.length,
            visibleEdgeCount: edges.length,
          },
        },
        client
      ),
    ]);

    return res.json({
      ok: true,
      model: aiModel,
      reply,
    });
  } catch (error) {
    console.error('Workbench board AI chat failed:', error);
    try {
      await logAiAuditEvent(
        {
          actorUid: req.user && req.user.uid ? req.user.uid : null,
          provider: 'openai',
          eventType: 'workbench_ai_chat',
          scopeType: 'workbench',
          scopeId: String(workbenchId),
          status: 'error',
          model: getOpenAIModel(),
          metadata: {
            error: error && error.message ? error.message : 'Unknown error',
          },
        },
        client
      );
    } catch (_auditError) {
      // no-op
    }
    return res.status(500).json({ ok: false, message: 'Unable to process board AI chat.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/ownership-transfer', async (req, res) => {
  if (!isWorkbenchTransferEnabled()) {
    return res.status(404).json({ ok: false, message: 'Workbench transfer feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  const toUid = sanitizeText(req.body && req.body.toUid, 120);
  const note = sanitizeText(req.body && req.body.note, 1000);
  const requestedHours = parsePositiveInt(req.body && req.body.tempPrivilegeHours);
  const tempPrivilegeHours = Math.min(requestedHours || DEFAULT_TRANSFER_EXPIRY_HOURS, MAX_SCOPED_PRIVILEGE_HOURS);
  if (!workbenchId || !toUid) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id or target user.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canTransferOwnership) {
      return res.status(403).json({ ok: false, message: 'Only owner/admin can request ownership transfer.' });
    }
    if (toUid === access.workbench.owner_uid) {
      return res.status(400).json({ ok: false, message: 'Target user is already the owner.' });
    }

    const targetResult = await client.query(
      `SELECT uid, COALESCE(is_banned, false) AS is_banned, course
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [toUid]
    );
    if (!targetResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Target user not found.' });
    }
    if (targetResult.rows[0].is_banned === true) {
      return res.status(400).json({ ok: false, message: 'Banned accounts cannot receive ownership transfer.' });
    }
    if (!sameCourse(targetResult.rows[0].course, access.workbench.course) && !access.permissions.isGlobalAdmin) {
      return res.status(403).json({ ok: false, message: 'Target user must belong to the same course.' });
    }

    const existingPending = await client.query(
      `SELECT id
       FROM workbench_ownership_transfers
       WHERE workbench_id = $1
         AND status = 'pending'
       LIMIT 1`,
      [workbenchId]
    );
    if (existingPending.rows.length) {
      return res.status(409).json({ ok: false, message: 'A pending ownership transfer already exists.' });
    }

    const expiresAt = new Date(Date.now() + DEFAULT_TRANSFER_EXPIRY_HOURS * 60 * 60 * 1000);
    const result = await client.query(
      `INSERT INTO workbench_ownership_transfers
        (workbench_id, from_uid, to_uid, requested_by_uid, note, status, temp_privilege_hours, expires_at, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW())
       RETURNING id, workbench_id, from_uid, to_uid, status, temp_privilege_hours, expires_at, created_at`,
      [workbenchId, access.workbench.owner_uid, toUid, viewer.uid, note || null, tempPrivilegeHours, expiresAt]
    );
    const row = result.rows[0];
    return res.status(201).json({
      ok: true,
      transfer: {
        id: Number(row.id),
        workbenchId: Number(row.workbench_id),
        fromUid: row.from_uid,
        toUid: row.to_uid,
        status: row.status,
        tempPrivilegeHours: Number(row.temp_privilege_hours || 0),
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error('Workbench ownership transfer request failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create ownership transfer request.' });
  } finally {
    client.release();
  }
});

router.post('/api/workbench/:id/ownership-transfer/respond', async (req, res) => {
  if (!isWorkbenchTransferEnabled()) {
    return res.status(404).json({ ok: false, message: 'Workbench transfer feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  const transferId = parsePositiveInt(req.body && req.body.transferId);
  const action = sanitizeText(req.body && req.body.action, 20).toLowerCase();
  const note = sanitizeText(req.body && req.body.note, 1000);
  if (!workbenchId || !transferId || !['accept', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, message: 'Invalid transfer response payload.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;

    await client.query('BEGIN');
    const transferResult = await client.query(
      `SELECT *
       FROM workbench_ownership_transfers
       WHERE id = $1
         AND workbench_id = $2
       FOR UPDATE`,
      [transferId, workbenchId]
    );
    if (!transferResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Ownership transfer request not found.' });
    }
    const transfer = transferResult.rows[0];
    const normalizedStatus = normalizeTransferStatus(transfer.status);
    if (normalizedStatus !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Ownership transfer is already closed.' });
    }
    if (new Date(transfer.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE workbench_ownership_transfers
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [transferId]
      );
      await client.query('COMMIT');
      return res.status(409).json({ ok: false, message: 'Ownership transfer has already expired.' });
    }

    const viewerRole = getPlatformRole(viewer);
    const canAct = viewer.uid === transfer.to_uid || viewerRole === 'owner' || viewerRole === 'admin';
    if (!canAct) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, message: 'Only transfer target or owner/admin can respond.' });
    }

    if (action === 'reject') {
      await client.query(
        `UPDATE workbench_ownership_transfers
         SET status = 'rejected',
             note = COALESCE($2, note),
             responded_by_uid = $3,
             responded_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [transferId, note || null, viewer.uid]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, transfer: { id: transferId, status: 'rejected' } });
    }

    const workbenchResult = await client.query(
      `SELECT id, owner_uid
       FROM workbenches
       WHERE id = $1
       FOR UPDATE`,
      [workbenchId]
    );
    if (!workbenchResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    const currentOwnerUid = workbenchResult.rows[0].owner_uid;
    if (currentOwnerUid !== transfer.from_uid) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Ownership has changed. Transfer request is stale.' });
    }

    await client.query(
      `UPDATE workbenches
       SET owner_uid = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [workbenchId, transfer.to_uid]
    );

    await client.query(
      `UPDATE workbench_members
       SET role = 'manager', state = 'active', updated_at = NOW()
       WHERE workbench_id = $1
         AND role = 'owner'
         AND user_uid <> $2`,
      [workbenchId, transfer.to_uid]
    );

    await client.query(
      `INSERT INTO workbench_members
        (workbench_id, user_uid, role, state, invited_by_uid, joined_at, created_at, updated_at)
       VALUES
        ($1, $2, 'owner', 'active', $3, NOW(), NOW(), NOW())
       ON CONFLICT (workbench_id, user_uid)
       DO UPDATE SET role = 'owner', state = 'active', joined_at = NOW(), updated_at = NOW()`,
      [workbenchId, transfer.to_uid, viewer.uid]
    );

    await client.query(
      `INSERT INTO workbench_members
        (workbench_id, user_uid, role, state, invited_by_uid, joined_at, created_at, updated_at)
       VALUES
        ($1, $2, 'manager', 'active', $3, NOW(), NOW(), NOW())
       ON CONFLICT (workbench_id, user_uid)
       DO UPDATE SET role = 'manager', state = 'active', updated_at = NOW()`,
      [workbenchId, transfer.from_uid, viewer.uid]
    );

    const targetViewerResult = await client.query(
      `SELECT COALESCE(platform_role, 'member') AS platform_role
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [transfer.to_uid]
    );
    const targetRole = targetViewerResult.rows[0] ? targetViewerResult.rows[0].platform_role : 'member';
    if (targetRole === 'member') {
      const durationHours = Math.min(
        Math.max(Number(transfer.temp_privilege_hours || 0), 0),
        MAX_SCOPED_PRIVILEGE_HOURS
      );
      if (durationHours > 0) {
        const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO workbench_scoped_privileges
            (workbench_id, user_uid, granted_role, granted_by_uid, reason, starts_at, expires_at, active, created_at, updated_at)
           VALUES
            ($1, $2, 'professor_scoped', $3, $4, NOW(), $5, true, NOW(), NOW())
           ON CONFLICT (workbench_id, user_uid, granted_role)
           WHERE active = true
           DO UPDATE SET granted_by_uid = EXCLUDED.granted_by_uid, reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
          [workbenchId, transfer.to_uid, viewer.uid, 'Ownership transfer scoped privilege', expiresAt]
        );
      }
    }

    await client.query(
      `UPDATE workbench_ownership_transfers
       SET status = 'accepted',
           note = COALESCE($2, note),
           responded_by_uid = $3,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [transferId, note || null, viewer.uid]
    );
    await client.query('COMMIT');
    return res.json({
      ok: true,
      transfer: {
        id: transferId,
        status: 'accepted',
        workbenchId,
        newOwnerUid: transfer.to_uid,
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback errors
    }
    console.error('Workbench ownership transfer respond failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to process ownership transfer response.' });
  } finally {
    client.release();
  }
});

router.get('/api/workbench/:id/tasks', async (req, res) => {
  if (!isTaskboardEnabled()) {
    return res.status(404).json({ ok: false, message: 'Taskboard feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }

  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canView) {
      return res.status(403).json({ ok: false, message: 'You do not have access to this workbench tasks.' });
    }

    const rowsResult = await pool.query(
      `SELECT
        t.id,
        t.task_group_id,
        t.workbench_id,
        t.creator_uid,
        t.title,
        t.description,
        t.task_type,
        t.priority,
        t.status,
        t.requires_submission_file,
        t.due_at,
        t.completed_at,
        t.created_at,
        t.updated_at
       FROM tasks t
       WHERE t.workbench_id = $1
       ORDER BY COALESCE(t.due_at, t.created_at) ASC, t.id ASC`,
      [workbenchId]
    );
    const tasks = await mapTaskRowsWithAssignees(rowsResult.rows, viewer.uid);
    return res.json({ ok: true, tasks });
  } catch (error) {
    console.error('Workbench tasks list failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load tasks.' });
  }
});

router.get('/api/workbench/:id/task-assignee-candidates', async (req, res) => {
  if (!isTaskboardEnabled()) {
    return res.status(404).json({ ok: false, message: 'Taskboard feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }
  try {
    const viewer = await ensureViewerOrReject(req, res);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canCreateTasks && !access.permissions.canManageTasks) {
      return res.status(403).json({ ok: false, message: 'You do not have access to assign task users.' });
    }
    const query = sanitizeText(req.query && req.query.q, 160);
    const candidates = await listAssignableTaskUsers(workbenchId, pool, {
      query,
      limit: query ? 40 : 25,
    });
    return res.json({ ok: true, candidates });
  } catch (error) {
    console.error('Task assignee candidate search failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load assignee candidates.' });
  }
});

router.post('/api/workbench/:id/tasks', async (req, res) => {
  if (!isTaskboardEnabled()) {
    return res.status(404).json({ ok: false, message: 'Taskboard feature is disabled.' });
  }
  const workbenchId = parsePositiveInt(req.params.id);
  if (!workbenchId) {
    return res.status(400).json({ ok: false, message: 'Invalid workbench id.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access) {
      return res.status(404).json({ ok: false, message: 'Workbench not found.' });
    }
    if (!access.permissions.canCreateTasks) {
      return res.status(403).json({ ok: false, message: 'You cannot create tasks in this workbench.' });
    }

    const title = sanitizeText(req.body && req.body.title, 220);
    const description = sanitizeText(req.body && req.body.description, 6000);
    const taskType = normalizeTaskType(req.body && req.body.taskType);
    const priority = normalizeTaskPriority(req.body && req.body.priority);
    const requiresSubmissionFile = parseBoolean(req.body && req.body.requiresSubmissionFile, false);
    const dueAt = parseDateInput(req.body && req.body.dueAt);
    const groupTitle = sanitizeText((req.body && req.body.groupTitle) || 'General', 120);
    const assigneeIdsRaw = Array.isArray(req.body && req.body.assigneeIds) ? req.body.assigneeIds : [];
    const assigneeUidsRaw = Array.isArray(req.body && req.body.assigneeUids) ? req.body.assigneeUids : [];
    const assigneeIdentifiers = Array.from(
      new Set(
        [...assigneeIdsRaw, ...assigneeUidsRaw]
          .map((item) => sanitizeText(item, 160))
          .filter(Boolean)
      )
    );

    if (!title) {
      return res.status(400).json({ ok: false, message: 'Task title is required.' });
    }

    await client.query('BEGIN');
    const existingGroup = await client.query(
      `SELECT id
       FROM task_groups
       WHERE workbench_id = $1
         AND title = $2
       ORDER BY id ASC
       LIMIT 1`,
      [workbenchId, groupTitle]
    );
    let groupId = existingGroup.rows[0] ? Number(existingGroup.rows[0].id) : null;
    if (!groupId) {
      const createdGroup = await client.query(
        `INSERT INTO task_groups
          (workbench_id, owner_uid, title, description, visibility, created_at, updated_at)
         VALUES
          ($1, $2, $3, NULL, 'workbench', NOW(), NOW())
         RETURNING id`,
        [workbenchId, viewer.uid, groupTitle]
      );
      groupId = Number(createdGroup.rows[0].id);
    }

    const taskResult = await client.query(
      `INSERT INTO tasks
        (task_group_id, workbench_id, creator_uid, title, description, task_type, priority, status, requires_submission_file, due_at, completed_at, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, NULL, NOW(), NOW())
       RETURNING id, task_group_id, workbench_id, creator_uid, title, description, task_type, priority, status, requires_submission_file, due_at, completed_at, created_at, updated_at`,
      [groupId, workbenchId, viewer.uid, title, description || null, taskType, priority, requiresSubmissionFile, dueAt]
    );
    const task = taskResult.rows[0];
    const taskId = Number(task.id);

    let resolvedAssignees = await resolveTaskAssigneeUids(workbenchId, assigneeIdentifiers, client);
    if (taskType === 'personal') {
      resolvedAssignees = [viewer.uid];
    }
    if (!resolvedAssignees.length) {
      resolvedAssignees = [viewer.uid];
    }

    const membershipResult = await client.query(
      `SELECT user_uid
       FROM workbench_members
       WHERE workbench_id = $1
         AND state = 'active'`,
      [workbenchId]
    );
    const activeMemberSet = new Set(membershipResult.rows.map((row) => row.user_uid));
    if (access.workbench && access.workbench.owner_uid) {
      activeMemberSet.add(access.workbench.owner_uid);
    }
    activeMemberSet.add(viewer.uid);
    resolvedAssignees = resolvedAssignees.filter((uid) => activeMemberSet.has(uid) || uid === viewer.uid);
    if (!resolvedAssignees.length) {
      resolvedAssignees = [viewer.uid];
    }

    for (const uid of resolvedAssignees) {
      await client.query(
        `INSERT INTO task_assignees
          (task_id, user_uid, assigned_by_uid, state, created_at, updated_at)
         VALUES
          ($1, $2, $3, 'assigned', NOW(), NOW())
         ON CONFLICT (task_id, user_uid)
         DO NOTHING`,
        [taskId, uid, viewer.uid]
      );
    }

    await insertTaskStatusHistory(client, {
      taskId,
      changedByUid: viewer.uid,
      fromStatus: null,
      toStatus: 'pending',
      note: 'Task created',
    });
    await client.query('COMMIT');

    const mapped = await mapTaskRowsWithAssignees([task], viewer.uid);
    return res.status(201).json({ ok: true, task: mapped[0] || null });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback errors
    }
    console.error('Workbench task create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create task.' });
  } finally {
    client.release();
  }
});

router.patch('/api/tasks/:taskId', async (req, res) => {
  if (!isTaskboardEnabled()) {
    return res.status(404).json({ ok: false, message: 'Taskboard feature is disabled.' });
  }
  const taskId = parsePositiveInt(req.params.taskId);
  if (!taskId) {
    return res.status(400).json({ ok: false, message: 'Invalid task id.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;

    const taskResult = await client.query(
      `SELECT
        t.id,
        t.task_group_id,
        t.workbench_id,
        t.creator_uid,
        t.title,
        t.description,
        t.task_type,
        t.priority,
        t.status,
        t.requires_submission_file,
        t.due_at,
        t.completed_at
       FROM tasks t
       WHERE t.id = $1
       LIMIT 1`,
      [taskId]
    );
    if (!taskResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    const task = taskResult.rows[0];
    if (!task.workbench_id) {
      return res.status(400).json({ ok: false, message: 'Task is not linked to a workbench.' });
    }

    const access = await resolveWorkbenchAccess(Number(task.workbench_id), viewer, client);
    if (!access || !access.permissions.canView) {
      return res.status(403).json({ ok: false, message: 'You do not have access to this task.' });
    }

    const assigneeResult = await client.query(
      `SELECT user_uid
       FROM task_assignees
       WHERE task_id = $1`,
      [taskId]
    );
    const isAssignee = assigneeResult.rows.some((row) => row.user_uid === viewer.uid);
    const isCreator = task.creator_uid === viewer.uid;
    const canManage = access.permissions.canManageTasks || isCreator;
    if (!canManage && !isAssignee) {
      return res.status(403).json({ ok: false, message: 'Only assigned users can update this task.' });
    }

    const updates = [];
    const params = [taskId];
    if (canManage && typeof req.body?.title === 'string') {
      params.push(sanitizeText(req.body.title, 220));
      updates.push(`title = $${params.length}`);
    }
    if (canManage && typeof req.body?.description === 'string') {
      params.push(sanitizeText(req.body.description, 6000) || null);
      updates.push(`description = $${params.length}`);
    }
    if (canManage && req.body?.priority) {
      params.push(normalizeTaskPriority(req.body.priority));
      updates.push(`priority = $${params.length}`);
    }
    if (canManage && req.body?.dueAt !== undefined) {
      const dueAt = parseDateInput(req.body.dueAt);
      params.push(dueAt);
      updates.push(`due_at = $${params.length}`);
    }
    if (canManage && req.body?.requiresSubmissionFile !== undefined) {
      params.push(parseBoolean(req.body.requiresSubmissionFile, false));
      updates.push(`requires_submission_file = $${params.length}`);
    }

    let nextStatus = null;
    if (typeof req.body?.status === 'string') {
      nextStatus = normalizeTaskStatus(req.body.status);
      params.push(nextStatus);
      updates.push(`status = $${params.length}`);
      if (nextStatus === 'completed') {
        updates.push(`completed_at = NOW()`);
      }
      if (nextStatus !== 'completed') {
        updates.push(`completed_at = NULL`);
      }
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, message: 'No valid task updates provided.' });
    }

    if (nextStatus === 'completed' && task.requires_submission_file === true) {
      const submissionResult = await client.query(
        `SELECT 1
         FROM task_submissions
         WHERE task_id = $1
           AND submitted_by_uid = $2
         LIMIT 1`,
        [taskId, viewer.uid]
      );
      if (!submissionResult.rows.length) {
        return res.status(400).json({
          ok: false,
          message: 'This task requires a file submission before completion.',
        });
      }
    }

    updates.push('updated_at = NOW()');
    await client.query('BEGIN');
    const updateResult = await client.query(
      `UPDATE tasks
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, task_group_id, workbench_id, creator_uid, title, description, task_type, priority, status, requires_submission_file, due_at, completed_at, created_at, updated_at`,
      params
    );
    if (!updateResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }

    if (nextStatus && nextStatus !== task.status) {
      await insertTaskStatusHistory(client, {
        taskId,
        changedByUid: viewer.uid,
        fromStatus: task.status,
        toStatus: nextStatus,
        note: sanitizeText(req.body && req.body.note, 1000) || null,
      });
      if (nextStatus === 'completed') {
        await client.query(
          `UPDATE task_assignees
           SET state = CASE WHEN user_uid = $2 THEN 'completed' ELSE state END,
               updated_at = NOW()
           WHERE task_id = $1`,
          [taskId, viewer.uid]
        );
      }
    }

    await client.query('COMMIT');
    const mapped = await mapTaskRowsWithAssignees(updateResult.rows, viewer.uid);
    return res.json({ ok: true, task: mapped[0] || null });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback errors
    }
    console.error('Task patch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update task.' });
  } finally {
    client.release();
  }
});

router.post('/api/tasks/:taskId/assign', async (req, res) => {
  if (!isTaskboardEnabled()) {
    return res.status(404).json({ ok: false, message: 'Taskboard feature is disabled.' });
  }
  const taskId = parsePositiveInt(req.params.taskId);
  const assigneeId = sanitizeText(
    (req.body && (req.body.assigneeId || req.body.userUid || req.body.uid)) || '',
    160
  );
  if (!taskId || !assigneeId) {
    return res.status(400).json({ ok: false, message: 'Invalid task id or assignee ID.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;

    const taskResult = await client.query(
      `SELECT id, workbench_id
       FROM tasks
       WHERE id = $1
       LIMIT 1`,
      [taskId]
    );
    if (!taskResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    const workbenchId = taskResult.rows[0].workbench_id ? Number(taskResult.rows[0].workbench_id) : null;
    if (!workbenchId) {
      return res.status(400).json({ ok: false, message: 'Task is not linked to a workbench.' });
    }

    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access || !access.permissions.canManageTasks) {
      return res.status(403).json({ ok: false, message: 'Only manager/professor can assign this task.' });
    }

    const resolvedUids = await resolveTaskAssigneeUids(workbenchId, [assigneeId], client);
    const targetUid = resolvedUids[0] || '';
    if (!targetUid) {
      return res.status(404).json({ ok: false, message: 'Assignee ID not found in this workbench.' });
    }

    await client.query(
      `INSERT INTO task_assignees
        (task_id, user_uid, assigned_by_uid, state, created_at, updated_at)
       VALUES
        ($1, $2, $3, 'assigned', NOW(), NOW())
       ON CONFLICT (task_id, user_uid)
       DO UPDATE SET assigned_by_uid = EXCLUDED.assigned_by_uid, state = 'assigned', updated_at = NOW()`,
      [taskId, targetUid, viewer.uid]
    );

    return res.json({ ok: true, message: `Task assignee updated (${assigneeId}).` });
  } catch (error) {
    console.error('Task assign failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to assign task.' });
  } finally {
    client.release();
  }
});

router.post('/api/tasks/:taskId/submit', upload.single('file'), async (req, res) => {
  if (!isTaskboardEnabled()) {
    return res.status(404).json({ ok: false, message: 'Taskboard feature is disabled.' });
  }
  const taskId = parsePositiveInt(req.params.taskId);
  if (!taskId) {
    return res.status(400).json({ ok: false, message: 'Invalid task id.' });
  }

  const client = await pool.connect();
  try {
    const viewer = await ensureViewerOrReject(req, res, client);
    if (!viewer) return;
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Submission file is required.' });
    }

    const taskResult = await client.query(
      `SELECT id, workbench_id, status
       FROM tasks
       WHERE id = $1
       LIMIT 1`,
      [taskId]
    );
    if (!taskResult.rows.length) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    const workbenchId = taskResult.rows[0].workbench_id ? Number(taskResult.rows[0].workbench_id) : null;
    if (!workbenchId) {
      return res.status(400).json({ ok: false, message: 'Task is not linked to a workbench.' });
    }

    const access = await resolveWorkbenchAccess(workbenchId, viewer, client);
    if (!access || !access.permissions.canView) {
      return res.status(403).json({ ok: false, message: 'You do not have access to this task.' });
    }

    const assigneeResult = await client.query(
      `SELECT 1
       FROM task_assignees
       WHERE task_id = $1
         AND user_uid = $2
       LIMIT 1`,
      [taskId, viewer.uid]
    );
    if (!assigneeResult.rows.length && !access.permissions.canManageTasks) {
      return res.status(403).json({ ok: false, message: 'Only assignees can submit files for this task.' });
    }

    const uploaded = await uploadToStorage({
      buffer: req.file.buffer,
      filename: req.file.originalname || `task-${taskId}.bin`,
      mimeType: req.file.mimetype || 'application/octet-stream',
      prefix: 'task-submissions',
    });
    const note = sanitizeText(req.body && req.body.note, 1000);

    await client.query(
      `INSERT INTO task_submissions
        (task_id, submitted_by_uid, storage_key, original_filename, mime_type, size_bytes, note, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (task_id, submitted_by_uid)
       DO UPDATE SET
         storage_key = EXCLUDED.storage_key,
         original_filename = EXCLUDED.original_filename,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         note = EXCLUDED.note,
         updated_at = NOW()`,
      [
        taskId,
        viewer.uid,
        uploaded.key,
        sanitizeText(req.file.originalname || '', 400) || null,
        sanitizeText(req.file.mimetype || '', 180) || null,
        req.file.size != null ? Number(req.file.size) : null,
        note || null,
      ]
    );

    await client.query(
      `UPDATE tasks
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );
    if (taskResult.rows[0].status === 'pending') {
      await insertTaskStatusHistory(client, {
        taskId,
        changedByUid: viewer.uid,
        fromStatus: 'pending',
        toStatus: 'in_progress',
        note: 'Submission uploaded',
      });
    }

    const signedUrl = await getSignedUrl(uploaded.key, SIGNED_TTL);
    return res.status(201).json({
      ok: true,
      submission: {
        taskId,
        submittedByUid: viewer.uid,
        fileName: req.file.originalname || null,
        mimeType: req.file.mimetype || null,
        sizeBytes: req.file.size != null ? Number(req.file.size) : null,
        fileUrl: signedUrl,
      },
    });
  } catch (error) {
    console.error('Task submission failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to submit task file.' });
  } finally {
    client.release();
  }
});

module.exports = router;
