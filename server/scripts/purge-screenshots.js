/**
 * Deletes screenshots and screen clips past their retention windows, by hand or
 * from a scheduler.
 *
 *   node --env-file=.env scripts/purge-screenshots.js            # uses the env windows
 *   node --env-file=.env scripts/purge-screenshots.js --days=30  # one-off override, both kinds
 *   node --env-file=.env scripts/purge-screenshots.js --dry-run  # count only, delete nothing
 *   node --env-file=.env scripts/purge-screenshots.js --shots    # screenshots only
 *   node --env-file=.env scripts/purge-screenshots.js --clips    # recordings only
 */
import { prisma } from '../src/lib/db.js';
import {
  purgeOldScreenshots,
  purgeOldRecordings,
  retentionDays,
  recordingRetentionDays,
} from '../src/lib/retention.js';

const args = process.argv.slice(2);
const daysArg = args.find((a) => a.startsWith('--days='));
const override = daysArg ? Number(daysArg.split('=')[1]) : null;
const dryRun = args.includes('--dry-run');

// With neither flag, do both.
const onlyShots = args.includes('--shots');
const onlyClips = args.includes('--clips');
const doShots = !onlyClips;
const doClips = !onlyShots;

const shotDays = override ?? retentionDays();
const clipDays = override ?? recordingRetentionDays();

if (dryRun) {
  if (doShots && shotDays) {
    const cutoff = new Date(Date.now() - shotDays * 86400000);
    const count = await prisma.screenshot.count({ where: { capturedAt: { lt: cutoff } } });
    console.log(`Dry run: ${count} screenshot(s) older than ${shotDays} day(s) would be deleted.`);
  } else if (doShots) {
    console.log('Dry run: no screenshot window set.');
  }

  if (doClips && clipDays) {
    const cutoff = new Date(Date.now() - clipDays * 86400000);
    const rows = await prisma.recording.findMany({ where: { startedAt: { lt: cutoff } }, select: { bytes: true } });
    const mb = Math.round(rows.reduce((sum, r) => sum + r.bytes, 0) / 1048576);
    console.log(`Dry run: ${rows.length} clip(s) older than ${clipDays} day(s) would be deleted, freeing ~${mb} MB.`);
  } else if (doClips) {
    console.log('Dry run: no recording window set.');
  }

  await prisma.$disconnect();
  process.exit(0);
}

const log = (m) => console.log(m);
let total = 0;

if (doClips) {
  const r = await purgeOldRecordings({ days: clipDays, log });
  total += r.deleted;
}

if (doShots) {
  const r = await purgeOldScreenshots({ days: shotDays, log });
  total += r.deleted;
}

console.log(`\nDone. ${total} item(s) deleted.`);
await prisma.$disconnect();
process.exit(0);
