import { getAndroidRelease } from '@/lib/android-release.js';
import { desktopUpdateRequired } from '@/lib/desktop-release.js';
export const dynamic = 'force-dynamic';
export async function GET() {
  const release = await getAndroidRelease();
  return release ? Response.json({ product: 'Chronexa Android', ...release, required: desktopUpdateRequired() }) : Response.json({ error: 'Android update information is temporarily unavailable.' }, { status: 503 });
}
