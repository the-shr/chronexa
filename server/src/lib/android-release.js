import { validVersion, isOlderVersion } from './update-version.js';
export const MINIMUM_ANDROID_VERSION = '1.2.5';
let cached = null, expires = 0;
export async function getAndroidRelease() {
  if (cached && Date.now() < expires) return cached;
  try {
    const response = await fetch('https://github.com/the-shr/chronexa/releases/latest/download/android-update.json', { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    const expected = `https://github.com/the-shr/chronexa/releases/download/v${data.latestVersion}/Chronexa.Android.${data.latestVersion}.apk`;
    if (!validVersion(data.latestVersion) || isOlderVersion(data.latestVersion, MINIMUM_ANDROID_VERSION) || data.downloadUrl !== expected || !/^[a-f0-9]{64}$/.test(data.downloadSha256)) throw new Error('Invalid release');
    if (!cached || !isOlderVersion(data.latestVersion, cached.latestVersion)) cached = { latestVersion: data.latestVersion, downloadUrl: expected, downloadSha256: data.downloadSha256, releaseNotesUrl: `https://github.com/the-shr/chronexa/releases/tag/v${data.latestVersion}` };
    expires = Date.now() + 60000;
  } catch { expires = Date.now() + 15000; }
  return cached;
}
