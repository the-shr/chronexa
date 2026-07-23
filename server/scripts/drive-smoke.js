/**
 * Proves the Google Drive connection actually works: refreshes a token, uploads
 * a file, reads it back, and deletes it.
 *
 *   node --env-file=.env scripts/drive-smoke.js
 *
 * Skips with an explanation when the credentials are not set yet. Cleans up
 * everything it creates.
 */
import {
  configured,
  folderId,
  checkConnection,
  uploadFile,
  getFile,
  deleteFile,
  ensureFolder,
  resetToken,
  accessToken,
} from '../src/lib/drive.js';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

if (!configured) {
  console.log(`
Google Drive is not connected yet.

  1. console.cloud.google.com -> create a project -> enable the Google Drive API
  2. Credentials -> Create credentials -> OAuth client ID -> Desktop app
  3. put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
  4. run: npm run drive:connect
  5. paste the two lines it prints into .env, then run this again
`);
  process.exit(0);
}

/* ----------------------------- the connection --------------------------- */

const conn = await checkConnection();
check('the credentials are accepted', conn.ok, conn.error || '');
if (!conn.ok) {
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
  process.exit(1);
}
check('the target folder is reachable', Boolean(conn.folder) || Boolean(conn.note), conn.folder?.name || conn.note);

// A cached token must be returned without going back to Google. Measure
// accessToken directly: checkConnection also fetches the folder every time, so
// timing that would say nothing about the cache.
resetToken();
const cold = Date.now();
const firstToken = await accessToken();
const coldMs = Date.now() - cold;

const warm = Date.now();
const secondToken = await accessToken();
const warmMs = Date.now() - warm;

check('the same token comes back', firstToken === secondToken);
check('and the second call skips the network', warmMs < 20, `${coldMs}ms cold vs ${warmMs}ms cached`);

/* -------------------------------- round trip ---------------------------- */

const stamp = Date.now();
const bytes = Buffer.from(`chronexa drive smoke ${stamp}`);
let uploaded;
try {
  uploaded = await uploadFile(`chronexa-smoke-${stamp}.txt`, bytes, { mimeType: 'text/plain' });
  check('a file uploads', Boolean(uploaded.id), uploaded.id);
  check('and the size comes back', uploaded.size === bytes.length, `${uploaded.size} bytes`);
} catch (err) {
  check('a file uploads', false, err.message);
}

if (uploaded?.id) {
  const read = await getFile(uploaded.id);
  check('it reads back byte for byte', Buffer.compare(read, bytes) === 0);

  await deleteFile(uploaded.id);
  check('it deletes', (await getFile(uploaded.id)) === null);
  check('deleting it twice is not an error', (await deleteFile(uploaded.id)).ok === true);
}

/* -------------------------------- subfolder ----------------------------- */

const subName = `smoke-sub-${stamp}`;
let sub;
try {
  sub = await ensureFolder(subName);
  check('a subfolder is created', Boolean(sub), sub);
  const again = await ensureFolder(subName);
  check('and asking twice reuses it', again === sub);
} catch (err) {
  check('a subfolder is created', false, err.message);
}

if (sub) {
  const inSub = await uploadFile(`nested-${stamp}.txt`, bytes, { mimeType: 'text/plain', parent: sub });
  check('files can go inside it', Boolean(inSub.id));
  await deleteFile(inSub.id);
  await deleteFile(sub);
}

console.log(`\nFolder in use: ${folderId() || '(Drive root)'}`);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
