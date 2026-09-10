const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  winMinimize: () => ipcRenderer.invoke('window:minimize'),
  winToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  winClose: () => ipcRenderer.invoke('window:close'),
  getManifest: () => ipcRenderer.invoke('store:getManifest'),
  saveProject: (p) => ipcRenderer.invoke('store:saveProject', p),
  loadProject: (id) => ipcRenderer.invoke('store:loadProject', id),
  deleteProject: (id) => ipcRenderer.invoke('store:deleteProject', id),
  importDetail: (pid, vid, filePath) => ipcRenderer.invoke('image:importDetail', pid, vid, filePath),
  importDetailAppend: (pid, vid, filePath) => ipcRenderer.invoke('image:importDetailAppend', pid, vid, filePath),
  saveDetailBuffer: (pid, vid, b64) => ipcRenderer.invoke('image:saveDetailBuffer', pid, vid, b64),
  importDetailFromClipboard: (pid, vid) => ipcRenderer.invoke('image:importDetailFromClipboard', pid, vid),
  pickImage: () => ipcRenderer.invoke('image:pick'),
  importRef: (pid, vid, filePath, name) => ipcRenderer.invoke('image:importRef', pid, vid, filePath, name),
  saveRefBuffer: (pid, vid, name, b64) => ipcRenderer.invoke('image:saveRefBuffer', pid, vid, name, b64),
  readDataUrl: (p) => ipcRenderer.invoke('image:readDataUrl', p),
  deleteFile: (p) => ipcRenderer.invoke('image:deleteFile', p),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload)
});
