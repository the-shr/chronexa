import { prisma } from '@/lib/db.js';
import { adminDeviceFromRequest } from '@/lib/auth.js';
import { startOfDay } from '@/lib/overview.js';
import { fetchTeamProfiles } from '@/lib/bmos.js';
import { getPolicy } from '@/lib/policy.js';
import { rankEmployees } from '@/lib/employee-ranking.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const today = startOfDay(0, now);
  const weekday = new Date(now.getTime() + 6 * 3600000).getUTCDay();
  const weekStart = startOfDay(-((weekday + 6) % 7), now);
  const [users, weekly, daily, policy, openSessions, organization] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, active: true, avatarPath: true, createdAt: true, overrides: true, source: true, externalId: true,
        devices: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } } },
    }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: weekStart, lte: now }, endedAt: { not: null, lte: now } }, _sum: { activeSeconds: true } }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: today, lte: now } }, _sum: { activeSeconds: true, idleSeconds: true } }),
    getPolicy(),
    prisma.workSession.findMany({ where: { endedAt: null, updatedAt: { gte: new Date(now.getTime() - 180000) } }, orderBy: { updatedAt: 'desc' }, select: { userId: true, taskNote: true, task: { select: { title: true } } } }),
    fetchTeamProfiles(device.user?.email),
  ]);
  const profiles = new Map((organization || []).map((person) => [String(person.email).toLowerCase(), person]));
  const profilesById = new Map((organization || []).map((person) => [person.userId, person]));
  const profileFor = (user) => profilesById.get(user.externalId) || profiles.get(user.email.toLowerCase());
  const tasks = new Map();
  for (const session of openSessions) if (!tasks.has(session.userId)) tasks.set(session.userId, session.task?.title || session.taskNote || 'General work');
  const week = new Map(weekly.map((row) => [row.userId, row._sum.activeSeconds || 0]));
  const day = new Map(daily.map((row) => [row.userId, row._sum]));
  const rows = users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
    department: profileFor(u)?.department?.name || null,
    designation: profileFor(u)?.designation || null,
    team: profileFor(u)?.team || null,
    rankingEnabled: u.overrides?.rankingEnabled !== false,
    hasAvatar: Boolean(u.avatarPath || u.source === 'bmos' || u.externalId), avatarVersion: u.avatarPath?.slice(-16) || 'remote',
    weeklyTargetHours: u.overrides?.weeklyTargetHours ?? policy.weeklyTargetHours,
    currentTask: tasks.get(u.id) || null, joinedAt: u.createdAt.toISOString(),
    lastSeenAt: u.devices[0]?.lastSeenAt?.toISOString() || null,
    online: Boolean(u.devices[0]?.lastSeenAt && now - u.devices[0].lastSeenAt < 180000),
    todayActive: day.get(u.id)?.activeSeconds || 0,
    todayIdle: day.get(u.id)?.idleSeconds || 0,
    weekCompletedActive: week.get(u.id) || 0,
  }));
  return Response.json({ users: rankEmployees(rows), organization: { available: organization !== null, source: 'bmos' }, ranking: { weekStart: new Date(weekStart.getTime() + 6 * 3600000).toISOString().slice(0, 10), generatedAt: now.toISOString(), timeZone: 'Asia/Dhaka', basis: 'completed-active' } });
}
