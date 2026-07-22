/**
 * Pure validation rules with no Node imports, so client components can share
 * them with the server. Anything touching crypto or the database belongs in
 * users.js instead -- importing that from a client component would pull
 * node:crypto into the browser bundle and fail the build.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const ROLES = ['employee', 'admin'];

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain both letters and numbers.';
  }
  return null;
}

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Enter a valid email address.';
}
