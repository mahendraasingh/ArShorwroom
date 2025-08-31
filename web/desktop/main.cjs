const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('node:path');

const TARGET_URL = process.env.SHOWROOM_URL || 'http://127.0.0.1:3000/?desktop=1';
let mainWin = null;
let clickThrough = false;

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  mainWin = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWin.setAlwaysOnTop(true, 'screen-saver');
  mainWin.loadURL(TARGET_URL);

  mainWin.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.loadURL(TARGET_URL);
      }
    }, 1000);
  });

  mainWin.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      app.quit();
    }
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

app.whenReady().then(() => {
  createOverlayWindow();

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit();
  });

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    clickThrough = !clickThrough;
    mainWin.setIgnoreMouseEvents(clickThrough, { forward: true });
    mainWin.webContents.send('click-through-changed', clickThrough);
  });
});

ipcMain.on('desktop-exit', () => {
  app.quit();
});

ipcMain.on('desktop-ignore-mouse', (_event, ignore) => {
  if (!mainWin || mainWin.isDestroyed()) return;
  clickThrough = Boolean(ignore);
  mainWin.setIgnoreMouseEvents(clickThrough, { forward: true });
  mainWin.webContents.send('click-through-changed', clickThrough);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
