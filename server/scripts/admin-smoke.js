/**
 * Covers the employee-management rules and their security consequences.
 * Runs against the configured database; test accounts are cleaned up at the end.
 *
 *   node scripts/admin-smoke.js [baseUrl]
 *
 * The base URL is only needed for the checks that confirm a device token really
 * stops working -- start the server first, or those are skipped.
 */
import { prisma } from '../src/lib/db.js';
import { verifyPassword } from '../src/lib/password.js';
import {
  createUser,
  setUserActive,
  setUserRole,
  resetUserPassword,
  revokeUserDevices,
  isLastActiveAdmin,
} from '../src/lib/users.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const TEST_PREFIX = 'admin-smoke-';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function serverUp() {
  try {
    const res = await fetch(`${base}/login`, { redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function agentLogin(email, password) {
  const res = await fetch(`${base}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, deviceName: 'admin-smoke-device', platform: 'test' }),
  });
  return { status: res.status, body: res.ok ? await res.json() : null };
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

await cleanup();

/* ------------------------------- creation ------------------------------- */

const weak = await createUser({
  name: 'Weak Password',
  email: `${TEST_PREFIX}weak@example.com`,
  role: 'employee',
  password: 'abcdefghij', // long enough, but no digits
});
check('rejects a password with no digits', Boolean(weak.error), weak.error);

const short = await createUser({
  name: 'Short',
  email: `${TEST_PREFIX}short@example.com`,
  role: 'employee',
  password: 'ab1',
});
check('rejects a short password', Boolean(short.error), short.error);

const badEmail = await createUser({
  name: 'Bad Email',
  email: 'not-an-email',
  role: 'employee',
  password: 'validpass123',
});
check('rejects a malformed email', Boolean(badEmail.error), badEmail.error);

const noName = await createUser({
  name: '',
  email: `${TEST_PREFIX}noname@example.com`,
  role: 'employee',
  password: 'validpass123',
});
check('rejects a missing name', Boolean(noName.error), noName.error);

const created = await createUser({
  name: 'Smoke Employee',
  email: `  ${TEST_PREFIX}Employee@Example.com  `,
  role: 'employee',
  password: 'initialpass123',
});
check('creates a valid employee', Boolean(created.user), created.error || created.user?.email);
check('normalises the email', created.user?.email === `${TEST_PREFIX}employee@example.com`, created.user?.email);
check('never stores the raw password', !JSON.stringify(created.user || {}).includes('initialpass123'));
check('stores a verifiable hash', verifyPassword('initialpass123', created.user.passwordHash));

const duplicate = await createUser({
  name: 'Duplicate',
  email: `${TEST_PREFIX}EMPLOYEE@example.com`,
  role: 'employee',
  password: 'anotherpass123',
});
check('rejects a duplicate email regardless of case', Boolean(duplicate.error), duplicate.error);

const unknownRole = await createUser({
  name: 'Sneaky',
  email: `${TEST_PREFIX}sneaky@example.com`,
  role: 'superuser',
  password: 'validpass123',
});
check('falls back to employee for an unknown role', unknownRole.user?.role === 'employee', unknownRole.user?.role);

/* ------------------------- device token lifecycle ------------------------ */

const employeeId = created.user.id;
const live = await serverUp();

if (live) {
  const first = await agentLogin(`${TEST_PREFIX}employee@example.com`, 'initialpass123');
  check('the new employee can sign in from the agent', first.status === 200, `HTTP ${first.status}`);
  const token = first.body?.token;

  const auth = { authorization: `Bearer ${token}` };
  const beforeReset = await fetch(`${base}/api/agent/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), activeSeconds: 60 }),
  });
  check('the token works before a reset', beforeReset.ok, `HTTP ${beforeReset.status}`);

  await resetUserPassword(employeeId, 'changedpass456');
  const afterReset = await fetch(`${base}/api/agent/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), activeSeconds: 60 }),
  });
  check('a password reset revokes existing device tokens', afterReset.status === 401, `HTTP ${afterReset.status}`);

  const oldPassword = await agentLogin(`${TEST_PREFIX}employee@example.com`, 'initialpass123');
  check('the old password stops working', oldPassword.status === 401, `HTTP ${oldPassword.status}`);

  const newPassword = await agentLogin(`${TEST_PREFIX}employee@example.com`, 'changedpass456');
  check('the new password works', newPassword.status === 200, `HTTP ${newPassword.status}`);
  const token2 = newPassword.body?.token;

  await setUserActive(employeeId, false);
  const deactivated = await fetch(`${base}/api/agent/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token2}` },
    body: JSON.stringify({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), activeSeconds: 60 }),
  });
  check('deactivating blocks the device token', deactivated.status === 401, `HTTP ${deactivated.status}`);

  const deactivatedLogin = await agentLogin(`${TEST_PREFIX}employee@example.com`, 'changedpass456');
  check('a deactivated employee cannot sign in', deactivatedLogin.status === 401, `HTTP ${deactivatedLogin.status}`);

  await setUserActive(employeeId, true);
  const reactivated = await agentLogin(`${TEST_PREFIX}employee@example.com`, 'changedpass456');
  check('reactivating restores access', reactivated.status === 200, `HTTP ${reactivated.status}`);

  const revoked = await revokeUserDevices(employeeId);
  check('revoking removes the device rows', revoked.revoked > 0, `${revoked.revoked} removed`);
} else {
  console.log(`SKIP  device token checks (no server at ${base})`);
}

/* --------------------------- last-admin guard ---------------------------- */

const soleAdmin = await createUser({
  name: 'Sole Admin',
  email: `${TEST_PREFIX}admin@example.com`,
  role: 'admin',
  password: 'adminpass123',
});

// Park every other admin so the test account really is the only one left.
const otherAdmins = await prisma.user.findMany({
  where: { role: 'admin', active: true, id: { not: soleAdmin.user.id } },
  select: { id: true },
});
await prisma.user.updateMany({
  where: { id: { in: otherAdmins.map((a) => a.id) } },
  data: { active: false },
});

try {
  check('recognises the last active admin', await isLastActiveAdmin(soleAdmin.user.id));

  const deactivate = await setUserActive(soleAdmin.user.id, false);
  check('refuses to deactivate the last admin', Boolean(deactivate.error), deactivate.error);

  const demote = await setUserRole(soleAdmin.user.id, 'employee');
  check('refuses to demote the last admin', Boolean(demote.error), demote.error);

  const self = await setUserActive(soleAdmin.user.id, false, { actingAdminId: soleAdmin.user.id });
  check('refuses self-deactivation', Boolean(self.error), self.error);

  const selfDemote = await setUserRole(soleAdmin.user.id, 'employee', { actingAdminId: soleAdmin.user.id });
  check('refuses self-demotion', Boolean(selfDemote.error), selfDemote.error);

  const stillAdmin = await prisma.user.findUnique({ where: { id: soleAdmin.user.id } });
  check('the last admin is untouched', stillAdmin.active && stillAdmin.role === 'admin');
} finally {
  await prisma.user.updateMany({
    where: { id: { in: otherAdmins.map((a) => a.id) } },
    data: { active: true },
  });
}

await cleanup();
await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
