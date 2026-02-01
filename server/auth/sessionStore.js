const crypto = require('crypto');

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function createSession(user) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, {
    user,
    createdAt: Date.now(),
  });
  return sessionId;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
};
