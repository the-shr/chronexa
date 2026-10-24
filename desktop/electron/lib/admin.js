'use strict';

// Narrow configuration client. Chronexa has no separate admin application.
const settings = require('./settings');
const auth = require('./auth');

function base() { return settings.get().sync.serverUrl; }
function canManage() { return Boolean(auth.get().user?.canManageTrackingPolicy); }
let cachedPolicy = null;
let policyRequest = null;
let cachedAt = 0;
const imageCache = new Map();
const clipCache = new Map();
const avatarCache = new Map();
const avatarRequests = new Map();

async function request(method, body, path = '/api/agent/admin/policy') {
  if (!auth.isSignedIn()) throw new Error('Sign in to load configuration.');
  if (!canManage()) throw new Error('This account cannot manage tracking configuration.');
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { ...auth.authHeaders(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('The server took too long to respond. Try again.');
    throw error;
  }
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
  employees(period = 'month') { return request('GET', null, `/api/agent/admin/employees?period=${period === 'week' ? 'week' : 'month'}`); },
  employee(id, month) { return request('GET', null, `/api/agent/admin/employees/${encodeURIComponent(id)}${month ? `?month=${encodeURIComponent(month)}` : ''}`); },
  async avatar(id) {
    if (!auth.isSignedIn() || !canManage()) throw new Error('Admin access required.');
    const key = `${auth.get().user?.id || auth.get().user?.email}:${String(id || '')}`;
    if (!id) return null;
    const cached = avatarCache.get(key);
    if (cached && cached.until > Date.now()) return cached.url;
    if (avatarRequests.has(key)) return avatarRequests.get(key);
    const pending = (async () => {
      const res = await fetch(`${base()}/api/agent/admin/employees/${encodeURIComponent(id)}/avatar`, { headers: auth.authHeaders(), signal: AbortSignal.timeout(15000) });
      const type = res.headers.get('content-type')?.split(';')[0];
      if (!res.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > 3 * 1024 * 1024) return null;
      return `data:${type};base64,${bytes.toString('base64')}`;
    })().then((url) => {
      if (avatarCache.size >= 150) avatarCache.delete(avatarCache.keys().next().value);
      avatarCache.set(key, { url, until: Date.now() + (url ? 300000 : 15000) });
      return url;
    }).finally(() => avatarRequests.delete(key));
    avatarRequests.set(key, pending);
    return pending;
  },
  screenshots({ userId = '', page = 1, pageSize = 24 } = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (userId) params.set('userId', userId);
    return request('GET', null, `/api/agent/admin/screenshots?${params}`);
  },
  recordings({ userId = '', limit = 60 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (userId) params.set('userId', userId);
    return request('GET', null, `/api/agent/admin/recordings?${params}`);
  },
  async image(id) {
    const key = String(id || '');
    if (!key) return null;
    if (imageCache.has(key)) return imageCache.get(key);
    const res = await fetch(`${base()}/api/image/${encodeURIComponent(key)}`, { headers: auth.authHeaders() });
    if (!res.ok) return null;
    const data = `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
    if (imageCache.size >= 80) imageCache.delete(imageCache.keys().next().value);
    imageCache.set(key, data);
    return data;
  },
  async clip(id) {
    const key = String(id || '');
    if (!key) return null;
    if (clipCache.has(key)) return clipCache.get(key);
    const res = await fetch(`${base()}/api/recording/${encodeURIComponent(key)}`, { headers: auth.authHeaders() });
    if (!res.ok) return null;
    const data = `data:${res.headers.get('content-type') || 'video/webm'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
    if (clipCache.size >= 6) clipCache.delete(clipCache.keys().next().value);
    clipCache.set(key, data);
    return data;
  },
};
