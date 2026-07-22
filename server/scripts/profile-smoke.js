/**
 * Covers the employee's own profile: name, email, password and picture.
 *
 *   node --env-file=.env scripts/profile-smoke.js [baseUrl]
 *
 * Creates and removes its own accounts.
 */
import { prisma } from '../src/lib/db.js';
import { createUser } from '../src/lib/users.js';
import { verifyPassword } from '../src/lib/password.js';
import { removeAvatar } from '../src/lib/storage.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const PREFIX = `profile-smoke-${Date.now()}`;
const PASSWORD = 'profilepass123';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A real 1x1 PNG, so the type sniffing is exercised rather than bypassed. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A distinct device name per call: signing in twice from the same machine
 * rotates that machine's token, which would otherwise invalidate the token this
 * test is holding.
 */
async function signIn(email, password, deviceName = 'profile-smoke-main') {
  const res = await fetch(`${base}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, deviceName, platform: 'test' }),
  });
  return res.ok ? (await res.json()).token : null;
}

await prisma.user.deleteMany({ where: { email: { startsWith: 'profile-smoke-' } } });

const me = await createUser({ name: 'Profile Smoke', email: `${PREFIX}@example.com`, role: 'employee', password: PASSWORD });
check('created the test account', Boolean(me.user), me.error || '');
if (!me.user) process.exit(1);

const token = await signIn(me.user.email, PASSWORD);
check('signed in', Boolean(token));
const auth = { authorization: `Bearer ${token}` };
const json = { 'content-type': 'application/json', ...auth };

/* --------------------------------- read --------------------------------- */

const read = await fetch(`${base}/api/agent/me`, { headers: auth });
check('reads its own profile', read.ok, `HTTP ${read.status}`);
const { user: profile } = await read.json();
check('returns name and email', profile.name === 'Profile Smoke' && profile.email === me.user.email);
check('never returns the password hash', !('passwordHash' in profile), Object.keys(profile).join(','));

const anon = await fetch(`${base}/api/agent/me`);
check('refuses an unauthenticated read', anon.status === 401, `HTTP ${anon.status}`);

/* -------------------------------- rename -------------------------------- */

const renamed = await fetch(`${base}/api/agent/me`, {
  method: 'PATCH',
  headers: json,
  body: JSON.stringify({ name: 'Renamed Person' }),
});
check('changes the name without a password', renamed.ok, `HTTP ${renamed.status}`);
check('the new name sticks', (await renamed.json()).user.name === 'Renamed Person');

const blankName = await fetch(`${base}/api/agent/me`, { method: 'PATCH', headers: json, body: JSON.stringify({ name: ' ' }) });
check('rejects an empty name', blankName.status === 400, `HTTP ${blankName.status}`);

/* --------------------------------- email -------------------------------- */

const newEmail = `${PREFIX}-changed@example.com`;

const noPassword = await fetch(`${base}/api/agent/me`, {
  method: 'PATCH',
  headers: json,
  body: JSON.stringify({ email: newEmail }),
});
check('will not change the email without the password', noPassword.status === 403, `HTTP ${noPassword.status}`);

const wrongPassword = await fetch(`${base}/api/agent/me`, {
  method: 'PATCH',
  headers: json,
  body: JSON.stringify({ email: newEmail, currentPassword: 'not-the-password' }),
});
check('rejects a wrong password', wrongPassword.status === 403, `HTTP ${wrongPassword.status}`);

const badEmail = await fetch(`${base}/api/agent/me`, {
  method: 'PATCH',
  headers: json,
  body: JSON.stringify({ email: 'not-an-email', currentPassword: PASSWORD }),
});
check('rejects a malformed email', badEmail.status === 400, `HTTP ${badEmail.status}`);

// Someone else already has this one.
const other = await createUser({ name: 'Other', email: `${PREFIX}-other@example.com`, role: 'employee', password: PASSWORD });
const taken = await fetch(`${base}/api/agent/me`, {
  method: 'PATCH',
  headers: json,
  body: JSON.stringify({ email: other.user.email, currentPassword: PASSWORD }),
});
check('refuses an email already in use', taken.status === 409, `HTTP ${taken.status}`);

const changed = await fetch(`${base}/api/agent/me`, {
  method: 'PATCH',
  headers: json,
  body: JSON.stringify({ email: newEmail, currentPassword: PASSWORD }),
});
check('changes the email with the password', changed.ok, `HTTP ${changed.status}`);
check('can sign in with the new email', Boolean(await signIn(newEmail, PASSWORD, 'profile-smoke-check')));

/* ------------------------------- password ------------------------------- */

const secondToken = await signIn(newEmail, PASSWORD, 'profile-smoke-second');
const wrongCurrent = await fetch(`${base}/api/agent/me/password`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ currentPassword: 'nope', newPassword: 'brandnewpass123' }),
});
check('will not change the password without the current one', wrongCurrent.status === 403, `HTTP ${wrongCurrent.status}`);

const weak = await fetch(`${base}/api/agent/me/password`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'short' }),
});
check('rejects a weak new password', weak.status === 400, `HTTP ${weak.status}`);

const same = await fetch(`${base}/api/agent/me/password`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ currentPassword: PASSWORD, newPassword: PASSWORD }),
});
check('rejects reusing the same password', same.status === 400, `HTTP ${same.status}`);

const NEW_PASSWORD = 'changedpass456';
const rotated = await fetch(`${base}/api/agent/me/password`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
});
check('changes the password', rotated.ok, `HTTP ${rotated.status}`);

const stored = await prisma.user.findUnique({ where: { id: me.user.id } });
check('stores the new password hashed', verifyPassword(NEW_PASSWORD, stored.passwordHash));
check('the old password no longer works', !(await signIn(newEmail, PASSWORD, 'profile-smoke-old')));

// The device that made the change keeps working; the other one does not.
const stillMine = await fetch(`${base}/api/agent/me`, { headers: auth });
check('this device stays signed in', stillMine.ok, `HTTP ${stillMine.status}`);
const otherDevice = await fetch(`${base}/api/agent/me`, { headers: { authorization: `Bearer ${secondToken}` } });
check('other devices are signed out', otherDevice.status === 401, `HTTP ${otherDevice.status}`);

/* -------------------------------- avatar -------------------------------- */

const noneYet = await fetch(`${base}/api/agent/me/avatar`, { headers: auth });
check('reports no picture before one is set', noneYet.status === 404, `HTTP ${noneYet.status}`);

const notAnImage = new FormData();
notAnImage.set('file', new Blob([Buffer.from('definitely not an image')]), 'x.png');
const rejected = await fetch(`${base}/api/agent/me/avatar`, { method: 'POST', headers: auth, body: notAnImage });
check('rejects a file that is not an image', rejected.status === 415, `HTTP ${rejected.status}`);

const form = new FormData();
form.set('file', new Blob([PNG], { type: 'image/png' }), 'me.png');
const uploaded = await fetch(`${base}/api/agent/me/avatar`, { method: 'POST', headers: auth, body: form });
check('accepts a PNG', uploaded.ok, `HTTP ${uploaded.status}`);

const fetched = await fetch(`${base}/api/agent/me/avatar`, { headers: auth });
check('serves the picture back', fetched.ok, `HTTP ${fetched.status}`);
check('with the right content type', fetched.headers.get('content-type') === 'image/png', fetched.headers.get('content-type'));
const bytes = Buffer.from(await fetched.arrayBuffer());
check('the bytes are identical', Buffer.compare(bytes, PNG) === 0, `${bytes.length} bytes`);

const publicRead = await fetch(`${base}/api/agent/me/avatar`);
check('the picture is not public', publicRead.status === 401, `HTTP ${publicRead.status}`);

const withAvatar = await (await fetch(`${base}/api/agent/me`, { headers: auth })).json();
check('the profile reports a picture', withAvatar.user.hasAvatar === true);

// Replacing it should not leave the previous one behind.
const before = await prisma.user.findUnique({ where: { id: me.user.id } });
const form2 = new FormData();
form2.set('file', new Blob([PNG], { type: 'image/png' }), 'me2.png');
await fetch(`${base}/api/agent/me/avatar`, { method: 'POST', headers: auth, body: form2 });
const after = await prisma.user.findUnique({ where: { id: me.user.id } });
check('replacing stores a new key', before.avatarPath !== after.avatarPath, after.avatarPath?.slice(-24));

const removed = await fetch(`${base}/api/agent/me/avatar`, { method: 'DELETE', headers: auth });
check('removes the picture', removed.ok, `HTTP ${removed.status}`);
const cleared = await prisma.user.findUnique({ where: { id: me.user.id } });
check('clears it on the account', cleared.avatarPath === null);

/* -------------------------------- cleanup ------------------------------- */

for (const p of [before.avatarPath, after.avatarPath]) if (p) await removeAvatar(p);
await prisma.user.deleteMany({ where: { email: { startsWith: 'profile-smoke-' } } });
await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
