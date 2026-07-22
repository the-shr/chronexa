import { prisma } from '@/lib/db.js';
import { currentAdmin, adminDeviceFromRequest } from '@/lib/auth.js';
import { getScreenshot } from '@/lib/storage.js';

/**
 * Serves a stored screenshot. Admin-only -- these are employees' screens.
 *
 * The bytes are streamed through this route rather than redirecting to the
 * underlying storage URL, so the storage location never leaks to the browser
 * and access always passes an authorisation check.
 *
 * Two ways in: the web dashboard's session cookie, and an admin's device token
 * from the desktop app. The app fetches in its main process and hands the
 * renderer a data URL, so the token never has to travel in an <img> URL.
 */
export async function GET(request, { params }) {
  const admin = (await currentAdmin()) || (await adminDeviceFromRequest(request));
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const row = await prisma.screenshot.findUnique({ where: { id } });
  if (!row) return new Response('Not found', { status: 404 });

  const bytes = await getScreenshot(row.storagePath);
  if (!bytes) return new Response('Image file missing', { status: 404 });

  return new Response(bytes, {
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=3600',
    },
  });
}
