import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { configured as driveConfigured, uploadFile, ensureFolder } from '@/lib/drive.js';

// Clips are five seconds; anything much larger is not one of ours.
const MAX_BYTES = 25 * 1024 * 1024;

export const maxDuration = 60;

/**
 * Multipart upload of one screen clip: `meta` (JSON) + `file` (webm).
 *
 * The bytes go straight to Google Drive and only the file id is kept here --
 * video would dwarf everything else in the database, and Drive is where the
 * admin wanted them.
 */
export async function POST(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!driveConfigured) {
    // Tell the agent to stop trying rather than queue forever: a 503 is
    // retryable, but this will not fix itself without an admin.
    return Response.json({ error: 'Recording storage is not configured' }, { status: 501 });
  }

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
  if (!file || typeof file === 'string') return Response.json({ error: 'Missing file' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'File too large' }, { status: 413 });

  let meta = {};
  try {
    meta = JSON.parse(form.get('meta') || '{}');
  } catch {
    return Response.json({ error: 'Invalid meta JSON' }, { status: 400 });
  }

  const clientId = String(meta.id || '').slice(0, 120);
  const startedAt = new Date(meta.startedAt);
  if (!clientId || Number.isNaN(startedAt.getTime())) {
    return Response.json({ error: 'meta.id and meta.startedAt are required' }, { status: 400 });
  }

  // The agent resends after a network failure, so a clip already stored must
  // not upload twice and leave an orphan in Drive.
  const existing = await prisma.recording.findUnique({
    where: { userId_clientId: { userId: device.userId, clientId } },
    select: { id: true, driveFileId: true },
  });
  if (existing?.driveFileId) return Response.json({ ok: true, id: existing.id, duplicate: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the declared type: WebM starts with an EBML header.
  if (!(bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)) {
    return Response.json({ error: 'Only WebM clips are accepted' }, { status: 415 });
  }

  // One subfolder per employee per day, so an admin browsing Drive directly
  // finds something navigable instead of one enormous flat list.
  const day = startedAt.toISOString().slice(0, 10);
  const user = await prisma.user.findUnique({ where: { id: device.userId }, select: { name: true } });
  const safeName = String(user?.name || device.userId).replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);

  let driveFileId;
  try {
    const personFolder = await ensureFolder(safeName);
    const dayFolder = await ensureFolder(day, personFolder);
    const uploaded = await uploadFile(`${day}T${startedAt.toISOString().slice(11, 19).replace(/:/g, '-')}.webm`, bytes, {
      mimeType: 'video/webm',
      parent: dayFolder,
    });
    driveFileId = uploaded.id;
  } catch (err) {
    // 502 rather than 500: the agent should keep the clip queued and retry.
    console.error('[chronexa] recording upload to Drive failed:', err.message);
    return Response.json({ error: 'Could not store the recording' }, { status: 502 });
  }

  const data = {
    userId: device.userId,
    clientId,
    sessionId: await ownedSessionId(meta.sessionId, device.userId),
    startedAt,
    durationMs: clamp(meta.durationMs, 0, 10 * 60_000),
    width: clamp(meta.width, 0, 10_000),
    height: clamp(meta.height, 0, 10_000),
    bytes: bytes.length,
    mimeType: 'video/webm',
    driveFileId,
  };

  const row = await prisma.recording.upsert({
    where: { userId_clientId: { userId: device.userId, clientId } },
    create: data,
    update: data,
  });

  return Response.json({ ok: true, id: row.id });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));
}

/** Only link a session the caller actually owns. */
async function ownedSessionId(sessionId, userId) {
  if (!sessionId) return null;
  const owned = await prisma.workSession.findFirst({
    where: { id: String(sessionId), userId },
    select: { id: true },
  });
  return owned?.id ?? null;
}
