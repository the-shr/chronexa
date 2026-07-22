import { prisma } from '@/lib/db.js';
import { deviceFromRequest, verifyPassword, hashPassword } from '@/lib/auth.js';
import { validatePassword } from '@/lib/user-rules.js';
import { rateLimit, clientIp, LOGIN_LIMITS } from '@/lib/rate-limit.js';

/**
 * Changing your own password. Requires the current one, so a device someone
 * walked away from cannot be used to lock the owner out.
 *
 * Every other device is signed out afterwards -- that is the point of changing
 * a password. This one stays signed in, since the person doing it is here.
 */
export async function POST(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Guessing the current password is a password attack like any other.
  const limited = await rateLimit(`me-password:${device.userId}:${clientIp(request.headers)}`, LOGIN_LIMITS.perAccount);
  if (!limited.allowed) {
    return Response.json(
      { error: 'Too many attempts. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

  if (!verifyPassword(String(body.currentPassword || ''), user.passwordHash)) {
    return Response.json({ error: 'Your current password is not correct.' }, { status: 403 });
  }

  const next = String(body.newPassword || '');
  const invalid = validatePassword(next);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  if (verifyPassword(next, user.passwordHash)) {
    return Response.json({ error: 'That is already your password.' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } });
  const { count } = await prisma.device.deleteMany({ where: { userId: user.id, id: { not: device.id } } });

  return Response.json({ ok: true, otherDevicesSignedOut: count });
}
