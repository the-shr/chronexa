import { adminDeviceFromRequest } from '@/lib/auth.js';
import { employeeDetail } from '@/lib/overview.js';

export const dynamic = 'force-dynamic';

/** One employee in depth: sessions, tasks, captures and devices. */
export async function GET(request, { params }) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await employeeDetail(id);
  if (detail.error) return Response.json({ error: detail.error }, { status: 404 });
  return Response.json(detail);
}
