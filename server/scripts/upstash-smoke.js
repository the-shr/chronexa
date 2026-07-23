/**
 * Covers the Redis rate-limiting path, which the other suites never touch.
 *
 *   node --env-file=.env scripts/upstash-smoke.js
 *
 * Two halves:
 *   1. the fixed-window algorithm, against a stub client -- always runs, so a
 *      mistake here is caught without needing an Upstash account;
 *   2. a live round-trip against the real Upstash database -- runs only when
 *      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, and cleans
 *      up the keys it creates.
 */
import { redisLimit, usingRedis, rateLimit, clearRateLimit, LOGIN_LIMITS } from '../src/lib/rate-limit.js';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/* --------------------------- the algorithm ------------------------------ */

/** Minimal stand-in for the Upstash client: just what redisLimit calls. */
function stubClient() {
  const store = new Map();
  const calls = { incr: 0, pexpire: 0, pttl: 0 };
  return {
    calls,
    store,
    async incr(key) {
      calls.incr += 1;
      const next = (store.get(key)?.count || 0) + 1;
      store.set(key, { count: next, ttl: store.get(key)?.ttl ?? -1 });
      return next;
    },
    async pexpire(key, ms) {
      calls.pexpire += 1;
      const entry = store.get(key);
      if (entry) entry.ttl = ms;
      return 1;
    },
    async pttl(key) {
      calls.pttl += 1;
      return store.get(key)?.ttl ?? -1;
    },
  };
}

const policy = { limit: 3, windowMs: 60_000 };
const stub = stubClient();

const first = await redisLimit('k', policy, stub);
check('the first hit is allowed', first.allowed === true);
check('and reports what is left', first.remaining === 2, String(first.remaining));
check('only the first hit sets the expiry', stub.calls.pexpire === 1);

const second = await redisLimit('k', policy, stub);
check('the second hit is allowed', second.allowed === true && second.remaining === 1);
check('the expiry is not reset on later hits', stub.calls.pexpire === 1, `${stub.calls.pexpire} call(s)`);

await redisLimit('k', policy, stub);
const fourth = await redisLimit('k', policy, stub);
check('the hit past the limit is refused', fourth.allowed === false);
check('and says how long to wait', fourth.retryAfterSeconds === 60, `${fourth.retryAfterSeconds}s`);
check('with nothing remaining', fourth.remaining === 0);

// A key whose TTL has already gone means retry-after must not be zero or
// negative, or a client would hammer straight back.
const noTtl = stubClient();
await noTtl.incr('gone');
noTtl.store.set('gone', { count: 99, ttl: -1 });
const expired = await redisLimit('gone', policy, noTtl);
check('a missing TTL still asks for at least a second', expired.retryAfterSeconds >= 1, `${expired.retryAfterSeconds}s`);

// Separate keys must not share a window.
const shared = stubClient();
await redisLimit('a', policy, shared);
await redisLimit('a', policy, shared);
await redisLimit('a', policy, shared);
const otherKey = await redisLimit('b', policy, shared);
check('a different key gets its own window', otherKey.allowed === true && otherKey.remaining === 2);

/* ------------------------------ live check ------------------------------ */

console.log(`\nBackend in use: ${usingRedis ? 'redis (Upstash)' : 'memory (per-process)'}`);

if (!usingRedis) {
  console.log('SKIP  live Upstash round-trip — UPSTASH_REDIS_REST_URL / _TOKEN are not set.');
  console.log('      Rate limits are counted per process, which is wrong on Vercel.');
} else {
  const key = `upstash-smoke:${Date.now()}`;
  const live = { limit: 2, windowMs: 10_000 };

  const one = await rateLimit(key, live);
  check('live: the first hit is allowed', one.allowed === true, `remaining ${one.remaining}`);

  const two = await rateLimit(key, live);
  check('live: the second hit is allowed', two.allowed === true);

  const three = await rateLimit(key, live);
  check('live: the third is refused', three.allowed === false, `retry after ${three.retryAfterSeconds}s`);
  check('live: with a sane retry-after', three.retryAfterSeconds > 0 && three.retryAfterSeconds <= 10);

  await clearRateLimit(key);
  const afterClear = await rateLimit(key, live);
  check('live: clearing the key reopens the window', afterClear.allowed === true, `remaining ${afterClear.remaining}`);
  await clearRateLimit(key);

  // Prove the counter really left this process: a fresh key written here is
  // readable through the same shared database.
  const { Redis } = await import('@upstash/redis');
  const client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  const probeKey = `upstash-smoke:shared:${Date.now()}`;
  await rateLimit(probeKey, live);
  const stored = await client.get(`ratelimit:${probeKey}`);
  check('live: the count is stored in Upstash, not in memory', Number(stored) === 1, `value ${stored}`);
  const ttl = await client.pttl(`ratelimit:${probeKey}`);
  check('live: and it is set to expire', ttl > 0 && ttl <= live.windowMs, `${ttl}ms`);
  await client.del(`ratelimit:${probeKey}`);

  console.log('\nUpstash is wired up correctly. Set the same two variables in Vercel.');
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
