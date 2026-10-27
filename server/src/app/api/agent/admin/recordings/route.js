import { trackingDeviceFromRequest, trackingUserScope, canReadTrackingUser } from '@/lib/auth.js';
import { recentRecordings } from '@/lib/overview.js';
import { configured as driveConfigured } from '@/lib/drive.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const device = await trackingDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const userId = params.get('userId') || null;
  const scope = await trackingUserScope(device.user);
  if (scope !== null && (!userId || !scope.includes(userId))) return Response.json({ error: 'Employee access required' }, { status: 403 });
  return Response.json({
    configured: driveConfigured,
    recordings: await recentRecordings({
      limit: Number(params.get('limit')) || 60,
      userId: params.get('userId') || null,
    }),
  });
}
