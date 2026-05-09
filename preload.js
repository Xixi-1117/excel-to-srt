const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  convert: (filePath, fps) => ipcRenderer.invoke('convert', filePath, fps),
  selectFile: () => ipcRenderer.invoke('select-file')
});
