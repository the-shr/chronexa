import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { serialiseTask } from '../route.js';

const STATUSES = ['open', 'done'];

/**
 * Employees may only move a task between open and done. Everything else about
 * a task -- title, assignee, due date -- belongs to the admin who created it.
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

  // Scope the lookup to the caller so one employee cannot touch another's task.
  const existing = await prisma.task.findFirst({ where: { id, userId: device.userId } });
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: { status, completedAt: status === 'done' ? existing.completedAt ?? new Date() : null },
  });

  return Response.json({ task: serialiseTask(task) });
}
