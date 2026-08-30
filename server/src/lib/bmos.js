/**
 * Client for the Brand Macros OS ecosystem hub.
 *
 * Chronexa is a satellite: the hub owns accounts and the canonical task list.
 * This talks to /api/ecosystem/* with Chronexa's registered app credentials.
 * The hub owns organisation accounts and tasks. A local password is retained
 * only for the explicit break-glass account.
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

export async function fetchProfilePhoto(email) {
  if (!configured()) return null;
  try {
    const query = new URLSearchParams({ email });
    const res = await fetch(`${base()}/api/ecosystem/profile-photo?${query.toString()}`, { headers: appHeaders() });
    if (!res.ok) return null;
    return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/jpeg' };
  } catch {
    return null;
  }
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

function statusParam(status) {
  return ['open', 'done', 'all'].includes(status) ? status : 'open';
}

/** The user's assigned tasks from the hub, or null if it could not be read. */
export async function fetchTasks(email, { status = 'open', userId = null } = {}) {
  if (!configured()) return null;
  try {
    const query = new URLSearchParams({ email, status: statusParam(status) });
    if (userId) query.set('userId', userId);
    const { ok, data } = await call(`/api/ecosystem/tasks?${query.toString()}`);
    return ok ? data.tasks || [] : null;
  } catch {
    return null;
  }
}

/** Team-wide hub task list for the admin dashboard. */
export async function fetchTeamTasks({ status = 'open' } = {}) {
  if (!configured()) return null;
  try {
    const query = new URLSearchParams({ status: statusParam(status) });
    const { ok, data } = await call(`/api/ecosystem/tasks?${query.toString()}`);
    return ok ? data.tasks || [] : null;
  } catch {
    return null;
  }
}

export async function fetchTaskOptions(actorEmail) {
  if (!configured()) return null;
  try {
    const query = new URLSearchParams({ meta: '1', actorEmail });
    const { ok, data } = await call(`/api/ecosystem/tasks?${query.toString()}`);
    return ok ? data : null;
  } catch {
    return null;
  }
}

export async function createTask(actorEmail, payload) {
  if (!configured()) return { error: 'The hub is not configured' };
  try {
    const { ok, status, data } = await call('/api/ecosystem/tasks', {
      method: 'POST',
      body: { ...payload, actorEmail },
    });
    return ok ? { id: data.id } : { error: data?.error || `The hub rejected the task (${status}).` };
  } catch {
    return { error: 'The hub could not be reached' };
  }
}

/** Marks a hub task done (SUBMITTED for review). Returns { ok } or { error }. */
export async function submitTask(email, taskId, completionNote, delayReason) {
  if (!configured()) return { error: 'The hub is not configured' };
  try {
    const { ok, data } = await call(`/api/ecosystem/tasks/${encodeURIComponent(taskId)}/submit`, {
      method: 'POST',
      body: { email, completionNote, delayReason },
    });
    return ok ? { ok: true } : { error: data?.error || 'The hub rejected the update' };
  } catch {
    return { error: 'The hub could not be reached' };
  }
}

export async function addTaskComment(email, taskId, body) {
  if (!configured()) return { error: 'The hub is not configured' };
  try {
    const { ok, status, data } = await call(`/api/ecosystem/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: 'POST', body: { email, body },
    });
    return ok ? data : { error: data?.error || `The hub rejected the comment (${status}).` };
  } catch {
    return { error: 'The hub could not be reached' };
  }
}

/**
 * How a hub identity maps to a Chronexa role. Superadmins and admin-type roles
 * run the team dashboard; everyone else is tracked as an employee.
 */
export function roleFor(identity) {
  if (identity.isSuperAdmin) return 'admin';
  const roles = Array.isArray(identity.roleKeys) ? identity.roleKeys.map((key) => String(key).toLowerCase()) : [];
  if (roles.some((key) => ['admin', 'administrator'].includes(key))) return 'admin';
  const permissions = Array.isArray(identity.permissions) ? identity.permissions : [];
  const adminPermissions = ['settings.manage', 'attendance.manage'];
  if (permissions.some((permission) => adminPermissions.includes(permission))) return 'admin';
  return 'employee';
}
