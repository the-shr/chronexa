import { prisma } from '@/lib/db.js';
import { verifyPassword, newDeviceToken } from '@/lib/auth.js';
import { normaliseEmail } from '@/lib/user-rules.js';
import { rateLimit, clearRateLimit, clientIp, LOGIN_LIMITS } from '@/lib/rate-limit.js';

/**
 * Desktop agent sign-in. Returns a long-lived device token rather than a
 * session cookie: the agent runs unattended and must survive restarts.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normaliseEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) {
    return Response.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  const ipKey = `agent-login:ip:${ip}`;
  const accountKey = `agent-login:email:${email}`;

  for (const [key, policy] of [
    [ipKey, LOGIN_LIMITS.perIp],
    [accountKey, LOGIN_LIMITS.perAccount],
  ]) {
    const result = rateLimit(key, policy);
    if (!result.allowed) {
      return Response.json(
        { error: 'Too many sign-in attempts. Try again shortly.' },
        { status: 429, headers: { 'retry-after': String(result.retryAfterSeconds) } },
      );
    }
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same response for unknown user and wrong password -- no account enumeration.
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: 'Incorrect email or password' }, { status: 401 });
  }

  // Success: don't let earlier typos count against this account.
  clearRateLimit(accountKey);

  const deviceName = String(body.deviceName || 'Unknown device').slice(0, 120);
  const platform = String(body.platform || 'unknown').slice(0, 40);
  const token = newDeviceToken();

  // One row per (user, machine): re-installing the agent rotates the token
  // instead of piling up duplicate devices.
  const existing = await prisma.device.findFirst({ where: { userId: user.id, name: deviceName } });
  const device = existing
    ? await prisma.device.update({
        where: { id: existing.id },
        data: { token, platform, lastSeenAt: new Date() },
      })
    : await prisma.device.create({
        data: { userId: user.id, name: deviceName, platform, token, lastSeenAt: new Date() },
      });

  return Response.json({
    token: device.token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    device: { id: device.id, name: device.name },
  });
}
