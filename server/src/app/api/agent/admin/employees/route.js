import { prisma } from '@/lib/db.js';
import { adminDeviceFromRequest } from '@/lib/auth.js';
import { startOfDay } from '@/lib/overview.js';
import { rankEmployees } from '@/lib/employee-ranking.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const today = startOfDay(0, now);
  const weekday = new Date(now.getTime() + 6 * 3600000).getUTCDay();
  const weekStart = startOfDay(-((weekday + 6) % 7), now);
  const [users, weekly, daily] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, active: true, avatarPath: true, createdAt: true,
        devices: { orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } } },
    }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: weekStart, lte: now }, endedAt: { not: null, lte: now } }, _sum: { activeSeconds: true } }),
    prisma.workSession.groupBy({ by: ['userId'], where: { startedAt: { gte: today, lte: now } }, _sum: { activeSeconds: true, idleSeconds: true } }),
  ]);
  const week = new Map(weekly.map((row) => [row.userId, row._sum.activeSeconds || 0]));
  const day = new Map(daily.map((row) => [row.userId, row._sum]));
  const rows = users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
    hasAvatar: Boolean(u.avatarPath), joinedAt: u.createdAt.toISOString(),
    lastSeenAt: u.devices[0]?.lastSeenAt?.toISOString() || null,
    online: Boolean(u.devices[0]?.lastSeenAt && now - u.devices[0].lastSeenAt < 180000),
    todayActive: day.get(u.id)?.activeSeconds || 0,
    todayIdle: day.get(u.id)?.idleSeconds || 0,
    weekCompletedActive: week.get(u.id) || 0,
  }));
  return Response.json({ users: rankEmployees(rows), ranking: { weekStart: new Date(weekStart.getTime() + 6 * 3600000).toISOString().slice(0, 10), generatedAt: now.toISOString(), timeZone: 'Asia/Dhaka', basis: 'completed-active' } });
}
