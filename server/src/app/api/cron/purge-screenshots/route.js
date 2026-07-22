import { purgeOldScreenshots, retentionDays } from '@/lib/retention.js';

export const dynamic = 'force-dynamic';
// A big backlog on the first run needs room; a warm daily run finishes fast.
export const maxDuration = 60;

/**
 * Deletes screenshots past the retention window. Wired to Vercel Cron (see
 * vercel.json). Vercel sends `Authorization: Bearer <CRON_SECRET>`, so anyone
 * without the secret gets a 401 -- this endpoint deletes data.
 *
 * With no CRON_SECRET set the route refuses to run at all, rather than sit open.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }

  const header = request.headers.get('authorization') || '';
  if (header !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!retentionDays()) {
    return Response.json({ ok: true, skipped: true, reason: 'SCREENSHOT_RETENTION_DAYS not set' });
  }

  const result = await purgeOldScreenshots({ log: (m) => console.log(m) });
  return Response.json({ ok: true, ...result });
}
