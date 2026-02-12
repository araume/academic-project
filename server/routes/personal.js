const express = require('express');
const { ObjectId } = require('mongodb');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const pool = require('../db/pool');
const { getOpenAIClient, getOpenAIModel, getOpenAIKey } = require('../services/openaiClient');
const pdfParse = require('pdf-parse');
const { downloadFromStorage } = require('../services/storage');

const GCLOUD_MCP_SERVER_URL = (process.env.GCLOUD_MCP_SERVER_URL || '').trim();

const router = express.Router();

router.use('/api/personal', requireAuthApi);

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((tag) => tag.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function extractProposedTasks(text) {
  const match = text.match(/tasks?:\s*([\s\S]+)/i);
  if (!match) return [];
  const raw = match[1]
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  return raw.slice(0, 10).map((title) => ({
    title,
    status: 'pending',
    priority: 'normal',
  }));
}

function hasTaskIntent(text) {
  if (!text) return false;
  return /(create|add|make|generate|set up)\s+.*(tasks?|to-?dos?)/i.test(text) ||
    /\b(tasks?|to-?dos?)\b.*\b(for|about|from)\b/i.test(text);
}

function parseTaskJson(text) {
  if (!text) return [];
  const cleaned = text.trim();
  const candidates = [cleaned];
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      // try next candidate
    }
  }
  return [];
}

function normalizeGeneratedTasks(tasks) {
  return tasks
    .filter((task) => task && typeof task === 'object')
    .map((task) => {
      const title = String(task.title || '').trim();
      if (!title) return null;
      const priority = ['low', 'normal', 'urgent'].includes(task.priority)
        ? task.priority
        : 'normal';
      const dueDate =
        typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
          ? task.dueDate
          : null;
      return {
        title,
        description: String(task.description || '').trim(),
        status: 'pending',
        priority,
        dueDate,
        tags: normalizeTags(task.tags || []),
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

async function inferTasksFromMessage(openai, text) {
  const response = await openai.responses.create({
    model: getOpenAIModel(),
    max_output_tokens: 700,
    input: [
      {
        role: 'system',
        content:
          'Extract actionable tasks from the user message. Return ONLY a JSON array. Each item must include: title, description, priority(low|normal|urgent), dueDate(YYYY-MM-DD or null), tags(string array). Return [] if no task should be created.',
      },
      { role: 'user', content: text },
    ],
  });
  const outputText = extractTextFromOpenAIResponse(response);
  return normalizeGeneratedTasks(parseTaskJson(outputText));
}

async function createTasksForUser(db, userUid, tasks) {
  if (!tasks.length) return [];
  const now = new Date();
  const taskDocs = tasks.map((task) => ({
    ...task,
    userUid,
    createdAt: now,
    updatedAt: now,
  }));
  const insertResult = await db.collection('personal_tasks').insertMany(taskDocs);
  return taskDocs.map((task, index) => ({
    ...task,
    _id: insertResult.insertedIds[index],
  }));
}

function deriveConversationTitle(text) {
  if (!text) return 'New conversation';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New conversation';
  const words = cleaned.split(' ');
  const title = words.slice(0, 6).join(' ');
  return title.length > 60 ? `${title.slice(0, 60).trim()}…` : title;
}

function extractTextFromOpenAIResponse(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const contentItem of item.content) {
        const text =
          typeof contentItem?.text === 'string' ? contentItem.text.trim() : '';
        if (!text) continue;
        if (contentItem.type === 'output_text' || contentItem.type === 'text') {
          chunks.push(text);
        }
      }
    }
  }

  return chunks.join('\n\n').trim();
}

function shouldRequireMcpTool(text) {
  if (!text) return false;
  return /(gcloud|google cloud|cloud run|gcs|bucket|project|service account|artifact registry|compute|sql|pub\/sub|bigquery|cloud functions|cloud storage)/i.test(
    text
  );
}

async function loadContextDocument(uuid) {
  if (!uuid) return null;
  try {
    const result = await pool.query(
      `SELECT uuid, title, description, subject, course, filename, link
       FROM documents
       WHERE uuid = $1`,
      [uuid]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Context document fetch failed:', error);
    return null;
  }
}

async function extractContextExcerpt(document) {
  if (!document || !document.link) return null;
  if (document.link.startsWith('http')) return null;
  try {
    const buffer = await downloadFromStorage(document.link);
    if (!buffer) return null;
    const maxBytes = 5 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return `Document is larger than ${Math.round(maxBytes / 1024 / 1024)}MB.`;
    }
    const data = await pdfParse(buffer);
    if (!data || !data.text) return null;
    const text = data.text.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const maxChars = 3500;
    return text.length > maxChars ? `${text.slice(0, maxChars).trim()}…` : text;
  } catch (error) {
    console.error('Context document parse failed:', error);
    return null;
  }
}

router.get('/api/personal/journals', async (req, res) => {
  try {
    const db = await getMongoDb();
    const entries = await db
      .collection('personal_journals')
      .find({ userUid: req.user.uid })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();
    return res.json({ ok: true, entries });
  } catch (error) {
    console.error('Journal fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load journals.' });
  }
});

