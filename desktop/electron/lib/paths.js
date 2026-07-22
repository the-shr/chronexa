'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

/**
 * All user data lives under Electron's per-user appData folder, e.g.
 *   Windows: %APPDATA%/TimeTracker
 *   macOS:   ~/Library/Application Support/TimeTracker
 *   Linux:   ~/.config/TimeTracker
 */
function root() {
  return app.getPath('userData');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const paths = {
  root,
  settingsFile: () => path.join(root(), 'settings.json'),
  authFile: () => path.join(root(), 'auth.json'),
  sessionsFile: () => path.join(root(), 'sessions.json'),
  screenshotsFile: () => path.join(root(), 'screenshots.json'),
  outboxFile: () => path.join(root(), 'outbox.json'),
  screenshotDir: () => ensureDir(path.join(root(), 'screenshots')),
  thumbDir: () => ensureDir(path.join(root(), 'screenshots', 'thumbs')),
  logFile: () => path.join(root(), 'timetracker.log'),
  ensureDir,
};

module.exports = paths;
