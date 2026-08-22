import pkg from '../../../../../package.json' with { type: 'json' };

export const dynamic = 'force-dynamic';

function cleanUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

export async function GET() {
  const latestVersion = String(process.env.DESKTOP_LATEST_VERSION || '').trim();
  const downloadUrl = cleanUrl(process.env.DESKTOP_DOWNLOAD_URL);
  const releaseNotesUrl = cleanUrl(process.env.DESKTOP_RELEASE_NOTES_URL);

  return Response.json({
    product: 'Chronexa',
    serverVersion: pkg.version,
    latestVersion: latestVersion || null,
    downloadUrl,
    releaseNotesUrl,
    required: process.env.DESKTOP_UPDATE_REQUIRED === 'true',
    notes: String(process.env.DESKTOP_UPDATE_NOTES || '').trim() || null,
  });
}
