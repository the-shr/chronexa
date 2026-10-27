import { NextResponse } from 'next/server';
import { validVersion, isOlderVersion } from './lib/update-version.js';
import { getDesktopRelease, desktopUpdateRequired, MINIMUM_DESKTOP_VERSION } from './lib/desktop-release.js';
import { getAndroidRelease, MINIMUM_ANDROID_VERSION } from './lib/android-release.js';

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  if (/^\/api\/agent\/admin\/(overview|tasks)(\/|$)/.test(pathname)) {
    return NextResponse.json({ error: 'This Chronexa admin surface has been retired. Use MacroBex OS.' }, { status: 410 });
  }
  // Authentication and updates stay reachable; work remains version-gated.
  if (['/api/agent/version', '/api/agent/android-version', '/api/agent/login', '/api/agent/diagnostics'].includes(pathname) || !desktopUpdateRequired()) return NextResponse.next();
  const android = request.headers.get('x-chronexa-platform') === 'android';
  const release = android ? await getAndroidRelease() : await getDesktopRelease();
  const minimum = release?.latestVersion || (android ? MINIMUM_ANDROID_VERSION : MINIMUM_DESKTOP_VERSION);
  if (!validVersion(minimum)) return NextResponse.json({ error: 'The required update is not configured correctly.' }, { status: 503 });
  const version = request.headers.get('x-chronexa-version');
  if (isOlderVersion(version, minimum)) {
    return NextResponse.json({ code: 'UPDATE_REQUIRED', error: `Install Chronexa ${minimum} before continuing.`, latestVersion: minimum }, { status: 426 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/agent/:path*',
  ],
};
