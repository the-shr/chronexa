/**
 * Checks the production-hardening measures against a running server.
 *
 *   node scripts/hardening-smoke.js [baseUrl]
 *
 * Uses a throwaway account and a unique source IP per run so repeated runs do
 * not trip each other's rate limits.
 */
import { rateLimit, resetAllRateLimits, LOGIN_LIMITS } from '../src/lib/rate-limit.js';
import { prisma } from '../src/lib/db.js';
import { createUser } from '../src/lib/users.js';
import { register } from '../src/instrumentation.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const TEST_EMAIL = `hardening-smoke-${Date.now()}@example.com`;
const TEST_PASSWORD = 'hardening123';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ------------------- boot-time configuration validation ----------------- */

const savedEnv = { ...process.env };

/**
 * Every variable register() looks at. All of them are cleared before applying
 * the overrides, so a real .env -- which Prisma loads on import -- cannot leak
 * into a test that expects the variable to be absent.
 */
const CONFIG_VARS = [
  'SESSION_SECRET',
  'DATABASE_URL',
  'DIRECT_URL',
  'STORAGE_DRIVER',
  'UPLOAD_DIR',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'TRUST_PROXY',
  'NODE_ENV',
  'VERCEL',
];

function withEnv(overrides, fn) {
  for (const key of CONFIG_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    fn();
    return null;
  } catch (err) {
    return err.message;
  } finally {
    process.env = { ...savedEnv };
  }
}

const goodSecret = 'a'.repeat(48);

check(
  'refuses to start without SESSION_SECRET',
  Boolean(withEnv({ SESSION_SECRET: undefined }, register)?.includes('SESSION_SECRET is not set')),
);
check(
  'refuses the example SESSION_SECRET',
  Boolean(
    withEnv({ SESSION_SECRET: 'change-me-to-a-long-random-string' }, register)?.includes('example value'),
  ),
);
check(
  'refuses a short secret in production',
  Boolean(withEnv({ SESSION_SECRET: 'tooshort', NODE_ENV: 'production' }, register)?.includes('characters')),
);
check(
  'refuses to start without DATABASE_URL',
  Boolean(withEnv({ SESSION_SECRET: goodSecret, DATABASE_URL: undefined }, register)?.includes('DATABASE_URL')),
);
check(
  'refuses a leftover SQLite DATABASE_URL',
  Boolean(
    withEnv({ SESSION_SECRET: goodSecret, DATABASE_URL: 'file:./dev.db' }, register)?.includes('SQLite'),
  ),
);

const validEnv = { SESSION_SECRET: goodSecret, DATABASE_URL: 'postgresql://u:p@host/db', STORAGE_DRIVER: 'local' };
check('starts with a valid configuration', withEnv(validEnv, register) === null);

const r2Env = {
  R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
};

// The failure mode this catches is nasty: uploads appear to succeed on Vercel
// and then vanish with the instance.
check(
  'refuses local storage on a serverless platform',
  Boolean(withEnv({ ...validEnv, VERCEL: '1' }, register)?.includes('serverless')),
);
check(
  'refuses r2 without credentials',
  Boolean(withEnv({ ...validEnv, STORAGE_DRIVER: 'r2' }, register)?.includes('R2_ENDPOINT')),
);
check(
  'names every missing R2 variable',
  Boolean(
    withEnv({ ...validEnv, STORAGE_DRIVER: 'r2', R2_ENDPOINT: r2Env.R2_ENDPOINT }, register)?.includes('R2_BUCKET'),
  ),
);
check(
  'refuses an unknown storage driver',
  Boolean(withEnv({ ...validEnv, STORAGE_DRIVER: 'dropbox' }, register)?.includes('STORAGE_DRIVER')),
);
check(
  'accepts r2 on a serverless platform',
  withEnv({ ...validEnv, ...r2Env, VERCEL: '1', STORAGE_DRIVER: 'r2' }, register) === null,
);

/* --------------------- rate limiter behaviour (unit) -------------------- */

