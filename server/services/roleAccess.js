function normalizeRole(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'administrator') return 'admin';
  return normalized;
}

function getPlatformRole(user) {
  if (!user || typeof user !== 'object') return 'member';
  if (user.isOwner === true) return 'owner';
  if (user.isAdmin === true) return 'admin';
  const candidates = [
    user.platformRole,
    user.platform_role,
    user.role,
    user.userType,
    user.usertype,
    user.user_type,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeRole(candidate);
    if (normalized === 'owner' || normalized === 'admin' || normalized === 'member') {
      return normalized;
    }
  }
  return 'member';
}

function hasAdminPrivileges(user) {
  const role = getPlatformRole(user);
  return role === 'owner' || role === 'admin';
}

function hasOwnerPrivileges(user) {
  return getPlatformRole(user) === 'owner';
}

module.exports = {
  getPlatformRole,
  hasAdminPrivileges,
  hasOwnerPrivileges,
};
