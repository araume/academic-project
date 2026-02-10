const express = require('express');
const { ObjectId } = require('mongodb');
const requireAuthApi = require('../middleware/requireAuthApi');
const { getMongoDb } = require('../db/mongo');
const pool = require('../db/pool');
const { getOpenAIClient, getOpenAIModel } = require('../services/openaiClient');
const pdfParse = require('pdf-parse');
const { downloadFromStorage } = require('../services/storage');

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

function deriveConversationTitle(text) {
  if (!text) return 'New conversation';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New conversation';
  const words = cleaned.split(' ');
  const title = words.slice(0, 6).join(' ');
  return title.length > 60 ? `${title.slice(0, 60).trim()}…` : title;
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

    let assistantText =
      'AI is not configured yet. Add OPENAI_API_KEY to enable responses. I can still store your conversation.';
    let proposalId = null;
    let proposedTasks = [];
    let createdTasks = [];

    const proposed = extractProposedTasks(content);
    if (proposed.length) {
      const taskDocs = proposed.map((task) => ({
        ...task,
        description: task.description || '',
        userUid: req.user.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      const insertResult = await db.collection('personal_tasks').insertMany(taskDocs);
      createdTasks = taskDocs.map((task, index) => ({
        ...task,
        _id: insertResult.insertedIds[index],
      }));
      proposedTasks = proposed;
      assistantText = `Added ${proposed.length} task${proposed.length === 1 ? '' : 's'} to your tracker.`;
    } else {
      const openai = await getOpenAIClient();
      if (openai) {
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
          const response = await openai.responses.create({
            model: getOpenAIModel(),
            input,
          });
          const outputText =
            (response && response.output_text && response.output_text.trim()) ||
            '';
          if (outputText) {
            assistantText = outputText;
          }
        } catch (error) {
          console.error('OpenAI response failed:', error);
        }
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
