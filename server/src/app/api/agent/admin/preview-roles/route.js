import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { fetchPreviewRoles, fetchTeamProfiles } from '@/lib/bmos.js';
import { syncTeamProfiles } from '@/lib/team-sync.js';

export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device?.user?.bmosIsSuperAdmin || !device.user.active) return Response.json({ error: 'Super Admin only' }, { status: 403 });
  const roles = await fetchPreviewRoles(device.user.email);
  if (!roles) return Response.json({ error: 'MacroBex OS roles unavailable' }, { status: 503 });
  await syncTeamProfiles(prisma, await fetchTeamProfiles(device.user.email, { fresh: true }));
  const userIds = [...new Set(roles.flatMap(role => [...(role.trackingUserIds || []), ...(role.members || []).map(member => member.userId)]))];
  const users = await prisma.user.findMany({ where: { externalId: { in: userIds } }, select: { id: true, externalId: true } });
  const byExternal = new Map(users.map(user => [user.externalId, user.id]));
  return Response.json({ roles: roles.map(role => ({
    ...role,
    trackingUserIds: role.trackingUserIds.map(id => byExternal.get(id)).filter(Boolean),
    members: role.members.map(member => ({ id: byExternal.get(member.userId), name: member.name })).filter(member => member.id),
  })) }, { headers: { 'cache-control': 'private, no-store' } });
}
