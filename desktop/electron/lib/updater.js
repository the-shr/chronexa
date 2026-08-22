'use strict';

const { app, shell } = require('electron');

const settings = require('./settings');
const log = require('./log');

function parts(version) {
  return String(version || '')
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function newerThan(remote, current) {
  const a = parts(remote);
  const b = parts(current);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function serverUrl() {
  return String(settings.get().sync.serverUrl || '').replace(/\/+$/, '');
}

async function check() {
  const currentVersion = app.getVersion();
  const base = serverUrl();
  if (!base) return { currentVersion, available: false, configured: false };

  try {
    const url = new URL(`${base}/api/agent/version`);
    url.searchParams.set('platform', process.platform);
    url.searchParams.set('current', currentVersion);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`version ${res.status}`);
    const data = await res.json();
    const latestVersion = data.latestVersion ? String(data.latestVersion) : null;
    return {
      currentVersion,
      latestVersion,
      available: Boolean(latestVersion && newerThan(latestVersion, currentVersion)),
      required: Boolean(data.required),
      downloadUrl: data.downloadUrl || null,
      releaseNotesUrl: data.releaseNotesUrl || null,
      notes: data.notes || null,
      checkedAt: new Date().toISOString(),
      configured: Boolean(latestVersion),
    };
  } catch (err) {
    log.warn('updater: check failed', err.message);
    return { currentVersion, available: false, error: err.message, checkedAt: new Date().toISOString() };
  }
}

async function openDownload(url) {
  const target = String(url || '');
  if (!/^https?:\/\//i.test(target)) return false;
  await shell.openExternal(target);
  return true;
}

module.exports = { check, openDownload, newerThan };
