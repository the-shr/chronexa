/**
 * Next runs this once when the server starts. Config mistakes that would
 * silently weaken security -- or that only surface as a broken feature hours
 * later -- are caught here instead. A boot failure is much easier to notice
 * than an unsigned session cookie or screenshots vanishing into a temp folder.
 */

const EXAMPLE_SECRET = 'change-me-to-a-long-random-string';
const MIN_SECRET_LENGTH = 32;

/** Vercel, Netlify, AWS Lambda: no persistent disk, many short-lived instances. */
function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

export function register() {
  const isProduction = process.env.NODE_ENV === 'production';
  const serverless = isServerless();
  const problems = [];
  const warnings = [];

  /* --------------------------------- auth -------------------------------- */

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    problems.push('SESSION_SECRET is not set. Copy .env.example to .env and set it.');
  } else if (secret === EXAMPLE_SECRET) {
    problems.push('SESSION_SECRET is still the example value from .env.example.');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    const message = `SESSION_SECRET is only ${secret.length} characters; use at least ${MIN_SECRET_LENGTH}.`;
    (isProduction ? problems : warnings).push(message);
  }

  /* ------------------------------- database ------------------------------ */

  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set.');
  } else if (process.env.DATABASE_URL.startsWith('file:')) {
    problems.push('DATABASE_URL points at SQLite, but this app now uses Postgres. See .env.example.');
  } else if (serverless && !process.env.DATABASE_URL.includes('-pooler') && !process.env.DIRECT_URL) {
    warnings.push(
      'DATABASE_URL may not be a pooled connection string. Serverless functions exhaust direct Postgres connections quickly.',
    );
  }

  /* -------------------------------- storage ------------------------------ */

  const R2_VARS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missingR2 = R2_VARS.filter((name) => !process.env[name]);
  const storageDriver = process.env.STORAGE_DRIVER || (missingR2.length ? 'local' : 'r2');

  if (!['local', 'r2'].includes(storageDriver)) {
    problems.push(`STORAGE_DRIVER is "${storageDriver}"; expected "local" or "r2".`);
  } else if (storageDriver === 'r2' && missingR2.length) {
    problems.push(`STORAGE_DRIVER is "r2" but ${missingR2.join(', ')} ${missingR2.length > 1 ? 'are' : 'is'} not set.`);
  } else if (storageDriver === 'local' && serverless) {
    // Uploads would appear to succeed and then disappear with the instance.
    problems.push(
      'STORAGE_DRIVER is "local" on a serverless platform. Uploaded screenshots would be lost. Configure R2 and set STORAGE_DRIVER="r2".',
    );
  }

  /* ----------------------------- rate limiting --------------------------- */

  const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
  if (serverless && !hasRedis) {
    warnings.push(
      'No Upstash Redis configured. Rate limit counters are per-instance on serverless, so the effective limit is much higher than intended.',
    );
  }
  if (isProduction && process.env.TRUST_PROXY !== 'true') {
    warnings.push(
      'TRUST_PROXY is not set. If the app runs behind a reverse proxy, set TRUST_PROXY=true so rate limiting sees real client IPs.',
    );
  }

  for (const warning of warnings) console.warn(`[chronexa] warning: ${warning}`);

  if (problems.length) {
    const message = problems.map((p) => `  - ${p}`).join('\n');
    // Refusing to start is the point: a half-configured deployment is worse
    // than an obviously broken one.
    throw new Error(`Chronexa cannot start:\n${message}`);
  }
}
