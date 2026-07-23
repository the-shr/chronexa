/**
 * Covers admin-set policy: the org policy and per-employee schedules, what an
 * agent is told to do, and the gate that keeps employees out of the admin side.
 *
 *   node --env-file=.env scripts/policy-smoke.js [baseUrl]
 *
 * Creates and removes its own accounts, and restores the org policy it changes.
 */
import { prisma } from '../src/lib/db.js';
import { createUser } from '../src/lib/users.js';
import { getPolicy, updatePolicy, setUserOverride, effectivePolicy, estimateDailyBytes } from '../src/lib/policy.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const PREFIX = `policy-${Date.now()}`;
const PASSWORD = 'policytest123';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// So the run does not leave the real org policy changed underneath the app.
const original = await getPolicy();

await prisma.user.deleteMany({ where: { email: { startsWith: 'policy-' } } });

const boss = (await createUser({ name: 'Policy Boss', email: `${PREFIX}-boss@example.com`, role: 'admin', password: PASSWORD })).user;
const worker = (await createUser({ name: 'Policy Worker', email: `${PREFIX}-work@example.com`, role: 'employee', password: PASSWORD })).user;
check('created an admin and an employee', Boolean(boss && worker));

/* ---------------------------- the library ------------------------------- */

const set = await updatePolicy({
  screenshotIntervalMinutes: 7,
  recordingEnabled: true,
  recordingMode: 'session',
  recordingSegmentMinutes: 4,
  idleOnTimeout: 'stop',
  officeStart: '10:00',
  officeEnd: '18:30',
});
check('the org policy updates', !set.error, set.error || '');
check('numbers are kept', set.policy.screenshotIntervalMinutes === 7);
check('office hours are kept', set.policy.officeStart === '10:00' && set.policy.officeEnd === '18:30');

const badTime = await updatePolicy({ officeStart: '25:00' });
check('a bad time is rejected', Boolean(badTime.error), badTime.error);
check('and a rejected patch changes nothing', (await getPolicy()).officeStart === '10:00');

const badMode = await updatePolicy({ recordingMode: 'always' });
check('an unknown recording mode is rejected', Boolean(badMode.error), badMode.error);

const junk = await updatePolicy({ notAThing: 5 });
check('an unknown field alone changes nothing', Boolean(junk.error), junk.error);

/* --------------------------- per-employee ------------------------------- */

const sched = await setUserOverride(worker.id, { dailyTargetHours: 6, officeStart: '11:00' });
check('an employee gets their own hours', sched.user?.overrides?.dailyTargetHours === 6 && sched.user?.overrides?.officeStart === '11:00');

const eff = await effectivePolicy(worker.id);
check('their effective policy uses the override', eff.work.dailyTargetHours === 6 && eff.work.officeStart === '11:00');
check('and the org policy for the rest', eff.work.officeEnd === '18:30' && eff.screenshots.intervalMinutes === 7);
check('the capture half is shaped like agent settings', eff.recording.mode === 'session' && eff.recording.segmentMinutes === 4);

// The case the whole feature exists for: tracked, but not captured.
const noCapture = await setUserOverride(worker.id, { screenshotsEnabled: false, recordingEnabled: false });
check('a person can be exempt from capture', !noCapture.error);
const effNoCap = await effectivePolicy(worker.id);
check('their screenshots are off', effNoCap.screenshots.enabled === false);
check('and their recording is off', effNoCap.recording.enabled === false);
check('while the org default stays on', (await effectivePolicy(boss.id)).screenshots.enabled === true);

const badOverride = await setUserOverride(worker.id, { idleOnTimeout: 'explode' });
check('an invalid override value is rejected', Boolean(badOverride.error), badOverride.error);

const oneCleared = await setUserOverride(worker.id, { dailyTargetHours: null });
check('clearing one key leaves the others', (await effectivePolicy(worker.id)).screenshots.enabled === false);

