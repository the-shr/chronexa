/**
 * Covers admin task assignment: creating, editing, reassigning and deleting,
 * and that what an admin assigns is what the employee's agent receives.
 *
 *   node --env-file=.env scripts/admin-tasks-smoke.js [baseUrl]
 *
 * Creates and removes its own accounts.
 */
import { prisma } from '../src/lib/db.js';
import { createUser, setUserActive } from '../src/lib/users.js';
import { assignTask, updateTask, reassignTask, deleteTask, listTasks, taskCounts } from '../src/lib/tasks.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const PREFIX = `admin-tasks-${Date.now()}`;
const PASSWORD = 'admintasks123';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

await prisma.user.deleteMany({ where: { email: { startsWith: 'admin-tasks-' } } });

const alice = (await createUser({ name: 'Alice Worker', email: `${PREFIX}-a@example.com`, role: 'employee', password: PASSWORD })).user;
const bob = (await createUser({ name: 'Bob Worker', email: `${PREFIX}-b@example.com`, role: 'employee', password: PASSWORD })).user;
check('created two employees', Boolean(alice && bob));

/* -------------------------------- assign -------------------------------- */

const noTitle = await assignTask({ userId: alice.id, title: ' ' });
check('rejects an empty title', Boolean(noTitle.error), noTitle.error);

const noAssignee = await assignTask({ userId: 'nobody', title: 'Ghost work' });
check('rejects an unknown assignee', Boolean(noAssignee.error), noAssignee.error);

const first = await assignTask({
  userId: alice.id,
  title: 'Write the release notes',
  description: 'Cover everything since the last tag.',
  priority: 'high',
  dueAt: '2026-08-01',
  estimateMinutes: '90',
});
check('assigns a task', Boolean(first.task), first.error || first.task?.title);
check('records it as assigned, not self-added', first.task?.source === 'assigned', first.task?.source);
check('keeps the priority', first.task?.priority === 'high');
check('keeps the estimate', first.task?.estimateMinutes === 90, String(first.task?.estimateMinutes));
check('keeps the due date', first.task?.dueAt instanceof Date, first.task?.dueAt?.toISOString().slice(0, 10));

const junkEstimate = await assignTask({ userId: alice.id, title: 'Junk estimate', estimateMinutes: 'abc' });
check('ignores an unparseable estimate', junkEstimate.task?.estimateMinutes === null);

const junkDue = await assignTask({ userId: alice.id, title: 'Junk due date', dueAt: 'not a date' });
check('ignores an unparseable due date', junkDue.task?.dueAt === null);

const second = await assignTask({ userId: alice.id, title: 'Newer task' });
check('newest assigned work sorts first', second.task.position < first.task.position, `${second.task.position} < ${first.task.position}`);

/* ------------------------- deactivated employees ------------------------ */

await setUserActive(bob.id, false);
const toDeactivated = await assignTask({ userId: bob.id, title: 'Should not land' });
check('refuses to assign to a deactivated employee', Boolean(toDeactivated.error), toDeactivated.error);
await setUserActive(bob.id, true);

/* --------------------------------- edit --------------------------------- */

const edited = await updateTask(first.task.id, { title: 'Write the release notes (v2)', priority: 'low' });
check('edits a task', edited.task?.title.endsWith('(v2)') && edited.task?.priority === 'low');

const blanked = await updateTask(first.task.id, { title: '  ' });
check('will not blank the title', Boolean(blanked.error), blanked.error);

const badStatus = await updateTask(first.task.id, { status: 'archived' });
check('rejects an unknown status', Boolean(badStatus.error), badStatus.error);

const done = await updateTask(first.task.id, { status: 'done' });
check('marks it done and stamps the time', done.task?.status === 'done' && Boolean(done.task?.completedAt));

const reopened = await updateTask(first.task.id, { status: 'open' });
check('reopening clears the completion time', reopened.task?.status === 'open' && reopened.task?.completedAt === null);

const gone = await updateTask('does-not-exist', { title: 'x' });
check('reports a missing task', Boolean(gone.error), gone.error);

/* ------------------------------- reassign ------------------------------- */

// A session tracked against it belongs to Alice's history, not Bob's.
await prisma.workSession.create({
  data: { id: `${PREFIX}-s1`, userId: alice.id, taskId: first.task.id, startedAt: new Date(), activeSeconds: 600 },
});

const moved = await reassignTask(first.task.id, bob.id);
check('moves a task to someone else', moved.task?.userId === bob.id);

const session = await prisma.workSession.findUnique({ where: { id: `${PREFIX}-s1` } });
check("leaves the old owner's tracked session behind", session.taskId === null && session.userId === alice.id);

const aliceTasks = await listTasks({ userId: alice.id });
check('it is off the old list', !aliceTasks.some((t) => t.id === first.task.id), `${aliceTasks.length} left`);
const bobTasks = await listTasks({ userId: bob.id });
check('and on the new one', bobTasks.some((t) => t.id === first.task.id));
check('it lands at the top of theirs', bobTasks[0].id === first.task.id);

/* --------------------------- the agent's view --------------------------- */

let reachable = true;
try {
  await fetch(`${base}/login`, { redirect: 'manual' });
} catch {
  reachable = false;
}

if (!reachable) {
  console.log(`SKIP  agent view (no server at ${base})`);
} else {
  const login = await fetch(`${base}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: bob.email, password: PASSWORD, deviceName: 'admin-tasks-smoke' }),
  });
  check('the employee can sign in', login.ok, `HTTP ${login.status}`);
  const { token } = await login.json();

  const listed = await fetch(`${base}/api/agent/tasks`, { headers: { authorization: `Bearer ${token}` } });
  const { tasks } = await listed.json();
  check('the agent receives what was assigned', tasks.some((t) => t.id === first.task.id), `${tasks.length} task(s)`);
  const received = tasks.find((t) => t.id === first.task.id);
  check('with the admin-set fields intact', received?.priority === 'low' && received?.estimateMinutes === 90);
  check('marked as assigned, so the agent hides delete', received?.source === 'assigned');
}

/* -------------------------------- counts -------------------------------- */

const counts = await taskCounts();
check('counts per employee', (counts.get(alice.id)?.open ?? 0) >= 1, JSON.stringify(counts.get(alice.id)));

/* -------------------------------- delete -------------------------------- */

const removed = await deleteTask(first.task.id);
check('deletes a task', removed.ok);
check('it is really gone', (await prisma.task.findUnique({ where: { id: first.task.id } })) === null);
const removeAgain = await deleteTask(first.task.id);
check('deleting twice reports it missing', Boolean(removeAgain.error), removeAgain.error);

await prisma.user.deleteMany({ where: { email: { startsWith: 'admin-tasks-' } } });
await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
