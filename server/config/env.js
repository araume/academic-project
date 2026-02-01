const fs = require('fs');
const path = require('path');

function parseEnvFile(contents) {
  const env = {};
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

function loadEnv() {
  const envPaths = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '..', 'env.txt'),
  ];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    const contents = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnvFile(contents);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  if (!process.env.PORT) {
    process.env.PORT = '3000';
  }
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'dev-session-secret';
  }
}

module.exports = {
  loadEnv,
};
