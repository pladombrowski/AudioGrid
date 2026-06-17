const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onServerPort: (callback) => ipcRenderer.once('server-port', (_event, port) => callback(port)),
    onOpenShortcutModal: (callback) => ipcRenderer.on('open-shortcut-modal', () => callback()),
    saveShortcut: (shortcut) => ipcRenderer.send('save-shortcut', shortcut),
    onShortcutRegistered: (callback) => ipcRenderer.on('shortcut-registered', (_event, status, message) => callback(status, message))
});
