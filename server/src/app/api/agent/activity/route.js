import { deviceFromRequest } from '@/lib/auth.js';
import { employeeDetail } from '@/lib/overview.js';
import { prisma } from '@/lib/db.js';
import { effectivePolicy } from '@/lib/policy.js';
import { dutyDayFor } from '@/lib/duty-day.js';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const headers = { 'cache-control': 'no-store' };
  if (query.get('scope') === 'today') {
    const policy = await effectivePolicy(device.userId);
    const date = dutyDayFor(new Date(), policy.work);
    const start = Date.parse(`${date}T00:00:00+06:00`);
    const rows = await prisma.workSession.findMany({
      where: { userId: device.userId, startedAt: { gte: new Date(start), lt: new Date(start + 2 * 86400000) } },
      select: { id: true, startedAt: true, activeSeconds: true, idleSeconds: true },
    });
    return Response.json({
      date,
      sessions: rows.filter(row => dutyDayFor(row.startedAt, policy.work) === date),
      countIdleAsWork: policy.idle.countIdleAsWork,
      dailyTargetHours: policy.work.dailyTargetHours,
    }, { headers });
  }
  return Response.json(await employeeDetail(device.userId, { month: query.get('month') || undefined }), { headers });
}
