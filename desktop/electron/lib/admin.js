'use strict';

/**
 * The admin side of the app. Everything here talks to /api/agent/admin/*, which
 * only answers to a device token whose account is an admin -- so an employee
 * running the same build gets a 401, not a dashboard.
 *
 * Screenshots are fetched here rather than in the renderer: the renderer cannot
 * put an Authorization header on an <img>, and putting the token in the URL
 * would leak it into logs. The bytes come back as a data URL instead.
 */

const { EventEmitter } = require('node:events');

const settings = require('./settings');
const auth = require('./auth');
const log = require('./log');

const events = new EventEmitter();

/** Small cache so flipping between pages does not refetch the same picture. */
const imageCache = new Map();
const IMAGE_CACHE_MAX = 120;
const clipCache = new Map();
const CLIP_CACHE_MAX = 8;

function base() {
  return settings.get().sync.serverUrl;
}

function isAdmin() {
  return auth.get().user?.role === 'admin';
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (!auth.isSignedIn()) throw new Error('Sign in to load this.');
  if (!isAdmin()) throw new Error('This account is not an administrator.');

  const res = await fetch(`${base()}${path}`, {
    method,
    signal,
    headers: {
      ...auth.authHeaders(),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    auth.markExpired('the admin dashboard was refused');
    throw new Error('Your session has expired. Sign in again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

/* -------------------------------- reading ------------------------------- */

function overview(days = 7) {
  return request(`/api/agent/admin/overview?days=${encodeURIComponent(days)}`);
}

function employees() {
  return request('/api/agent/admin/employees');
}

function employee(id) {
  return request(`/api/agent/admin/employees/${encodeURIComponent(id)}`);
}

function tasks({ userId = '', status = 'all' } = {}) {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (status) params.set('status', status);
  return request(`/api/agent/admin/tasks?${params}`);
}

function screenshots({ userId = '', limit = 60 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (userId) params.set('userId', userId);
  return request(`/api/agent/admin/screenshots?${params}`);
}

/* -------------------------------- writing ------------------------------- */

function assignTask(payload) {
  return request('/api/agent/admin/tasks', { method: 'POST', body: payload });
}

function updateTask(payload) {
  return request('/api/agent/admin/tasks', { method: 'PATCH', body: payload });
}

function deleteTask(id) {
  return request(`/api/agent/admin/tasks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

function policy() {
  return request('/api/agent/admin/policy');
}

function updatePolicy(patch) {
  return request('/api/agent/admin/policy', { method: 'PATCH', body: patch });
}

function recordings({ userId = '', limit = 60 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (userId) params.set('userId', userId);
  return request(`/api/agent/admin/recordings?${params}`);
}

async function deleteRecording(id) {
  const result = await request(`/api/agent/admin/recordings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  clipCache.delete(String(id));
  return result;
}

/**
 * One clip as a data URL the renderer can drop into <video>. Same reasoning as
 * images: the renderer cannot put an Authorization header on a media element,
 * and a token in the URL would leak into logs.
 */
async function clip(id) {
  const key = String(id || '');
  if (!key) return null;
  if (clipCache.has(key)) return clipCache.get(key);
  if (!auth.isSignedIn() || !isAdmin()) return null;

  try {
    const res = await fetch(`${base()}/api/recording/${encodeURIComponent(key)}`, { headers: auth.authHeaders() });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const url = `data:${res.headers.get('content-type') || 'video/webm'};base64,${buffer.toString('base64')}`;

    // Far fewer than images: video is bulky and only one plays at a time.
    if (clipCache.size >= CLIP_CACHE_MAX) clipCache.delete(clipCache.keys().next().value);
    clipCache.set(key, url);
    return url;
  } catch (err) {
    log.warn('admin: clip', key, err.message);
    return null;
  }
}

async function deleteScreenshot(id) {
  const result = await request(`/api/agent/admin/screenshots?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  // Drop the cached image too, so a re-render cannot show what was just deleted.
  imageCache.delete(String(id));
  return result;
}

function addEmployee(payload) {
  return request('/api/agent/admin/employees', { method: 'POST', body: payload });
}

function updateEmployee(payload) {
  return request('/api/agent/admin/employees', { method: 'PATCH', body: payload });
}

/* ------------------------------- pictures ------------------------------- */

/** A stored screenshot as a data URL the renderer can drop straight into <img>. */
async function image(id) {
  const key = String(id || '');
  if (!key) return null;
  if (imageCache.has(key)) return imageCache.get(key);

  if (!auth.isSignedIn() || !isAdmin()) return null;

  try {
    const res = await fetch(`${base()}/api/image/${encodeURIComponent(key)}`, { headers: auth.authHeaders() });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const url = `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${buffer.toString('base64')}`;

    // Oldest out first; these are a megabyte each and the wall is long.
    if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
    imageCache.set(key, url);
    return url;
  } catch (err) {
    log.warn('admin: image', key, err.message);
    return null;
  }
}

function clearCache() {
  imageCache.clear();
  clipCache.clear();
}

// Signing out must not leave another account's screens in memory.
function init() {
  auth.on('changed', (status) => {
    if (!status.signedIn) clearCache();
    events.emit('role', { isAdmin: isAdmin(), signedIn: status.signedIn });
  });
}

module.exports = {
  init,
  isAdmin,
  overview,
  employees,
  employee,
  tasks,
  screenshots,
  deleteScreenshot,
  policy,
  updatePolicy,
  recordings,
  deleteRecording,
  clip,
  assignTask,
  updateTask,
  deleteTask,
  addEmployee,
  updateEmployee,
  image,
  clearCache,
  on: (event, fn) => events.on(event, fn),
};
