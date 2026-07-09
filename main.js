const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

function findSoundsDir() {
  const candidates = [
    path.resolve(__dirname, '..', 'soundboard-bot', 'sounds'),
    path.resolve(process.cwd(), '..', 'soundboard-bot', 'sounds'),
    path.resolve(path.dirname(app.getPath('exe')), '..', '..', '..', 'soundboard-bot', 'sounds'),
    path.join(app.getPath('documents'), 'ReSound', 'sounds'),
  ];
  for (const d of candidates) {
    try { if (fs.statSync(d)?.isDirectory()) return d; } catch {}
  }
  const dir = candidates[0];
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
const SOUNDS_DIR = findSoundsDir();
const VOLUMES_FILE = path.join(__dirname, 'volumes.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const HOTKEYS_FILE = path.join(__dirname, 'hotkeys.json');
const PLAYCOUNTS_FILE = path.join(__dirname, 'playcounts.json');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');
const DEFAULT_CAT = '\u0639\u0627\u0645';

if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR, { recursive: true });

let config = { lastGuild: null, windowBounds: { width: 1100, height: 750 }, audioDeviceId1: null, audioDeviceId2: null, minimizeToTray: true };
try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}

let volumes = {};
try { volumes = JSON.parse(fs.readFileSync(VOLUMES_FILE, 'utf8')); } catch {}

let hotkeys = {};
try { hotkeys = JSON.parse(fs.readFileSync(HOTKEYS_FILE, 'utf8')); } catch {}

let playcounts = {};
try { playcounts = JSON.parse(fs.readFileSync(PLAYCOUNTS_FILE, 'utf8')); } catch {}

let favorites = {};
try { favorites = JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8')); } catch {}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function comboToElectron(combo) {
  return combo.replace(/\bCtrl\b/g, 'CommandOrControl');
}

function registerAllHotkeys() {
  globalShortcut.unregisterAll();
  for (const [fp, combo] of Object.entries(hotkeys)) {
    try {
      globalShortcut.register(comboToElectron(combo), () => {
        if (win && !win.isDestroyed()) win.webContents.send('hotkey-triggered', fp);
      });
    } catch {}
  }
}

function getGuilds() {
  if (!fs.existsSync(SOUNDS_DIR)) return [];
  return fs.readdirSync(SOUNDS_DIR).filter(d =>
    fs.statSync(path.join(SOUNDS_DIR, d), { throwIfNoEntry: false })?.isDirectory()
  );
}

function getSounds(guildId) {
  const dir = path.join(SOUNDS_DIR, guildId);
  if (!fs.existsSync(dir)) return [];
  const sounds = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const catDir = path.join(dir, entry.name);
      for (const f of fs.readdirSync(catDir)) {
        const fp = path.join(catDir, f);
        try {
          const stat = fs.statSync(fp);
          if (stat.isFile()) sounds.push({
            name: path.parse(f).name,
            filePath: fp,
            category: entry.name,
            ext: path.extname(f),
            size: stat.size,
            mtime: stat.mtimeMs,
          });
        } catch {}
      }
    } else if (entry.isFile()) {
      const fp = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(fp);
        sounds.push({
          name: path.parse(entry.name).name,
          filePath: fp,
          category: DEFAULT_CAT,
          ext: path.extname(entry.name),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {}
    }
  }
  sounds.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return sounds;
}

function getCategories(guildId) {
  const dir = path.join(SOUNDS_DIR, guildId);
  if (!fs.existsSync(dir)) return [];
  const cats = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) cats.push(entry.name);
  }
  if (cats.length === 0) cats.push(DEFAULT_CAT);
  return cats;
}

let win, tray;

function createWindow() {
  const bounds = config.windowBounds;
  win = new BrowserWindow({
    width: bounds.width, height: bounds.height,
    minWidth: 700, minHeight: 500,
    title: 'ReSound',
    backgroundColor: '#11111b',
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (!(config.startMinimized && config.minimizeToTray)) win.show();
  });

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') callback(true);
    else callback(false);
  });

  win.on('resize', () => {
    if (!win.isMaximized() && !win.isMinimized()) {
      config.windowBounds = win.getBounds();
      saveJSON(CONFIG_FILE, config);
    }
  });

  win.on('close', (e) => {
    if (config.minimizeToTray && tray) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => { win = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('ReSound');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { if (win) { win.show(); win.focus(); } } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { if (win) { win.show(); win.focus(); } });
}

// ========== Auto Update ==========
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(status, data) {
  if (win && !win.isDestroyed()) win.webContents.send('update-status', status, data);
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', info);
});
autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
autoUpdater.on('error', (err) => sendUpdateStatus('error', err.message));
autoUpdater.on('download-progress', (p) => sendUpdateStatus('progress', p.percent.toFixed(1)));
autoUpdater.on('update-downloaded', () => sendUpdateStatus('downloaded'));

