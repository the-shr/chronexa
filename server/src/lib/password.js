import crypto from 'node:crypto';

/**
 * scrypt via node:crypto -- no native module to build, and the parameters are
 * stored alongside the hash so they can be raised later without invalidating
 * existing passwords.
 *
 * Kept separate from auth.js because that module pulls in next/headers, which
 * cannot be imported outside a request context (scripts, tests, seeds).
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function newDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}
