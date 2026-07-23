'use strict';

/**
 * Records real clips in the real app: real hidden window, real MediaRecorder,
 * real files on disk. Nothing here can be checked from the browser preview,
 * which has no desktopCapturer at all.
 *
 *   npx electron scripts/recorder-probe.js
 *
 * Uses a throwaway data directory, and cleans up the clips it records.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(app.getPath('temp'), `chronexa-rec-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);

// Electron quits by default once the last window goes, which would kill this
// probe the moment it tears the recorder window down. The real app registers
// its own handler in main.js; this stands in for it.
app.on('window-all-closed', () => {});

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const db = require('../electron/lib/db');
  const recorder = require('../electron/lib/recorder');

  settings.init();
  db.init();
  recorder.init();

  // Short clips so the probe finishes in seconds rather than minutes.
  settings.set({ recording: { enabled: true, durationSeconds: 2, intervalMinutes: 1, maxWidth: 640, frameRate: 10 } });

  /* --------------------------- invisibility --------------------------- */

  const publicView = settings.publicView();
  check('the renderer is never told about recording', publicView.recording === undefined, Object.keys(publicView).join(', '));

  const fromRenderer = settings.setFromRenderer({ recording: { enabled: false } });
  check(
    'and the renderer cannot switch it off',
    settings.get().recording.enabled === true && fromRenderer.recording === undefined,
  );

  /* ------------------------------ one clip ---------------------------- */

  let row;
  try {
    row = await recorder.captureOnce();
    check('a clip records', Boolean(row?.filePath), row?.id);
  } catch (err) {
    check('a clip records', false, err.message);
    console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
    app.exit(1);
    return;
  }

  check('the file is on disk', fs.existsSync(row.filePath));
  check('and is not empty', row.bytes > 1000, `${Math.round(row.bytes / 1024)}kb`);

  const head = fs.readFileSync(row.filePath).subarray(0, 4);
  check(
    'it really is WebM',
    head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3,
    head.toString('hex'),
  );

  check('it carries the frame size', row.width > 0 && row.height > 0, `${row.width}x${row.height}`);
  check('and the duration asked for', row.durationMs === 2000, `${row.durationMs}ms`);
  check('the file sits under the data directory', row.filePath.startsWith(dir), row.filePath);

  /* ------------------------- the hidden window ------------------------ */

  const windows = BrowserWindow.getAllWindows();
  check('the recorder window exists', windows.length >= 1, `${windows.length} window(s)`);
  check(
    'but is never visible to the employee',
    windows.every((w) => !w.isVisible()),
  );

  /* --------------------------- queue and disk ------------------------- */

  db.addRecording(row);
  db.enqueue({ id: `recording:${row.id}`, type: 'recording', payload: { id: row.id } });
  check(
    'it is queued for upload',
    db.peekOutbox(10).some((i) => i.type === 'recording' && i.payload.id === row.id),
  );

  check('and can be read back', db.getRecording(row.id)?.id === row.id);

  db.markRecordingUploaded(row.id);
  check('uploading marks it done', db.getRecording(row.id).uploaded === true);

  // Six uploaded clips, keeping five: the oldest should be handed back to delete.
  for (let i = 0; i < 5; i += 1) {
    db.addRecording({ ...row, id: `${row.id}-extra-${i}`, uploaded: true });
  }
  const drained = db.drainUploadedRecordings(5);
  check('old uploaded clips are dropped from disk', drained.length === 1, `${drained.length} to delete`);
  check('and five are kept', db.getRecording(`${row.id}-extra-0`) !== null);

  /* ------------------------------ stopping ---------------------------- */

  recorder.start('probe-session');
  recorder.stop();
  await new Promise((r) => setTimeout(r, 300));
  check(
    'stopping tears the hidden window down',
    BrowserWindow.getAllWindows().length === 0,
    `${BrowserWindow.getAllWindows().length} left`,
  );

  /* ------------------------------- cleanup ---------------------------- */

  recorder.remove(row);
  check('a clip can be deleted from disk', !fs.existsSync(row.filePath));

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
