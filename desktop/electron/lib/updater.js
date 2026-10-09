'use strict';

const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const settings = require('./settings');
const log = require('./log');
const events = new EventEmitter();
let state = { phase: 'idle', percent: 0, error: null };
let installing = null;

function status() { return { ...state }; }
function report(patch) { state = { ...state, ...patch }; events.emit('status', status()); }

function trustedDownload(value, base = serverUrl()) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return (url.hostname === 'github.com' && /^\/the-shr\/chronexa\/releases\/(download\/[^/]+|latest\/download)\/[^/]+\.exe$/i.test(decodeURIComponent(url.pathname))) ||
      (url.origin === new URL(base).origin && /\.exe$/i.test(url.pathname));
  } catch { return false; }
}

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
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`version ${res.status}`);
    const data = await res.json();
    const latestVersion = data.latestVersion ? String(data.latestVersion) : null;
    if ((latestVersion && !/^\d+\.\d+\.\d+$/.test(latestVersion)) || (data.required && !latestVersion)) throw new Error('The server update version is not configured correctly.');
    return {
      currentVersion,
      latestVersion,
      available: Boolean(latestVersion && newerThan(latestVersion, currentVersion)),
      required: Boolean(data.required),
      downloadUrl: data.downloadUrl || null,
      downloadSha256: /^[a-f0-9]{64}$/i.test(data.downloadSha256 || '') ? data.downloadSha256.toLowerCase() : null,
      canInstall: Boolean(process.platform === 'win32' && trustedDownload(data.downloadUrl, base) && /^[a-f0-9]{64}$/i.test(data.downloadSha256 || '')),
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

async function downloadInstaller(update) {
  if (!trustedDownload(update.downloadUrl)) throw new Error('The server has not provided a trusted Windows installer link.');
  if (!/^[a-f0-9]{64}$/i.test(update.downloadSha256 || '')) throw new Error('The update checksum has not been published yet.');
  if (!/^\d+\.\d+\.\d+$/.test(update.latestVersion)) throw new Error('Invalid update version.');
  const directory = path.join(app.getPath('userData'), 'updates');
  await fs.promises.mkdir(directory, { recursive: true });
  const target = path.join(directory, `Chronexa-${update.latestVersion}.exe`);
  const partial = target + '.part';
  let handle;
  try {
    report({ phase: 'downloading', percent: 0, error: null, version: update.latestVersion });
    const response = await fetch(update.downloadUrl, { signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}).`);
    const resolved = new URL(response.url || update.downloadUrl);
    if (resolved.protocol !== 'https:' || ![new URL(update.downloadUrl).hostname, 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(resolved.hostname)) throw new Error('Unexpected download destination.');
    if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('The download link points to a page, not an installer.');
    const total = Number(response.headers.get('content-length')) || 0;
    const maximum = 500 * 1024 * 1024;
    if (total > maximum) throw new Error('Installer is too large.');
    handle = await fs.promises.open(partial, 'w');
    const hash = crypto.createHash('sha256');
    let received = 0;
    let lastProgress = 0;
    for await (const chunk of response.body) {
      received += chunk.byteLength;
      if (received > maximum) throw new Error('Installer is too large.');
      hash.update(chunk);
      const buffer = Buffer.from(chunk);
      for (let offset = 0; offset < buffer.length;) {
        const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset);
        offset += bytesWritten;
      }
      if (Date.now() - lastProgress >= 200) {
        report({ percent: total ? Math.min(99, Math.floor(received / total * 100)) : null, receivedBytes: received });
        lastProgress = Date.now();
      }
    }
    await handle.close(); handle = null;
    if (received < 2 || (total && received !== total)) throw new Error('The installer download is incomplete.');
    report({ phase: 'verifying', percent: 100 });
    if (hash.digest('hex') !== update.downloadSha256) throw new Error('Installer verification failed. Please retry the download.');
    const executable = await fs.promises.open(partial, 'r');
    try { const signature = Buffer.alloc(2); await executable.read(signature, 0, 2, 0); if (signature.toString() !== 'MZ') throw new Error('The downloaded file is not a Windows installer.'); }
    finally { await executable.close(); }
    await fs.promises.rename(partial, target);
    return target;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.unlink(partial).catch(() => {});
    throw error;
  }
}

function install({ beforeInstall = async () => {} } = {}) {
  if (installing) return installing;
  installing = Promise.resolve().then(async () => {
    try {
      if (!app.isPackaged || process.platform !== 'win32') throw new Error('In-app installation is available in the installed Windows app.');
      report({ phase: 'checking', error: null, percent: 0 });
      // Always fetch the manifest ourselves; the renderer cannot choose an executable.
      const update = await check();
      if (update.error) throw new Error(update.error);
      if (!update.available) throw new Error('You already have the latest version.');
      const installer = await downloadInstaller(update);
      report({ phase: 'installing', percent: 100 });
      await beforeInstall();
      const args = ['--updated', '/S', '--force-run', `/D=${path.dirname(process.execPath)}`];
      const child = spawn(installer, args, { detached: true, stdio: 'ignore', windowsHide: true });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
      app.quit();
      return { ok: true };
    } catch (error) {
      report({ phase: 'error', error: error.message });
      log.warn('updater: install failed', error.message);
      throw error;
    } finally { installing = null; }
  });
  return installing;
}

async function openDownload(url) {
  let target;
  try { target = new URL(String(url || '')); } catch { return false; }
  if (target.protocol !== 'https:' || target.hostname !== 'github.com') return false;
  await shell.openExternal(target.toString());
  return true;
}

module.exports = { check, openDownload, newerThan, trustedDownload, downloadInstaller, install, status, on: (event, fn) => events.on(event, fn) };
