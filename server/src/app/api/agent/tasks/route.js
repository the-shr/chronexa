import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';

/** Shape sent to the agent. Never leaks fields belonging to other users. */
export function serialiseTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    estimateMinutes: task.estimateMinutes,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
  };
}

/**
 * Tasks assigned to the signed-in employee. The agent caches these locally so
 * the list still renders with no connection.
 */
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { userId: device.userId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });

  return Response.json({ tasks: tasks.map(serialiseTask) });
}
