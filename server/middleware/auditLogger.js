const {
  deriveAction,
  logAuditEvent,
  safeBodySnapshot,
  shouldSkipAudit,
} = require('../services/auditLog');

function auditLogger(req, res, next) {
  if (shouldSkipAudit(req)) {
    return next();
  }

  const startedAt = Date.now();
  const bodySnapshot = safeBodySnapshot(req.body);

  res.on('finish', () => {
    const user = req.user;
    if (!user || !user.uid) {
      return;
    }

    const action = deriveAction(req);
    const metadata = {
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      success: res.statusCode >= 200 && res.statusCode < 400,
      body: bodySnapshot,
    };

    logAuditEvent({
      executorUid: user.uid,
      executorRole: user.platformRole || user.platform_role || null,
      course: user.course || null,
      actionKey: action.actionKey,
      actionType: action.actionType,
      targetType: action.targetType,
      targetId: action.targetId,
      sourcePath: action.sourcePath,
      metadata,
    }).catch((error) => {
      console.error('Audit log write failed:', error);
    });
  });

  return next();
}

module.exports = auditLogger;
