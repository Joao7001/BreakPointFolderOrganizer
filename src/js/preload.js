const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bpUpdater", {
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("updater:update-available", (_event, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on("updater:download-progress", (_event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("updater:update-downloaded", (_event, data) => callback(data));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on("updater:error", (_event, data) => callback(data));
  },
  startDownload: () => ipcRenderer.send("updater:start-download"),
  quitAndInstall: () => ipcRenderer.send("updater:quit-and-install")
});
