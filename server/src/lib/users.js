import { prisma } from './db.js';
import { hashPassword } from './password.js';
import { ROLES, validatePassword, validateEmail, normaliseEmail } from './user-rules.js';

// Re-exported so server-side callers only need one import.
export { MIN_PASSWORD_LENGTH, ROLES, validatePassword, validateEmail, normaliseEmail } from './user-rules.js';

/**
 * Locking every admin out of the dashboard would need a database edit to undo,
 * so the last active admin can never be deactivated or demoted.
 */
export async function isLastActiveAdmin(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'admin' || !user.active) return false;
  const others = await prisma.user.count({
    where: { role: 'admin', active: true, id: { not: userId } },
  });
  return others === 0;
}

/* ------------------------------- mutations ------------------------------ */
/*
 * These are plain functions rather than server actions so they can be covered
 * by scripts/admin-smoke.js. The server actions in the dashboard are thin
 * wrappers that check the session and then call straight through.
 *
 * Each returns { error } on a rule violation instead of throwing, so callers
 * can render the message inline.
 */

export async function createUser({ name, email, role, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normaliseEmail(email);
  const cleanRole = ROLES.includes(role) ? role : 'employee';

  if (cleanName.length < 2) return { error: 'Enter the employee name.' };
  const emailError = validateEmail(cleanEmail);
  if (emailError) return { error: emailError };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  if (await prisma.user.findUnique({ where: { email: cleanEmail } })) {
    return { error: 'An account with that email already exists.' };
  }

  const user = await prisma.user.create({
    data: { name: cleanName, email: cleanEmail, role: cleanRole, passwordHash: hashPassword(password) },
  });
  return { user };
}

export async function setUserActive(userId, active, { actingAdminId } = {}) {
  if (!active) {
    if (userId === actingAdminId) return { error: 'You cannot deactivate your own account.' };
    if (await isLastActiveAdmin(userId)) {
      return { error: 'The last active administrator cannot be deactivated.' };
    }
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { active } });
  // Deactivating must also cut off any agent already holding a device token.
  if (!active) await prisma.device.deleteMany({ where: { userId } });
  return { user };
}

export async function resetUserPassword(userId, password) {
  const error = validatePassword(password);
  if (error) return { error };

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } });
  // Old device tokens would stay valid otherwise, defeating the point of a reset.
  await prisma.device.deleteMany({ where: { userId } });
  return { ok: true };
}

export async function revokeUserDevices(userId) {
  const { count } = await prisma.device.deleteMany({ where: { userId } });
  return { revoked: count };
}

export async function setUserRole(userId, role, { actingAdminId } = {}) {
  const cleanRole = ROLES.includes(role) ? role : 'employee';

  if (cleanRole !== 'admin') {
    if (userId === actingAdminId) return { error: 'You cannot remove your own administrator access.' };
    if (await isLastActiveAdmin(userId)) {
      return { error: 'The last active administrator cannot be demoted.' };
    }
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { role: cleanRole } });
  return { user };
}
