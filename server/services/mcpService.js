const { getOpenAIClient, getOpenAIModel } = require('./openaiClient');

const ALLOWED_MCP_ACTIONS = new Set([
  'run:services:list',
  'projects:list',
  'storage:buckets:list',
]);

function sanitizeText(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function getMcpServerUrl() {
  return String(process.env.GCLOUD_MCP_SERVER_URL || '').trim();
}

function isAllowedMcpAction(action) {
  const normalized = sanitizeText(action, 80);
  return ALLOWED_MCP_ACTIONS.has(normalized);
}

function extractResponseText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const chunks = [];
  const output = Array.isArray(response.output) ? response.output : [];
  output.forEach((item) => {
    const contentItems = Array.isArray(item && item.content) ? item.content : [];
    contentItems.forEach((content) => {
      const text = typeof content && typeof content.text === 'string' ? content.text.trim() : '';
      if (text) chunks.push(text);
    });
  });
  return chunks.join('\n\n').trim();
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  const clampedTimeout = Math.min(Math.max(Number(timeoutMs) || 0, 1000), 120000);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage || 'Operation timed out.'));
      }, clampedTimeout);
    }),
  ]);
}

function tryParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

async function invokeGcloudMcp(payload = {}) {
  const action = sanitizeText(payload.action, 80);
  if (!action) {
    const error = new Error('MCP action is required.');
    error.code = 'MCP_ACTION_REQUIRED';
    throw error;
  }
  if (!isAllowedMcpAction(action)) {
    const error = new Error('Requested MCP action is not allowed.');
    error.code = 'MCP_ACTION_BLOCKED';
    throw error;
  }

  const serverUrl = getMcpServerUrl();
  if (!serverUrl) {
    const error = new Error('MCP server URL is not configured.');
    error.code = 'MCP_NOT_CONFIGURED';
    throw error;
  }

  const client = await getOpenAIClient();
  if (!client) {
    const error = new Error('OpenAI client is not configured for MCP invocation.');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }

  const retries = Math.min(Math.max(Number(payload.retries) || 1, 0), 3);
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs) || 30000, 1000), 120000);
  const model = getOpenAIModel();

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const requestPromise = client.responses.create({
        model,
        input: [
          {
            role: 'system',
            content:
              'You must call the MCP tool run_gcloud exactly once. Do not invent outputs.',
          },
          {
            role: 'user',
            content:
              `Run the allowed gcloud action "${action}" and return only the raw tool output without commentary.`,
          },
        ],
        max_output_tokens: 1600,
        tools: [
          {
            type: 'mcp',
            server_label: 'gcloud',
            server_url: serverUrl,
            require_approval: 'never',
            allowed_tools: ['run_gcloud'],
          },
        ],
      });

      const response = await withTimeout(requestPromise, timeoutMs, 'MCP invocation timed out.');
      const text = extractResponseText(response);
      if (!text) {
        throw new Error('MCP invocation returned no text output.');
      }
      return {
        ok: true,
        action,
        model,
        serverUrl,
        responseId: response && response.id ? response.id : null,
        rawOutput: text,
        parsedOutput: tryParseJson(text),
      };
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError || new Error('MCP invocation failed.');
}

module.exports = {
  ALLOWED_MCP_ACTIONS: Array.from(ALLOWED_MCP_ACTIONS),
  getMcpServerUrl,
  isAllowedMcpAction,
  invokeGcloudMcp,
};
