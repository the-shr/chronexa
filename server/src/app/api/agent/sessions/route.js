import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { syncTaskSession } from '@/lib/bmos.js';

const MAX_SESSION_SECONDS = 24 * 3600;

function toDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upsert one tracked session. The agent may resend the same id (retries after
 * a network failure), so this is idempotent on the client-generated uuid.
 */
export async function POST(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const startedAt = toDate(body.startedAt);
  if (!body.id || !startedAt) {
    return Response.json({ error: 'id and startedAt are required' }, { status: 400 });
  }

  // Clamp the counters: they arrive from a machine the employee controls.
  const clampSeconds = (n) => Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor(Number(n) || 0)));

  // Chronexa sessions point directly to the canonical BM OS task id.
  const taskId = null;
  const externalTaskId = body.taskId ? String(body.taskId).replace(/^bmos:/, '').slice(0, 120) : null;

  const data = {
    userId: device.userId,
    deviceId: device.id,
    taskId,
    externalTaskId,
    startedAt,
    endedAt: toDate(body.endedAt),
    activeSeconds: clampSeconds(body.activeSeconds),
    idleSeconds: clampSeconds(body.idleSeconds),
    taskNote: String(body.taskNote || '').slice(0, 500),
    stopReason: body.stopReason ? String(body.stopReason).slice(0, 40) : null,
    screenshotCount: Math.max(0, Math.floor(Number(body.screenshotCount) || 0)),
  };

  const existing = await prisma.workSession.findUnique({ where: { id: body.id } });
  // A session id belongs to whoever reported it first.
  if (existing && existing.userId !== device.userId) {
    return Response.json({ error: 'Session belongs to another user' }, { status: 403 });
  }

  const session = await prisma.workSession.upsert({
    where: { id: body.id },
    create: { id: body.id, ...data },
    update: data,
  });

  if (externalTaskId && data.endedAt) {
    const synced = await syncTaskSession(device.user.email, externalTaskId, { id: session.id, ...data });
    if (synced.error) return Response.json({ error: synced.error }, { status: 502 });
  }

  return Response.json({ ok: true, id: session.id });
}
