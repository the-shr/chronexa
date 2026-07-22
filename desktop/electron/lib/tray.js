'use strict';

const path = require('node:path');
const { Tray, Menu, nativeImage, app } = require('electron');

const ICON = path.join(__dirname, '..', 'assets', 'tray.png');

let tray = null;
let handlers = {};

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function create(callbacks) {
  handlers = callbacks;
  const image = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  image.setTemplateImage(process.platform === 'darwin');

  tray = new Tray(image);
  tray.setToolTip('TimeTracker');
  tray.on('click', () => handlers.onShow?.());
  return tray;
}

function update(snapshot) {
  if (!tray) return;

  const running = snapshot.state === 'running';
  const paused = snapshot.state === 'paused';
  const idle = snapshot.idlePhase !== 'active' && running;

  const label = running ? (idle ? 'Idle' : 'Tracking') : paused ? 'Paused' : 'Stopped';
  tray.setToolTip(`TimeTracker — ${label} · ${formatDuration(snapshot.todaySeconds)} today`);

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Today: ${formatDuration(snapshot.todaySeconds)}`, enabled: false },
      { label: `Status: ${label}`, enabled: false },
      { type: 'separator' },
      { label: 'Start tracking', enabled: !running, click: () => handlers.onStart?.() },
      { label: paused ? 'Resume' : 'Pause', enabled: running || paused, click: () => (paused ? handlers.onResume?.() : handlers.onPause?.()) },
      { label: 'Stop tracking', enabled: running || paused, click: () => handlers.onStop?.() },
      { type: 'separator' },
      { label: 'Take screenshot now', enabled: running, click: () => handlers.onCapture?.() },
      { label: 'Open TimeTracker', click: () => handlers.onShow?.() },
      { type: 'separator' },
      { label: 'Quit', click: () => handlers.onQuit?.() },
    ]),
  );
}

function destroy() {
  tray?.destroy();
  tray = null;
}

module.exports = { create, update, destroy, formatDuration };
