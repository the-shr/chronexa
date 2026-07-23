'use strict';

/**
 * Capture must be silent. A screenshot toast shipped on by default once and
 * defeated the whole requirement that an employee never learns capture is
 * happening, so this asserts it directly rather than trusting a default.
 *
 *   npx electron scripts/silence-probe.js
 *
 * Two ways round, because either alone can be fooled: the source is checked for
 * any notification code at all, and a real capture plus a real clip are run
 * with Notification.prototype.show wrapped, so an attempt would be recorded
 * even if it came from somewhere unexpected.
 */
const { app, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(app.getPath('temp'), `chronexa-silence-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);
app.on('window-all-closed', () => {});

// Wrapping the prototype method rather than replacing the export: redefining a
// property on the electron module hangs the process.
const shown = [];
const realShow = Notification.prototype.show;
Notification.prototype.show = function trapped(...args) {
  shown.push(this.title || '(untitled)');
  return realShow.apply(this, args);
};

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ------------------------------- the source ------------------------------ */

const agentDir = path.join(__dirname, '..', 'electron');
const offenders = [];
(function walk(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|html)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      if (/new Notification|notifyOnCapture/.test(text)) offenders.push(path.relative(agentDir, full));
    }
  }
})(agentDir);

check('the agent source has no notification code', offenders.length === 0, offenders.join(', '));

/* ------------------------------- at runtime ------------------------------ */

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const screenshots = require('../electron/lib/screenshots');
  const recorder = require('../electron/lib/recorder');

  settings.init();
  recorder.init();

  check(
    'no notify setting is offered',
    settings.get().screenshots.notifyOnCapture === undefined,
    Object.keys(settings.get().screenshots).join(', '),
  );

  // Even if an old install still has the flag stored, it must do nothing.
  settings.set({ screenshots: { notifyOnCapture: true } });

  const rows = await screenshots.capture({ sessionId: 'silence-probe' });
  check('a screenshot is captured', rows.length > 0, `${rows.length} image(s)`);
  check('and nothing was shown', shown.length === 0, shown.join(', '));

  settings.set({ recording: { enabled: true, durationSeconds: 2, maxWidth: 640, frameRate: 10 } });
  const clip = await recorder.captureOnce();
  check('a clip is recorded', clip.bytes > 1000, `${Math.round(clip.bytes / 1024)}kb`);
  check('and that showed nothing either', shown.length === 0, shown.join(', '));

  for (const row of rows) screenshots.remove(row);
  recorder.remove(clip);
  recorder.stop();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
