const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow = null;

// Configura o autoUpdater para perguntar ao usuário antes de baixar
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdaterEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdater() {
  // Só verifica atualizações quando o aplicativo estiver empacotado (.exe instalado)
  if (!app.isPackaged) return;

  autoUpdater.on('update-available', (info) => {
    sendUpdaterEvent('updater:update-available', {
      version: info.version,
      releaseDate: info.releaseDate || null
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdaterEvent('updater:download-progress', {
      percent: Math.round(progressObj.percent || 0),
      transferred: progressObj.transferred || 0,
      total: progressObj.total || 0,
      bytesPerSecond: progressObj.bytesPerSecond || 0
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterEvent('updater:update-downloaded', {
      version: info.version
    });
  });

  autoUpdater.on('error', (err) => {
    const msg = err == null ? 'Erro desconhecido' : (err.message || err.toString());
    console.error('Erro no AutoUpdater:', msg);
    sendUpdaterEvent('updater:error', { message: msg });
  });

  ipcMain.on('updater:start-download', () => {
    autoUpdater.downloadUpdate().catch((err) => {
      console.error('Erro ao baixar atualização:', err);
    });
  });

  ipcMain.on('updater:quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Verifica se há nova versão disponível no GitHub Releases assim que a página terminar de carregar
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Falha ao buscar atualizações:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Break Point Folder Organizer",
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'js', 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.once('did-finish-load', () => {
    setupAutoUpdater();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
