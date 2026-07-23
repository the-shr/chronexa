import { adminDeviceFromRequest } from '@/lib/auth.js';
import { recentRecordings, deleteRecording } from '@/lib/overview.js';
import { configured as driveConfigured } from '@/lib/drive.js';

export const dynamic = 'force-dynamic';

/** The team's latest clips. Bytes come from /api/recording/[id]. */
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

/** Delete one clip, from Drive and from the database. */
export async function DELETE(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id') || '';
  const result = await deleteRecording(id);
  if (result.error) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