router.get('/api/personal/journal-folders', async (req, res) => {
  try {
    const db = await getMongoDb();
    const folders = await db
      .collection('personal_journal_folders')
      .find({ userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .toArray();
    return res.json({ ok: true, folders });
  } catch (error) {
    console.error('Journal folders fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load folders.' });
  }
});

router.post('/api/personal/journal-folders', async (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ ok: false, message: 'Folder name is required.' });
  }
  try {
    const db = await getMongoDb();
    const existing = await db
      .collection('personal_journal_folders')
      .findOne({ userUid: req.user.uid, name: name.trim() });
    if (existing) {
      return res.status(409).json({ ok: false, message: 'Folder already exists.' });
    }
    const folder = {
      userUid: req.user.uid,
      name: name.trim(),
      createdAt: new Date(),
    };
    const result = await db.collection('personal_journal_folders').insertOne(folder);
    return res.json({ ok: true, folder: { ...folder, _id: result.insertedId } });
  } catch (error) {
    console.error('Journal folder create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create folder.' });
  }
});

router.delete('/api/personal/journal-folders/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid folder id.' });
  }
  try {
    const db = await getMongoDb();
    const folderId = new ObjectId(id);
    const folder = await db
      .collection('personal_journal_folders')
      .findOne({ _id: folderId, userUid: req.user.uid });
    if (!folder) {
      return res.status(404).json({ ok: false, message: 'Folder not found.' });
    }
    await db.collection('personal_journal_folders').deleteOne({ _id: folderId, userUid: req.user.uid });
    await db
      .collection('personal_journals')
      .updateMany({ userUid: req.user.uid, folder: folder.name }, { $set: { folder: null } });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Journal folder delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete folder.' });
  }
});

router.post('/api/personal/journals', async (req, res) => {
  const { title, content, folder, tags } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ ok: false, message: 'Title and content are required.' });
  }
  try {
    const db = await getMongoDb();
    if (folder) {
      const folderExists = await db
        .collection('personal_journal_folders')
        .findOne({ userUid: req.user.uid, name: folder.trim() });
      if (!folderExists) {
        return res.status(400).json({ ok: false, message: 'Selected folder does not exist.' });
      }
    }
    const now = new Date();
    const entry = {
      userUid: req.user.uid,
      title: title.trim(),
      content,
      folder: folder ? folder.trim() : null,
      tags: normalizeTags(tags),
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection('personal_journals').insertOne(entry);
    return res.json({ ok: true, entry: { ...entry, _id: result.insertedId } });
  } catch (error) {
    console.error('Journal create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create journal.' });
  }
});

router.patch('/api/personal/journals/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid journal id.' });
  }
  const { title, content, folder, tags } = req.body || {};
  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (folder !== undefined) updates.folder = folder ? folder.trim() : null;
  if (tags !== undefined) updates.tags = normalizeTags(tags);
  updates.updatedAt = new Date();

  try {
    const db = await getMongoDb();
    if (folder) {
      const folderExists = await db
        .collection('personal_journal_folders')
        .findOne({ userUid: req.user.uid, name: folder.trim() });
      if (!folderExists) {
        return res.status(400).json({ ok: false, message: 'Selected folder does not exist.' });
      }
    }
    const result = await db.collection('personal_journals').updateOne(
      { _id: new ObjectId(id), userUid: req.user.uid },
      { $set: updates }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ ok: false, message: 'Journal not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Journal update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update journal.' });
  }
});

