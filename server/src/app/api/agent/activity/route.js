import { deviceFromRequest } from '@/lib/auth.js';
import { employeeDetail } from '@/lib/overview.js';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json(await employeeDetail(device.userId), { headers: { 'cache-control': 'no-store' } });
}
