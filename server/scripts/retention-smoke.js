/**
 * Covers screenshot retention: old captures go (row and object both), recent
 * ones stay, and an unset window deletes nothing.
 *
 *   node --env-file=.env scripts/retention-smoke.js
 *
 * Creates and removes its own data.
 */
import { prisma } from '../src/lib/db.js';
import { createUser } from '../src/lib/users.js';
import { putScreenshot, getScreenshot } from '../src/lib/storage.js';
import { purgeOldScreenshots, purgeOldRecordings } from '../src/lib/retention.js';

const PREFIX = `retention-${Date.now()}`;
const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// A one-pixel JPEG is enough to prove the object round-trips.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////wgARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAT8H/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQI//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwE//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwE//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwI//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyE//9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxA//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxA//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA//9k=',
  'base64',
);

const user = (await createUser({ name: 'Retention User', email: `${PREFIX}@example.com`, role: 'employee', password: 'retention123' })).user;
check('created a user', Boolean(user));

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function makeShot(id, capturedAt) {
  const key = `${user.id}/${PREFIX}/${id}.jpg`;
  const storagePath = await putScreenshot(key, JPEG);
  await prisma.screenshot.create({
    data: { userId: user.id, clientId: id, capturedAt, storagePath, bytes: JPEG.length },
  });
  return storagePath;
}

const oldPath = await makeShot('old-1', daysAgo(40));
const old2Path = await makeShot('old-2', daysAgo(31));
const freshPath = await makeShot('fresh-1', daysAgo(5));
check('stored three screenshots', Boolean(oldPath && old2Path && freshPath));
check('the old object is really there', Boolean(await getScreenshot(oldPath)));

/* ----------------------------- unset window ----------------------------- */

const noop = await purgeOldScreenshots({ days: 0 });
check('an unset window deletes nothing', noop.skipped === true && noop.deleted === 0);
check('all three still present', (await countMine()) === 3, String(await countMine()));

/* ------------------------------ 30-day window --------------------------- */

const run = await purgeOldScreenshots({ days: 30 });
check('the two old ones are deleted', run.deleted === 2, `deleted ${run.deleted}`);
check('the cutoff is reported', typeof run.cutoff === 'string');
check('only the fresh row remains', (await countMine()) === 1, String(await countMine()));

const remaining = await prisma.screenshot.findFirst({ where: { userId: user.id } });
check('and it is the fresh one', remaining?.clientId === 'fresh-1', remaining?.clientId);
check('the fresh object is untouched', Boolean(await getScreenshot(freshPath)));
check('the old object is gone', (await getScreenshot(oldPath)) === null);

/* -------------------------- second run is a no-op ----------------------- */

const again = await purgeOldScreenshots({ days: 30 });
check('running again deletes nothing new', again.deleted === 0);

/* ------------------------------ recordings ------------------------------ */

// A stub remover stands in for Drive, so the clip sweep is proven without
// needing Google credentials.
const removedFromDrive = [];
const remove = async (fileId) => {
  if (fileId === 'clip-gone') throw new Error('already deleted in Drive');
  removedFromDrive.push(fileId);
};

async function makeClip(id, startedAt, driveFileId) {
  await prisma.recording.create({
    data: { userId: user.id, clientId: id, startedAt, driveFileId, bytes: 1024, durationMs: 5000 },
  });
}

await makeClip('clip-old', daysAgo(20), 'drive-old-1');
await makeClip('clip-old-2', daysAgo(15), 'drive-old-2');
await makeClip('clip-fresh', daysAgo(2), 'drive-fresh');
await makeClip('clip-missing', daysAgo(30), 'clip-gone');
check('stored four clips', (await countClips()) === 4, String(await countClips()));

const clipNoop = await purgeOldRecordings({ days: 0, remove });
check('an unset clip window deletes nothing', clipNoop.skipped === true && clipNoop.deleted === 0);

const clipRun = await purgeOldRecordings({ days: 14, remove });
check('clips past the window are deleted', clipRun.deleted === 3, `deleted ${clipRun.deleted}`);
check('the Drive files are removed too', removedFromDrive.length === 2, removedFromDrive.join(', '));
check('a clip already gone from Drive is still counted', clipRun.failed === 1, `failed ${clipRun.failed}`);
check('and its row goes anyway', (await countClips()) === 1, String(await countClips()));

const survivor = await prisma.recording.findFirst({ where: { userId: user.id } });
check('the fresh clip survives', survivor?.clientId === 'clip-fresh', survivor?.clientId);
check('and its Drive file was left alone', !removedFromDrive.includes('drive-fresh'));

const clipAgain = await purgeOldRecordings({ days: 14, remove });
check('a second clip sweep deletes nothing new', clipAgain.deleted === 0);

/* -------------------------------- cleanup ------------------------------- */

await prisma.user.deleteMany({ where: { email: { startsWith: 'retention-' } } });
await prisma.$disconnect();

async function countMine() {
  return prisma.screenshot.count({ where: { userId: user.id } });
}

async function countClips() {
  return prisma.recording.count({ where: { userId: user.id } });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
