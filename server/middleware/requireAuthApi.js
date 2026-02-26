const { getSession, getRequestSessionId } = require('../auth/sessionStore');

async function requireAuthApi(req, res, next) {
  try {
    const sessionId = getRequestSessionId(req, { preferBearer: true });
    const session = sessionId ? await getSession(sessionId) : null;
    if (!session) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }
    req.user = session.user;
    return next();
  } catch (error) {
    console.error('API auth middleware failed:', error);
    return res.status(500).json({ ok: false, message: 'Auth service unavailable.' });
  }
}

module.exports = requireAuthApi;
