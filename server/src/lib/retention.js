/**
 * Screenshots pile up forever otherwise -- one every few minutes per employee
 * adds up fast, and old ones have little value. This deletes captures past a
 * cut-off, removing both the stored object and its database row.
 *
 * The window is SCREENSHOT_RETENTION_DAYS (0 or unset = keep everything). Run
 * purgeOldScreenshots() from a schedule (Vercel Cron in production, or the
 * bundled script by hand).
 */
import { prisma } from './db.js';
import { removeScreenshot } from './storage.js';
import { deleteFile as deleteDriveFile } from './drive.js';

export function retentionDays() {
  const raw = Number(process.env.SCREENSHOT_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function recordingRetentionDays() {
  const raw = Number(process.env.RECORDING_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/**
 * Deletes captures older than the cut-off. Storage is emptied first, one object
 * at a time: a failed object delete must not drop the row, or the bytes would
 * be orphaned with nothing left pointing at them. The row goes only once its
 * object is gone (or was already missing).
 *
 * @param {object} [opts]
 * @param {number} [opts.days]   override the env window
 * @param {number} [opts.batch]  rows per pass, so a huge backlog cannot exhaust memory
 * @param {(msg: string) => void} [opts.log]
 */
export async function purgeOldScreenshots({ days = retentionDays(), batch = 500, log = () => {} } = {}) {
  if (!days) {
    log('retention: SCREENSHOT_RETENTION_DAYS not set — keeping everything');
    return { deleted: 0, failed: 0, cutoff: null, skipped: true };
  }

  const cutoff = new Date(Date.now() - days * 86400000);
  log(`retention: deleting screenshots captured before ${cutoff.toISOString()} (${days}d)`);

  let deleted = 0;
  let failed = 0;

  // Loop in batches until nothing older remains.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.screenshot.findMany({
      where: { capturedAt: { lt: cutoff } },
      select: { id: true, storagePath: true },
      take: batch,
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        await removeScreenshot(row.storagePath);
      } catch (err) {
        // The object may already be gone; deleting the row is still correct.
        // A real storage error is logged but does not stop the sweep.
        failed += 1;
        log(`retention: could not remove object for ${row.id}: ${err.message}`);
      }
      await prisma.screenshot.delete({ where: { id: row.id } });
      deleted += 1;
    }

    log(`retention: removed ${rows.length} (running total ${deleted})`);
    if (rows.length < batch) break;
  }

  log(`retention: done — ${deleted} deleted, ${failed} object(s) already missing or unreachable`);
  return { deleted, failed, cutoff: cutoff.toISOString(), skipped: false };
}

/**
 * The same sweep for screen clips, which live in Drive. Video is far bulkier
 * than screenshots -- a free Drive fills in about a fortnight -- so this
 * matters more than the screenshot purge does.
 *
 * Drive is emptied before the row goes, for the same reason: a row is the only
 * record of which Drive file belongs to whom.
 */
export async function purgeOldRecordings({
  days = recordingRetentionDays(),
  batch = 200,
  log = () => {},
  // A parameter so the sweep can be proven without Drive credentials. Without
  // this the whole path would only ever run in production.
  remove = deleteDriveFile,
} = {}) {
  if (!days) {
    log('retention: RECORDING_RETENTION_DAYS not set — keeping every clip');
    return { deleted: 0, failed: 0, cutoff: null, skipped: true };
  }

  const cutoff = new Date(Date.now() - days * 86400000);
  log(`retention: deleting clips recorded before ${cutoff.toISOString()} (${days}d)`);

  let deleted = 0;
  let failed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.recording.findMany({
      where: { startedAt: { lt: cutoff } },
      select: { id: true, driveFileId: true },
      take: batch,
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.driveFileId) {
        try {
          await remove(row.driveFileId);
        } catch (err) {
          // Already gone, or Drive is briefly unreachable. Dropping the row is
          // still right: keeping it would only orphan a record nobody can play.
          failed += 1;
          log(`retention: could not remove Drive file for ${row.id}: ${err.message}`);
        }
      }
      await prisma.recording.delete({ where: { id: row.id } });
      deleted += 1;
    }

    log(`retention: removed ${rows.length} clip(s) (running total ${deleted})`);
    if (rows.length < batch) break;
  }

  log(`retention: clips done — ${deleted} deleted, ${failed} already missing or unreachable`);
  return { deleted, failed, cutoff: cutoff.toISOString(), skipped: false };
}