router.delete('/api/personal/journals/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid journal id.' });
  }
  try {
    const db = await getMongoDb();
    const result = await db
      .collection('personal_journals')
      .deleteOne({ _id: new ObjectId(id), userUid: req.user.uid });
    if (!result.deletedCount) {
      return res.status(404).json({ ok: false, message: 'Journal not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Journal delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete journal.' });
  }
});

router.get('/api/personal/tasks', async (req, res) => {
  try {
    const db = await getMongoDb();
    const tasks = await db
      .collection('personal_tasks')
      .find({ userUid: req.user.uid })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({ ok: true, tasks });
  } catch (error) {
    console.error('Tasks fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load tasks.' });
  }
});

router.post('/api/personal/tasks', async (req, res) => {
  const { title, description, status, priority, dueDate, tags } = req.body || {};
  if (!title) {
    return res.status(400).json({ ok: false, message: 'Task title is required.' });
  }
  const now = new Date();
  try {
    const db = await getMongoDb();
    const task = {
      userUid: req.user.uid,
      title: title.trim(),
      description: description ? description.trim() : '',
      status: status || 'pending',
      priority: priority || 'normal',
      dueDate: dueDate || null,
      tags: normalizeTags(tags),
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection('personal_tasks').insertOne(task);
    return res.json({ ok: true, task: { ...task, _id: result.insertedId } });
  } catch (error) {
    console.error('Task create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create task.' });
  }
});

router.patch('/api/personal/tasks/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid task id.' });
  }
  const { title, description, status, priority, dueDate, tags } = req.body || {};
  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description.trim();
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;
  if (tags !== undefined) updates.tags = normalizeTags(tags);
  updates.updatedAt = new Date();

  try {
    const db = await getMongoDb();
    const result = await db.collection('personal_tasks').updateOne(
      { _id: new ObjectId(id), userUid: req.user.uid },
      { $set: updates }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Task update failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to update task.' });
  }
});

router.delete('/api/personal/tasks/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid task id.' });
  }
  try {
    const db = await getMongoDb();
    const result = await db
      .collection('personal_tasks')
      .deleteOne({ _id: new ObjectId(id), userUid: req.user.uid });
    if (!result.deletedCount) {
      return res.status(404).json({ ok: false, message: 'Task not found.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Task delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete task.' });
  }
});

router.get('/api/personal/conversations', async (req, res) => {
  try {
    const db = await getMongoDb();
    const conversations = await db
      .collection('ai_conversations')
      .find({ userUid: req.user.uid })
      .sort({ updatedAt: -1 })
      .toArray();
    return res.json({ ok: true, conversations });
  } catch (error) {
    console.error('Conversations fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load conversations.' });
  }
});

router.post('/api/personal/conversations', async (req, res) => {
  const { title } = req.body || {};
  try {
    const db = await getMongoDb();
    const now = new Date();
    const conversation = {
      userUid: req.user.uid,
      title: title ? title.trim() : 'New conversation',
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection('ai_conversations').insertOne(conversation);
    return res.json({ ok: true, conversation: { ...conversation, _id: result.insertedId } });
  } catch (error) {
    console.error('Conversation create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to create conversation.' });
  }
});

router.delete('/api/personal/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  try {
    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    await db.collection('ai_conversations').deleteOne({ _id: conversationId, userUid: req.user.uid });
    await db.collection('ai_messages').deleteMany({ conversationId, userUid: req.user.uid });
    await db.collection('ai_task_proposals').deleteMany({ conversationId, userUid: req.user.uid });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Conversation delete failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to delete conversation.' });
  }
});

router.get('/api/personal/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  try {
    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    const messages = await db
      .collection('ai_messages')
      .find({ conversationId, userUid: req.user.uid })
      .sort({ createdAt: 1 })
      .toArray();
    return res.json({ ok: true, messages });
  } catch (error) {
    console.error('Messages fetch failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to load messages.' });
  }
});

