'use strict';

// Narrow configuration client. Chronexa has no separate admin application.
const settings = require('./settings');
const auth = require('./auth');

function base() { return settings.get().sync.serverUrl; }
function canManage() { return Boolean(auth.get().user?.canManageTrackingPolicy); }

async function request(method, body) {
  if (!auth.isSignedIn()) throw new Error('Sign in to load configuration.');
  if (!canManage()) throw new Error('This account cannot manage tracking configuration.');
  const res = await fetch(`${base()}/api/agent/admin/policy`, {
    method,
    headers: { ...auth.authHeaders(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error('Your account cannot manage tracking configuration.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Configuration request failed (${res.status}).`);
  return data;
}

module.exports = {
  init() {},
  policy: () => request('GET'),
  updatePolicy: (patch) => request('PATCH', patch),
};
