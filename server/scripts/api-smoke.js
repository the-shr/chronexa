/**
 * Exercises the agent-facing API the way the desktop app does:
 * sign in -> push a session -> upload a screenshot.
 *
 *   node --env-file=.env scripts/api-smoke.js [baseUrl] [pathToJpeg]
 *
 * Creates and removes its own throwaway account, so it does not depend on the
 * seeded demo users still existing and leaves nothing behind.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

import { prisma } from '../src/lib/db.js';
import { createUser } from '../src/lib/users.js';
import { removeScreenshot } from '../src/lib/storage.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const jpegPath = process.argv[3];

const TEST_EMAIL = `api-smoke-${Date.now()}@example.com`;
const TEST_PASSWORD = 'apismoke1234';

/** A valid 1x1 JPEG, so the upload path is covered even with no fixture on disk. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAx' +
    'NDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAI' +
    'AQEAAD8AKp//2Q==',
  'base64',
);

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ------------------------------- sign in -------------------------------- */

const created = await createUser({
  name: 'API Smoke',
  email: TEST_EMAIL,
  role: 'employee',
  password: TEST_PASSWORD,
});
check('creates a throwaway test account', Boolean(created.user), created.error || TEST_EMAIL);
if (!created.user) process.exit(1);

const badLogin = await fetch(`${base}/api/agent/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: TEST_EMAIL, password: 'wrong-password' }),
});
check('rejects a wrong password', badLogin.status === 401, `HTTP ${badLogin.status}`);

const login = await fetch(`${base}/api/agent/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    deviceName: 'smoke-test-machine',
    platform: 'win32',
  }),
});
check('signs the agent in', login.ok, `HTTP ${login.status}`);
if (!login.ok) process.exit(1);

const { token, user } = await login.json();
check('returns a device token', typeof token === 'string' && token.length >= 32);
check('returns the user', Boolean(user?.email), user?.email);

const auth = { authorization: `Bearer ${token}` };

/* ------------------------------- sessions ------------------------------- */

const noAuth = await fetch(`${base}/api/agent/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: crypto.randomUUID(), startedAt: new Date().toISOString() }),
});
check('rejects an unauthenticated upload', noAuth.status === 401, `HTTP ${noAuth.status}`);

const sessionId = crypto.randomUUID();
const startedAt = new Date(Date.now() - 3600_000);
const sessionBody = {
  id: sessionId,
  startedAt: startedAt.toISOString(),
  endedAt: new Date().toISOString(),
  activeSeconds: 3120,
  idleSeconds: 480,
  taskNote: 'API smoke test',
  stopReason: 'idle-timeout',
  screenshotCount: 1,
};

const push = await fetch(`${base}/api/agent/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify(sessionBody),
});
check('accepts a session', push.ok, `HTTP ${push.status}`);

const again = await fetch(`${base}/api/agent/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify({ ...sessionBody, activeSeconds: 3200 }),
});
check('re-sending the same session is idempotent', again.ok, `HTTP ${again.status}`);

const absurd = await fetch(`${base}/api/agent/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify({ ...sessionBody, id: crypto.randomUUID(), activeSeconds: 99_999_999 }),
});
check('accepts but clamps an impossible duration', absurd.ok, `HTTP ${absurd.status}`);

/* ----------------------------- screenshots ------------------------------ */

