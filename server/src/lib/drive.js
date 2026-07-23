/**
 * Google Drive, for screen recordings.
 *
 * Built on the REST API with plain fetch rather than the `googleapis` package:
 * that dependency is tens of megabytes for the handful of calls made here, and
 * it would be bundled into every serverless function.
 *
 * One set of credentials for the whole server -- the admin's. The agent never
 * talks to Drive; it uploads to us and we forward. That keeps Google
 * credentials off employee machines entirely.
 *
 * The scope is drive.file, so this can only ever see files it created itself.
 * The rest of the admin's Drive is invisible to it, and that scope needs no
 * security review from Google.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const configured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN,
);

export function folderId() {
  return process.env.GOOGLE_DRIVE_FOLDER_ID || null;
}

/* ------------------------------- access token --------------------------- */

// Access tokens last an hour. Cached so a burst of uploads costs one refresh,
// with a minute of slack so a token cannot expire mid-request.
let cached = { token: null, expiresAt: 0 };

export async function accessToken() {
  if (!configured) throw new Error('Google Drive is not configured. See .env.example.');
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant means the refresh token was revoked or expired -- say so
    // plainly, because the fix is to re-run the connect script, not to retry.
    const hint =
      body.error === 'invalid_grant'
        ? ' The refresh token is no longer valid. Run `npm run drive:connect` again.'
        : '';
    throw new Error(`Google refused the token refresh: ${body.error || res.status}.${hint}`);
  }

  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
  return cached.token;
}

/** Drops the cached token. Used by tests and after a credential change. */
export function resetToken() {
  cached = { token: null, expiresAt: 0 };
}

/* --------------------------------- upload ------------------------------- */

/**
 * Uploads bytes as one multipart request: metadata and content together.
 * Fine for the clip sizes here (a few MB); a resumable upload would add a
 * round trip per file for no benefit at this size.
 *
 * @returns {Promise<{id: string, name: string, size: number}>}
 */
export async function uploadFile(name, bytes, { mimeType = 'video/webm', parent = folderId() } = {}) {
  const token = await accessToken();
  const boundary = `chronexa-${Math.random().toString(36).slice(2)}`;

  const metadata = { name, ...(parent ? { parents: [parent] } : {}) };

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(`${UPLOAD_URL}?uploadType=multipart&fields=id,name,size`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Drive upload failed (${res.status}): ${json.error?.message || 'unknown error'}`);
  return { id: json.id, name: json.name, size: Number(json.size) || bytes.length };
}

/* --------------------------------- read --------------------------------- */

/** The bytes of one file this app uploaded. Null if it is gone. */
export async function getFile(id) {
  const token = await accessToken();
  const res = await fetch(`${FILES_URL}/${encodeURIComponent(id)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** A short-lived link an admin can open. Drive itself enforces access. */
export async function fileLink(id) {
  const token = await accessToken();
  const res = await fetch(`${FILES_URL}/${encodeURIComponent(id)}?fields=id,webViewLink`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  return json.webViewLink || null;
}

/* -------------------------------- delete -------------------------------- */

/** Removes a file. A file that is already gone is not an error. */
export async function deleteFile(id) {
  const token = await accessToken();
  const res = await fetch(`${FILES_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.ok || res.status === 404) return { ok: true };
  throw new Error(`Drive delete failed (${res.status})`);
}

/* -------------------------------- folders ------------------------------- */

/**
 * Finds or creates a subfolder. Recordings are filed per employee so an admin
 * opening Drive directly sees something navigable rather than one flat heap.
 */
export async function ensureFolder(name, parent = folderId()) {
  const token = await accessToken();
  const query = [
    `name = '${String(name).replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parent ? `'${parent}' in parents` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const found = await fetch(`${FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const list = await found.json().catch(() => ({}));
  if (found.ok && list.files?.length) return list.files[0].id;

  const created = await fetch(`${FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parent ? { parents: [parent] } : {}),
    }),
  });
  const json = await created.json().catch(() => ({}));
  if (!created.ok) throw new Error(`Could not create the Drive folder: ${json.error?.message || created.status}`);
  return json.id;
}

/** Confirms the credentials work and the target folder is reachable. */
export async function checkConnection() {
  if (!configured) return { ok: false, error: 'Not configured' };
  try {
    await accessToken();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const target = folderId();
  if (!target) return { ok: true, folder: null, note: 'No GOOGLE_DRIVE_FOLDER_ID set; uploads go to the Drive root.' };

  const token = await accessToken();
  const res = await fetch(`${FILES_URL}/${encodeURIComponent(target)}?fields=id,name,mimeType`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 404
          ? 'That folder id was not found. With the drive.file scope the folder must have been created by this app, or picked through the connect script.'
          : json.error?.message || `HTTP ${res.status}`,
    };
  }
  return { ok: true, folder: { id: json.id, name: json.name } };
}
