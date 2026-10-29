import { deviceFromRequest } from '@/lib/auth.js';
import * as bmos from '@/lib/bmos.js';

/** Employees may submit assigned work; BM OS owns every other mutation. */
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

  if (body.status !== 'done') return Response.json({ error: 'Task status is managed in MacroBex OS.' }, { status: 405 });
  const result = await bmos.submitTask(device.user.email, id.replace(/^bmos:/, ''), body.completionNote, body.delayReason);
  if (result.error) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ task: { id, status: result.status === 'APPROVED' ? 'done' : 'pending_approval', source: 'bmos', completedAt: result.status === 'APPROVED' ? new Date() : null } });
}

/** Task deletion belongs exclusively to MacroBex OS. */
export async function DELETE(request, { params }) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await params;
  return Response.json({ error: 'Tasks can only be deleted in MacroBex OS.' }, { status: 405 });
}
