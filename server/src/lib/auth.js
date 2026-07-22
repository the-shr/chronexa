import crypto from 'node:crypto';
import { cookies } from 'next/headers';

import { prisma } from './db.js';

export { hashPassword, verifyPassword, newDeviceToken } from './password.js';

const COOKIE = 'tt_admin';
const SESSION_DAYS = 7;

/* ----------------------------- agent devices ---------------------------- */

/** Resolves the `Authorization: Bearer <device token>` header to a device. */
export async function deviceFromRequest(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  const device = await prisma.device.findUnique({ where: { token }, include: { user: true } });
  if (!device || !device.user.active) return null;

  // Fire-and-forget: a failed heartbeat must not fail the upload.
  prisma.device
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return device;
}

/* ---------------------------- admin sessions ---------------------------- */

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set. Copy .env.example to .env.');
  return value;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(value) {
  const [body, mac] = String(value || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export async function createAdminSession(user) {
  const store = await cookies();
  store.set(COOKIE, sign({ sub: user.id, exp: Date.now() + SESSION_DAYS * 86400000 }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Current signed-in admin, or null. */
export async function currentAdmin() {
  const store = await cookies();
  const payload = unsign(store.get(COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  return user && user.active && user.role === 'admin' ? user : null;
}
