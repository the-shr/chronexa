import { deviceFromRequest } from '@/lib/auth.js';
import { effectivePolicy } from '@/lib/policy.js';

export const dynamic = 'force-dynamic';

/**
 * What this agent should do, shaped like its own settings tree.
 *
 * Any signed-in agent may read this, employee or admin -- an agent has to know
 * the idle rule and its own hours to run at all. It tells the agent nothing it
 * could not already infer from its own behaviour, and the renderer still never
 * sees the capture half: settings.publicView() filters that on the way through.
 */
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  return Response.json(await effectivePolicy(device.userId));
}
