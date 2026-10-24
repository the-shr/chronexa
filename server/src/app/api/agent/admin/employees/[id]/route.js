import { adminDeviceFromRequest } from '@/lib/auth.js';
import { employeeDetail } from '@/lib/overview.js';
import { prisma } from '@/lib/db.js';
import { sanitizeDiagnostics } from '@/lib/diagnostics.js';
import { effectivePolicy } from '@/lib/policy.js';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';

/** One employee in depth: sessions, tasks, captures and devices. */
export async function GET(request, { params }) {
  const device = await adminDeviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await employeeDetail(id, { month: new URL(request.url).searchParams.get('month') || undefined });
  if (detail.error) return Response.json({ error: detail.error }, { status: 404 });
  const devices=await prisma.device.findMany({where:{userId:id},orderBy:{lastSeenAt:'desc'},select:{id:true,name:true,platform:true,lastSeenAt:true,diagnostics:true,diagnosticsAt:true}});
  const expected=await effectivePolicy(id);
  return Response.json({...detail,policyFingerprint:createHash('sha256').update(expected.version).digest('hex'),diagnostics:devices.map(row=>({id:row.id,name:row.name,platform:row.platform,lastSeenAt:row.lastSeenAt,receivedAt:row.diagnosticsAt,report:sanitizeDiagnostics(row.diagnostics)}))},{headers:{'cache-control':'no-store'}});
}

