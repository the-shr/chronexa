import { prisma } from '@/lib/db.js';
import { deviceFromRequest } from '@/lib/auth.js';
import { sanitizeDiagnostics } from '@/lib/diagnostics.js';
export const dynamic='force-dynamic';
export async function POST(request){
  const device=await deviceFromRequest(request);
  if(!device)return Response.json({error:'Unauthorized'},{status:401});
  if(device.diagnosticsAt && Date.now()-new Date(device.diagnosticsAt).getTime()<10000)return Response.json({ok:true,throttled:true});
  if(Number(request.headers.get('content-length')||0)>16000)return Response.json({error:'Report too large'},{status:413});
  let body;try{const raw=await request.text();if(raw.length>16000)return Response.json({error:'Report too large'},{status:413});body=JSON.parse(raw);}catch{return Response.json({error:'Invalid report'},{status:400});}
  const report=sanitizeDiagnostics(body);if(!report)return Response.json({error:'Unsupported report'},{status:400});
  report.components.report={failures:0,lastFailure:null,code:null,...report.components.report,lastSuccess:new Date().toISOString()};
  await prisma.device.update({where:{id:device.id},data:{diagnostics:report,diagnosticsAt:new Date()}});
  return Response.json({ok:true});
}
