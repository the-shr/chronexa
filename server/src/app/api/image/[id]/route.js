import { prisma } from '@/lib/db.js';
import { currentAdmin } from '@/lib/auth.js';
import { getScreenshot } from '@/lib/storage.js';

/**
 * Serves a stored screenshot. Admin-only -- these are employees' screens.
 *
 * The bytes are streamed through this route rather than redirecting to the
 * underlying storage URL, so the storage location never leaks to the browser
 * and access always passes an authorisation check.
 */
export async function GET(_request, { params }) {
  const admin = await currentAdmin();
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
