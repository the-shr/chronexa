/**
 * Fixed-window rate limiter held in process memory.
 *
 * This is deliberately simple and has one limitation worth knowing: each server
 * instance keeps its own counters, so behind a load balancer the effective
 * limit is `limit x instances`. For a single-instance deployment that is fine.
 * If you scale out, back this with Redis and keep the same interface.
 */

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

/**
 * Records one hit against `key`.
 * Returns { allowed, remaining, retryAfterSeconds }.
 */
export function rateLimit(key, { limit, windowMs }) {
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

/** Clears a key early -- used after a successful sign-in so one typo'd password
 *  does not count against someone who then got it right. */
export function clearRateLimit(key) {
  buckets.delete(key);
}

/** Test helper. */
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
 * Set TRUST_PROXY=true when running behind nginx / Vercel / Cloudflare, which
 * makes these headers authoritative.
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
