/**
 * What an admin sees: team totals, per-employee rollups and one person's
 * detail. Kept as plain functions -- both the web dashboard and the desktop
 * app read from here, and they can be tested without a request.
 */
import { prisma } from './db.js';

const DAY = 86400000;

export function startOfDay(offsetDays = 0, from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

/** An employee counts as tracking if a session is open and was touched lately. */
const LIVE_WINDOW_MS = 3 * 60 * 1000;

function isLive(session, now) {
  return Boolean(session) && !session.endedAt && now - session.updatedAt.getTime() < LIVE_WINDOW_MS;
}

/**
 * Everything the admin home page needs, in one round trip: the app polls this
 * on a timer, so a second query per employee would not scale past a few dozen.
 */
export async function teamOverview({ days = 7, now = new Date() } = {}) {
  const since = startOfDay(-(days - 1), now);
  const today = startOfDay(0, now);

  const [employees, sessions, tasks] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: 'employee' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        avatarPath: true,
        createdAt: true,
        devices: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true, platform: true } },
      },
    }),
    prisma.workSession.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        updatedAt: true,
        activeSeconds: true,
        idleSeconds: true,
        stopReason: true,
        taskNote: true,
      },
    }),
    prisma.task.groupBy({ by: ['userId', 'status'], _count: { _all: true } }),
  ]);

  const byUser = new Map(employees.map((e) => [e.id, []]));
  for (const s of sessions) byUser.get(s.userId)?.push(s);

  const taskCounts = new Map();
  for (const row of tasks) {
    const entry = taskCounts.get(row.userId) || { open: 0, done: 0 };
    entry[row.status] = row._count._all;
    taskCounts.set(row.userId, entry);
  }

  const stamp = now.getTime();

  const people = employees.map((user) => {
    const mine = byUser.get(user.id) || [];
    const todays = mine.filter((s) => s.startedAt >= today);
    const open = mine.find((s) => !s.endedAt);

    // One bar per day, oldest first, so the chart can render straight from this.
    const daily = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const from = startOfDay(-i, now);
      const to = new Date(from.getTime() + DAY);
      const inDay = mine.filter((s) => s.startedAt >= from && s.startedAt < to);
      daily.push({
        date: from.toISOString().slice(0, 10),
        activeSeconds: inDay.reduce((sum, s) => sum + s.activeSeconds, 0),
        idleSeconds: inDay.reduce((sum, s) => sum + s.idleSeconds, 0),
      });
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      hasAvatar: Boolean(user.avatarPath),
      platform: user.devices[0]?.platform || null,
      lastSeenAt: user.devices[0]?.lastSeenAt?.toISOString() || null,
      live: isLive(open, stamp),
      currentTask: open?.taskNote || '',
      todayActive: todays.reduce((sum, s) => sum + s.activeSeconds, 0),
      todayIdle: todays.reduce((sum, s) => sum + s.idleSeconds, 0),
      weekActive: mine.reduce((sum, s) => sum + s.activeSeconds, 0),
      weekIdle: mine.reduce((sum, s) => sum + s.idleSeconds, 0),
      idleStops: mine.filter((s) => s.stopReason === 'idle-timeout').length,
      sessionsToday: todays.length,
      tasksOpen: taskCounts.get(user.id)?.open || 0,
      tasksDone: taskCounts.get(user.id)?.done || 0,
      daily,
    };
  });

  const sum = (key) => people.reduce((total, p) => total + p[key], 0);

  // The team chart is the sum of everyone's, day by day.
  const teamDaily = [];
  for (let i = 0; i < days; i += 1) {
    teamDaily.push({
      date: people[0]?.daily[i]?.date || startOfDay(-(days - 1 - i), now).toISOString().slice(0, 10),
      activeSeconds: people.reduce((total, p) => total + (p.daily[i]?.activeSeconds || 0), 0),
      idleSeconds: people.reduce((total, p) => total + (p.daily[i]?.idleSeconds || 0), 0),
    });
  }

  return {
    generatedAt: now.toISOString(),
    days,
    team: {
      headcount: people.length,
      tracking: people.filter((p) => p.live).length,
      todayActive: sum('todayActive'),
      todayIdle: sum('todayIdle'),
      weekActive: sum('weekActive'),
      weekIdle: sum('weekIdle'),
      tasksOpen: sum('tasksOpen'),
      tasksDone: sum('tasksDone'),
      idleStops: sum('idleStops'),
      daily: teamDaily,
    },
    people,
  };
}

/** One employee, in depth: recent sessions, their tasks and their screenshots. */
export async function employeeDetail(userId, { days = 14, sessionLimit = 60, shotLimit = 60 } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId || '') },
    select: { id: true, name: true, email: true, role: true, active: true, avatarPath: true, createdAt: true },
  });
  if (!user) return { error: 'That employee no longer exists' };

  const since = startOfDay(-(days - 1));

  const [sessions, tasks, screenshots, devices] = await Promise.all([
    prisma.workSession.findMany({
      where: { userId: user.id, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: sessionLimit,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        activeSeconds: true,
        idleSeconds: true,
        stopReason: true,
        taskNote: true,
        screenshotCount: true,
        task: { select: { id: true, title: true } },
      },
    }),
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        source: true,
        dueAt: true,
        estimateMinutes: true,
        completedAt: true,
      },
    }),
    prisma.screenshot.findMany({
      where: { userId: user.id },
      orderBy: { capturedAt: 'desc' },
      take: shotLimit,
      select: { id: true, capturedAt: true, monitorLabel: true, activityPercent: true, width: true, height: true },
    }),
    prisma.device.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, name: true, platform: true, lastSeenAt: true },
    }),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      hasAvatar: Boolean(user.avatarPath),
      joinedAt: user.createdAt.toISOString(),
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() || null,
      activeSeconds: s.activeSeconds,
      idleSeconds: s.idleSeconds,
      stopReason: s.stopReason,
      note: s.taskNote,
      screenshotCount: s.screenshotCount,
      taskTitle: s.task?.title || null,
    })),
    tasks: tasks.map((t) => ({
      ...t,
      dueAt: t.dueAt?.toISOString() || null,
      completedAt: t.completedAt?.toISOString() || null,
    })),
    screenshots: screenshots.map((s) => ({
      id: s.id,
      capturedAt: s.capturedAt.toISOString(),
      monitorLabel: s.monitorLabel,
      activityPercent: s.activityPercent,
      width: s.width,
      height: s.height,
    })),
    devices: devices.map((d) => ({ ...d, lastSeenAt: d.lastSeenAt?.toISOString() || null })),
  };
}

/** The team's latest captures, newest first, for the admin's screenshot wall. */
export async function recentScreenshots({ limit = 60, userId = null } = {}) {
  const rows = await prisma.screenshot.findMany({
    where: userId ? { userId: String(userId) } : {},
    orderBy: { capturedAt: 'desc' },
    take: Math.min(200, Math.max(1, Number(limit) || 60)),
    select: {
      id: true,
      userId: true,
      capturedAt: true,
      monitorLabel: true,
      activityPercent: true,
      user: { select: { name: true } },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    userId: s.userId,
    name: s.user.name,
    capturedAt: s.capturedAt.toISOString(),
    monitorLabel: s.monitorLabel,
    activityPercent: s.activityPercent,
  }));
}
