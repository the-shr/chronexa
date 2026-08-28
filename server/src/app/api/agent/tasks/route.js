import { deviceFromRequest } from '@/lib/auth.js';
import * as bmos from '@/lib/bmos.js';

// Brand Macros OS priority -> Chronexa's three levels.
const HUB_PRIORITY = { URGENT: 'high', HIGH: 'high', MEDIUM: 'normal', LOW: 'low' };
const COMPLETE = new Set(['PENDING_APPROVAL', 'APPROVED']);

/**
 * A canonical BM OS task shaped for Chronexa's execution-only interface.
 */
function serialiseHubTask(t) {
  const projectName = t.project?.name || t.projectName || null;
  const clientName = t.client?.name || t.clientName || null;
  const parentTitle = t.parent?.title || t.parentTitle || null;
  return {
    id: t.id,
    title: t.title,
    description: t.description || '',
    status: COMPLETE.has(t.status) ? 'done' : 'open',
    priority: HUB_PRIORITY[t.priority] || 'normal',
    source: 'bmos',
    position: Number.isFinite(t.sortOrder) ? t.sortOrder : 0,
    dueAt: t.deadline,
    externalId: t.id,
    parentExternalId: t.parent?.id || null,
    parentTitle,
    projectExternalId: t.project?.id || null,
    projectName,
    clientExternalId: t.client?.id || null,
    clientName,
    context: [clientName, projectName, parentTitle].filter(Boolean).join(' / '),
    hubStatus: t.status,
    estimateMinutes: null,
    completedAt: COMPLETE.has(t.status) ? t.updatedAt : null,
    updatedAt: t.updatedAt || null,
  };
}

/**
 * Tasks assigned to the signed-in employee. BM OS is the only task source.
 */
export async function GET(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!device.user?.externalId) return Response.json({ error: 'This account is not linked to Brand Macros OS.' }, { status: 409 });
  const hubTasks = await bmos.fetchTasks(device.user.email, { status: 'all' });
  if (!hubTasks) return Response.json({ error: 'Brand Macros OS is temporarily unavailable.' }, { status: 503 });
  return Response.json({ tasks: hubTasks.map(serialiseHubTask) });
}

/** Task authoring belongs exclusively to Brand Macros OS. */
export async function POST(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ error: 'Tasks can only be created in Brand Macros OS.' }, { status: 405 });
}

/** Task ordering belongs exclusively to Brand Macros OS. */
export async function PUT(request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ error: 'Task ordering is managed in Brand Macros OS.' }, { status: 405 });
}