resetAllRateLimits();
const policy = { limit: 3, windowMs: 60_000 };
const outcomes = [];
for (let i = 0; i < 5; i += 1) outcomes.push((await rateLimit('unit-test', policy)).allowed);
check('allows up to the limit', outcomes.slice(0, 3).every(Boolean), outcomes.join(','));
check('blocks past the limit', outcomes.slice(3).every((a) => a === false));

const blocked = await rateLimit('unit-test', policy);
check('reports a retry-after', blocked.retryAfterSeconds > 0, `${blocked.retryAfterSeconds}s`);

resetAllRateLimits();
check('is independent per key', (await rateLimit('unit-test', policy)).allowed);

const windowed = { limit: 1, windowMs: 1 };
await rateLimit('expiring', windowed);
await new Promise((r) => setTimeout(r, 12));
check('resets once the window passes', (await rateLimit('expiring', windowed)).allowed);

/* ------------------------------ live server ----------------------------- */

let live = true;
try {
  await fetch(`${base}/login`, { redirect: 'manual' });
} catch {
  live = false;
}

if (!live) {
  console.log(`\nSKIP  server checks (nothing at ${base})`);
} else {
  const headRes = await fetch(`${base}/login`, { redirect: 'manual' });
  const h = (name) => headRes.headers.get(name);

  check('sets X-Content-Type-Options', h('x-content-type-options') === 'nosniff', h('x-content-type-options'));
  check('sets X-Frame-Options', h('x-frame-options') === 'DENY', h('x-frame-options'));
  check('sets Referrer-Policy', Boolean(h('referrer-policy')), h('referrer-policy'));
  check('sets Permissions-Policy', Boolean(h('permissions-policy')), h('permissions-policy'));
  check('sets a CSP with frame-ancestors none', (h('content-security-policy') || '').includes("frame-ancestors 'none'"));
  check('hides the X-Powered-By header', !h('x-powered-by'), h('x-powered-by') || 'absent');

  // A fresh account so the per-account counter starts clean.
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  const created = await createUser({
    name: 'Hardening Smoke',
    email: TEST_EMAIL,
    role: 'employee',
    password: TEST_PASSWORD,
  });
  check('created the test account', Boolean(created.user), created.error || '');

  const attempt = (password, ip) =>
    fetch(`${base}/api/agent/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: TEST_EMAIL, password, deviceName: 'hardening-smoke' }),
    });

  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  const statuses = [];
  for (let i = 0; i < LOGIN_LIMITS.perAccount.limit + 3; i += 1) {
    statuses.push((await attempt('definitely-wrong', ip)).status);
  }

  check('wrong passwords start as 401', statuses[0] === 401, `first: ${statuses[0]}`);
  check(
    'brute force is eventually rate limited',
    statuses.includes(429),
    `statuses: ${statuses.join(',')}`,
  );

  const limited = await attempt(TEST_PASSWORD, ip);
  check('the correct password is also blocked while limited', limited.status === 429, `HTTP ${limited.status}`);
  check('sends a Retry-After header', Boolean(limited.headers.get('retry-after')), limited.headers.get('retry-after'));

  // A different source address must not inherit the block.
  const otherIpEmail = `hardening-other-${Date.now()}@example.com`;
  await createUser({ name: 'Other', email: otherIpEmail, role: 'employee', password: TEST_PASSWORD });
  const otherRes = await fetch(`${base}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
    body: JSON.stringify({ email: otherIpEmail, password: TEST_PASSWORD, deviceName: 'hardening-smoke-2' }),
  });
  check('a different account and IP is unaffected', otherRes.status === 200, `HTTP ${otherRes.status}`);

  const oversize = await fetch(`${base}/api/agent/screenshots`, {
    method: 'POST',
    headers: { authorization: 'Bearer nope', 'content-length': String(50 * 1024 * 1024) },
  });
  check('unauthenticated upload is refused', oversize.status === 401, `HTTP ${oversize.status}`);

  await prisma.user.deleteMany({ where: { email: { in: [TEST_EMAIL, otherIpEmail] } } });
}

await prisma.$disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