const allCleared = await setUserOverride(worker.id, { clear: true });
check('clearing all falls back to the org policy', allCleared.user.overrides === null);
const effAfter = await effectivePolicy(worker.id);
check('so the effective daily hours are the org default', effAfter.work.dailyTargetHours === original.dailyTargetHours, String(effAfter.work.dailyTargetHours));
// The org policy currently has recording on (set above), so clearing the
// person's override returns them to that, not to the start-of-test snapshot.
check('and capture is on again', effAfter.screenshots.enabled === true && effAfter.recording.enabled === true);

/* -------------------------- clamping, in isolation ---------------------- */

// Left until after the effective-policy checks: it mutates the shared org
// interval, so asserting against 7 earlier would depend on order.
const clamped = await updatePolicy({ screenshotIntervalMinutes: 9999 });
check('an out-of-range number is clamped, not refused', clamped.policy.screenshotIntervalMinutes === 120, String(clamped.policy.screenshotIntervalMinutes));
await updatePolicy({ screenshotIntervalMinutes: 7 });

/* ----------------------------- the estimate ----------------------------- */

const sessionBytes = estimateDailyBytes({ ...set.policy, recordingEnabled: true, recordingMode: 'session' }, { employees: 1 });
const intervalBytes = estimateDailyBytes({ ...set.policy, recordingEnabled: true, recordingMode: 'interval', recordingIntervalMinutes: 3, recordingDurationSeconds: 5 }, { employees: 1 });
check('session recording estimates far more than interval', sessionBytes > intervalBytes * 10, `${Math.round(sessionBytes / 1e6)}MB vs ${Math.round(intervalBytes / 1e6)}MB`);
check('recording off estimates nothing', estimateDailyBytes({ ...set.policy, recordingEnabled: false }) === 0);

/* ------------------------------ over HTTP ------------------------------- */

let reachable = true;
try {
  await fetch(`${base}/login`, { redirect: 'manual' });
} catch {
  reachable = false;
}

if (!reachable) {
  console.log(`SKIP  HTTP checks (no server at ${base})`);
} else {
  const signIn = async (email) => {
    const res = await fetch(`${base}/api/agent/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, deviceName: `policy-${email}` }),
    });
    return (await res.json()).token;
  };

  const adminToken = await signIn(boss.email);
  const workerToken = await signIn(worker.email);

  const adminGet = await fetch(`${base}/api/agent/admin/policy`, { headers: { authorization: `Bearer ${adminToken}` } });
  check('an admin can read the policy page', adminGet.ok, `HTTP ${adminGet.status}`);
  const page = await adminGet.json();
  check('it lists employees with their schedules', page.employees?.some((e) => e.id === worker.id));
  check('and an estimated daily size', typeof page.estimatedDailyBytes === 'number');

  const workerGet = await fetch(`${base}/api/agent/admin/policy`, { headers: { authorization: `Bearer ${workerToken}` } });
  check('an employee cannot read the policy page', workerGet.status === 401, `HTTP ${workerGet.status}`);

  const workerPatch = await fetch(`${base}/api/agent/admin/policy`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${workerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ screenshotsEnabled: false }),
  });
  check('nor change it', workerPatch.status === 401, `HTTP ${workerPatch.status}`);

  // The agent reads its own effective policy.
  const agentPolicy = await fetch(`${base}/api/agent/policy`, { headers: { authorization: `Bearer ${workerToken}` } });
  check('the agent can read its own policy', agentPolicy.ok, `HTTP ${agentPolicy.status}`);
  const mine = await agentPolicy.json();
  check('shaped like its settings tree', Boolean(mine.screenshots && mine.recording && mine.work));
  check('with the org interval', mine.screenshots.intervalMinutes === 7, String(mine.screenshots.intervalMinutes));
}

/* -------------------------------- restore ------------------------------- */

await updatePolicy({
  screenshotIntervalMinutes: original.screenshotIntervalMinutes,
  recordingEnabled: original.recordingEnabled,
  recordingMode: original.recordingMode,
  recordingSegmentMinutes: original.recordingSegmentMinutes,
  idleOnTimeout: original.idleOnTimeout,
  officeStart: original.officeStart,
  officeEnd: original.officeEnd,
});
await prisma.user.deleteMany({ where: { email: { startsWith: 'policy-' } } });
await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
