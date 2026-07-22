'use strict';

const os = require('node:os');
const paths = require('./paths');
const { JsonStore } = require('./jsonstore');
const settings = require('./settings');
const log = require('./log');

let store = null;

function init() {
  store = new JsonStore(paths.authFile(), { token: null, user: null, deviceName: os.hostname() }, { debounceMs: 0 });
}

function get() {
  return store.read();
}

function isSignedIn() {
  return Boolean(get().token);
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
    const detail = await res.text().catch(() => '');
    throw new Error(`Sign in failed (${res.status}). ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  store.write({ token: data.token, user: data.user, deviceName: os.hostname() });
  store.flush();
  log.info('auth: signed in as', data.user?.email);
  return data.user;
}

function logout() {
  store.write({ token: null, user: null, deviceName: os.hostname() });
  store.flush();
}

function authHeaders() {
  const { token } = get();
  return token ? { authorization: `Bearer ${token}` } : {};
}

module.exports = { init, get, isSignedIn, login, logout, authHeaders };
