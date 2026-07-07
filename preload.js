const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {
  getGuilds: () => ipcRenderer.invoke('get-guilds'),
  getSounds: (gid) => ipcRenderer.invoke('get-sounds', gid),
  getCategories: (gid) => ipcRenderer.invoke('get-categories', gid),
  uploadSound: (gid, cat) => ipcRenderer.invoke('upload-sound', gid, cat),
  uploadSoundFiles: (gid, cat, paths) => ipcRenderer.invoke('upload-sound-files', gid, cat, paths),
  deleteSound: (fp) => ipcRenderer.invoke('delete-sound', fp),
  renameSound: (oldp, newn) => ipcRenderer.invoke('rename-sound', oldp, newn),

  createCategory: (gid, name) => ipcRenderer.invoke('create-category', gid, name),
  renameCategory: (gid, oldName, newName) => ipcRenderer.invoke('rename-category', gid, oldName, newName),
  deleteCategory: (gid, name) => ipcRenderer.invoke('delete-category', gid, name),

  getVolume: (fp) => ipcRenderer.invoke('get-volume', fp),
  setVolume: (fp, v) => ipcRenderer.invoke('set-volume', fp, v),

  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (u) => ipcRenderer.invoke('set-config', u),
  getSoundsDir: () => ipcRenderer.invoke('get-sounds-dir'),
  readSoundFile: (fp) => ipcRenderer.invoke('read-sound-file', fp),

  getHotkeys: () => ipcRenderer.invoke('get-hotkeys'),
  setHotkey: (fp, combo) => ipcRenderer.invoke('set-hotkey', fp, combo),
  removeHotkey: (fp) => ipcRenderer.invoke('remove-hotkey', fp),
  exportHotkeys: () => ipcRenderer.invoke('export-hotkeys'),
  importHotkeys: () => ipcRenderer.invoke('import-hotkeys'),

  getPlaycount: (fp) => ipcRenderer.invoke('get-playcount', fp),
  incrementPlaycount: (fp) => ipcRenderer.invoke('increment-playcount', fp),

  moveSound: (fp, newCat) => ipcRenderer.invoke('move-sound', fp, newCat),
  getCategorySoundsCount: (gid) => ipcRenderer.invoke('get-category-sounds-count', gid),
  showContextMenu: (fp, name) => ipcRenderer.invoke('show-context-menu', fp, name),

  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  toggleFavorite: (fp) => ipcRenderer.invoke('toggle-favorite', fp),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  on: (ch, fn) => {
    const valid = [
      'menu-upload', 'menu-refresh', 'menu-search',
      'ctx-rename', 'ctx-delete', 'ctx-play', 'ctx-hotkey', 'ctx-add-queue', 'ctx-toggle-fav',
      'hotkey-triggered', 'update-status',
    ];
    if (valid.includes(ch)) ipcRenderer.on(ch, (_, ...a) => fn(...a));
  },
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),
});
