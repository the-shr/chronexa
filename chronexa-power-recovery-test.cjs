const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronexa-recovery-'));
try {
  const { JsonStore } = require('./desktop/electron/lib/jsonstore');
  const file = path.join(root, 'atomic.json');
  fs.writeFileSync(file, '{broken');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ hours: 3 }));
  assert.deepEqual(new JsonStore(file, {}).read(), { hours: 3 }, 'A complete interrupted write must be recovered');
  fs.writeFileSync(`${file}.tmp`, '{broken');
  fs.writeFileSync(`${file}.bak`, JSON.stringify({ hours: 2 }));
  assert.deepEqual(new JsonStore(file, {}).read(), { hours: 2 }, 'Backup must survive a corrupt primary write');
  fs.rmSync(`${file}.bak`);
  assert.throws(() => new JsonStore(file, {}).read(), /Could not recover local data/, 'Corrupt data must never silently become empty');

  const session = {
    id: 'power-cut-session', startedAt: '2026-11-01T09:00:00.000Z', endedAt: null,
    checkpointAt: '2026-11-01T12:00:00.000Z', activeSeconds: 10800,
    idleSeconds: 0, taskId: 'bmos:task-1', taskNote: 'Office task', synced: false,
  };
  const stores = new Map([['sessions', { rows: [session] }]]);
  class MemoryStore {
    constructor(name, fallback) { this.name = name; this.data = structuredClone(stores.get(name) || fallback); }
    read() { return this.data; }
    update(fn) { this.data = fn(this.data) || this.data; }
    flush() { stores.set(this.name, structuredClone(this.data)); }
  }
  const source = fs.readFileSync(path.join(__dirname, 'desktop/electron/lib/db.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, structuredClone, Date,
    require: id => id === './jsonstore' ? { JsonStore: MemoryStore }
      : id === './paths' ? { sessionsFile: () => 'sessions', screenshotsFile: () => 'screenshots', recordingsFile: () => 'recordings', outboxFile: () => 'outbox' }
      : id === './workday' ? { dayBounds: () => [0, Infinity] }
      : id === './check-ins-core.cjs' ? require('./desktop/electron/lib/check-ins-core.cjs') : require(id),
  });
  const db = module.exports;
  db.init();
  const recovered = db.getSession(session.id);
  assert.equal(recovered.activeSeconds, 10800);
  assert.equal(recovered.endedAt, session.checkpointAt);
  assert.equal(recovered.stopReason, 'interrupted');
  assert.equal(db.peekOutbox(10)[0].payload.taskId, session.taskId);
  assert.equal(db.peekOutbox(10)[0].payload.endedAt, session.checkpointAt);
  db.init();
  assert.equal(db.getSession(session.id).activeSeconds, 10800, 'Recovery must be idempotent');
  console.log('PASS: atomic file fallback and three-hour interrupted task recovery');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