ipcMain.handle('check-for-updates', () => {
  try { autoUpdater.checkForUpdates(); } catch (e) { sendUpdateStatus('error', e.message); }
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// ========== App Lifecycle ==========
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();
  registerAllHotkeys();
  // Check for updates after a short delay so window is ready
  setTimeout(() => {
    try { autoUpdater.checkForUpdates(); } catch {}
  }, 3000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (win) { win.show(); win.focus(); }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => { app.isQuitting = true; });

ipcMain.handle('get-guilds', () => getGuilds());
ipcMain.handle('get-sounds', (_, gid) => {
  const safeGid = path.basename(gid ? gid.replace(/[^a-zA-Z0-9_]/g, '') : '');
  if (!safeGid) return [];
  return getSounds(safeGid);
});
ipcMain.handle('get-categories', (_, gid) => {
  const safeGid = path.basename(gid ? gid.replace(/[^a-zA-Z0-9_]/g, '') : '');
  if (!safeGid) return [];
  return getCategories(safeGid);
});

ipcMain.handle('upload-sound', async (_, gid, category) => {
  const safeGid = path.basename(gid.replace(/[^a-zA-Z0-9_]/g, ''));
  if (!safeGid) return { error: 'invalid_guild' };
  const safeCat = category ? category.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40) : DEFAULT_CAT;
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'webm', 'opus'] }],
  });
  if (result.canceled) return { cancelled: true };
  const uploaded = [];
  for (const src of result.filePaths) {
    const clean = path.parse(src).name.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 80) || 'sound';
    const catDir = path.join(SOUNDS_DIR, safeGid, safeCat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    const dest = path.join(catDir, clean + path.extname(src));
    if (fs.existsSync(dest)) { uploaded.push({ name: clean, status: 'exists' }); continue; }
    try { fs.copyFileSync(src, dest); uploaded.push({ name: clean, status: 'ok' }); }
    catch (e) { uploaded.push({ name: clean, status: 'error', error: e.message }); }
  }
  return { uploaded };
});

ipcMain.handle('upload-sound-files', (_, gid, category, filePaths) => {
  if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) return { uploaded: [] };
  const safeGid = path.basename(gid.replace(/[^a-zA-Z0-9_]/g, ''));
  if (!safeGid) return { error: 'invalid_guild' };
  const safeCat = category ? category.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40) : DEFAULT_CAT;
  const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm', '.opus'];
  const uploaded = [];
  for (const src of filePaths) {
    if (!src || typeof src !== 'string') continue;
    const resolved = path.resolve(src);
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) continue;
    } catch { continue; }
    const ext = path.extname(resolved).toLowerCase();
    if (!AUDIO_EXTS.includes(ext)) continue;
    const clean = path.parse(resolved).name.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 80) || 'sound';
    const catDir = path.join(SOUNDS_DIR, safeGid, safeCat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    const dest = path.join(catDir, clean + ext);
    if (fs.existsSync(dest)) { uploaded.push({ name: clean, status: 'exists' }); continue; }
    try { fs.copyFileSync(resolved, dest); uploaded.push({ name: clean, status: 'ok' }); }
    catch (e) { uploaded.push({ name: clean, status: 'error', error: e.message }); }
  }
  return { uploaded };
});

ipcMain.handle('delete-sound', (_, fp) => {
  const resolved = path.resolve(fp);
  if (!resolved.startsWith(SOUNDS_DIR)) return { error: 'Forbidden' };
  try { fs.unlinkSync(resolved); return { success: true }; } catch (e) { return { error: e.message }; }
});

ipcMain.handle('rename-sound', (_, oldPath, newName) => {
  const resolved = path.resolve(oldPath);
  if (!resolved.startsWith(SOUNDS_DIR)) return { error: 'Forbidden' };
  const clean = newName.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 80);
  if (!clean) return { error: 'invalid_name' };
  const ext = path.extname(resolved);
  const newPath = path.join(path.dirname(resolved), clean + ext);
  if (fs.existsSync(newPath)) return { error: 'exists' };
  try { fs.renameSync(resolved, newPath); return { success: true, name: clean }; } catch (e) { return { error: e.message }; }
});

