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
  let responseSnapshot = null;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    responseSnapshot = payload;
    return originalJson(payload);
  };

  res.on('finish', () => {
    const user = req.user;
    if (!user || !user.uid) {
      return;
    }

    deriveAction(req, {
      statusCode: res.statusCode,
      responseBody: responseSnapshot,
      executorName: user.displayName || user.username || user.email || 'User',
    })
      .then((action) => {
        const metadata = {
          method: req.method,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          success: res.statusCode >= 200 && res.statusCode < 400,
          body: bodySnapshot,
        };
        if (action.targetUrl) metadata.targetUrl = action.targetUrl;
        if (action.recipientUid) metadata.recipientUid = action.recipientUid;
        if (action.recipientName) metadata.recipientName = action.recipientName;
        if (action.postTitle) metadata.postTitle = action.postTitle;

        return logAuditEvent({
          executorUid: user.uid,
          executorRole: user.platformRole || user.platform_role || null,
          course: user.course || null,
          actionKey: action.actionKey,
          actionType: action.actionType,
          targetType: action.targetType,
          targetId: action.targetId,
          sourcePath: action.sourcePath,
          metadata,
        });
      })
      .catch((error) => {
        console.error('Audit log write failed:', error);
      });
  });

  return next();
}

module.exports = auditLogger;
