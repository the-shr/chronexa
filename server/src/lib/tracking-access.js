const normalise = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export function isProjectManager(user) {
  return (user?.bmosRoleKeys || user?.roleKeys || []).some(key => /^(CUSTOM_)?(ASSIGNED_)?PROJECT_MANAGER(?:_|$)/.test(normalise(key)));
}
export function canViewEmployeeTracking(user) {
  return Boolean(user?.active && (user.role === 'admin' || user.bmosIsSuperAdmin || isProjectManager(user) || (user.bmosRoleKeys || []).some(key => ['ADMIN','ADMINISTRATOR'].includes(normalise(key))) || (user.bmosPermissions || []).some(key => ['settings.manage','attendance.manage'].includes(key))));
}
export function isProtectedTrackingUser(user) {
  if (user?.bmosIsSuperAdmin || user?.isSuperAdmin) return true;
  const roles = [...(user?.bmosRoleKeys || user?.roleKeys || []), ...(user?.roleNames || [])].map(normalise);
  return roles.some(key => /(?:^|_)(SUPER_ADMIN|CEO|HOO|CHIEF_EXECUTIVE_OFFICER|HEAD_OF_OPERATIONS)(?:_|$)/.test(key));
}
export function managerCanView(actor, target, profile) {
  if (!actor?.active || !target || isProtectedTrackingUser(target) || isProtectedTrackingUser(profile)) return false;
  if (actor.id === target.id) return true;
  if (isProjectManager(target) || isProjectManager(profile)) return false;
  // Directory membership is an allowlist supplied by OS after checking the live role.
  return Boolean(profile && Array.isArray(profile.roleKeys) && target.role !== 'admin');
}
