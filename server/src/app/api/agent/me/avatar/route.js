import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { putAvatar, getAvatar, removeAvatar } from '@/lib/storage.js';
import * as bmos from '@/lib/bmos.js';

const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Sniffs the actual bytes rather than trusting the declared type, the same way
 * screenshot uploads do. Only real JPEG, PNG and WebP get through.
 */
function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function typeFromKey(reference) {
  const ext = String(reference).split('.').pop()?.toLowerCase();
  return { png: 'image/png', webp: 'image/webp' }[ext] || 'image/jpeg';
}

/** The employee's own picture. Served through the API; never public. */
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return new Response('Unauthorized', { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user) return new Response('No picture set', { status: 404 });
  if (!user.avatarPath && user.source === 'bmos') {
    const remote = await bmos.fetchProfilePhoto(user.email);
    if (!remote) return new Response('No picture set', { status: 404 });
    return new Response(remote.bytes, { headers: { 'content-type': remote.type, 'content-length': String(remote.bytes.length), 'cache-control': 'private, max-age=300' } });
  }
  if (!user.avatarPath) return new Response('No picture set', { status: 404 });

  const bytes = await getAvatar(user.avatarPath);
  if (!bytes) return new Response('Missing', { status: 404 });

  return new Response(bytes, {
    headers: {
      // Taken from the stored key's extension rather than another column.
      'content-type': typeFromKey(user.avatarPath),
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=300',
    },
  });
}

export async function POST(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES * 1.2) {
    return Response.json({ error: 'That picture is too large. Keep it under 3 MB.' }, { status: 413 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return Response.json({ error: 'Missing file' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'That picture is too large. Keep it under 3 MB.' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) return Response.json({ error: 'Use a JPEG, PNG or WebP image.' }, { status: 415 });

  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

  // A fresh key each time, so caches cannot serve the previous picture.
  const key = `${user.id}/${Date.now()}.${type.split('/')[1]}`;
  const stored = await putAvatar(key, bytes, type);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatarPath: stored },
  });

  // Only once the new one is safely stored.
  if (user.avatarPath && user.avatarPath !== stored) await removeAvatar(user.avatarPath);

  return Response.json({ ok: true, hasAvatar: true, avatarVersion: updated.avatarPath.slice(-12) });
}

export async function DELETE(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

  if (user.avatarPath) {
    await removeAvatar(user.avatarPath);
    await prisma.user.update({ where: { id: user.id }, data: { avatarPath: null } });
  }
  return Response.json({ ok: true, hasAvatar: false });
}
