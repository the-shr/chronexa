import { deviceFromRequest } from '@/lib/auth.js';
import * as bmos from '@/lib/bmos.js';

export async function POST(request, { params }) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const text = String(body.body || '').trim();
  if (!text) return Response.json({ error: 'Write a comment first.' }, { status: 400 });
  const result = await bmos.addTaskComment(device.user.email, id.replace(/^bmos:/, ''), text);
  if (result.error) return Response.json({ error: result.error }, { status: 502 });
  return Response.json(result, { status: 201 });
}
