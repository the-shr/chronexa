import pkg from '../../../../../package.json' with { type: 'json' };
import { getDesktopRelease, desktopUpdateRequired } from '@/lib/desktop-release.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const release = await getDesktopRelease();
  if (!release) return Response.json({ error: 'Update information is temporarily unavailable. Please retry.' }, { status: 503 });
  return Response.json({ product: 'Chronexa', serverVersion: pkg.version, ...release, required: desktopUpdateRequired() });
}
