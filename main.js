const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow = null;

// Configura o autoUpdater para perguntar ao usuário antes de baixar
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  // Só verifica atualizações quando o aplicativo estiver empacotado (.exe instalado)
  if (!app.isPackaged) return;

  autoUpdater.on('update-available', async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Nova Atualização Disponível — Break Point Folder Organizer',
      message: `A versão ${info.version} do Break Point Folder Organizer está disponível!`,
      detail: 'Deseja baixar e instalar a atualização automaticamente agora?',
      buttons: ['Sim, Atualizar Agora', 'Mais Tarde'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Atualização Pronta para Instalar',
      message: `A versão ${info.version} foi baixada com sucesso.`,
      detail: 'O aplicativo será reiniciado agora para concluir a atualização.',
      buttons: ['Reiniciar e Atualizar Agora', 'Depois'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro no AutoUpdater:', err == null ? 'desconhecido' : (err.stack || err).toString());
  });

  // Verifica se há nova versão disponível no GitHub Releases
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
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    setupAutoUpdater();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
