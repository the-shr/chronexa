/**
 * Client for the Brand Macros OS ecosystem hub.
 *
 * Chronexa is a satellite: the hub owns accounts and the canonical task list.
 * This talks to /api/ecosystem/* with Chronexa's registered app credentials.
 * If the hub is not configured, everything here reports "not available" and the
 * caller falls back to Chronexa's own local accounts, so a missing or unreachable
 * hub can never lock everyone out.
 */

const TIMEOUT_MS = 10_000;

export function configured() {
  return Boolean(process.env.BMOS_URL && process.env.ECOSYSTEM_CLIENT_ID && process.env.ECOSYSTEM_CLIENT_SECRET);
}

function base() {
  return String(process.env.BMOS_URL || '').replace(/\/+$/, '');
}

function appHeaders() {
  return {
    'x-ecosystem-client': process.env.ECOSYSTEM_CLIENT_ID,
    'x-ecosystem-secret': process.env.ECOSYSTEM_CLIENT_SECRET,
  };
}

async function call(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      signal: controller.signal,
      headers: { ...appHeaders(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validates a user's credentials against the hub.
 *
 * Returns { ok: true, identity } when the hub accepts them, { ok: false } when
 * the hub is reachable but rejects them (wrong password, unknown or blocked
 * user), and { unreachable: true } when the hub could not be reached at all --
 * which the caller treats as "fall back to local", not "denied".
 */
export async function authenticate(email, password) {
  if (!configured()) return { unreachable: true };
  try {
    const { ok, data } = await call('/api/ecosystem/auth', { method: 'POST', body: { email, password } });
    return ok && data?.identity ? { ok: true, identity: data.identity } : { ok: false };
  } catch {
    return { unreachable: true };
  }
}

/** The user's open assigned tasks from the hub, or null if it could not be read. */
export async function fetchTasks(email) {
  if (!configured()) return null;
  try {
    const { ok, data } = await call(`/api/ecosystem/tasks?email=${encodeURIComponent(email)}`);
    return ok ? data.tasks || [] : null;
  } catch {
    return null;
  }
}

/** Marks a hub task done (SUBMITTED for review). Returns { ok } or { error }. */
export async function submitTask(email, taskId, completionNote) {
  if (!configured()) return { error: 'The hub is not configured' };
  try {
    const { ok, data } = await call(`/api/ecosystem/tasks/${encodeURIComponent(taskId)}/submit`, {
      method: 'POST',
      body: { email, completionNote },
    });
    return ok ? { ok: true } : { error: data?.error || 'The hub rejected the update' };
  } catch {
    return { error: 'The hub could not be reached' };
  }
}

/**
 * How a hub identity maps to a Chronexa role. Superadmins and admin-type roles
 * run the team dashboard; everyone else is tracked as an employee.
 */
export function roleFor(identity) {
  const adminRoles = ['SUPER_ADMIN', 'ADMIN'];
  if (identity.isSuperAdmin) return 'admin';
  if (Array.isArray(identity.roleKeys) && identity.roleKeys.some((k) => adminRoles.includes(k))) return 'admin';
  return 'employee';
}
