'use strict';
// Guscio desktop: avvia il server locale e apre una finestra sull'interfaccia.
// Per leggere i dischi grezzi l'app va eseguita da AMMINISTRATORE (vedi README).

const { app, BrowserWindow, shell, dialog } = require('electron');
const { server, PORT } = require('../src/server');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 840, minWidth: 720, minHeight: 600,
    title: 'Recupero Dati',
    backgroundColor: '#F5F5F7',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`http://127.0.0.1:${PORT}`);
  // i link esterni si aprono nel browser di sistema, non dentro l'app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  server.listen(PORT, '127.0.0.1', () => createWindow())
    .on('error', (e) => { dialog.showErrorBox('Recupero Dati', 'Impossibile avviare il server locale: ' + e.message); app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
