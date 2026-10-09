const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const versionCode = fs.readFileSync(path.join(__dirname, 'server/src/lib/update-version.js'), 'utf8').replace(/export /g, '');
const code = fs.readFileSync(path.join(__dirname, 'server/src/lib/desktop-release.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const make = (version) => ({ latestVersion: version, downloadUrl: `https://github.com/the-shr/chronexa/releases/download/v${version}/Chronexa.Setup.${version}.exe`, downloadSha256: 'a'.repeat(64), notes: 'Release notes' });
function create() {
  let now = 100000; let calls = 0; let value = make('1.1.10'); let offline = false;
  const env = { DESKTOP_LATEST_VERSION: '1.1.9', DESKTOP_DOWNLOAD_URL: 'old', DESKTOP_DOWNLOAD_SHA256: 'old', DESKTOP_UPDATE_REQUIRED: 'true' };
  const module = { exports: {} };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(versionCode + '\n' + code + '\nmodule.exports = { getDesktopRelease, desktopUpdateRequired };', {
    module, desktopPackage: { version: '1.1.10' }, process: { env }, Date: Clock, AbortSignal,
    fetch: async (url, options) => { calls++; assert.equal(url, 'https://github.com/the-shr/chronexa/releases/latest/download/update.json'); assert.equal(options.next.revalidate, 60); if (offline) throw new Error('Offline'); return { ok: true, json: async () => value }; },
  });
  return { api: module.exports, env, calls: () => calls, advance: () => { now += 61000; }, remote: (next) => { value = next; }, offline: () => { offline = true; } };
}
async function main() {
  const test = create();
  const results = await Promise.all([test.api.getDesktopRelease(), test.api.getDesktopRelease(), test.api.getDesktopRelease()]);
  assert.equal(test.calls(), 1, 'Concurrent fetches coalesce');
  assert.equal(results[0].latestVersion, '1.1.10', 'Stale Vercel version must not override GitHub');
  assert.equal(test.api.desktopUpdateRequired(), true);
  await test.api.getDesktopRelease(); assert.equal(test.calls(), 1);
  test.advance(); test.remote(make('1.1.11'));
  assert.equal((await test.api.getDesktopRelease()).latestVersion, '1.1.11', 'Future release discovered without environment edits');
  test.advance(); test.remote(make('1.1.10'));
  assert.equal((await test.api.getDesktopRelease()).latestVersion, '1.1.11', 'Stale CDN data must not roll the minimum back');
  test.advance(); test.remote({ ...make('1.1.12'), downloadSha256: null });
  assert.equal((await test.api.getDesktopRelease()).latestVersion, '1.1.11');
  test.advance(); test.offline(); assert.equal((await test.api.getDesktopRelease()).latestVersion, '1.1.11');
  const fresh = create(); fresh.offline();
  assert.equal(await fresh.api.getDesktopRelease(), null, 'Invalid legacy environment cannot fabricate an update');
  assert.equal(await fresh.api.getDesktopRelease(), null); assert.equal(fresh.calls(), 1, 'Failed upstream request is throttled');
  const invalid = create(); invalid.remote({ ...make('1.1.10'), downloadUrl: 'https://example.invalid/installer.exe' });
  assert.equal(await invalid.api.getDesktopRelease(), null, 'Foreign executable URLs are refused');
  console.log('PASS: automatic future-release discovery, stale environment ignored, cache/coalescing, validated URL/checksum, no rollback and outage retention');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
