import { prisma } from '@/lib/db.js';
import { deviceFromRequest, verifyPassword } from '@/lib/auth.js';
import { normaliseEmail, validateEmail } from '@/lib/user-rules.js';

/** What the employee is allowed to know about their own account. */
export function serialiseMe(user) {
  const hasHubIdentity = user.source === 'bmos' || Boolean(user.externalId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.bmosPermissions || [],
    roleKeys: user.bmosRoleKeys || [],
    canManageTrackingPolicy:
      Boolean(user.bmosIsSuperAdmin) ||
      (user.bmosRoleKeys || []).some((key) => ['admin', 'administrator'].includes(String(key).toLowerCase())) ||
      (user.bmosPermissions || []).some((permission) => ['settings.manage', 'attendance.manage'].includes(permission)),
    hasAvatar: Boolean(user.avatarPath || hasHubIdentity),
    // Changes whenever the picture does, so the agent knows to re-fetch.
    avatarVersion: user.avatarPath ? user.avatarPath.slice(-12) : hasHubIdentity ? `bmos-${new Date().toISOString().slice(0, 10)}` : null,
  };
}

export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({ user: serialiseMe(user) });
}

/**
 * Updates the employee's own name and email.
 *
 * Changing the email is an identity change, so it needs the current password
 * even though the caller already holds a valid device token: a token left on an
 * unattended machine should not be enough to take the account over.
 */
export async function PATCH(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (name.length < 2) return Response.json({ error: 'Enter your name.' }, { status: 400 });
    data.name = name;
  }

  if (body.email !== undefined) {
    const email = normaliseEmail(body.email);
    const invalid = validateEmail(email);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });

    if (email !== user.email) {
      if (!verifyPassword(String(body.currentPassword || ''), user.passwordHash)) {
        return Response.json({ error: 'Enter your current password to change your email.' }, { status: 403 });
      }
      const taken = await prisma.user.findUnique({ where: { email } });
      if (taken) return Response.json({ error: 'That email is already in use.' }, { status: 409 });
      data.email = email;
    }
  }

  if (!Object.keys(data).length) return Response.json({ user: serialiseMe(user) });

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return Response.json({ user: serialiseMe(updated) });
}
