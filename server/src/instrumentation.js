/**
 * Next runs this once when the server starts. Config mistakes that would
 * silently weaken security are caught here rather than at the first request --
 * a boot failure is much easier to notice than an unsigned session cookie.
 */

const EXAMPLE_SECRET = 'change-me-to-a-long-random-string';
const MIN_SECRET_LENGTH = 32;

export function register() {
  const isProduction = process.env.NODE_ENV === 'production';
  const problems = [];
  const warnings = [];

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    problems.push('SESSION_SECRET is not set. Copy .env.example to .env and set it.');
  } else if (secret === EXAMPLE_SECRET) {
    problems.push('SESSION_SECRET is still the example value from .env.example.');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    const message = `SESSION_SECRET is only ${secret.length} characters; use at least ${MIN_SECRET_LENGTH}.`;
    (isProduction ? problems : warnings).push(message);
  }

  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set.');
  } else if (isProduction && process.env.DATABASE_URL.startsWith('file:')) {
    warnings.push(
      'Running in production on SQLite. Move to Postgres before more than a handful of employees rely on it.',
    );
  }

  if (isProduction && process.env.TRUST_PROXY !== 'true') {
    warnings.push(
      'TRUST_PROXY is not set. If the app runs behind a reverse proxy, set TRUST_PROXY=true so rate limiting sees real client IPs.',
    );
  }

  for (const warning of warnings) console.warn(`[timetracker] warning: ${warning}`);

  if (problems.length) {
    const message = problems.map((p) => `  - ${p}`).join('\n');
    // Refusing to start is the point: a half-configured auth system is worse
    // than an obviously broken one.
    throw new Error(`TimeTracker cannot start:\n${message}`);
  }
}
