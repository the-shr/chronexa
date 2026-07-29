import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { serialiseTask } from '../route.js';
import * as bmos from '@/lib/bmos.js';

const STATUSES = ['open', 'done'];

/**
 * Employees may only move a task between open and done. Everything else about
 * an assigned task -- title, assignee, due date -- belongs to the admin who
 * created it.
 */
export async function PATCH(request, { params }) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const status = String(body.status || '');
  if (!STATUSES.includes(status)) {
    return Response.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 });
  }

  // A hub task: completion is a submission back to Brand Macros OS for review.
  // The id was prefixed on the way out so it routes here rather than to a local
  // row. Un-ticking is a no-op -- a submitted task cannot be pulled back from
  // the agent.
  if (id.startsWith('bmos:')) {
    const hubId = id.slice('bmos:'.length);
    const synthetic = {
      id,
      title: '',
      description: '',
      status,
      priority: 'normal',
      source: 'bmos',
      position: -1000,
      dueAt: null,
      estimateMinutes: null,
      completedAt: status === 'done' ? new Date() : null,
      updatedAt: new Date(),
    };
    if (status !== 'done') return Response.json({ task: synthetic });

    const result = await bmos.submitTask(device.user.email, hubId, body.completionNote);
    if (result.error) return Response.json({ error: result.error }, { status: 502 });
    return Response.json({ task: synthetic });
  }

  // Scope the lookup to the caller so one employee cannot touch another's task.
  const existing = await prisma.task.findFirst({ where: { id, userId: device.userId } });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: { status, completedAt: status === 'done' ? existing.completedAt ?? new Date() : null },
  });

  return Response.json({ task: serialiseTask(task) });
}

/**
 * Only tasks the employee added themselves may be deleted. Work assigned by an
 * admin can be completed but not made to disappear.
 */
export async function DELETE(request, { params }) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.task.findFirst({ where: { id, userId: device.userId } });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (existing.source !== 'self') {
    return Response.json({ error: 'Assigned tasks cannot be deleted' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: existing.id } });
  return Response.json({ ok: true });
}
