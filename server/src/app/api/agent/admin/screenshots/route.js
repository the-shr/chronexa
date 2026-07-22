import { adminDeviceFromRequest } from '@/lib/auth.js';
import { recentScreenshots } from '@/lib/overview.js';

export const dynamic = 'force-dynamic';

/** The team's latest captures. Images themselves come from /api/image/[id]. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  return Response.json({
    screenshots: await recentScreenshots({
      limit: Number(params.get('limit')) || 60,
      userId: params.get('userId') || null,
    }),
  });
}
