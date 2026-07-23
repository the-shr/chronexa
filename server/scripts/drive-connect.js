/**
 * One-time Google Drive authorisation.
 *
 *   node --env-file=.env scripts/drive-connect.js
 *
 * Opens a browser, asks the admin to grant access, and prints the refresh token
 * and folder id to paste into .env. Run it once; the refresh token then keeps
 * working until it is revoked.
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already set (see .env.example
 * for where to get them).
 *
 * The folder is created here rather than by hand, because the drive.file scope
 * only ever shows this app the files it created itself -- a folder made in the
 * Drive web UI would be invisible to it.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = process.env.GOOGLE_DRIVE_FOLDER_NAME || 'Chronexa Recordings';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Missing credentials.

Set these in .env first, then run this again:

  GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
  GOOGLE_CLIENT_SECRET="...."

Where to get them: console.cloud.google.com -> APIs & Services -> Credentials
-> Create credentials -> OAuth client ID -> Application type: Desktop app.
`);
  process.exit(1);
}

/** A loopback server catches the redirect; Desktop-app clients allow this. */
const server = http.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}`;
const state = crypto.randomBytes(16).toString('hex');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent is what actually returns a refresh token; without them
    // Google hands back an access token that dies in an hour.
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

console.log('\nOpening your browser to ask for access to Google Drive.');
console.log('If it does not open, paste this into a browser:\n');
console.log(authUrl + '\n');

const open =
  process.platform === 'win32'
    ? `start "" "${authUrl}"`
    : process.platform === 'darwin'
      ? `open "${authUrl}"`
      : `xdg-open "${authUrl}"`;
exec(open, () => {});

/* --------------------------- wait for the code -------------------------- */

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timed out after 5 minutes.')), 5 * 60_000);

  server.on('request', (req, res) => {
    const url = new URL(req.url, redirectUri);
    const reply = (message) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Chronexa</title>` +
          `<body style="font:15px system-ui;display:grid;place-items:center;height:90vh;margin:0">` +
          `<div style="max-width:380px;text-align:center">${message}</div></body>`,
      );
    };

    if (url.searchParams.get('error')) {
      reply('<h2>Access was declined</h2><p>Nothing was changed. You can close this tab.</p>');
      clearTimeout(timer);
      reject(new Error(`Google returned: ${url.searchParams.get('error')}`));
      return;
    }

    const returned = url.searchParams.get('code');
    if (!returned) return;

    // Guards against another page on this machine firing a request at the
    // loopback port while it is open.
    if (url.searchParams.get('state') !== state) {
      reply('<h2>Something did not match</h2><p>Please run the command again.</p>');
      clearTimeout(timer);
      reject(new Error('The state parameter did not match.'));
      return;
    }

    reply('<h2>Chronexa is connected</h2><p>You can close this tab and go back to the terminal.</p>');
    clearTimeout(timer);
    resolve(returned);
  });
});

server.close();

/* ---------------------------- exchange for tokens ----------------------- */

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }),
});

const tokens = await tokenRes.json();
if (!tokenRes.ok) {
  console.error(`\nGoogle refused the exchange: ${tokens.error_description || tokens.error}`);
  process.exit(1);
}

if (!tokens.refresh_token) {
  console.error(`
Google did not return a refresh token.

That usually means this account has already granted access to this client.
Remove it at myaccount.google.com/permissions and run this again.
`);
  process.exit(1);
}

/* ------------------------------ make the folder ------------------------- */

const folderRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
  method: 'POST',
  headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
});

const folder = await folderRes.json();
if (!folderRes.ok) {
  console.error(`\nConnected, but the folder could not be created: ${folder.error?.message || folderRes.status}`);
  console.log(`\nGOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"\n`);
  process.exit(1);
}

console.log(`
Connected. A folder named "${folder.name}" is now in your Drive.

Add these two lines to server/.env:

GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"
GOOGLE_DRIVE_FOLDER_ID="${folder.id}"

Then check it with:  npm run test:drive

Keep the refresh token secret -- it grants write access to that folder.
To revoke it later: myaccount.google.com/permissions
`);
process.exit(0);
