import { adminDeviceFromRequest } from '@/lib/auth.js';
import { recentScreenshots, screenshotCount } from '@/lib/overview.js';

export const dynamic = 'force-dynamic';

/** The team's latest captures. Images themselves come from /api/image/[id]. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 24));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const userId = params.get('userId') || null;
  const [screenshots, total] = await Promise.all([
    recentScreenshots({ limit: pageSize, skip: (page - 1) * pageSize, userId }),
    screenshotCount({ userId }),
  ]);
  return Response.json({
    screenshots,
    page,
    pageSize,
    total,
  });
}
