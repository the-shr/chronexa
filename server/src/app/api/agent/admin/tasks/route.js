import { adminDeviceFromRequest } from '@/lib/auth.js';
import { assignTask, updateTask, reassignTask, deleteTask, listTasks } from '@/lib/tasks.js';

export const dynamic = 'force-dynamic';

function serialise(task) {
  return {
    ...task,
    dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
    updatedAt: undefined,
  };
}

/** Every task on the team, or one person's, filtered by status. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const status = params.get('status');
  const tasks = await listTasks({
    userId: params.get('userId') || null,
    status: status && status !== 'all' ? status : null,
  });

  return Response.json({ tasks: tasks.map(serialise) });
}

/** Assign new work. */
export async function POST(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await assignTask({ ...body, createdById: device.userId });
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ task: serialise(result.task) }, { status: 201 });
}

/** Edit a task, or hand it to someone else. */
export async function PATCH(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = String(body.id || '');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const result = body.moveTo
    ? await reassignTask(id, String(body.moveTo))
    : await updateTask(id, body);

  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ task: serialise(result.task) });
}

export async function DELETE(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id') || '';
  const result = await deleteTask(id);
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
