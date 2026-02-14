const pool = require('../db/pool');
const { ensureAuditReady } = require('../services/auditLog');

async function requireOwnerOrAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.uid) {
      return res.redirect('/login');
    }

    await ensureAuditReady();

    const result = await pool.query(
      `SELECT COALESCE(platform_role, 'member') AS platform_role, COALESCE(is_banned, false) AS is_banned
       FROM accounts
       WHERE uid = $1
       LIMIT 1`,
      [req.user.uid]
    );

    if (!result.rows.length) {
      return res.redirect('/login');
    }

    const viewer = result.rows[0];
    if (viewer.is_banned === true) {
      return res.redirect('/login');
    }

    const role = viewer.platform_role || 'member';
    if (role !== 'owner' && role !== 'admin') {
      return res.redirect('/home');
    }

    req.user.platformRole = role;
    return next();
  } catch (error) {
    console.error('Admin page auth failed:', error);
    return res.redirect('/home');
  }
}

module.exports = requireOwnerOrAdmin;
