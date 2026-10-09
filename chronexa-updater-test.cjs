const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const dataRoot = path.join(__dirname, 'updater-test-data');
const installerBytes = Buffer.from('MZ-fake-installer-only-for-regression-tests');
const digest = crypto.createHash('sha256').update(installerBytes).digest('hex');
const url = 'https://github.com/the-shr/chronexa/releases/download/v1.1.8/Chronexa.Setup.1.1.8.exe';
let manifest = { latestVersion: '1.1.8', downloadUrl: url, downloadSha256: digest };
let mode = 'ok'; let launches = 0; let quits = 0; let saved = false; let downloads = 0;
const moduleObject = { exports: {} };
const mocks = {
  electron: { app: { getVersion: () => '1.1.7', getPath: () => dataRoot, isPackaged: true, quit: () => quits++ }, shell: { openExternal: () => { throw new Error('Unexpected browser launch'); } } },
  './settings': { get: () => ({ sync: { serverUrl: 'https://chronexa-psi.vercel.app' } }) },
  './log': { warn() {} },
  'node:child_process': { spawn: (_file, args, options) => {
    assert.equal(saved, true, 'Work must be saved before installer launch');
    assert.ok(args.includes('/S') && args.includes('--updated') && args.includes('--force-run'));
    assert.equal(options.windowsHide, true);
    launches++;
    const child = new EventEmitter(); child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  } },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'desktop/electron/lib/updater.js'), 'utf8'), {
  module: moduleObject, exports: moduleObject.exports, require: (id) => id in mocks ? mocks[id] : require(id),
  URL, Buffer, process: { platform: 'win32', execPath: 'C:\\Program Files\\Chronexa\\Chronexa.exe' }, AbortSignal, console,
  fetch: async (address) => {
    if (String(address).includes('/api/agent/version')) return { ok: true, json: async () => manifest };
    downloads++;
    if (mode === 'network') throw new Error('Connection interrupted');
    return { ok: true, status: 200, url: address, headers: new Headers({ 'content-type': mode === 'html' ? 'text/html' : 'application/octet-stream', 'content-length': String(installerBytes.length) }), body: new ReadableStream({ start(controller) { controller.enqueue(installerBytes); controller.close(); } }) };
  },
});
const updater = moduleObject.exports;
async function main() {
  assert.equal(updater.trustedDownload(url), true);
  assert.equal(updater.trustedDownload('https://github.com/another/repo/releases/download/v1/a.exe'), false);
  assert.equal(updater.trustedDownload('https://github.com/the-shr/chronexa/releases/latest'), false);
  assert.equal(updater.trustedDownload('http://github.com/the-shr/chronexa/releases/download/v1/a.exe'), false);
  for (const scenario of ['checksum', 'html', 'network']) {
    mode = scenario;
    const info = { latestVersion: '1.1.8', downloadUrl: url, downloadSha256: scenario === 'checksum' ? '0'.repeat(64) : digest };
    await assert.rejects(updater.downloadInstaller(info));
    assert.equal(fs.existsSync(path.join(dataRoot, 'updates/Chronexa-1.1.8.exe.part')), false);
    assert.equal(launches, 0);
  }
  mode = 'ok'; const progress = [];
  updater.on('status', (status) => progress.push(status.phase));
  const beforeInstall = async () => { saved = true; };
  const first = updater.install({ beforeInstall }); const second = updater.install({ beforeInstall });
  assert.equal(first, second, 'Repeated clicks share one installer operation');
  await first;
  assert.equal(launches, 1); assert.equal(quits, 1);
  assert.ok(progress.includes('downloading') && progress.includes('verifying') && progress.includes('installing'));
  assert.equal(fs.readFileSync(path.join(dataRoot, 'updates/Chronexa-1.1.8.exe')).equals(installerBytes), true);
  manifest = { ...manifest, latestVersion: '1.1.7' };
  await assert.rejects(updater.install(), /latest version/);
  console.log('PASS: trusted release URLs, checksum and file validation, failed download cleanup, progress, duplicate clicks, save-before-install, silent installer flags, no browser redirect');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
