'use strict';
const { app } = require('electron');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { JsonStore } = require('./jsonstore');
const settings = require('./settings');
const updater = require('./updater');

const events = new EventEmitter();
const INTERVAL = 5 * 60 * 1000;
let store;
let manifest = null;
let checked = false;
let checking = true;
let error = null;
let refreshing = null;
let timer = null;
let installer = null;
let canAutoInstall = () => true;
let lastAttempt = { version: null, at: 0 };

function snapshot() {
  const update = manifest && { ...manifest, currentVersion: app.getVersion(), available: Boolean(manifest.latestVersion && updater.newerThan(manifest.latestVersion, app.getVersion())) };
  return { checking, checked, error, manifest: update, blocked: !checked || Boolean(update?.required && update.available) };
}
function emit() { events.emit('changed', snapshot()); }
function assertAllowed() {
  const policy = snapshot();
  if (policy.blocked) throw new Error(policy.manifest?.required && policy.manifest.available ? 'Update Chronexa before continuing.' : 'Check for updates before continuing.');
}
function requireVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || '')) || !updater.newerThan(version, app.getVersion())) return;
  const same = manifest?.latestVersion === version;
  manifest = { ...(same ? manifest : {}), latestVersion: version, required: true };
  checked = true;
  store.write({ manifest }); store.flush();
  emit();
}
function init({ onInstall, canInstallAutomatically } = {}) {
  store = new JsonStore(path.join(app.getPath('userData'), 'release-policy.json'), { manifest: null }, { debounceMs: 0 });
  manifest = store.read().manifest;
  error = null;
  checked = false;
  installer = onInstall || null;
  canAutoInstall = canInstallAutomatically || (() => true);
  checking = true;
  lastAttempt = { version: null, at: 0 };
}
async function maybeInstall() {
  const update = snapshot().manifest;
  if (!checked || !update?.available || !settings.get().general.autoUpdate || !app.isPackaged || process.platform !== 'win32' || !installer || !canAutoInstall()) return;
  if (lastAttempt.version === update.latestVersion && Date.now() - lastAttempt.at < INTERVAL) return;
  lastAttempt = { version: update.latestVersion, at: Date.now() };
  try { await installer(); } catch { /* updater status exposes the error; no immediate retry loop */ }
}
function preferencesChanged() {
  if (!settings.get().general.autoUpdate) lastAttempt = { version: null, at: 0 };
  else maybeInstall().catch(() => {});
}
function refresh() {
  if (refreshing) return refreshing;
  refreshing = Promise.resolve().then(async () => {
    checking = true; emit();
    const next = await updater.check();
    if (next.error) {
      error = next.error;
      // A remembered required update stays locked across network failures/restarts.
      checked = Boolean(manifest);
    } else {
      manifest = next; error = null; checked = true;
      store.write({ manifest }); store.flush();
    }
    checking = false; emit();
    maybeInstall().catch(() => {});
    return snapshot();
  }).finally(() => { refreshing = null; });
  return refreshing;
}
function start() { stop(); timer = setInterval(() => refresh().catch(() => {}), INTERVAL); return refresh(); }
function stop() { if (timer) clearInterval(timer); timer = null; }
function allowsChannel(channel) {
  return channel.startsWith('app:') || channel.startsWith('window:') || ['settings:get', 'settings:set', 'tracker:snapshot', 'account:get', 'account:login', 'account:logout', 'tracker:stop', 'sync:now', 'sync:status'].includes(channel);
}
module.exports = { init, start, stop, refresh, snapshot, assertAllowed, allowsChannel, preferencesChanged, requireVersion, on: (event, fn) => events.on(event, fn) };
