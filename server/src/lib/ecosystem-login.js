import { prisma } from '@/lib/db.js';
import * as bmos from '@/lib/bmos.js';

/**
 * Resolves a sign-in against the Brand Macros OS hub, shared by the desktop
 * agent and the admin web login.
 *
 * On a hub-accepted login it mirrors the person into Chronexa's own tables (so
 * sessions, devices, screenshots and tasks still hang off a local row) and
 * returns that row. On a rejected or unreachable hub it returns null, and the
 * caller falls back to a local password -- which only genuine local accounts
 * (the break-glass admin) can pass, since mirrored accounts store no password.
 */
export async function loginViaHub(email, password) {
  const result = await bmos.authenticate(email, password);
  if (!result.ok) return null;
  return mirrorUser(result.identity);
}

async function mirrorUser(identity) {
  const email = identity.email.toLowerCase().trim();
  const role = bmos.roleFor(identity);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // A pre-existing local account (the break-glass admin) keeps its own role,
    // name and password -- only link it to the hub identity. A previously
    // mirrored account is refreshed from the hub.
    const data =
      existing.source === 'local'
        ? { externalId: identity.userId, active: true }
        : { name: identity.name, role, externalId: identity.userId, active: true };
    return prisma.user.update({ where: { id: existing.id }, data });
  }

  return prisma.user.create({
    data: {
      email,
      name: identity.name,
      role,
      source: 'bmos',
      externalId: identity.userId,
      passwordHash: null,
      active: true,
    },
  });
}
