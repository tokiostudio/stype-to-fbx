const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  parseXmlInfo: (filePath) => ipcRenderer.invoke('parse-xml-info', filePath),
  convertToFbx: (params) => ipcRenderer.invoke('convert-to-fbx', params),
  savePresetFile: (json) => ipcRenderer.invoke('save-preset-file', json),
  loadPresetFile: () => ipcRenderer.invoke('load-preset-file'),
  // Get native file path from a dropped File object (Electron security bridge)
  getFilePath: (file) => webUtils.getPathForFile(file),
});