router.post('/api/personal/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { content, contextDoc } = req.body || {};
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid conversation id.' });
  }
  if (!content) {
    return res.status(400).json({ ok: false, message: 'Message content required.' });
  }

  try {
    const db = await getMongoDb();
    const conversationId = new ObjectId(id);
    const now = new Date();
    const contextUuid = contextDoc && contextDoc.uuid ? contextDoc.uuid : null;
    const contextDocument = await loadContextDocument(contextUuid);
    const contextExcerpt = await extractContextExcerpt(contextDocument);
    const userMessage = {
      conversationId,
      userUid: req.user.uid,
      role: 'user',
      content: content.trim(),
      contextDoc: contextUuid ? { uuid: contextUuid } : null,
      createdAt: now,
    };
    await db.collection('ai_messages').insertOne(userMessage);
    let conversationTitle = null;
    const conversation = await db
      .collection('ai_conversations')
      .findOne({ _id: conversationId, userUid: req.user.uid });
    const userMessageCount = await db
      .collection('ai_messages')
      .countDocuments({ conversationId, userUid: req.user.uid, role: 'user' });
    if (conversation && userMessageCount === 1) {
      const currentTitle = (conversation.title || '').trim();
      if (!currentTitle || currentTitle.toLowerCase() === 'new conversation') {
        conversationTitle = deriveConversationTitle(content);
      }
    }

    const conversationUpdate = { updatedAt: now };
    if (conversationTitle) {
      conversationUpdate.title = conversationTitle;
    }

    await db.collection('ai_conversations').updateOne(
      { _id: conversationId, userUid: req.user.uid },
      { $set: conversationUpdate }
    );

    const hasOpenAIKey = Boolean(getOpenAIKey());
    let assistantText = hasOpenAIKey
      ? 'AI is temporarily unavailable. Please retry in a moment.'
      : 'AI is not configured yet. Add OPENAI_API_KEY to enable responses. I can still store your conversation.';
    let proposalId = null;
    let proposedTasks = [];
    let createdTasks = [];

    const proposed = extractProposedTasks(content);
    if (proposed.length) {
      createdTasks = await createTasksForUser(
        db,
        req.user.uid,
        proposed.map((task) => ({ ...task, description: task.description || '', tags: [] }))
      );
      proposedTasks = proposed;
      assistantText = `Added ${proposed.length} task${proposed.length === 1 ? '' : 's'} to your tracker.`;
    } else {
      const openai = await getOpenAIClient();
      if (openai) {
        if (hasTaskIntent(content)) {
          try {
            const inferredTasks = await inferTasksFromMessage(openai, content);
            if (inferredTasks.length) {
              createdTasks = await createTasksForUser(db, req.user.uid, inferredTasks);
              assistantText = `Added ${inferredTasks.length} task${inferredTasks.length === 1 ? '' : 's'} to your tracker.`;
            }
          } catch (error) {
            console.error('Task inference failed:', error);
          }
        }

        if (createdTasks.length) {
          // Task creation handled; skip generic assistant generation for this turn.
        } else {
        const recentMessages = await db
          .collection('ai_messages')
          .find({ conversationId, userUid: req.user.uid })
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray();
        const history = recentMessages.reverse().map((message) => ({
          role: message.role,
          content: message.content,
        }));

        const systemPrompt = [
          'You are a private academic companion. Keep responses concise, helpful, and specific.',
          'If the user asks for plans or tasks, suggest a short, structured list.',
          'If you are unsure, ask a brief clarifying question.',
          GCLOUD_MCP_SERVER_URL
            ? 'When the user asks for Google Cloud environment state/actions, use the MCP tool and return concrete results from tool output. Do not ask for confirmation; tool access is already granted. The gcloud MCP tool run_gcloud accepts action values: run:services:list, projects:list, storage:buckets:list. For Cloud Run service listing, call run_gcloud with action run:services:list.'
            : '',
        ].join(' ');

        const input = [{ role: 'system', content: systemPrompt }, ...history];
        if (contextDocument) {
          input.unshift({
            role: 'system',
            content: [
              'Context document (use if relevant):',
              `Title: ${contextDocument.title}`,
              `Course: ${contextDocument.course || 'N/A'}`,
              `Subject: ${contextDocument.subject || 'N/A'}`,
              `Description: ${contextDocument.description || 'N/A'}`,
              `Filename: ${contextDocument.filename || 'N/A'}`,
              contextExcerpt ? `Excerpt: ${contextExcerpt}` : '',
            ].join('\n'),
          });
        }

        try {
          const requestBody = {
            model: getOpenAIModel(),
            input,
            max_output_tokens: 700,
          };
          let response = null;
          if (GCLOUD_MCP_SERVER_URL) {
            const requireMcpTool = shouldRequireMcpTool(content);
            requestBody.tools = [
              {
                type: 'mcp',
                server_label: 'gcloud',
                server_url: GCLOUD_MCP_SERVER_URL,
                require_approval: 'never',
              },
            ];
            requestBody.tool_choice = requireMcpTool ? 'required' : 'auto';
          }

          try {
            response = await openai.responses.create(requestBody);
          } catch (error) {
            const isMcpToolError =
              GCLOUD_MCP_SERVER_URL &&
              (error?.status === 424 ||
                /mcp|tool list|failed dependency/i.test(String(error?.message || '')));
            if (!isMcpToolError) {
              throw error;
            }

            // Fallback keeps chat functional when MCP endpoint is unreachable/misconfigured.
            console.error('OpenAI MCP tool failed, retrying without MCP:', error?.message || error);
            response = await openai.responses.create({
              model: getOpenAIModel(),
              input,
            });
          }

          let outputText = extractTextFromOpenAIResponse(response);
          if (!outputText) {
            // Some runs can return tool-only output; force a plain-text retry.
            const fallbackInput = [
              { role: 'system', content: 'Reply in plain text only. Do not call tools.' },
              ...input,
            ];
            const fallbackResponse = await openai.responses.create({
              model: getOpenAIModel(),
              input: fallbackInput,
              max_output_tokens: 700,
            });
            outputText = extractTextFromOpenAIResponse(fallbackResponse);
          }

          if (outputText) {
            assistantText = outputText;
          } else {
            assistantText =
              'AI returned no text output for this request. Set OPENAI_MODEL to gpt-4.1-mini and retry.';
          }
        } catch (error) {
          console.error('OpenAI response failed:', error);
          if (/model|does not exist|not found|unsupported/i.test(String(error?.message || ''))) {
            assistantText =
              'Model access/config issue detected. Set OPENAI_MODEL to an available model (for example: gpt-4.1-mini).';
          }
        }
        }
      } else if (!hasOpenAIKey) {
        assistantText =
          'AI is not configured yet. Add OPENAI_API_KEY to enable responses. I can still store your conversation.';
      } else if (/not helpful|unsatisfied|confused|doesn\\'t help/i.test(content)) {
        assistantText =
          'I can suggest alternative documents or articles if you want. Tell me the topic or course.';
      }
    }

    const assistantMessage = {
      conversationId,
      userUid: req.user.uid,
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    };
    await db.collection('ai_messages').insertOne(assistantMessage);

    return res.json({
      ok: true,
      message: assistantMessage,
      proposedTasks,
      proposalId,
      createdTasks,
      conversationTitle,
    });
  } catch (error) {
    console.error('Message create failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to add message.' });
  }
});

