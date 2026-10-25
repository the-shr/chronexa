'use strict';

const path = require('node:path');
const { BrowserWindow, screen, shell } = require('electron');

const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:5173';
const INDEX = path.join(__dirname, '..', '..', 'dist', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload.js');

let mainWindow = null;
let idleWindow = null;
let overlayWindow = null;
let overlayPosition = null;
let overlayExpanded = false, overlayHidden = false, overlayLastState = 'stopped', overlayLastSession = null, overlayDrag = null;
let overlayCompactSize = { width: 158, height: 54 };
const settings = require('./settings');

function load(win, view) {
  if (isDev) return win.loadURL(view ? `${DEV_URL}/?view=${view}` : DEV_URL);
  return win.loadFile(INDEX, view ? { query: { view } } : undefined);
}

function createMainWindow({ onCloseRequest }) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    // The dashboard is a four-column grid; this is the width where all four
    // columns are comfortable. It sheds columns down to minWidth, below which
    // the cards would be too narrow to read.
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  load(mainWindow, null);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (event) => {
    if (onCloseRequest?.(event) === 'hide') {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  return mainWindow;
}

/**
 * The idle warning deliberately steals focus and sits above everything: if the
 * employee is at the machine they must see it, otherwise the tracker stops.
 */
function raiseIdleWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  if (win.isMinimized()) win.restore();
  win.show();
  win.moveTop();
  win.focus();
  win.flashFrame(true);
}

function openIdleWindow(view = 'idle') {
  if (idleWindow && !idleWindow.isDestroyed()) {
    raiseIdleWindow(idleWindow);
    return idleWindow;
  }

  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = 420;
  const height = 290;

  idleWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height * 0.18),
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#161a22',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  idleWindow.setAlwaysOnTop(true, 'screen-saver');
  idleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  load(idleWindow, view);
  const warningWindow = idleWindow;
  const retries = new Set();
  idleWindow.once('ready-to-show', () => {
    raiseIdleWindow(warningWindow);
    // Windows can reject the first foreground request during app switching.
    for (const delay of [350, 1200]) {
      const timer = setTimeout(() => { retries.delete(timer); raiseIdleWindow(warningWindow); }, delay);
      retries.add(timer);
    }
  });
  idleWindow.on('focus', () => warningWindow.flashFrame(false));
  idleWindow.on('closed', () => {
    for (const timer of retries) clearTimeout(timer);
    idleWindow = null;
  });

  return idleWindow;
}

function closeIdleWindow() {
  if (idleWindow && !idleWindow.isDestroyed()) idleWindow.close();
  idleWindow = null;
}

function broadcast(channel, payload) {
  for (const win of [mainWindow, idleWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function setOverlayExpanded(expanded) {
  overlayExpanded = Boolean(expanded);
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const bounds = overlayWindow.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(area.width, overlayCompactSize.width + (overlayExpanded ? 138 : 0)), height = Math.max(overlayCompactSize.height, overlayExpanded ? 58 : 44);
  overlayWindow.setBounds({ x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
  overlayWindow.webContents.send('overlay:expanded', overlayExpanded);
  if (overlayExpanded) overlayWindow.focus();
}
function hideOverlay() { overlayHidden = true; setOverlayExpanded(false); if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide(); }
function dragOverlay(phase) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (phase === 'start') overlayDrag = { cursor: screen.getCursorScreenPoint(), bounds: overlayWindow.getBounds() };
  if (phase === 'end') { overlayDrag = null; return; }
  if (phase !== 'move' || !overlayDrag) return;
  const cursor = screen.getCursorScreenPoint(), area = screen.getDisplayNearestPoint(cursor).workArea, bounds = overlayWindow.getBounds();
  overlayWindow.setPosition(Math.round(Math.max(area.x, Math.min(overlayDrag.bounds.x + cursor.x - overlayDrag.cursor.x, area.x + area.width - bounds.width))), Math.round(Math.max(area.y, Math.min(overlayDrag.bounds.y + cursor.y - overlayDrag.cursor.y, area.y + area.height - bounds.height))));
}
function updateOverlay(snapshot) {
  const sessionId = snapshot.session?.id || null;
  const freshPlay = snapshot.state === 'running' && (overlayLastState !== 'running' || sessionId !== overlayLastSession);
  overlayLastState = snapshot.state; overlayLastSession = sessionId;
  if (freshPlay) { overlayHidden = false; setOverlayExpanded(false); if (!settings.get().general.timerOverlayVisible) settings.set({ general: { timerOverlayVisible: true } }); }
  if (overlayHidden || !settings.get().general.timerOverlayVisible || !['running', 'paused'].includes(snapshot.state)) { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide(); return; }
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    const area = screen.getPrimaryDisplay().workArea, saved = overlayPosition || { x: area.x + area.width - 190, y: area.y + 30 }, display = screen.getDisplayNearestPoint(saved).workArea;
    overlayWindow = new BrowserWindow({ width: overlayCompactSize.width, height: overlayCompactSize.height, minWidth: 130, minHeight: 44, maxWidth: 650, maxHeight: 100,
      x: Math.max(display.x, Math.min(saved.x, display.x + display.width - overlayCompactSize.width)), y: Math.max(display.y, Math.min(saved.y, display.y + display.height - overlayCompactSize.height)),
      frame: false, transparent: true, resizable: true, movable: true, skipTaskbar: true, alwaysOnTop: true, show: false, focusable: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    overlayWindow.setOpacity(0.9); overlayWindow.setAlwaysOnTop(true, 'floating');
    overlayWindow.on('moved', () => { const [x,y] = overlayWindow.getPosition(); overlayPosition = {x,y}; });
    overlayWindow.on('resized', () => { if (!overlayExpanded) { const [width,height] = overlayWindow.getSize(); overlayCompactSize = {width,height}; } });
    overlayWindow.on('blur', () => setOverlayExpanded(false));
    overlayWindow.on('closed', () => { overlayWindow = null; overlayExpanded = false; });
    overlayWindow.once('ready-to-show', () => updateOverlay(require('./tracker').snapshot())); load(overlayWindow, 'overlay');
  } else overlayWindow.showInactive();
}

module.exports = {
  updateOverlay,
  setOverlayExpanded,
  hideOverlay,
  dragOverlay,
  getOverlayWindow: () => overlayWindow,
  createMainWindow,
  openIdleWindow,
  closeIdleWindow,
  broadcast,
  getMainWindow: () => mainWindow,
  getIdleWindow: () => idleWindow,
};
