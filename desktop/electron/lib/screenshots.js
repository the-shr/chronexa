'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { desktopCapturer, screen } = require('electron');

const paths = require('./paths');
const settings = require('./settings');
const log = require('./log');

const THUMB_WIDTH = 320;

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayFolder(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Privacy mode: downscale hard, then scale back up. The detail is destroyed in
 * the round trip, so the result is genuinely unrecoverable rather than just
 * visually softened.
 */
function pixelate(image) {
  const { width, height } = image.getSize();
  const tiny = image.resize({ width: Math.max(16, Math.round(width / 24)), quality: 'good' });
  return tiny.resize({ width, height, quality: 'good' });
}

/**
 * Capture every screen (or just the primary) and write JPEGs to disk.
 * Returns metadata rows for the caller to persist -- this module never touches
 * the database itself.
 */
async function capture({ sessionId, activityPercent = null }) {
  const cfg = settings.get().screenshots;
  const displays = screen.getAllDisplays();

  // desktopCapturer applies one thumbnail size to every source, so ask for the
  // largest display and downscale each result individually afterwards.
  const request = displays.reduce(
    (acc, d) => ({
      width: Math.max(acc.width, Math.round(d.size.width * d.scaleFactor)),
      height: Math.max(acc.height, Math.round(d.size.height * d.scaleFactor)),
    }),
    { width: 1280, height: 720 },
  );

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: request,
    fetchWindowIcons: false,
  });

  if (!sources.length) throw new Error('No screen sources available');

  const chosen = cfg.allMonitors ? sources : sources.slice(0, 1);
  const capturedAt = new Date();
  const folder = paths.ensureDir(path.join(paths.screenshotDir(), dayFolder(capturedAt)));
  const thumbFolder = paths.ensureDir(path.join(folder, 'thumbs'));
  const stamp = capturedAt.toISOString().replace(/[:.]/g, '-');

  const rows = [];
  for (const [index, source] of chosen.entries()) {
    let image = source.thumbnail;
    if (image.isEmpty()) {
      log.warn('screenshot: empty frame for source', source.name);
      continue;
    }

    const { width } = image.getSize();
    if (width > cfg.maxWidth) image = image.resize({ width: cfg.maxWidth, quality: 'good' });
    if (cfg.blur) image = pixelate(image);

    const baseName = `${stamp}_m${index}`;
    const filePath = path.join(folder, `${baseName}.jpg`);
    const thumbPath = path.join(thumbFolder, `${baseName}.jpg`);

    fs.writeFileSync(filePath, image.toJPEG(cfg.quality));
    fs.writeFileSync(thumbPath, image.resize({ width: THUMB_WIDTH, quality: 'good' }).toJPEG(55));

    rows.push({
      id: `${stamp}_m${index}`,
      sessionId,
      capturedAt: capturedAt.toISOString(),
      monitorIndex: index,
      monitorLabel: source.name,
      filePath,
      thumbPath,
      width: image.getSize().width,
      height: image.getSize().height,
      bytes: fs.statSync(filePath).size,
      activityPercent,
      blurred: cfg.blur,
      uploaded: false,
    });
  }

  // No notification, ever. Capture has to be invisible to the employee, and a
  // toast announcing it is the one thing that cannot be. This used to be a
  // setting defaulting to on, which contradicted that outright; it is gone
  // rather than defaulted off, because a stored `true` in an existing install
  // would have survived a change of default.
  log.info('screenshot: captured', rows.length, 'image(s) for session', sessionId);
  return rows;
}

function remove(row) {
  for (const file of [row.filePath, row.thumbPath]) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

module.exports = { capture, remove };
