import { NextResponse } from 'next/server';
import { validVersion, isOlderVersion } from './lib/update-version.js';
import { getDesktopRelease, desktopUpdateRequired, MINIMUM_DESKTOP_VERSION } from './lib/desktop-release.js';

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  if (/^\/api\/agent\/admin\/(overview|tasks)(\/|$)/.test(pathname)) {
    return NextResponse.json({ error: 'This Chronexa admin surface has been retired. Use Brand Macros OS.' }, { status: 410 });
  }
  // The version manifest must remain reachable for clients blocked from working.
  if (pathname === '/api/agent/version' || !desktopUpdateRequired()) return NextResponse.next();
  const release = await getDesktopRelease();
  const minimum = release?.latestVersion || MINIMUM_DESKTOP_VERSION;
  if (!validVersion(minimum)) return NextResponse.json({ error: 'The required update is not configured correctly.' }, { status: 503 });
  const version = request.headers.get('x-chronexa-version');
  if (isOlderVersion(version, minimum)) {
    return NextResponse.json({ code: 'UPDATE_REQUIRED', error: `Install Chronexa ${minimum} before continuing.`, latestVersion: minimum }, { status: version ? 426 : 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/agent/:path*',
  ],
};
