const { getSession, getRequestSessionId } = require('../auth/sessionStore');

async function requireAuth(req, res, next) {
  try {
    const sessionId = getRequestSessionId(req, { preferBearer: false });
    const session = sessionId ? await getSession(sessionId) : null;
    if (!session) {
      return res.redirect('/login');
    }
    req.user = session.user;
    return next();
  } catch (error) {
    console.error('Web auth middleware failed:', error);
    return res.redirect('/login');
  }
}

module.exports = requireAuth;
