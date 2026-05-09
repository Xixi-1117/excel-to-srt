const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  convert: (filePath, fps) => ipcRenderer.invoke('convert', filePath, fps),
  selectFile: () => ipcRenderer.invoke('select-file'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      return null;
    }
  }
});
