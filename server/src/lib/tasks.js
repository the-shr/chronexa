import { prisma } from './db.js';
import { PRIORITIES, STATUSES } from './task-rules.js';

// Re-exported so server-side callers only need one import.
export { PRIORITIES, STATUSES } from './task-rules.js';

/**
 * Task management from the admin side. Kept as plain functions rather than
 * server actions so scripts/admin-tasks-smoke.js can cover the rules directly;
 * the dashboard actions are thin wrappers that check the session first.
 *
 * Each returns { error } on a rule violation instead of throwing, so callers
 * can render the message inline.
 */

function cleanTitle(value) {
  return String(value || '').trim().slice(0, 200);
}

function parseDue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEstimate(value) {
  if (value === undefined || value === null || value === '') return null;
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(minutes, 60 * 24 * 30);
}

export async function assignTask({ userId, title, description, priority, dueAt, estimateMinutes, createdById }) {
  const cleanedTitle = cleanTitle(title);
  if (cleanedTitle.length < 2) return { error: 'Give the task a title.' };

  const assignee = await prisma.user.findUnique({ where: { id: String(userId || '') } });
  if (!assignee) return { error: 'Choose who this is for.' };
  if (!assignee.active) return { error: 'That employee is deactivated.' };

  // New work goes to the top of their list, above anything already there.
  const first = await prisma.task.findFirst({
    where: { userId: assignee.id },
    orderBy: { position: 'asc' },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      userId: assignee.id,
      title: cleanedTitle,
      description: String(description || '').trim().slice(0, 1000),
      priority: PRIORITIES.includes(priority) ? priority : 'normal',
      dueAt: parseDue(dueAt),
      estimateMinutes: parseEstimate(estimateMinutes),
      source: 'assigned',
      position: (first?.position ?? 0) - 1,
      createdById: createdById || null,
    },
  });

  return { task };
}

export async function updateTask(id, { title, description, priority, dueAt, estimateMinutes, status }) {
  const existing = await prisma.task.findUnique({ where: { id: String(id || '') } });
  if (!existing) return { error: 'That task no longer exists.' };

  const data = {};

  if (title !== undefined) {
    const cleaned = cleanTitle(title);
    if (cleaned.length < 2) return { error: 'Give the task a title.' };
    data.title = cleaned;
  }
  if (description !== undefined) data.description = String(description).trim().slice(0, 1000);
  if (priority !== undefined) data.priority = PRIORITIES.includes(priority) ? priority : existing.priority;
  if (dueAt !== undefined) data.dueAt = parseDue(dueAt);
  if (estimateMinutes !== undefined) data.estimateMinutes = parseEstimate(estimateMinutes);

  if (status !== undefined) {
    if (!STATUSES.includes(status)) return { error: `Status must be one of: ${STATUSES.join(', ')}.` };
    data.status = status;
    data.completedAt = status === 'done' ? existing.completedAt ?? new Date() : null;
  }

  if (!Object.keys(data).length) return { task: existing };
  return { task: await prisma.task.update({ where: { id: existing.id }, data }) };
}

/** Moving work to someone else, rather than deleting and recreating it. */
export async function reassignTask(id, userId) {
  const existing = await prisma.task.findUnique({ where: { id: String(id || '') } });
  if (!existing) return { error: 'That task no longer exists.' };

  const assignee = await prisma.user.findUnique({ where: { id: String(userId || '') } });
  if (!assignee) return { error: 'Choose who this is for.' };
  if (!assignee.active) return { error: 'That employee is deactivated.' };
  if (assignee.id === existing.userId) return { task: existing };

  // Sessions already tracked against it belong to the previous assignee's
  // history, so the link is cut rather than carried across.
  await prisma.workSession.updateMany({ where: { taskId: existing.id }, data: { taskId: null } });

  const first = await prisma.task.findFirst({
    where: { userId: assignee.id },
    orderBy: { position: 'asc' },
    select: { position: true },
  });

  return {
    task: await prisma.task.update({
      where: { id: existing.id },
      data: { userId: assignee.id, position: (first?.position ?? 0) - 1 },
    }),
  };
}

export async function deleteTask(id) {
  const existing = await prisma.task.findUnique({ where: { id: String(id || '') } });
  if (!existing) return { error: 'That task no longer exists.' };
  await prisma.task.delete({ where: { id: existing.id } });
  return { ok: true };
}

/** Everything assigned across the team, newest first, for the admin list. */
export async function listTasks({ userId = null, status = null, limit = 200 } = {}) {
  return prisma.task.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

/** Per-employee counts for the assignment page. */
export async function taskCounts() {
  const rows = await prisma.task.groupBy({ by: ['userId', 'status'], _count: { _all: true } });
  const map = new Map();
  for (const row of rows) {
    const entry = map.get(row.userId) || { open: 0, done: 0 };
    entry[row.status] = row._count._all;
    map.set(row.userId, entry);
  }
  return map;
}
