import { prisma } from '@/lib/db.js';
import { adminDeviceFromRequest } from '@/lib/auth.js';
import { getPolicy, updatePolicy, setUserOverride, estimateDailyBytes } from '@/lib/policy.js';

export const dynamic = 'force-dynamic';

/** The organisation policy, plus each employee's overrides. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [policy, employees] = await Promise.all([
    getPolicy(),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, overrides: true },
    }),
  ]);

  return Response.json({
    policy: { ...policy, updatedAt: policy.updatedAt.toISOString() },
    employees,
    // So the cost of a recording choice is visible where it is made.
    estimatedDailyBytes: estimateDailyBytes(policy, { employees: Math.max(1, employees.length) }),
  });
}

/** Change the organisation policy, or one employee's hours. */
export async function PATCH(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // A userId means "just this person's overrides"; without one it is the
  // organisation policy.
  if (body.userId) {
    const { userId, ...patch } = body;
    const result = await setUserOverride(userId, patch);
    if (result.error) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ user: result.user });
  }

  const result = await updatePolicy(body, { updatedById: device.userId });
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({
    policy: { ...result.policy, updatedAt: result.policy.updatedAt.toISOString() },
    estimatedDailyBytes: estimateDailyBytes(result.policy, {
      employees: Math.max(1, await prisma.user.count({ where: { active: true } })),
    }),
  });
}
