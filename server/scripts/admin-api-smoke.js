/**
 * Covers the admin API the desktop app talks to: that a device token belonging
 * to an admin opens it, an employee's token does not, and the numbers add up.
 *
 *   node --env-file=.env scripts/admin-api-smoke.js [baseUrl]
 *
 * Creates and removes its own accounts. Needs the server running.
 */
import { prisma } from '../src/lib/db.js';
import { createUser } from '../src/lib/users.js';
import { teamOverview, employeeDetail, startOfDay } from '../src/lib/overview.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const PREFIX = `admin-api-${Date.now()}`;
const PASSWORD = 'adminapi12345';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  await fetch(`${base}/login`, { redirect: 'manual' });
} catch {
  console.log(`\nNo server at ${base} — start it with "npm run dev" first.`);
  process.exit(1);
}

await prisma.user.deleteMany({ where: { email: { startsWith: 'admin-api-' } } });

const boss = (await createUser({ name: 'Boss Person', email: `${PREFIX}-boss@example.com`, role: 'admin', password: PASSWORD })).user;
const worker = (await createUser({ name: 'Worker Person', email: `${PREFIX}-work@example.com`, role: 'employee', password: PASSWORD })).user;
check('created an admin and an employee', Boolean(boss && worker));

/* ------------------------------ known data ------------------------------ */

// Two sessions today: one closed, one still open so the person reads as live.
const today = startOfDay();
const at = (hours) => new Date(today.getTime() + hours * 3600_000);

await prisma.workSession.create({
  data: {
    id: `${PREFIX}-s1`,
    userId: worker.id,
    startedAt: at(9),
    endedAt: at(11),
    activeSeconds: 6000,
    idleSeconds: 1200,
    stopReason: 'idle-timeout',
  },
});
await prisma.workSession.create({
  data: {
    id: `${PREFIX}-s2`,
    userId: worker.id,
    startedAt: at(13),
    activeSeconds: 1800,
    idleSeconds: 300,
    taskNote: 'Payments refactor',
  },
});

/* -------------------------------- tokens -------------------------------- */

async function signIn(email, deviceName) {
  const res = await fetch(`${base}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, deviceName }),
  });
  const body = await res.json();
  return { ok: res.ok, token: body.token, role: body.user?.role };
}

const adminLogin = await signIn(boss.email, `${PREFIX}-admin-box`);
check('an admin can sign in through the agent endpoint', adminLogin.ok, `HTTP role ${adminLogin.role}`);
check('the response says they are an admin', adminLogin.role === 'admin', adminLogin.role);

const workerLogin = await signIn(worker.email, `${PREFIX}-worker-box`);
check('an employee can still sign in', workerLogin.ok);
check('and is not labelled an admin', workerLogin.role === 'employee', workerLogin.role);

const asAdmin = (path, init) =>
  fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${adminLogin.token}`, ...(init?.headers || {}) } });
