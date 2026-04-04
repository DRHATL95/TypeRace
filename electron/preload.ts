import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  onNewRace: (callback: () => void) => ipcRenderer.on('new-race', callback),
  onRestartRace: (callback: () => void) => ipcRenderer.on('restart-race', callback),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
});
