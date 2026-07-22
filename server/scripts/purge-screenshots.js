/**
 * Deletes screenshots past the retention window, by hand or from a scheduler.
 *
 *   node --env-file=.env scripts/purge-screenshots.js            # uses SCREENSHOT_RETENTION_DAYS
 *   node --env-file=.env scripts/purge-screenshots.js --days=30  # one-off override
 *   node --env-file=.env scripts/purge-screenshots.js --dry-run  # count only, delete nothing
 */
import { prisma } from '../src/lib/db.js';
import { purgeOldScreenshots, retentionDays } from '../src/lib/retention.js';

const args = process.argv.slice(2);
const daysArg = args.find((a) => a.startsWith('--days='));
const days = daysArg ? Number(daysArg.split('=')[1]) : retentionDays();
const dryRun = args.includes('--dry-run');

if (!days) {
  console.log('SCREENSHOT_RETENTION_DAYS is not set and no --days given. Nothing to do.');
  await prisma.$disconnect();
  process.exit(0);
}

if (dryRun) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const count = await prisma.screenshot.count({ where: { capturedAt: { lt: cutoff } } });
  console.log(`Dry run: ${count} screenshot(s) older than ${days} day(s) (before ${cutoff.toISOString()}) would be deleted.`);
  await prisma.$disconnect();
  process.exit(0);
}

const result = await purgeOldScreenshots({ days, log: (m) => console.log(m) });
console.log(`\nDone. Deleted ${result.deleted}, ${result.failed} object(s) already missing.`);
await prisma.$disconnect();
process.exit(0);
