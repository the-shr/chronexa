const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function harness(thresholdMinutes = 5, now = '2026-10-12T10:00:00+06:00') {
  const clock = { now: Date.parse(now), idle: 0 };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const disk = new Map();
  class Store {
    constructor(file, fallback) { this.file = file; this.data = structuredClone(disk.get(file) || fallback); }
    read() { return this.data; } update(fn) { this.data = fn(this.data); } flush() { disk.set(this.file, structuredClone(this.data)); }
  }
  const dayKey = (date) => new Date(new Date(date || clock.now).getTime() + 6 * 3600000).toISOString().slice(0, 10);
  const load = (file, mocks) => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'desktop/electron/lib', file), 'utf8'), { module, require: (id) => mocks[id] || require(id), Date: ClockDate, structuredClone, Buffer, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} });
    return module.exports;
  };
  const db = load('db.js', { './paths': { sessionsFile: () => 'sessions', screenshotsFile: () => 'shots', recordingsFile: () => 'clips', outboxFile: () => 'outbox' }, './jsonstore': { JsonStore: Store }, './workday': { dayBounds: (date) => { const start = Date.parse(`${dayKey(date)}T00:00:00+06:00`); return [start, start + 86400000]; } } });
  db.init();
  const cfg = { idle: { enabled: true, thresholdMinutes, warningEnabled: true, warningCountdownSeconds: 60, onTimeout: 'pause', countIdleAsWork: false }, screenshots: { enabled: false, intervalMinutes: 10 } };
  const tracker = load('tracker.js', { electron: { powerMonitor: { getSystemIdleTime: () => clock.idle } }, './settings': { get: () => cfg }, './update-policy': { assertAllowed() {} }, './workday': { dayKey }, './screenshots': {}, './db': db, './log': { info() {}, error() {} } });
  tracker.start();
  const sync = load('sync.js', { './db': db, './update-policy': { snapshot: () => ({ blocked: false }) }, './auth': { isSignedIn: () => true }, './settings': { get: () => ({ sync: { enabled: true }, ...cfg }) }, './recorder': {}, './log': { info() {}, warn() {}, error() {} } });
  return { tracker, db, cfg, clock, sync, tick: () => { clock.now += 1000; tracker.tick(); } };
}
for (const [active, threshold] of [[600, 4], [480, 5]]) {
  const h = harness(threshold);
  h.tracker.session.activeSeconds = active;
  h.clock.idle = threshold * 60;
  h.tick();
  assert.equal(h.tracker.session.activeSeconds, active + 1, 'Popup must not deduct the reported 4/5 minutes');
  assert.equal(h.tracker.session.idleSeconds, 0);
  for (let second = 0; second < 20; second++) h.tick();
  h.tracker.acknowledgeIdle();
  assert.equal(h.tracker.session.activeSeconds, active + 21, 'Presence confirmation preserves work and countdown time');
  assert.equal(h.tracker.session.idleSeconds, 0);
  assert.equal(h.tracker.session.pendingIdleSeconds, 0);
  h.db.flush(); h.db.init();
  assert.equal(h.db.getSession(h.tracker.session.id).activeSeconds, active + 21, 'Confirmed time survives restart');
  h.clock.idle = 0;
  for (let second = 1; second <= threshold * 60; second++) { h.clock.idle = second; h.tick(); }
  h.tracker.acknowledgeIdle();
  assert.equal(h.tracker.session.activeSeconds, active + 21 + threshold * 60, 'Repeated confirmations must not progressively lose time');
}
{
  const h = harness(); h.tracker.session.activeSeconds = 600; h.clock.idle = 300; h.tick();
  h.tracker.warningDeadline = h.clock.now; h.tick();
  assert.equal(h.tracker.session.activeSeconds, 300); assert.equal(h.tracker.session.idleSeconds, 302);
  assert.equal(h.tracker.idlePhase, 'idle');
  let prompts=0; h.tracker.on('idle-returned',()=>prompts++);
  h.clock.idle=301; h.tick(); assert.equal(prompts,0,'Timeout alone never opens Resume');
  h.clock.idle = 0; h.tick(); assert.equal(prompts,1); assert.equal(h.tracker.session.activeSeconds,300,'Input cannot resume tracking');
  h.tick(); assert.equal(prompts,1,'No repeated prompt while visible');
  h.tracker.resume(); assert.equal(h.tracker.idlePhase,'active'); h.tick(); assert.equal(h.tracker.session.activeSeconds,301);
}
{
  const h = harness(); h.tracker.session.activeSeconds = 600; h.clock.idle = 300; h.tick();
  h.tracker.acknowledgeIdle(); h.tick();
  assert.equal(h.tracker.idlePhase, 'active', 'A delayed OS input report must not immediately re-open idle after confirmation');
  assert.equal(h.tracker.session.activeSeconds, 602); assert.equal(h.tracker.session.idleSeconds, 0);
}
{
  const h = harness(); h.tracker.session.activeSeconds = 600; h.clock.idle = 300; h.tick();
  h.tracker.pause(); const row = h.db.getSession(h.tracker.pausedContext ? h.db.listSessions()[0].id : '');
  assert.equal(row.activeSeconds, 300); assert.equal(row.idleSeconds, 301); assert.equal(row.pendingIdleSeconds, 0);
}
for (const confirmed of [true, false]) {
  const h = harness(5, '2026-10-12T23:59:58+06:00'); h.tracker.session.activeSeconds = 600;
  const oldId = h.tracker.session.id; h.clock.idle = 300; h.tick(); h.tick();
  assert.notEqual(h.tracker.session.id, oldId);
  if (confirmed) h.tracker.acknowledgeIdle();
  else { h.tracker.warningDeadline = h.clock.now; h.tick(); }
  assert.equal(h.db.getSession(oldId).activeSeconds, confirmed ? 601 : 300, 'Midnight keeps or deducts the correct previous-day segment');
  assert.equal(h.db.getSession(oldId).pendingIdleSeconds, 0);
  assert.equal(h.tracker.session.activeSeconds, confirmed ? 1 : 0);
}
{
  const h = harness(); h.tracker.session.activeSeconds = 600; h.clock.idle = 300; h.tick();
  h.tracker.persist(); h.db.flush(); const id = h.tracker.session.id;
  h.db.init(); const recovered = h.db.getSession(id);
  assert.equal(recovered.activeSeconds, 300); assert.equal(recovered.idleSeconds, 301); assert.equal(recovered.pendingIdleSeconds, 0);
  assert.equal(h.db.peekOutbox(10).find((row) => row.id === `session:${id}`).payload.activeSeconds, 300);
  h.db.flush(); h.db.init(); assert.equal(h.db.getSession(id).idleSeconds, 301, 'Recovery must not subtract twice');
}
{
  const h = harness(); h.cfg.idle.countIdleAsWork = true; h.tracker.session.activeSeconds = 600; h.clock.idle = 300; h.tick();
  h.tracker.warningDeadline = h.clock.now; h.tick();
  assert.equal(h.tracker.snapshot().today.workSeconds, 602);
  assert.equal(h.tracker.session.activeSeconds, 300, 'Idle credit must not misclassify idle as active for ranking');
  assert.equal(h.tracker.session.idleSeconds, 302);
}
async function main() {
  const h = harness(5, '2026-10-12T23:59:58+06:00'); h.tracker.session.activeSeconds = 600;
  const oldId = h.tracker.session.id; h.clock.idle = 300; h.tick(); h.tick();
  const published = [];
  h.sync.pushSession = async (row) => { published.push(structuredClone(row)); };
  await h.sync.run();
  assert.equal(published.some((row) => row.id === oldId), false, 'Canonical task time must not finalize provisional midnight work');
  h.tracker.acknowledgeIdle(); await h.sync.run();
  assert.equal(published.find((row) => row.id === oldId).activeSeconds, 601);
  console.log('PASS: reported 10→6/8→3 cases, repeated confirmations, timeout, pause, midnight, crash recovery, persistence, idle-credit policy and canonical sync');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
