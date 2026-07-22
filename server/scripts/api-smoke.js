/**
 * Exercises the agent-facing API the way the desktop app does:
 * sign in -> push a session -> upload a screenshot.
 *
 *   node scripts/api-smoke.js [baseUrl] [pathToJpeg]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const jpegPath = process.argv[3];

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

const badLogin = await fetch(`${base}/api/agent/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'employee@example.com', password: 'wrong-password' }),
});
check('rejects a wrong password', badLogin.status === 401, `HTTP ${badLogin.status}`);

const login = await fetch(`${base}/api/agent/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: process.env.SEED_EMPLOYEE_EMAIL || 'employee@example.com',
    password: process.env.SEED_EMPLOYEE_PASSWORD || 'employee1234',
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

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
