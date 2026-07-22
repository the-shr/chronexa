import { prisma } from '@/lib/db.js';
import { adminDeviceFromRequest } from '@/lib/auth.js';
import { createUser, setUserActive, resetUserPassword } from '@/lib/users.js';

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

/** Add someone to the team. */
export async function POST(request) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await createUser(body);
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  const { id, name, email, role, active } = result.user;
  return Response.json({ user: { id, name, email, role, active } }, { status: 201 });
}

/** Activate, deactivate, or set a new password. */
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

  if (body.password !== undefined) {
    const result = await resetUserPassword(id, String(body.password));
    if (result.error) return Response.json({ error: result.error }, { status: 400 });
  }

  if (body.active !== undefined) {
    // actingAdminId stops an admin deactivating the account they are using.
    const result = await setUserActive(id, Boolean(body.active), { actingAdminId: device.userId });
    if (result.error) return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
