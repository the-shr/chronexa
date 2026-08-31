import { prisma } from '@/lib/db.js';
import { adminDeviceFromRequest } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/** Everyone on the team, including the deactivated. */
export async function GET(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, active: true, avatarPath: true, createdAt: true },
  });

  return Response.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      hasAvatar: Boolean(u.avatarPath),
      joinedAt: u.createdAt.toISOString(),
    })),
  });
}

