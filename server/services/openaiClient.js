let clientPromise = null;

const DEFAULT_MODEL = 'gpt-4.1-mini';

function sanitizeEnvValue(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function getOpenAIKey() {
  return sanitizeEnvValue(process.env.OPENAI_API_KEY);
}

function getOpenAIModel() {
  const model = sanitizeEnvValue(process.env.OPENAI_MODEL);
  return model || DEFAULT_MODEL;
}

async function getOpenAIClient() {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import('openai').then(({ default: OpenAI }) => new OpenAI({ apiKey }));
  }

  return clientPromise;
}

module.exports = {
  getOpenAIClient,
  getOpenAIKey,
  getOpenAIModel,
};
