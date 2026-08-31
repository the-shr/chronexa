import { adminDeviceFromRequest } from '@/lib/auth.js';
import { teamOverview } from '@/lib/overview.js';

export const dynamic = 'force-dynamic';

/** The admin home page, in one request. Polled by the desktop app. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.min(31, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 7));
  return Response.json(await teamOverview({ days }));
}

