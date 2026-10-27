import { prisma } from '@/lib/db.js';
import { trackingDeviceFromRequest, trackingUserScope, canReadTrackingUser } from '@/lib/auth.js';
import { startOfDay } from '@/lib/overview.js';
import { fetchTeamProfiles } from '@/lib/bmos.js';
import { getPolicy } from '@/lib/policy.js';
import { syncTeamProfiles } from '@/lib/team-sync.js';
import { rankEmployees } from '@/lib/employee-ranking.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const device = await trackingDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const organization = await fetchTeamProfiles(device.user?.email);
  await syncTeamProfiles(prisma, organization);
  const now = new Date();
  const today = startOfDay(0, now);
  const weekday = new Date(now.getTime() + 6 * 3600000).getUTCDay();
  const weekStart = startOfDay(-((weekday + 6) % 7), now);
  const period = new URL(request.url).searchParams.get('period') === 'week' ? 'week' : 'month';
  const monthKey = new Date(now.getTime() + 21600000).toISOString().slice(0, 7);
  const monthStart = new Date(`${monthKey}-01T00:00:00+06:00`);
  const periodStart = period === 'week' ? weekStart : monthStart;
  const [users, weekly, monthly, daily, policy, openSessions] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, active: true, avatarPath: true, createdAt: true, overrides: true, source: true, externalId: true,
        devices: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } } },
    }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: weekStart, lte: now }, endedAt: { not: null, lte: now } }, _sum: { activeSeconds: true } }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: monthStart, lte: now }, endedAt: { not: null, lte: now } }, _sum: { activeSeconds: true } }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: today, lte: now } }, _sum: { activeSeconds: true, idleSeconds: true } }),
    getPolicy(),
    prisma.workSession.findMany({ where: { endedAt: null, updatedAt: { gte: new Date(now.getTime() - 180000) } }, orderBy: { updatedAt: 'desc' }, select: { userId: true, taskNote: true, task: { select: { title: true } } } }),
  ]);
  const profiles = new Map((organization || []).map((person) => [String(person.email).toLowerCase(), person]));
  const profilesById = new Map((organization || []).map((person) => [person.userId, person]));
  const profileFor = (user) => profilesById.get(user.externalId) || profiles.get(user.email.toLowerCase());
  const tasks = new Map();
  for (const session of openSessions) if (!tasks.has(session.userId)) tasks.set(session.userId, session.task?.title || session.taskNote || 'General work');
  const week = new Map(weekly.map((row) => [row.userId, row._sum.activeSeconds || 0]));
  const month = new Map(monthly.map((row) => [row.userId, row._sum.activeSeconds || 0]));
  const workDays = new Set(String(policy.workDays).split(',').map(Number));
  const monthDate = new Date(`${monthKey}-01T12:00:00Z`);
  const monthDays = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  let workingDays = 0;
  for (let day = 1; day <= monthDays; day++) if (workDays.has(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), day)).getUTCDay() || 7)) workingDays++;
  const day = new Map(daily.map((row) => [row.userId, row._sum]));
  const scope = await trackingUserScope(device.user);
  const rows = users.filter(u => scope === null || scope.includes(u.id)).map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
    department: profileFor(u)?.department?.name || null,
    designation: profileFor(u)?.designation || null,
    team: profileFor(u)?.team || null,
    rankingEnabled: u.overrides?.rankingEnabled !== false,
    hasAvatar: Boolean(u.avatarPath || u.source === 'bmos' || u.externalId), avatarVersion: u.avatarPath?.slice(-16) || 'remote',
    weeklyTargetHours: u.overrides?.weeklyTargetHours ?? policy.weeklyTargetHours,
    periodTargetHours: period === 'week' ? (u.overrides?.weeklyTargetHours ?? policy.weeklyTargetHours) : workingDays * (u.overrides?.dailyTargetHours ?? policy.dailyTargetHours),
    periodActive: (period === 'week' ? week : month).get(u.id) || 0,
    currentTask: tasks.get(u.id) || null, joinedAt: u.createdAt.toISOString(),
    lastSeenAt: u.devices[0]?.lastSeenAt?.toISOString() || null,
    online: Boolean(u.devices[0]?.lastSeenAt && now - u.devices[0].lastSeenAt < 180000),
    todayActive: day.get(u.id)?.activeSeconds || 0,
    todayIdle: day.get(u.id)?.idleSeconds || 0,
    weekCompletedActive: week.get(u.id) || 0,
  }));
  return Response.json({ users: rankEmployees(rankEmployees(rows), 'periodActive', 'rank'), organization: { available: organization !== null, source: 'bmos' }, ranking: { period, periodStart: new Date(periodStart.getTime() + 21600000).toISOString().slice(0, 10), weekStart: new Date(weekStart.getTime() + 21600000).toISOString().slice(0, 10), generatedAt: now.toISOString(), timeZone: 'Asia/Dhaka', basis: 'completed-active' } });
}
