import { deviceFromRequest } from '@/lib/auth.js';
import { attendance } from '@/lib/bmos.js';

async function handle(request, method) {
  const device = await deviceFromRequest(request);
  if (!device?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await attendance(device.user.email, method);
  return Response.json(result, { status: result.error ? 502 : 200 });
}

export const GET = request => handle(request, 'GET');
export const POST = request => handle(request, 'POST');
