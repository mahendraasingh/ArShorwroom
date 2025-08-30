const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopOverlay', {
  exit: () => ipcRenderer.send('desktop-exit'),
  setClickThrough: (ignore) => ipcRenderer.send('desktop-ignore-mouse', Boolean(ignore)),
  onClickThroughChanged: (cb) => {
    ipcRenderer.on('click-through-changed', (_event, value) => cb(Boolean(value)));
  },
});

