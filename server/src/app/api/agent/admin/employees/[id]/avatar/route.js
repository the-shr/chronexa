import { prisma } from '@/lib/db.js';
import { trackingDeviceFromRequest, trackingUserScope, canReadTrackingUser } from '@/lib/auth.js';
import { getAvatar } from '@/lib/storage.js';
import * as bmos from '@/lib/bmos.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const device = await trackingDeviceFromRequest(request);
  if (!device) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!await canReadTrackingUser(device.user, id)) return new Response('Not found', { status: 404 });
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, source: true, externalId: true, avatarPath: true } });
  if (!user) return new Response('Not found', { status: 404 });
  let bytes, type;
  if (user.avatarPath) {
    bytes = await getAvatar(user.avatarPath);
    const extension = user.avatarPath.split('.').pop()?.toLowerCase();
    type = { png: 'image/png', webp: 'image/webp' }[extension] || 'image/jpeg';
  } else if (user.source === 'bmos' || user.externalId) {
    const photo = await bmos.fetchProfilePhoto(user.email);
    bytes = photo?.bytes; type = photo?.type;
  }
  if (!bytes) return new Response('No picture set', { status: 404 });
  return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' } });
}