const asWorker = (path) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${workerLogin.token}` } });

/* ------------------------------ the gate -------------------------------- */

for (const path of [
  '/api/agent/admin/overview',
  '/api/agent/admin/employees',
  '/api/agent/admin/tasks',
  '/api/agent/admin/screenshots',
]) {
  const refused = await asWorker(path);
  check(`an employee is refused ${path.replace('/api/agent/admin', '')}`, refused.status === 401, `HTTP ${refused.status}`);
}

const anonymous = await fetch(`${base}/api/agent/admin/overview`);
check('no token is refused', anonymous.status === 401, `HTTP ${anonymous.status}`);

/* ------------------------------- overview ------------------------------- */

const overviewRes = await asAdmin('/api/agent/admin/overview?days=7');
check('the admin gets the overview', overviewRes.ok, `HTTP ${overviewRes.status}`);
const overview = await overviewRes.json();

const mine = overview.people.find((p) => p.id === worker.id);
check('the employee is listed', Boolean(mine));
check('today adds up', mine?.todayActive === 7800, String(mine?.todayActive));
check('idle is counted separately', mine?.todayIdle === 1500, String(mine?.todayIdle));
check('the open session reads as tracking', mine?.live === true);
check('and shows what they are on', mine?.currentTask === 'Payments refactor', mine?.currentTask);
check('an idle stop is counted', mine?.idleStops === 1, String(mine?.idleStops));
check('one bar per day', mine?.daily.length === 7, String(mine?.daily.length));
check("today's bar carries the seconds", mine?.daily.at(-1).activeSeconds === 7800);
check('the team total includes them', overview.team.todayActive >= 7800, String(overview.team.todayActive));
check('the tracking count includes them', overview.team.tracking >= 1, String(overview.team.tracking));
check('admins are not listed as employees', !overview.people.some((p) => p.id === boss.id));

const shortRes = await asAdmin('/api/agent/admin/overview?days=1');
const short = await shortRes.json();
check('the range is adjustable', short.people.find((p) => p.id === worker.id)?.daily.length === 1);

/* -------------------------------- detail -------------------------------- */

const detailRes = await asAdmin(`/api/agent/admin/employees/${worker.id}`);
check('one employee in depth', detailRes.ok, `HTTP ${detailRes.status}`);
const detail = await detailRes.json();
check('their sessions come back', detail.sessions.length === 2, String(detail.sessions.length));
check('newest session first', detail.sessions[0].id === `${PREFIX}-s2`);
check('the open one has no end', detail.sessions[0].endedAt === null);
check('the stop reason survives', detail.sessions[1].stopReason === 'idle-timeout');
check('their devices are listed', detail.devices.some((d) => d.name === `${PREFIX}-worker-box`));

const missing = await asAdmin('/api/agent/admin/employees/nobody');
check('an unknown employee is a 404', missing.status === 404, `HTTP ${missing.status}`);

/* --------------------------------- team --------------------------------- */

const peopleRes = await asAdmin('/api/agent/admin/employees');
const people = await peopleRes.json();
check('the roster includes admins too', people.users.some((u) => u.id === boss.id));

const created = await asAdmin('/api/agent/admin/employees', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Hired Today', email: `${PREFIX}-new@example.com`, role: 'employee', password: PASSWORD }),
});
check('an admin can add someone', created.status === 201, `HTTP ${created.status}`);
const hired = (await created.json()).user;

const dupe = await asAdmin('/api/agent/admin/employees', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Hired Again', email: `${PREFIX}-new@example.com`, role: 'employee', password: PASSWORD }),
});
check('the same email is refused', dupe.status === 400, `HTTP ${dupe.status}`);

const deactivate = await asAdmin('/api/agent/admin/employees', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: hired.id, active: false }),
});
check('an admin can deactivate someone', deactivate.ok, `HTTP ${deactivate.status}`);

const suicide = await asAdmin('/api/agent/admin/employees', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: boss.id, active: false }),
});
check('but not the account they are using', suicide.status === 400, `HTTP ${suicide.status}`);

const stillWorks = await asAdmin('/api/agent/admin/overview');
check('so their own token still works', stillWorks.ok, `HTTP ${stillWorks.status}`);

/* --------------------------------- tasks -------------------------------- */

const assigned = await asAdmin('/api/agent/admin/tasks', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: worker.id, title: 'Ship the release', priority: 'high', estimateMinutes: 45 }),
});
check('an admin can assign work', assigned.status === 201, `HTTP ${assigned.status}`);
const task = (await assigned.json()).task;
check('it records who assigned it', task.createdById === boss.id);

const employeeSees = await fetch(`${base}/api/agent/tasks`, { headers: { authorization: `Bearer ${workerLogin.token}` } });
const { tasks: theirs } = await employeeSees.json();
check('the employee agent receives it', theirs.some((t) => t.id === task.id));

const patched = await asAdmin('/api/agent/admin/tasks', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: task.id, status: 'done' }),
});
check('and can close it', patched.ok && (await patched.json()).task.status === 'done');

const filtered = await asAdmin(`/api/agent/admin/tasks?userId=${worker.id}&status=open`);
const { tasks: open } = await filtered.json();
check('the open filter excludes it', !open.some((t) => t.id === task.id), `${open.length} open`);

const dropped = await asAdmin(`/api/agent/admin/tasks?id=${task.id}`, { method: 'DELETE' });
check('and can delete it', dropped.ok, `HTTP ${dropped.status}`);

/* ------------------------------ screenshots ----------------------------- */

const shotsRes = await asAdmin('/api/agent/admin/screenshots?limit=5');
check('the capture list opens for an admin', shotsRes.ok, `HTTP ${shotsRes.status}`);
const { screenshots } = await shotsRes.json();
check('it is a list', Array.isArray(screenshots), `${screenshots?.length} row(s)`);

/* ---------------------------- library, direct --------------------------- */

const direct = await teamOverview({ days: 3 });
check('the library agrees with the route', direct.people.find((p) => p.id === worker.id)?.todayActive === 7800);
const detailDirect = await employeeDetail('nope');
check('the library reports a missing employee', Boolean(detailDirect.error));

/* -------------------------------- cleanup ------------------------------- */

await prisma.user.deleteMany({ where: { email: { startsWith: 'admin-api-' } } });
await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
