/**
 * Fixed-window rate limiting with two backends.
 *
 *   memory — per-process counters. Correct on a single long-lived server,
 *            useless on serverless where every instance counts separately.
 *   redis  — Upstash REST API, shared by every instance. Set
 *            UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable.
 *
 * Redis is chosen automatically when those variables are present. If a Redis
 * call fails the request is allowed through: a rate limiter that goes down
 * should not take sign-in down with it.
 */

export const usingRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

/* -------------------------------- memory -------------------------------- */

const buckets = new Map();
const SWEEP_EVERY_MS = 60_000;
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}

function memoryLimit(key, { limit, windowMs }) {
  const now = Date.now();
  sweep(now);

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: limit - entry.count, retryAfterSeconds: 0 };
}

/* --------------------------------- redis -------------------------------- */

let redisClient = null;
async function redis() {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

async function redisLimit(key, { limit, windowMs }) {
  const client = await redis();
  const count = await client.incr(key);
  // Only the first hit sets the expiry, which is what makes this a fixed
  // window rather than a rolling one that never lets the key die.
  if (count === 1) await client.pexpire(key, windowMs);

  if (count > limit) {
    const ttl = await client.pttl(key);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)) };
  }
  return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
}

/* -------------------------------- facade -------------------------------- */

/** Records one hit against `key`. Returns { allowed, remaining, retryAfterSeconds }. */
export async function rateLimit(key, policy) {
  if (!usingRedis) return memoryLimit(key, policy);
  try {
    return await redisLimit(`ratelimit:${key}`, policy);
  } catch (err) {
    console.error('[timetracker] rate limiter unavailable, allowing request:', err.message);
    return { allowed: true, remaining: policy.limit, retryAfterSeconds: 0 };
  }
}

/** Clears a key early -- used after a successful sign-in so one typo'd password
 *  does not count against someone who then got it right. */
export async function clearRateLimit(key) {
  if (!usingRedis) {
    buckets.delete(key);
    return;
  }
  try {
    const client = await redis();
    await client.del(`ratelimit:${key}`);
  } catch {
    /* best effort */
  }
}

/** Test helper (memory backend only). */
export function resetAllRateLimits() {
  buckets.clear();
}

/**
 * Best-effort client IP from proxy headers.
 *
 * A client can forge `x-forwarded-for` unless a trusted proxy overwrites it, so
 * treat the per-IP limit as a speed bump, not a guarantee. The per-account limit
 * below is the one that actually stops credential stuffing, because the attacker
 * cannot change which account they are guessing at.
 *
 * On Vercel `x-forwarded-for` is set by the platform and cannot be spoofed;
 * set TRUST_PROXY=true there and behind nginx / Cloudflare.
 */
export function clientIp(headers) {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Shared policy for anything that checks a password. */
export const LOGIN_LIMITS = {
  perIp: { limit: 20, windowMs: 15 * 60_000 },
  perAccount: { limit: 8, windowMs: 15 * 60_000 },
};
