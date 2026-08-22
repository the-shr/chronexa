import { adminDeviceFromRequest } from '@/lib/auth.js';
import { prisma } from '@/lib/db.js';
import * as bmos from '@/lib/bmos.js';
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

const HUB_PRIORITY = { URGENT: 'high', HIGH: 'high', MEDIUM: 'normal', LOW: 'low' };
const LOCAL_PRIORITY = { LOW: 'low', MEDIUM: 'normal', HIGH: 'high', URGENT: 'high' };
const HUB_DONE = new Set(['SUBMITTED', 'COMPLETED', 'APPROVED']);

function serialiseHubTask(task, user) {
  const assignee = task.assignee || null;
  const owner = user || (assignee ? { id: `bmos:${assignee.id}`, name: assignee.name, email: assignee.email } : null);
  const projectName = task.project?.name || task.projectName || null;
  const clientName = task.client?.name || task.clientName || null;
  const parentTitle = task.parent?.title || task.parentTitle || null;
  const done = HUB_DONE.has(task.status);

  return {
    id: `bmos:${task.id}`,
    title: task.title,
    description: task.description || '',
    status: done ? 'done' : 'open',
    priority: HUB_PRIORITY[task.priority] || 'normal',
    source: 'bmos',
    position: -1000,
    dueAt: task.deadline || null,
    completedAt: done ? task.updatedAt || null : null,
    createdAt: task.startDate || null,
    userId: user?.id || owner?.id || '',
    user: owner,
    externalId: task.id,
    parentExternalId: task.parent?.id || null,
    parentTitle,
    projectExternalId: task.project?.id || null,
    projectName,
    clientExternalId: task.client?.id || null,
    clientName,
    context: [clientName, projectName, parentTitle].filter(Boolean).join(' / '),
    hubStatus: task.status,
    estimateMinutes: null,
  };
}

async function hubTasks({ userId, status }) {
  if (!bmos.configured()) return [];

  const wanted = status || 'all';
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, externalId: true, name: true } })
    : null;

  const raw = user
    ? await bmos.fetchTasks(user.email, { status: wanted })
    : await bmos.fetchTeamTasks({ status: wanted });

  if (!raw?.length) return [];

  const localUsers = user
    ? [user]
    : await prisma.user.findMany({
        where: {
          OR: [
            { externalId: { in: raw.map((task) => task.assignee?.id).filter(Boolean) } },
            { email: { in: raw.map((task) => task.assignee?.email).filter(Boolean) } },
          ],
        },
        select: { id: true, email: true, externalId: true, name: true },
      });

  const byExternal = new Map(localUsers.filter((u) => u.externalId).map((u) => [u.externalId, u]));
  const byEmail = new Map(localUsers.map((u) => [u.email, u]));
  return raw.map((task) => serialiseHubTask(task, byExternal.get(task.assignee?.id) || byEmail.get(task.assignee?.email)));
}

function localOptions(users) {
  return {
    users: users.map((user) => ({ id: user.id, name: user.name, email: user.email })),
    clients: [],
    projects: [],
    parents: [],
    priorities: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    source: 'local',
  };
}

async function taskOptions(device) {
  const remote = device.user?.externalId ? await bmos.fetchTaskOptions(device.user.email) : null;
  if (remote) return { ...remote, source: 'bmos' };

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });
  return localOptions(users);
}

/** Every task on the team, or one person's, filtered by status. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  if (params.get('meta') === '1') return Response.json(await taskOptions(device));

  const status = params.get('status');
  const localTasks = await listTasks({
    userId: params.get('userId') || null,
    status: status && status !== 'all' ? status : null,
  });
  const remoteTasks = await hubTasks({
    userId: params.get('userId') || null,
    status: status && status !== 'all' ? status : 'all',
  });
  const tasks = [...remoteTasks, ...localTasks.map(serialise)];

  return Response.json({ tasks });
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

  if (device.user?.externalId && body.source !== 'local') {
    const result = await bmos.createTask(device.user.email, {
      title: body.title,
      description: body.description,
      clientId: body.clientId || null,
      projectId: body.projectId || null,
      parentId: body.parentId || null,
      assigneeId: body.assigneeId || null,
      priority: body.priority || 'MEDIUM',
      startDate: body.startDate || null,
      deadline: body.deadline || body.dueAt || null,
      notes: body.notes || null,
      privateNotes: body.privateNotes || null,
    });
    if (result.error) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ task: { id: `bmos:${result.id}` } }, { status: 201 });
  }

  const result = await assignTask({
    userId: body.assigneeId || body.userId,
    title: body.title,
    description: body.description,
    priority: LOCAL_PRIORITY[body.priority] || body.priority,
    dueAt: body.deadline || body.dueAt,
    estimateMinutes: body.estimateMinutes,
    createdById: device.userId,
  });
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