{
  const bytes = jpegPath && fs.existsSync(jpegPath) ? fs.readFileSync(jpegPath) : TINY_JPEG;

  const notAnImage = new FormData();
  notAnImage.set('meta', JSON.stringify({ id: 'bogus', capturedAt: new Date().toISOString() }));
  notAnImage.set('file', new Blob([Buffer.from('not a jpeg')], { type: 'image/jpeg' }), 'x.jpg');
  const rejected = await fetch(`${base}/api/agent/screenshots`, { method: 'POST', headers: auth, body: notAnImage });
  check('rejects a non-JPEG payload', rejected.status === 415, `HTTP ${rejected.status}`);

  const form = new FormData();
  form.set(
    'meta',
    JSON.stringify({
      id: `smoke_${Date.now()}`,
      sessionId,
      capturedAt: new Date().toISOString(),
      monitorIndex: 0,
      monitorLabel: 'Entire screen',
      width: 800,
      height: 450,
      activityPercent: 86,
      blurred: false,
    }),
  );
  form.set('file', new Blob([bytes], { type: 'image/jpeg' }), 'shot.jpg');

  const upload = await fetch(`${base}/api/agent/screenshots`, { method: 'POST', headers: auth, body: form });
  check('accepts a screenshot upload', upload.ok, `HTTP ${upload.status}`);
  if (upload.ok) {
    const data = await upload.json();
    check('returns a viewable url', typeof data.url === 'string', data.url);

    const unauth = await fetch(`${base}${data.url}`);
    check('image is not public', unauth.status === 401, `HTTP ${unauth.status}`);
  }
}

/* --------------------------------- tasks -------------------------------- */

{
  const mine = await prisma.task.create({
    data: { userId: created.user.id, title: 'Smoke task', priority: 'high', description: 'assigned by the test' },
  });

  const listed = await fetch(`${base}/api/agent/tasks`, { headers: auth });
  check('lists assigned tasks', listed.ok, `HTTP ${listed.status}`);
  const { tasks } = await listed.json();
  check('includes the assigned task', tasks.some((t) => t.id === mine.id), `${tasks.length} task(s)`);
  check('does not leak internal fields', tasks.every((t) => !('createdById' in t) && !('userId' in t)));

  const patch = (id, body, headers = auth) =>
    fetch(`${base}/api/agent/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const badStatus = await patch(mine.id, { status: 'cancelled' });
  check('rejects an unknown status', badStatus.status === 400, `HTTP ${badStatus.status}`);

  const completed = await patch(mine.id, { status: 'done' });
  check('marks a task done', completed.ok, `HTTP ${completed.status}`);
  const after = await prisma.task.findUnique({ where: { id: mine.id } });
  check('records when it was completed', Boolean(after.completedAt), after.completedAt?.toISOString());

  const reopened = await patch(mine.id, { status: 'open' });
  check('reopens a task', reopened.ok && !(await prisma.task.findUnique({ where: { id: mine.id } })).completedAt);

  // A task belonging to someone else must be invisible, not merely read-only.
  const other = await createUser({
    name: 'Other Employee',
    email: `api-smoke-other-${Date.now()}@example.com`,
    role: 'employee',
    password: 'otherpass123',
  });
  const theirs = await prisma.task.create({ data: { userId: other.user.id, title: 'Not yours' } });

  const stealRead = await fetch(`${base}/api/agent/tasks`, { headers: auth });
  const { tasks: visible } = await stealRead.json();
  check("cannot see another employee's task", !visible.some((t) => t.id === theirs.id));

  const stealWrite = await patch(theirs.id, { status: 'done' });
  check("cannot complete another employee's task", stealWrite.status === 404, `HTTP ${stealWrite.status}`);

  const unauth = await patch(mine.id, { status: 'done' }, {});
  check('rejects an unauthenticated task update', unauth.status === 401, `HTTP ${unauth.status}`);

  await prisma.user.deleteMany({ where: { id: other.user.id } });
}

/* -------------------------------- cleanup ------------------------------- */

// Remove the uploaded objects before the rows cascade away with the user,
// otherwise they linger in the bucket with nothing pointing at them.
const uploaded = await prisma.screenshot.findMany({
  where: { user: { email: TEST_EMAIL } },
  select: { storagePath: true },
});
for (const shot of uploaded) await removeScreenshot(shot.storagePath);
await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
check('cleans up after itself', (await prisma.user.count({ where: { email: TEST_EMAIL } })) === 0);
await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