ipcMain.handle('create-category', (_, gid, name) => {
  const safeGid = path.basename(gid.replace(/[^a-zA-Z0-9_]/g, ''));
  const clean = name.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40);
  if (!safeGid || !clean) return { error: 'invalid' };
  const catDir = path.join(SOUNDS_DIR, safeGid, clean);
  try { fs.mkdirSync(catDir, { recursive: true }); return { success: true, name: clean }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('rename-category', (_, gid, oldName, newName) => {
  const safeGid = path.basename(gid.replace(/[^a-zA-Z0-9_]/g, ''));
  const safeOld = oldName.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40);
  const clean = newName.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40);
  if (!safeGid || !safeOld || !clean) return { error: 'invalid' };
  const src = path.join(SOUNDS_DIR, safeGid, safeOld);
  const dst = path.join(SOUNDS_DIR, safeGid, clean);
  if (!fs.existsSync(src)) return { error: 'not_found' };
  if (fs.existsSync(dst)) return { error: 'exists' };
  try { fs.renameSync(src, dst); return { success: true, name: clean }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('delete-category', (_, gid, name) => {
  const safeGid = path.basename(gid.replace(/[^a-zA-Z0-9_]/g, ''));
  const safeName = name.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40);
  if (!safeGid || !safeName) return { error: 'invalid' };
  const catDir = path.join(SOUNDS_DIR, safeGid, safeName);
  if (!fs.existsSync(catDir) || !fs.statSync(catDir).isDirectory()) return { error: 'not_found' };
  try { fs.rmSync(catDir, { recursive: true, force: true }); return { success: true }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('get-volume', (_, fp) => volumes[fp] != null ? volumes[fp] : 100);

ipcMain.handle('set-volume', (_, fp, v) => {
  volumes[fp] = Math.max(0, Math.min(100, Math.round(v)));
  saveJSON(VOLUMES_FILE, volumes);
});

ipcMain.handle('get-config', () => ({
  lastGuild: config.lastGuild,
  audioDeviceId1: config.audioDeviceId1,
  audioDeviceId2: config.audioDeviceId2,
  minimizeToTray: config.minimizeToTray !== false,
  gridDensity: config.gridDensity || 'medium',
  lightTheme: config.lightTheme || false,
  startMinimized: config.startMinimized || false,
}));

const ALLOWED_CONFIG_KEYS = ['lastGuild', 'audioDeviceId1', 'audioDeviceId2', 'minimizeToTray', 'gridDensity', 'lightTheme', 'startMinimized'];
ipcMain.handle('set-config', (_, u) => {
  for (const k of ALLOWED_CONFIG_KEYS) {
    if (u[k] !== undefined) config[k] = u[k];
  }
  saveJSON(CONFIG_FILE, config);
  if (u.minimizeToTray !== undefined && u.minimizeToTray === false && tray) {
    tray.destroy();
    tray = null;
  } else if (u.minimizeToTray && !tray) {
    createTray();
  }
});

ipcMain.handle('get-hotkeys', () => ({ ...hotkeys }));

ipcMain.handle('set-hotkey', (_, fp, combo) => {
  if (!combo || !/^((Ctrl|Shift|Alt)\+){0,2}(F\d{1,2}|[0-9]|[A-Z])$/.test(combo)) return { error: 'invalid_combo' };
  const resolved = path.resolve(fp);
  if (!resolved.startsWith(SOUNDS_DIR)) return { error: 'Forbidden' };
  for (const [otherFp, otherCombo] of Object.entries(hotkeys)) {
    if (otherFp !== fp && otherCombo === combo) return { error: 'conflict' };
  }
  hotkeys[fp] = combo;
  saveJSON(HOTKEYS_FILE, hotkeys);
  registerAllHotkeys();
  return { success: true, combo };
});

ipcMain.handle('remove-hotkey', (_, fp) => {
  delete hotkeys[fp];
  saveJSON(HOTKEYS_FILE, hotkeys);
  registerAllHotkeys();
  return { success: true };
});

ipcMain.handle('export-hotkeys', async () => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export Hotkeys',
    defaultPath: 'soundboard-hotkeys.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled) return { cancelled: true };
  try { fs.writeFileSync(r.filePath, JSON.stringify(hotkeys, null, 2)); return { success: true }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('import-hotkeys', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Import Hotkeys',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled) return { cancelled: true };
  try {
    const imported = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    let count = 0;
    for (const [fp, combo] of Object.entries(imported)) {
      const resolved = path.resolve(fp);
      if (resolved.startsWith(SOUNDS_DIR) && /^((Ctrl|Shift|Alt)\+){0,2}(F\d{1,2}|[0-9]|[A-Z])$/.test(combo)) {
        hotkeys[fp] = combo;
        count++;
      }
    }
    saveJSON(HOTKEYS_FILE, hotkeys);
    registerAllHotkeys();
    return { success: true, count };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('get-playcount', (_, fp) => playcounts[fp] || 0);

ipcMain.handle('increment-playcount', (_, fp) => {
  playcounts[fp] = (playcounts[fp] || 0) + 1;
  saveJSON(PLAYCOUNTS_FILE, playcounts);
  return playcounts[fp];
});

ipcMain.handle('get-sounds-dir', () => SOUNDS_DIR);

ipcMain.handle('read-sound-file', (_, fp) => {
  const resolved = path.resolve(fp);
  if (!resolved.startsWith(SOUNDS_DIR)) throw new Error('Forbidden');
  return fs.readFileSync(resolved);
});

ipcMain.handle('move-sound', (_, fp, newCategory) => {
  const resolved = path.resolve(fp);
  if (!resolved.startsWith(SOUNDS_DIR)) return { error: 'Forbidden' };
  const safeCat = newCategory.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 40);
  if (!safeCat) return { error: 'invalid_category' };
  const oldDir = path.dirname(resolved);
  const guildDir = path.dirname(oldDir);
  const newDir = path.join(guildDir, safeCat);
  if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
  const dest = path.join(newDir, path.basename(resolved));
  if (fs.existsSync(dest)) return { error: 'exists' };
  try {
    fs.renameSync(resolved, dest);
    if (hotkeys[fp]) {
      hotkeys[dest] = hotkeys[fp];
      delete hotkeys[fp];
      saveJSON(HOTKEYS_FILE, hotkeys);
      registerAllHotkeys();
    }
    if (favorites[fp]) {
      favorites[dest] = true;
      delete favorites[fp];
      saveJSON(FAVORITES_FILE, favorites);
    }
    if (volumes[fp] != null) {
      volumes[dest] = volumes[fp];
      delete volumes[fp];
      saveJSON(VOLUMES_FILE, volumes);
    }
    if (playcounts[fp] != null) {
      playcounts[dest] = playcounts[fp];
      delete playcounts[fp];
      saveJSON(PLAYCOUNTS_FILE, playcounts);
    }
    return { success: true, newPath: dest };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('get-category-sounds-count', (_, gid) => {
  const safeGid = path.basename(gid.replace(/[^a-zA-Z0-9_]/g, ''));
  const dir = path.join(SOUNDS_DIR, safeGid);
  if (!fs.existsSync(dir)) return {};
  const counts = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const catDir = path.join(dir, entry.name);
      try { counts[entry.name] = fs.readdirSync(catDir).length; } catch { counts[entry.name] = 0; }
    }
  }
  return counts;
});

ipcMain.handle('get-favorites', () => ({ ...favorites }));

ipcMain.handle('toggle-favorite', (_, fp) => {
  const resolved = path.resolve(fp);
  if (!resolved.startsWith(SOUNDS_DIR)) return { error: 'Forbidden' };
  const isFav = !!favorites[fp];
  if (isFav) delete favorites[fp];
  else favorites[fp] = true;
  saveJSON(FAVORITES_FILE, favorites);
  return { favorited: !isFav };
});

ipcMain.handle('show-context-menu', (event, filePath, name) => {
  const isFav = !!favorites[filePath];
  const ctxMenu = Menu.buildFromTemplate([
    { label: 'Play', click: () => event.sender.send('ctx-play', filePath) },
    { label: 'Add to Queue', click: () => event.sender.send('ctx-add-queue', filePath) },
    { type: 'separator' },
    { label: (isFav ? 'Unfavorite' : 'Favorite'), click: () => event.sender.send('ctx-toggle-fav', filePath) },
    { type: 'separator' },
    { label: 'Rename', click: () => event.sender.send('ctx-rename', filePath, name) },
    { label: 'Delete', click: () => event.sender.send('ctx-delete', filePath) },
    { type: 'separator' },
    { label: 'Hotkey...', click: () => event.sender.send('ctx-hotkey', filePath, name) },
  ]);
  ctxMenu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});
