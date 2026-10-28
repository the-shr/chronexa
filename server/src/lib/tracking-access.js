const normalise = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export function isProjectManager(user) {
  return (user?.bmosRoleKeys || user?.roleKeys || []).some(key => /^(CUSTOM_)?(ASSIGNED_)?PROJECT_MANAGER(?:_|$)/.test(normalise(key)));
}
export function canViewEmployeeTracking(user) {
  return Boolean(user?.active && (user.role === 'admin' || user.bmosIsSuperAdmin || isProjectManager(user) || (user.bmosRoleKeys || []).some(key => ['ADMIN','ADMINISTRATOR'].includes(normalise(key))) || (user.bmosPermissions || []).some(key => ['settings.manage','attendance.manage'].includes(key))));
}
export function managerCanView(actor, target, profile) {
  if (!actor?.active || !target) return false;
  if (actor.id === target.id) return true;
  // The live OS directory is the complete allowlist, regardless of target role.
  return Boolean(profile && Array.isArray(profile.roleKeys));
}
