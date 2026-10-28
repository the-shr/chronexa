/**
 * What an admin sees: team totals, per-employee rollups and one person's
 * detail. Kept as plain functions -- both the web dashboard and the desktop
 * app read from here, and they can be tested without a request.
 */
import { prisma } from './db.js';
import { effectivePolicy } from './policy.js';
import { removeScreenshot } from './storage.js';
import { deleteFile as deleteDriveFile } from './drive.js';

const DAY = 86400000;

export function startOfDay(offsetDays = 0, from = new Date()) {
  const key = new Date(new Date(from).getTime() + 6 * 3600000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${key}T00:00:00+06:00`) + offsetDays * DAY);
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
        externalTaskId: true,
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
        date: new Date(from.getTime() + 6 * 3600000).toISOString().slice(0, 10),
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
      currentTaskId: open?.taskId || (open?.externalTaskId ? `bmos:${open.externalTaskId}` : null),
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
      date: people[0]?.daily[i]?.date || new Date(startOfDay(-(days - 1 - i), now).getTime() + 6 * 3600000).toISOString().slice(0, 10),
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
export async function employeeDetail(userId, { month = new Date(Date.now() + 21600000).toISOString().slice(0, 7) } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId || '') },
    select: { id: true, name: true, email: true, role: true, active: true, avatarPath: true, createdAt: true },
  });
  if (!user) return { error: 'That employee no longer exists' };
  // OS owns canonical tasks. Keep their titles visible in historical Chronexa
  // sessions even if a task was temporarily unassigned and later restored.
  const { fetchTasks } = await import('./bmos.js');
  const hubTasks = await fetchTasks(user.email, { status: 'all' });
  const hubTaskTitles = new Map((hubTasks || []).map((task) => [String(task.id), task.title]));

  const currentMonth = new Date(Date.now() + 21600000).toISOString().slice(0, 7);
  const earliestMonth = new Date(Date.now() + 21600000 - 365 * DAY).toISOString().slice(0, 7);
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') && month >= earliestMonth && month <= currentMonth ? month : currentMonth;
  const since = new Date(`${selectedMonth}-01T00:00:00+06:00`);
  const next = new Date(since.getTime() + 21600000); next.setUTCMonth(next.getUTCMonth() + 1);
  const until = new Date(next.getTime() - 21600000);

  const sessions = await prisma.workSession.findMany({
      where: { userId: user.id, OR: [{ startedAt: { gte: since, lt: until } }, { startedAt: { gte: startOfDay(-6), lte: new Date() } }] },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        activeSeconds: true,
        idleSeconds: true,
        stopReason: true,
        taskNote: true,
        externalTaskId: true,
        screenshotCount: true,
        task: { select: { id: true, title: true } },
      },
    });

  const policy = await effectivePolicy(user.id);
  const countIdle = policy.idle.countIdleAsWork;
  const groups = new Map();
  for (const session of sessions) {
    const date = new Date(session.startedAt.getTime() + 6 * 3600000).toISOString().slice(0, 10);
    if (!groups.has(date)) groups.set(date, { date, activeSeconds: 0, idleSeconds: 0, workSeconds: 0, sessionIds: [] });
    const group = groups.get(date);
    group.activeSeconds += session.activeSeconds;
    group.idleSeconds += session.idleSeconds;
    group.workSeconds += session.activeSeconds + (countIdle ? session.idleSeconds : 0);
    group.sessionIds.push(session.id);
  }
  return {
    timeZone: 'Asia/Dhaka',
    month: selectedMonth,
    countIdleAsWork: countIdle,
    dailyTargetHours: policy.work.dailyTargetHours,
    workDays: policy.work.workDays,
    daily: [...groups.values()],
    totals: { activeSeconds: sessions.reduce((sum, row) => sum + row.activeSeconds, 0), idleSeconds: sessions.reduce((sum, row) => sum + row.idleSeconds, 0), workSeconds: sessions.reduce((sum, row) => sum + row.activeSeconds + (countIdle ? row.idleSeconds : 0), 0), sessions: sessions.length },
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
      taskId: s.task?.id || (s.externalTaskId ? `bmos:${s.externalTaskId}` : null),
      screenshotCount: s.screenshotCount,
      taskTitle: s.task?.title || (s.externalTaskId ? hubTaskTitles.get(s.externalTaskId) : null) || null,
    })),
    tasks: [],
    screenshots: [],
    devices: [],
  };
}

/** The team's latest captures, newest first, for the admin's screenshot wall. */
export async function recentScreenshots({ limit = 60, skip = 0, userId = null } = {}) {
  const rows = await prisma.screenshot.findMany({
    where: userId ? { userId: String(userId) } : {},
    orderBy: { capturedAt: 'desc' },
    skip: Math.max(0, Number(skip) || 0),
    take: Math.min(100, Math.max(1, Number(limit) || 60)),
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

export async function screenshotCount({ userId = null } = {}) {
  return prisma.screenshot.count({ where: userId ? { userId: String(userId) } : {} });
}

/** The team's latest screen clips, newest first. */
export async function recentRecordings({ limit = 60, userId = null } = {}) {
  const rows = await prisma.recording.findMany({
    where: userId ? { userId: String(userId) } : {},
    orderBy: { startedAt: 'desc' },
    take: Math.min(200, Math.max(1, Number(limit) || 60)),
    select: {
      id: true,
      userId: true,
      startedAt: true,
      durationMs: true,
      bytes: true,
      driveFileId: true,
      user: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    startedAt: r.startedAt.toISOString(),
    durationMs: r.durationMs,
    bytes: r.bytes,
    driveFileId: r.driveFileId,
  }));
}

/** Removes one clip from Drive and from the database. */
export async function deleteRecording(id) {
  const row = await prisma.recording.findUnique({
    where: { id: String(id || '') },
    select: { id: true, driveFileId: true },
  });
  if (!row) return { error: 'That recording no longer exists' };

  if (row.driveFileId) await deleteDriveFile(row.driveFileId).catch(() => {});
  await prisma.recording.delete({ where: { id: row.id } });
  return { ok: true };
}

/**
 * Removes one capture an admin no longer wants kept: the stored object first,
 * then the row, so bytes are never orphaned. A missing object is fine -- the
 * row still goes. Reports a missing row rather than pretending it worked.
 */
export async function deleteScreenshot(id) {
  const row = await prisma.screenshot.findUnique({
    where: { id: String(id || '') },
    select: { id: true, storagePath: true },
  });
  if (!row) return { error: 'That screenshot no longer exists' };

  await removeScreenshot(row.storagePath).catch(() => {});
  await prisma.screenshot.delete({ where: { id: row.id } });
  return { ok: true };
}
