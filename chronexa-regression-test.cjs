const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module, exports: module.exports, require: (name) => name in mocks ? mocks[name] : require(name),
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
    Date, console, structuredClone, Buffer, ...globals,
  }, { filename: file });
  return module.exports;
}
const stores = new Map();
class Store { constructor(file, fallback) { this.data = structuredClone(fallback); stores.set(file, this); } read() { return this.data; } update(fn) { this.data = fn(this.data); } flush() {} }
const db = load('desktop/electron/lib/db.js', {
  './paths': { sessionsFile: () => 'sessions', screenshotsFile: () => 'shots', recordingsFile: () => 'clips', outboxFile: () => 'queue' },
  './jsonstore': { JsonStore: Store }, './workday': require('./desktop/electron/lib/workday'),
});
db.init();
let idleSeconds = 0;
const cfg = { idle: { enabled: true, thresholdMinutes: 5, warningEnabled: true, warningCountdownSeconds: 60, onTimeout: 'pause', countIdleAsWork: false }, screenshots: { enabled: false, intervalMinutes: 10 }, sync: { enabled: true } };
const log = { info() {}, warn() {}, error() {} };
const tracker = load('desktop/electron/lib/tracker.js', { electron: { powerMonitor: { getSystemIdleTime: () => idleSeconds } }, './settings': { get: () => cfg }, './update-policy': { assertAllowed() {} }, './db': db, './screenshots': {}, './log': log, './workday': require('./desktop/electron/lib/workday') });
tracker.start();
const sessionId = tracker.session.id;
tracker.session.activeSeconds = 300;
idleSeconds = 300; tracker.tick();
assert.equal(tracker.idlePhase, 'warning');
idleSeconds = 0; tracker.tick();
assert.equal(tracker.idlePhase, 'warning', 'Mouse movement must not dismiss the warning');
tracker.acknowledgeIdle();
assert.equal(tracker.idlePhase, 'active');
idleSeconds = 300; tracker.tick(); tracker.warningDeadline = Date.now() - 1; tracker.tick();
assert.equal(tracker.idlePhase, 'idle');
idleSeconds = 0; tracker.tick();
assert.equal(tracker.idlePhase, 'active');
assert.equal(tracker.session.id, sessionId, 'Idle resumes the same session');
tracker.persist(); tracker.persist();
assert.equal(db.peekOutbox(10).length, 1, 'Live sync snapshots coalesce');
const sent = structuredClone(db.peekOutbox(10)[0]);
tracker.session.activeSeconds += 1; tracker.persist(); db.dropOutbox([sent]);
assert.equal(db.peekOutbox(10).length, 1, 'New snapshot survives acknowledgement of older upload');
tracker.pause(); idleSeconds = 0; tracker.tick();
assert.equal(tracker.state, 'paused', 'Manual pause must never auto-resume');
tracker.resume(); cfg.idle.onTimeout = 'stop'; idleSeconds = 300; tracker.tick(); tracker.warningDeadline = Date.now() - 1; tracker.tick();
assert.equal(tracker.state, 'stopped', 'Explicit stop policy remains honoured');
cfg.idle.onTimeout = 'pause'; tracker.start();
const beforeRollover = tracker.session.id;
tracker.session.startedAt = new Date(Date.now() - 86400000).toISOString(); idleSeconds = 0; tracker.tick();
assert.notEqual(tracker.session.id, beforeRollover);
assert.equal(db.getSession(beforeRollover).stopReason, 'day-boundary');
const { dayBounds, dayKey } = require('./desktop/electron/lib/workday');
assert.equal(dayKey('2026-10-09T18:01:00Z'), '2026-10-10');
assert.equal(new Date(dayBounds('2026-10-09T18:01:00Z')[0]).toISOString(), '2026-10-09T18:00:00.000Z');
const sync = load('desktop/electron/lib/sync.js', { './db': db, './update-policy': { snapshot: () => ({ blocked: false }) }, './settings': { get: () => cfg }, './auth': { isSignedIn: () => true, authHeaders: () => ({}) }, './recorder': {}, './log': log });
sync.pushSession = async () => { throw new Error('offline'); };
async function main() {
  for (let attempt = 0; attempt < 10; attempt++) await sync.run();
  assert.ok(db.peekOutbox(999).some((item) => item.type === 'session' && item.attempts >= 10), 'Sessions must not disappear after eight failures');
  const policySource = fs.readFileSync(path.join(__dirname, 'server/src/lib/policy.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const policyModule = { exports: {} };
  vm.runInNewContext(policySource + '\nmodule.exports = { effectivePolicy };', { module: policyModule, prisma: { policy: { upsert: async () => ({ updatedAt: new Date(), screenshotsEnabled: true, recordingEnabled: true }) }, user: { findUnique: async () => ({ overrides: { screenshotsEnabled: false, recordingEnabled: false } }) } }, console });
  const effective = await policyModule.exports.effectivePolicy('test');
  assert.equal(effective.screenshots.enabled, false);
  assert.equal(effective.recording.enabled, false);
  const route = fs.readFileSync(path.join(__dirname, 'server/src/app/api/agent/sessions/route.js'), 'utf8');
  const dates = vm.runInNewContext(route.slice(route.indexOf('function toDate'), route.indexOf('/**')) + '\ntoDate', { Date });
  assert.equal(dates(null), null, 'Live sessions must remain open, not end at Unix epoch');
  const overviewModule = { exports: {} };
  const overview = fs.readFileSync(path.join(__dirname, 'server/src/lib/overview.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  let query;
  const testSessions = Array.from({ length: 301 }, (_, i) => ({ id: String(i), startedAt: new Date('2026-10-09T19:00:00Z'), endedAt: new Date('2026-10-09T20:00:00Z'), activeSeconds: 60, idleSeconds: 30 }));
  vm.runInNewContext(overview + '\nmodule.exports = { employeeDetail, startOfDay };', { module: overviewModule, Date, effectivePolicy: async () => ({ idle: { countIdleAsWork: true } }), prisma: { user: { findUnique: async () => ({ id: 'test', createdAt: new Date() }) }, workSession: { findMany: async (options) => { query = options; return testSessions; } } } });
  const detail = await overviewModule.exports.employeeDetail('test');
  assert.equal(query.take, undefined, 'Daily totals must not silently truncate at 200 sessions');
  assert.equal(detail.daily[0].date, '2026-10-10');
  assert.equal(detail.daily[0].workSeconds, 301 * 90);
  assert.equal(detail.totals.workSeconds, 301 * 90);
  console.log('PASS: warning acknowledgement, idle auto-resume, manual pause/stop, midnight rollover, queue coalescing/race, offline retry retention, Dhaka dates, explicit false overrides');
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
