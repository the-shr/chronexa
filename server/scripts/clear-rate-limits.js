/**
 * Clears the login rate-limit counters.
 *
 *   node --env-file=.env scripts/clear-rate-limits.js
 *
 * Needed during development because the counters are shared and persistent now
 * that they live in Redis. Before Upstash, every probe ran in its own process
 * with its own memory, so each run started from zero; now a batch of probes
 * signing in repeatedly trips the per-IP limit and the next run gets a 429 that
 * looks like a broken login.
 *
 * Only touches ratelimit:* keys. Never run this against production to let
 * someone back in -- that is the limit doing its job.
 */
import { usingRedis } from '../src/lib/rate-limit.js';

if (!usingRedis) {
  console.log('Rate limits are in process memory, not Redis. Nothing to clear -- restart the server instead.');
  process.exit(0);
}

const { Redis } = await import('@upstash/redis');
const client = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const keys = await client.keys('ratelimit:*');
if (!keys.length) {
  console.log('No rate-limit counters are set.');
  process.exit(0);
}

for (const key of keys) {
  const count = await client.get(key);
  console.log(`  ${key} = ${count}`);
}

await client.del(...keys);
console.log(`\nCleared ${keys.length} counter(s).`);
process.exit(0);
