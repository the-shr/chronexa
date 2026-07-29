import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import * as bmos from '@/lib/bmos.js';

const MAX_SELF_TASKS = 200;

// Brand Macros OS priority -> Chronexa's three levels.
const HUB_PRIORITY = { URGENT: 'high', HIGH: 'high', MEDIUM: 'normal', LOW: 'low' };

/**
 * A task from the ecosystem hub, shaped like a Chronexa task so the agent shows
 * it alongside the rest. The id is prefixed so it never collides with a local
 * one and so completion can be routed back to the hub. Source "bmos" means the
 * agent treats it as assigned work -- shown and completable, never deletable.
 */
function serialiseHubTask(t) {
  return {
    id: `bmos:${t.id}`,
    title: t.title,
    description: t.description || '',
    status: 'open',
    priority: HUB_PRIORITY[t.priority] || 'normal',
    source: 'bmos',
    position: -1000, // hub work sorts above the employee's own
    dueAt: t.deadline,
    estimateMinutes: null,
    completedAt: null,
    updatedAt: null,
  };
}

/** Shape sent to the agent. Never leaks fields belonging to other users. */
export function serialiseTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    source: task.source,
    position: task.position,
    dueAt: task.dueAt,
    estimateMinutes: task.estimateMinutes,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
  };
}

/** The employee's own ordering first, then newest. */
export const TASK_ORDER = [{ position: 'asc' }, { createdAt: 'desc' }];

/**
 * Tasks assigned to the signed-in employee, plus any they added themselves.
 * The agent caches these locally so the list still renders with no connection.
 */
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { userId: device.userId },
    orderBy: TASK_ORDER,
    take: 300,
  });
  const local = tasks.map(serialiseTask);

  // Mirror the employee's open work from the ecosystem hub, if this account came
  // from there. A hub that is down or slow just yields no hub tasks -- the
  // employee's own list still renders.
  let hub = [];
  if (device.user?.externalId) {
    const hubTasks = await bmos.fetchTasks(device.user.email);
    if (hubTasks) hub = hubTasks.map(serialiseHubTask);
  }

  return Response.json({ tasks: [...hub, ...local] });
}

/**
 * An employee adding a task for themselves. Marked source "self" so the agent
 * can allow deleting it -- work assigned by an admin is not the employee's to
 * remove.
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

  const title = String(body.title || '').trim().slice(0, 200);
  if (!title) return Response.json({ error: 'A title is required' }, { status: 400 });

  const owned = await prisma.task.count({ where: { userId: device.userId, source: 'self', status: 'open' } });
  if (owned >= MAX_SELF_TASKS) {
    return Response.json({ error: 'Too many open tasks' }, { status: 429 });
  }

  // New tasks go to the top of the employee's list.
  const first = await prisma.task.findFirst({
    where: { userId: device.userId },
    orderBy: { position: 'asc' },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      userId: device.userId,
      title,
      description: String(body.description || '').slice(0, 1000),
      source: 'self',
      position: (first?.position ?? 0) - 1,
      dueAt: body.dueAt && !Number.isNaN(new Date(body.dueAt).getTime()) ? new Date(body.dueAt) : null,
    },
  });

  return Response.json({ task: serialiseTask(task) }, { status: 201 });
}

/** Applies the employee's ordering: a list of ids, first to last. */
export async function PUT(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const order = Array.isArray(body.order) ? body.order.map(String).slice(0, 300) : null;
  if (!order) return Response.json({ error: 'order must be an array of task ids' }, { status: 400 });

  // Only reorder tasks the caller actually owns; unknown ids are ignored
  // rather than failing the whole request.
  const owned = await prisma.task.findMany({
    where: { userId: device.userId, id: { in: order } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((t) => t.id));

  await prisma.$transaction(
    order
      .filter((id) => ownedIds.has(id))
      .map((id, index) => prisma.task.update({ where: { id }, data: { position: index } })),
  );

  return Response.json({ ok: true, reordered: ownedIds.size });
}
