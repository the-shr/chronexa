const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const stores = new Map();
class Store {
  constructor(file, fallback) { this.file = file; if (!stores.has(file)) stores.set(file, structuredClone(fallback)); }
  read() { return stores.get(this.file); } write(value) { stores.set(this.file, structuredClone(value)); } flush() {}
}
let currentVersion = '1.1.10';
const settings = { general: { autoUpdate: false } };
let response = { currentVersion, latestVersion: currentVersion, required: false, available: false };
let attempts = 0;
const updater = {
  check: async () => response,
  newerThan: (remote, current) => {
    const a = remote.split('.').map(Number); const b = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  },
};
const object = { exports: {} };
const mocks = { electron: { app: { getVersion: () => currentVersion, getPath: () => 'isolated-test', isPackaged: true } }, './settings': { get: () => settings }, './updater': updater, './jsonstore': { JsonStore: Store } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'desktop/electron/lib/update-policy.js'), 'utf8'), { module: object, require: (id) => mocks[id] || require(id), process: { platform: 'win32' }, setInterval: () => 1, clearInterval() {}, Date, console });
const policy = object.exports;
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function main() {
  policy.init({ onInstall: async () => { attempts++; } });
  assert.equal(policy.snapshot().blocked, true);
  assert.throws(policy.assertAllowed);
  await policy.refresh(); assert.equal(policy.snapshot().blocked, false);
  response = { ...response, latestVersion: '1.1.11', available: true, required: true };
  await policy.refresh(); assert.equal(policy.snapshot().blocked, true);
  assert.throws(policy.assertAllowed, /Update Chronexa/);
  const trackerModule = { exports: {} };
  const trackerMocks = { electron: { powerMonitor: { getSystemIdleTime: () => 0 } }, './settings': {}, './update-policy': policy, './workday': {}, './screenshots': {}, './db': {}, './log': {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'desktop/electron/lib/tracker.js'), 'utf8'), { module: trackerModule, require: (id) => trackerMocks[id] || require(id), setInterval: () => 1, clearInterval() {}, Date });
  assert.throws(() => trackerModule.exports.start(), /Update Chronexa/);
  assert.throws(() => trackerModule.exports.resume(), /Update Chronexa/);
  assert.throws(() => trackerModule.exports.beginSession(), /Update Chronexa/);
  let actionCount = 0;
  const handlers = new Map();
  const mainSource = fs.readFileSync(path.join(__dirname, 'desktop/electron/main.js'), 'utf8');
  const actualIpcWrapper = mainSource.slice(mainSource.indexOf('const handle ='), mainSource.indexOf("handle('tracker:start'"));
  vm.runInNewContext(actualIpcWrapper + "\nhandle('tasks:set-status', () => action()); handle('app:install-update', () => action());", { ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) }, updatePolicy: policy, action: () => actionCount++ });
  assert.throws(() => handlers.get('tasks:set-status')({}, {}), /Update Chronexa/);
  handlers.get('app:install-update')({}, {});
  assert.equal(actionCount, 1, 'Work IPC is blocked while installer IPC remains accessible');
  assert.equal(attempts, 0, 'Auto update Off must not start installation');
  assert.equal(policy.allowsChannel('tracker:start'), false);
  assert.equal(policy.allowsChannel('tasks:set-status'), false);
  assert.equal(policy.allowsChannel('configuration:update'), false);
  assert.equal(policy.allowsChannel('account:login'), true, 'Login remains available before an update');
  assert.equal(policy.allowsChannel('account:logout'), true);
  assert.equal(policy.allowsChannel('app:install-update'), true);
  settings.general.autoUpdate = true; policy.preferencesChanged(); await tick();
  assert.equal(attempts, 1); assert.equal(policy.snapshot().blocked, true);
  await policy.refresh(); await tick(); assert.equal(attempts, 1, 'No automatic retry loop');
  response = { error: 'Offline' };
  policy.init(); await policy.refresh(); assert.equal(policy.snapshot().blocked, true, 'Required update survives restart and offline failures');
  currentVersion = '1.1.11'; policy.init(); await policy.refresh();
  assert.equal(policy.snapshot().blocked, false, 'Installed required version unlocks even with cached policy offline');
  settings.general.autoUpdate = false;
  response = { currentVersion, latestVersion: '1.1.12', required: false, available: true };
  policy.init({ onInstall: async () => { attempts++; } }); await policy.refresh();
  assert.equal(policy.snapshot().blocked, false); assert.equal(attempts, 1);
  policy.preferencesChanged(); settings.general.autoUpdate = true; policy.preferencesChanged(); await tick();
  assert.equal(attempts, 2, 'Optional update installs automatically when On');
  policy.requireVersion('1.1.12'); assert.equal(policy.snapshot().blocked, true, 'An API-required update locks even if the manifest endpoint is offline');
  response = { error: 'Offline' }; await policy.refresh(); assert.equal(policy.snapshot().blocked, true);
  let authenticated = false;
  response = { currentVersion, latestVersion: '1.1.12', required: true, available: true };
  policy.init({ onInstall: async () => { attempts++; }, canInstallAutomatically: () => authenticated });
  await policy.refresh(); await tick(); assert.equal(attempts, 2, 'Auto install must not interrupt initial login');
  authenticated = true; policy.preferencesChanged(); await tick(); assert.equal(attempts, 3);

  // Execute the actual server middleware with a small NextResponse adapter.
  const versionCode = fs.readFileSync(path.join(__dirname, 'server/src/lib/update-version.js'), 'utf8').replace(/export /g, '');
  const middlewareCode = fs.readFileSync(path.join(__dirname, 'server/src/middleware.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const releaseCode = fs.readFileSync(path.join(__dirname, 'server/src/lib/desktop-release.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const server = { exports: {} }; const env = { DESKTOP_UPDATE_REQUIRED: 'true', DESKTOP_LATEST_VERSION: '1.1.10' };
  vm.runInNewContext(versionCode + '\n' + releaseCode + '\n' + middlewareCode + '\nmodule.exports = { middleware };', { module: server, desktopPackage: { version: '1.1.10' }, process: { env }, Date, AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ latestVersion: env.DESKTOP_LATEST_VERSION, downloadUrl: `https://github.com/the-shr/chronexa/releases/download/v${env.DESKTOP_LATEST_VERSION}/Chronexa.Setup.${env.DESKTOP_LATEST_VERSION}.exe`, downloadSha256: 'a'.repeat(64) }) }), NextResponse: { next: () => ({ status: 200 }), json: (body, options) => ({ body, ...options }) } });
  const request = (version, pathname = '/api/agent/sessions') => ({ nextUrl: { pathname }, headers: { get: () => version } });
  assert.equal((await server.exports.middleware(request(null))).status, 426, 'Outdated clients are update-blocked without expiring their login');
  assert.equal((await server.exports.middleware(request('1.1.9'))).status, 426);
  assert.equal((await server.exports.middleware(request('1.1.10'))).status, 200);
  assert.equal((await server.exports.middleware(request('1.1.11'))).status, 200);
  assert.equal((await server.exports.middleware(request(null, '/api/agent/version'))).status, 200);
  assert.equal((await server.exports.middleware(request(null, '/api/agent/login'))).status, 200);
  assert.equal((await server.exports.middleware(request('1.1.9', '/api/agent/login'))).status, 200);
  assert.equal((await server.exports.middleware(request(null, '/api/agent/admin/tasks'))).status, 410);
  env.DESKTOP_LATEST_VERSION = '1.1.9'; assert.equal((await server.exports.middleware(request(null))).status, 426, 'Stale environment cannot weaken the automatically discovered minimum');
  env.DESKTOP_LATEST_VERSION = '1.1.10';
  env.DESKTOP_UPDATE_REQUIRED = 'false'; assert.equal((await server.exports.middleware(request(null))).status, 200);
  env.DESKTOP_UPDATE_REQUIRED = 'true'; env.DESKTOP_LATEST_VERSION = ''; assert.equal((await server.exports.middleware(request('1.1.10'))).status, 200);
  const authModule = { exports: {} };
  let loginHeaders;
  const authMocks = { electron: { app: { getVersion: () => currentVersion } }, './paths': { authFile: () => 'auth-test' }, './jsonstore': { JsonStore: Store }, './settings': { get: () => ({ sync: { serverUrl: 'https://example.invalid' } }) }, './log': { info() {}, warn() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'desktop/electron/lib/auth.js'), 'utf8'), { module: authModule, require: (id) => authMocks[id] || require(id), process: { platform: 'win32' }, console, fetch: async (_url, options) => { loginHeaders = options.headers; return { ok: true, json: async () => ({ token: 'test-token', user: { id: 'test' } }) }; } });
  authModule.exports.init();
  assert.equal(authModule.exports.authHeaders()['x-chronexa-version'], currentVersion);
  await authModule.exports.login({ email: 'test@example.invalid', password: 'test' });
  assert.equal(loginHeaders['x-chronexa-version'], currentVersion);
  assert.equal(authModule.exports.authHeaders().authorization, 'Bearer test-token');
  console.log('PASS: startup gate, required lock independent of Auto update, offline/restart persistence, unlock after install, optional auto install, retry throttling, API/version guards');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
