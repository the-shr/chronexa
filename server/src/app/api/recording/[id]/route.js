import { prisma } from '@/lib/db.js';
import { currentAdmin, adminDeviceFromRequest } from '@/lib/auth.js';
import { getFile } from '@/lib/drive.js';

export const maxDuration = 60;

/**
 * Streams one stored clip. Admin-only -- these are employees' screens.
 *
 * The bytes come through this route rather than by handing out a Drive link, so
 * the Drive file id never has to be shared and access always passes our own
 * check. Same two ways in as /api/image: the web dashboard's session cookie, or
 * an admin's device token from the desktop app.
 */
export async function GET(request, { params }) {
  const admin = (await currentAdmin()) || (await adminDeviceFromRequest(request));
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const row = await prisma.recording.findUnique({ where: { id }, select: { driveFileId: true, mimeType: true } });
  if (!row?.driveFileId) return new Response('Not found', { status: 404 });

  let bytes;
  try {
    bytes = await getFile(row.driveFileId);
  } catch (err) {
    console.error('[chronexa] could not read a recording from Drive:', err.message);
    return new Response('Storage unavailable', { status: 502 });
  }
  if (!bytes) return new Response('The clip is no longer in Drive', { status: 404 });

  return new Response(bytes, {
    headers: {
      'content-type': row.mimeType || 'video/webm',
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=3600',
    },
  });
}
