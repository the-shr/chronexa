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
import { purgeOldScreenshots } from '../src/lib/retention.js';

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

/* -------------------------------- cleanup ------------------------------- */

await prisma.user.deleteMany({ where: { email: { startsWith: 'retention-' } } });
await prisma.$disconnect();

async function countMine() {
  return prisma.screenshot.count({ where: { userId: user.id } });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
