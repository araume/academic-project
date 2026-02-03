const { getSession } = require('../auth/sessionStore');

function requireAuthApi(req, res, next) {
  const sessionId = req.cookies.session_id;
  const session = sessionId ? getSession(sessionId) : null;
  if (!session) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }
  req.user = session.user;
  return next();
}

module.exports = requireAuthApi;