router.post('/api/personal/task-proposals/:id/confirm', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid proposal id.' });
  }
  try {
    const db = await getMongoDb();
    const proposalId = new ObjectId(id);
    const proposal = await db
      .collection('ai_task_proposals')
      .findOne({ _id: proposalId, userUid: req.user.uid, status: 'pending' });
    if (!proposal) {
      return res.status(404).json({ ok: false, message: 'Proposal not found.' });
    }

    const now = new Date();
    const tasks = proposal.tasks.map((task) => ({
      userUid: req.user.uid,
      title: task.title,
      status: task.status || 'pending',
      priority: task.priority || 'normal',
      dueDate: task.dueDate || null,
      tags: task.tags || [],
      createdAt: now,
      updatedAt: now,
    }));

    if (tasks.length) {
      await db.collection('personal_tasks').insertMany(tasks);
    }
    await db.collection('ai_task_proposals').updateOne(
      { _id: proposalId },
      { $set: { status: 'accepted', decidedAt: now } }
    );
    return res.json({ ok: true, created: tasks.length });
  } catch (error) {
    console.error('Proposal confirm failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to confirm proposal.' });
  }
});

router.post('/api/personal/task-proposals/:id/reject', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: 'Invalid proposal id.' });
  }
  try {
    const db = await getMongoDb();
    const proposalId = new ObjectId(id);
    await db.collection('ai_task_proposals').updateOne(
      { _id: proposalId, userUid: req.user.uid },
      { $set: { status: 'rejected', decidedAt: new Date() } }
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Proposal reject failed:', error);
    return res.status(500).json({ ok: false, message: 'Unable to reject proposal.' });
  }
});

module.exports = router;
