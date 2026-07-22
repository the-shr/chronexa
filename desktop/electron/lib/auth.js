'use strict';

const os = require('node:os');
const { EventEmitter } = require('node:events');

const paths = require('./paths');
const { JsonStore } = require('./jsonstore');
const settings = require('./settings');
const log = require('./log');

let store = null;
const events = new EventEmitter();

function init() {
  store = new JsonStore(
    paths.authFile(),
    { token: null, user: null, deviceName: os.hostname(), expired: false },
    { debounceMs: 0 },
  );
}

function get() {
  return store.read();
}

function isSignedIn() {
  return Boolean(get().token) && !get().expired;
}

/**
 * The token is present but the server no longer accepts it -- someone signed in
 * from this machine again, an admin revoked the device, or the password was
 * changed elsewhere.
 *
 * The token and the cached identity are kept so the dashboard can still say who
 * you were and show your recorded hours; only the network side stands down.
 * Anything already tracked stays queued and uploads once you sign back in.
 */
function markExpired(reason = 'the server rejected this device') {
  if (get().expired) return;
  store.write({ ...get(), expired: true });
  store.flush();
  log.warn('auth: session expired —', reason);
  events.emit('changed', status());
}

function status() {
  const { user, deviceName, token, expired } = get();
  return {
    user,
    deviceName,
    signedIn: Boolean(token) && !expired,
    sessionExpired: Boolean(token) && Boolean(expired),
  };
}

function base() {
  return settings.get().sync.serverUrl;
}

async function login({ email, password }) {
  const res = await fetch(`${base()}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, deviceName: os.hostname(), platform: process.platform }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Sign in failed (${res.status}).`);
  }
  const data = await res.json();
  store.write({ token: data.token, user: data.user, deviceName: os.hostname(), expired: false });
  store.flush();
  log.info('auth: signed in as', data.user?.email);
  events.emit('changed', status());
  return data.user;
}

/** Keeps the cached identity in step after a profile edit. */
function updateUser(user) {
  store.write({ ...get(), user: { ...(get().user || {}), ...user } });
  store.flush();
  events.emit('changed', status());
}

function logout() {
  store.write({ token: null, user: null, deviceName: os.hostname(), expired: false });
  store.flush();
  events.emit('changed', status());
}

function authHeaders() {
  const { token } = get();
  return token ? { authorization: `Bearer ${token}` } : {};
}

module.exports = {
  init,
  get,
  status,
  isSignedIn,
  login,
  logout,
  authHeaders,
  updateUser,
  markExpired,
  on: (event, fn) => events.on(event, fn),
};
