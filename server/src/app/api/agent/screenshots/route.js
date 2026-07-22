import fs from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { uploadRoot } from '@/lib/storage.js';

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Multipart upload of one screenshot: `meta` (JSON) + `file` (JPEG).
 * Images live on disk, not in the database -- swap uploadRoot() for S3 later
 * and nothing else changes.
 */
export async function POST(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Reject oversized uploads before buffering the body, not after.
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES * 1.2) {
    return Response.json({ error: 'File too large' }, { status: 413 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'File too large' }, { status: 413 });
  }

  let meta = {};
  try {
    meta = JSON.parse(form.get('meta') || '{}');
  } catch {
    return Response.json({ error: 'Invalid meta JSON' }, { status: 400 });
  }

  const clientId = String(meta.id || '').slice(0, 120);
  const capturedAt = new Date(meta.capturedAt);
  if (!clientId || Number.isNaN(capturedAt.getTime())) {
    return Response.json({ error: 'meta.id and meta.capturedAt are required' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the declared type: check the JPEG magic number.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return Response.json({ error: 'Only JPEG images are accepted' }, { status: 415 });
  }

  const day = capturedAt.toISOString().slice(0, 10);
  // The path is built from ids we control, never from client-supplied filenames.
  const relative = path.posix.join(device.userId, day, `${clientId.replace(/[^\w.-]/g, '_')}.jpg`);
  const absolute = path.join(uploadRoot(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, bytes);

  // Only link the session if it really belongs to this user.
  let sessionId = null;
  if (meta.sessionId) {
    const owned = await prisma.workSession.findFirst({
      where: { id: String(meta.sessionId), userId: device.userId },
      select: { id: true },
    });
    sessionId = owned?.id ?? null;
  }

  const data = {
    userId: device.userId,
    clientId,
    sessionId,
    capturedAt,
    monitorIndex: Math.max(0, Math.floor(Number(meta.monitorIndex) || 0)),
    monitorLabel: String(meta.monitorLabel || '').slice(0, 80),
    width: Math.max(0, Math.floor(Number(meta.width) || 0)),
    height: Math.max(0, Math.floor(Number(meta.height) || 0)),
    bytes: bytes.length,
    activityPercent:
      meta.activityPercent === null || meta.activityPercent === undefined
        ? null
        : Math.min(100, Math.max(0, Math.floor(Number(meta.activityPercent)))),
    blurred: Boolean(meta.blurred),
    storagePath: relative,
  };

  const row = await prisma.screenshot.upsert({
    where: { userId_clientId: { userId: device.userId, clientId } },
    create: data,
    update: data,
  });

  return Response.json({ ok: true, id: row.id, url: `/api/image/${row.id}` });
}
