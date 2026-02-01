const { getSession } = require('../auth/sessionStore');

function requireAuth(req, res, next) {
  const sessionId = req.cookies.session_id;
  const session = sessionId ? getSession(sessionId) : null;
  if (!session) {
    return res.redirect('/login');
  }
  req.user = session.user;
  return next();
}

module.exports = requireAuth;
