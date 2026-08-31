import { adminDeviceFromRequest } from '@/lib/auth.js';
import { recentRecordings } from '@/lib/overview.js';
import { configured as driveConfigured } from '@/lib/drive.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  return Response.json({
    configured: driveConfigured,
    recordings: await recentRecordings({
      limit: Number(params.get('limit')) || 60,
      userId: params.get('userId') || null,
    }),
  });
}
