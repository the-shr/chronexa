'use strict';

const path = require('node:path');
const { BrowserWindow, screen, shell } = require('electron');

const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:5173';
const INDEX = path.join(__dirname, '..', '..', 'dist', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload.js');

let mainWindow = null;
let idleWindow = null;

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
function openIdleWindow() {
  if (idleWindow && !idleWindow.isDestroyed()) {
    idleWindow.show();
    idleWindow.focus();
    return idleWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
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
  load(idleWindow, 'idle');
  idleWindow.once('ready-to-show', () => {
    idleWindow.show();
    idleWindow.focus();
  });
  idleWindow.on('closed', () => {
    idleWindow = null;
  });

  return idleWindow;
}

function closeIdleWindow() {
  if (idleWindow && !idleWindow.isDestroyed()) idleWindow.close();
  idleWindow = null;
}

function broadcast(channel, payload) {
  for (const win of [mainWindow, idleWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

module.exports = {
  createMainWindow,
  openIdleWindow,
  closeIdleWindow,
  broadcast,
  getMainWindow: () => mainWindow,
  getIdleWindow: () => idleWindow,
};
