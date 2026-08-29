'use strict';

// Narrow configuration client. Chronexa has no separate admin application.
const settings = require('./settings');
const auth = require('./auth');

function base() { return settings.get().sync.serverUrl; }
function canManage() { return Boolean(auth.get().user?.canManageTrackingPolicy); }
let cachedPolicy = null;
let policyRequest = null;
let cachedAt = 0;

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
  init() {
    setTimeout(() => {
      if (canManage()) module.exports.policy({ force: true }).catch(() => {});
    }, 500);
  },
  async policy({ force = false } = {}) {
    if (!force && cachedPolicy && Date.now() - cachedAt < 60000) return cachedPolicy;
    if (!policyRequest) {
      policyRequest = request('GET').then((data) => {
        cachedPolicy = data;
        cachedAt = Date.now();
        return data;
      }).finally(() => { policyRequest = null; });
    }
    return policyRequest;
  },
  async updatePolicy(patch) {
    const result = await request('PATCH', patch);
    cachedAt = 0;
    return result;
  },
};
