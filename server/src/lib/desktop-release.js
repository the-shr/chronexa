import { validVersion, isOlderVersion } from './update-version.js';

export const RELEASE_MANIFEST_URL = 'https://github.com/the-shr/chronexa/releases/latest/download/update.json';
// First version that reports its version and implements the mandatory gate.
export const MINIMUM_DESKTOP_VERSION = '1.1.10';
let cached = null;
let expiresAt = 0;
let request = null;

function normalize(value, source = 'github') {
  if (!validVersion(value?.latestVersion) || !/^[a-f0-9]{64}$/i.test(value.downloadSha256 || '')) return null;
  const version = value.latestVersion;
  const expected = `https://github.com/the-shr/chronexa/releases/download/v${version}/Chronexa.Setup.${version}.exe`;
  if (value.downloadUrl !== expected || isOlderVersion(version, MINIMUM_DESKTOP_VERSION)) return null;
  return { latestVersion: version, downloadUrl: expected, downloadSha256: value.downloadSha256.toLowerCase(), releaseNotesUrl: `https://github.com/the-shr/chronexa/releases/tag/v${version}`, notes: String(value.notes || 'Install the latest Chronexa update.').slice(0, 400), source };
}
function environmentFallback() {
  return normalize({ latestVersion: String(process.env.DESKTOP_LATEST_VERSION || '').trim(), downloadUrl: process.env.DESKTOP_DOWNLOAD_URL, downloadSha256: process.env.DESKTOP_DOWNLOAD_SHA256, notes: process.env.DESKTOP_UPDATE_NOTES }, 'environment');
}
export function desktopUpdateRequired() { return process.env.DESKTOP_UPDATE_REQUIRED === 'true'; }
export async function getDesktopRelease() {
  if (Date.now() < expiresAt) return cached;
  if (request) return request;
  request = Promise.resolve().then(async () => {
    try {
      const response = await fetch(RELEASE_MANIFEST_URL, { headers: { accept: 'application/json' }, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Release manifest ${response.status}`);
      const release = normalize(await response.json());
      if (!release) throw new Error('Release manifest is incomplete or invalid');
      if (!cached || !isOlderVersion(release.latestVersion, cached.latestVersion)) cached = release;
      expiresAt = Date.now() + 60000;
    } catch {
      cached ||= environmentFallback();
      expiresAt = Date.now() + 15000;
    }
    return cached;
  }).finally(() => { request = null; });
  return request;
}
