const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audioCtx2 = new (window.AudioContext || window.webkitAudioContext)();
let currentSource = null, currentGain = null;
let currentSource2 = null, currentGain2 = null;
let dev1 = 'default', dev2 = null;

async function resumeAudio() {
  for (const ctx of [audioCtx, audioCtx2]) {
    if (ctx.state === 'suspended') await ctx.resume();
  }
  try { if (audioCtx.setSinkId && dev1 !== 'default') await audioCtx.setSinkId(dev1); } catch {}
  try { if (audioCtx2.setSinkId && dev2 && dev2 !== 'default') await audioCtx2.setSinkId(dev2); } catch {}
}

async function setAudioDevice(idx, deviceId) {
  const ctx = idx === 1 ? audioCtx : audioCtx2;
  if (!ctx.setSinkId) { toast('Audio output selection not supported', 'error'); return false; }
  try {
    await ctx.setSinkId(deviceId);
    if (idx === 1) { dev1 = deviceId; await window.sb.setConfig({ audioDeviceId1: deviceId }); }
    else { dev2 = deviceId; await window.sb.setConfig({ audioDeviceId2: deviceId }); }
    return true;
  } catch (e) {
    toast('Failed to set audio device: ' + e.message, 'error');
    return false;
  }
}

let perSoundVolumes = Object.create(null);

async function getEffectiveVolume(fp) {
  if (perSoundVolumes[fp] != null) return perSoundVolumes[fp];
  return state.volume;
}

async function playSound(filePath, volume) {
  try {
    await resumeAudio();
    stopSound();

    const raw = await window.sb.readSoundFile(filePath);
    if (!raw) throw new Error('File not found');
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const [audioBuf, audioBuf2] = await Promise.all([
      audioCtx.decodeAudioData(ab.slice(0)),
      dev2 ? audioCtx2.decodeAudioData(ab.slice(0)) : null,
    ]);

    const vol = volume ?? await getEffectiveVolume(filePath);
    const s1 = audioCtx.createBufferSource();
    s1.buffer = audioBuf;
    const g1 = audioCtx.createGain();
    g1.gain.value = (vol ?? 100) / 100;
    s1.connect(g1); g1.connect(audioCtx.destination);
    s1.start(0);
    currentSource = s1; currentGain = g1;

    let s2 = null;
    if (dev2 && audioBuf2) {
      s2 = audioCtx2.createBufferSource();
      s2.buffer = audioBuf2;
      const g2 = audioCtx2.createGain();
      g2.gain.value = (vol ?? 100) / 100;
      s2.connect(g2); g2.connect(audioCtx2.destination);
      s2.start(0);
      currentSource2 = s2; currentGain2 = g2;
    }

    showNowPlaying(filePath, audioBuf.duration);
    let ended = false;
    s1.onended = () => { if (ended) return; ended = true; if (currentSource2) try { currentSource2.stop(); } catch {} stopSound(); playNextInQueue(); };
    if (s2) s2.onended = () => { if (ended) return; ended = true; if (currentSource) try { currentSource.stop(); } catch {} stopSound(); playNextInQueue(); };

    document.querySelectorAll('.sound-card.playing').forEach(c => c.classList.remove('playing'));
    const card = document.querySelector('[data-fp="' + CSS.escape(filePath) + '"]');
    if (card) card.classList.add('playing');

    window.sb.incrementPlaycount(filePath).then(() => {
      const pc = document.querySelector('[data-fp="' + CSS.escape(filePath) + '"] .playcount');
      if (pc) pc.textContent = 'Played ' + (parseInt(pc.dataset.count) + 1) + 'x';
    });
  } catch (e) {
    toast('Playback error: ' + e.message, 'error');
  }
}

const nowPlaying = document.getElementById('now-playing');
const nowPlayingName = document.getElementById('now-playing-name');
const progressFill = document.getElementById('progress-fill');
let progressInterval = null;

function showNowPlaying(fp, dur) {
  const name = fp.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  nowPlayingName.textContent = name;
  nowPlaying.classList.remove('hidden');
  let start = audioCtx.currentTime;
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    const elapsed = audioCtx.currentTime - start;
    const pct = dur > 0 ? Math.min(100, (elapsed / dur) * 100) : 0;
    progressFill.style.width = pct + '%';
    if (pct >= 100) clearInterval(progressInterval);
  }, 100);
}

function hideNowPlaying() {
  nowPlaying.classList.add('hidden');
  clearInterval(progressInterval);
  progressFill.style.width = '0';
}

function stopSound() {
  for (const s of [currentSource, currentSource2]) {
    if (s) { try { s.stop(); } catch {} }
  }
  currentSource = null; currentGain = null;
  currentSource2 = null; currentGain2 = null;
  hideNowPlaying();
  document.querySelectorAll('.sound-card.playing').forEach(c => c.classList.remove('playing'));
}

function updateVolume(vol) {
  const v = (vol ?? 100) / 100;
  if (currentGain) currentGain.gain.value = v;
  if (currentGain2) currentGain2.gain.value = v;
}

async function enumerateOutputDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audiooutput');
  } catch { return []; }
}

async function populateDeviceList(selectEl, currentId) {
  const devices = await enumerateOutputDevices();
  const defaultId = currentId || 'default';
  selectEl.innerHTML = devices.map(d =>
    '<option value="' + escAttr(d.deviceId) + '"' + (d.deviceId === defaultId ? ' selected' : '') + '>' +
    esc(d.label || d.deviceId.slice(0, 16) + '...') + '</option>'
  ).join('');
  if (devices.length === 0) selectEl.innerHTML = '<option value="default">Default Output</option>';
}

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const devSelect1 = document.getElementById('output-device');
const devSelect2 = document.getElementById('output-device2');

settingsBtn.addEventListener('click', async () => {
  await populateDeviceList(devSelect1, dev1);
  await populateDeviceList(devSelect2, dev2 || 'default');
  settingsModal.classList.remove('hidden');
});
settingsModal.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) settingsModal.classList.add('hidden');
});
document.getElementById('settings-close').addEventListener('click', () => settingsModal.classList.add('hidden'));

devSelect1.addEventListener('change', async () => {
  const ok = await setAudioDevice(1, devSelect1.value);
  if (ok) toast('Output 1 changed', 'success');
});
devSelect2.addEventListener('change', async () => {
  const ok = await setAudioDevice(2, devSelect2.value);
  if (ok) toast('Output 2 changed', 'success');
});

const state = { guildId: null, allSounds: [], category: null, page: 0, search: '', volume: 100, sort: 'name' };
let hotkeys = Object.create(null);
let favorites = Object.create(null);
let showFavoritesOnly = false;
let serverCategories = [];
let playQueue = [];
let queueFps = new Set();
let multiSelected = new Set();

const guildSelect = document.getElementById('guild-select');
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel = document.getElementById('volume-label');
const searchInput = document.getElementById('search-input');
const clearSearch = document.getElementById('clear-search');
const uploadBtn = document.getElementById('upload-btn');
const catBar = document.getElementById('cat-bar');
const soundGrid = document.getElementById('sound-grid');
const statusBar = document.getElementById('status-bar');
const sortSelect = document.getElementById('sort-select');

async function init() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach(t => t.stop());
  } catch {}

  const cfg = await window.sb.getConfig();
  const guilds = await window.sb.getGuilds();
  statusBar.textContent = '';

  if (cfg.audioDeviceId1 && cfg.audioDeviceId1 !== 'default' && audioCtx.setSinkId) {
    dev1 = cfg.audioDeviceId1;
    try { await audioCtx.setSinkId(dev1); } catch {}
  }
  if (cfg.audioDeviceId2 && cfg.audioDeviceId2 !== 'default' && audioCtx2.setSinkId) {
    dev2 = cfg.audioDeviceId2;
    try { await audioCtx2.setSinkId(dev2); } catch {}
  }

  hotkeys = await window.sb.getHotkeys();
  favorites = await window.sb.getFavorites();

  if (guilds.length === 0) {
    guildSelect.innerHTML = '<option>No servers</option>';
    soundGrid.innerHTML = '<div class="empty">No servers found. Upload sounds via the bot first.</div>';
    return;
  }

  guildSelect.innerHTML = guilds.map(g =>
    '<option value="' + escAttr(g) + '">' + esc(g) + '</option>'
  ).join('');

  state.guildId = (cfg.lastGuild && guilds.includes(cfg.lastGuild)) ? cfg.lastGuild : guilds[0];
  guildSelect.value = state.guildId;
  state.volume = 100;
  volumeSlider.value = 100;
  volumeLabel.textContent = '100%';

  if (cfg.minimizeToTray !== undefined) {
    document.getElementById('tray-check').checked = cfg.minimizeToTray;
  }
  if (cfg.startMinimized !== undefined) {
    document.getElementById('start-minimized-check').checked = cfg.startMinimized;
  }

  if (cfg.gridDensity && densities.includes(cfg.gridDensity)) {
    densityIndex = densities.indexOf(cfg.gridDensity);
    soundGrid.className = 'drop-zone ' + cfg.gridDensity;
  }

  if (cfg.lightTheme) {
    document.body.classList.add('light');
    document.getElementById('theme-btn').innerHTML = '&#9790;';
  }

  await loadSounds();
}

async function loadSounds() {
  if (!state.guildId) return;
  soundGrid.innerHTML = '<div class="empty"><div class="spinner"></div> Loading...</div>';
  state.allSounds = await window.sb.getSounds(state.guildId);
  serverCategories = await window.sb.getCategories(state.guildId);
  hotkeys = await window.sb.getHotkeys();
  perSoundVolumes = {};
  for (const s of state.allSounds) {
    perSoundVolumes[s.filePath] = await window.sb.getVolume(s.filePath);
  }
  state.category = null;
  state.page = 0;
  render();
}

function getFiltered() {
  let list = [...state.allSounds];
  if (state.category) list = list.filter(s => s.category === state.category);
  const q = state.search.toLowerCase().trim();
  if (showFavoritesOnly) list = list.filter(s => favorites[s.filePath]);
  if (q) {
    if (q.startsWith('hk:')) {
      const hkq = q.slice(3);
      list = list.filter(s => {
        const hk = hotkeys[s.filePath];
        return hk && hk.toLowerCase().includes(hkq);
      });
    } else {
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
  }

  list.sort((a, b) => {
    const fa = favorites[a.filePath] ? 1 : 0;
    const fb = favorites[b.filePath] ? 1 : 0;
    if (fa !== fb) return fb - fa;
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'ar');
    if (state.sort === 'name_desc') return b.name.localeCompare(a.name, 'ar');
    if (state.sort === 'newest') return (b.mtime || 0) - (a.mtime || 0);
    if (state.sort === 'oldest') return (a.mtime || 0) - (b.mtime || 0);
    if (state.sort === 'hotkey') {
      const ha = hotkeys[a.filePath] || '';
      const hb = hotkeys[b.filePath] || '';
      if (ha && !hb) return -1;
      if (!ha && hb) return 1;
      return ha.localeCompare(hb);
    }
    return 0;
  });
  return list;
}

function render() {
  const list = getFiltered();
  const cats = [...new Set([...serverCategories, ...state.allSounds.map(s => s.category)])];
  const totalPages = Math.max(1, Math.ceil(list.length / 30));
  if (state.page >= totalPages) state.page = totalPages - 1;
  if (state.page < 0) state.page = 0;
  const page = list.slice(state.page * 30, (state.page + 1) * 30);

  catBar.innerHTML =
    '<button class="cat-btn' + (!state.category ? ' active' : '') + '" data-cat="">\uD83D\uDCC1 All</button>' +
    cats.map(c => '<button class="cat-btn' + (c === state.category ? ' active' : '') + '" data-cat="' + escAttr(c) + '" title="Right-click for options">\uD83D\uDCC2 ' + esc(c) + '</button>').join('') +
    '<button class="cat-btn cat-add" id="cat-add-btn" title="New Category">+</button>';

  catBar.querySelectorAll('.cat-btn[data-cat]').forEach(b => {
    b.addEventListener('click', () => {
      state.category = b.dataset.cat || null;
      state.page = 0;
      render();
    });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!b.dataset.cat) return;
      openCategoryMenu(b.dataset.cat, e);
    });
    // Drop target for moving sounds between categories
    b.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    b.addEventListener('drop', async (e) => {
      e.preventDefault();
      const fp = e.dataTransfer.getData('text/plain');
      if (!fp || !b.dataset.cat) return;
      const sound = state.allSounds.find(s => s.filePath === fp);
      if (!sound || sound.category === b.dataset.cat) return;
      const r = await window.sb.moveSound(fp, b.dataset.cat);
      if (r.success) {
        toast('Moved to "' + b.dataset.cat + '"', 'success');
        loadSounds();
      } else {
        toast('Error moving sound', 'error');
      }
    });
  });

  document.getElementById('cat-add-btn')?.addEventListener('click', () => openCategoryModal());

  if (page.length === 0) {
    soundGrid.innerHTML = '<div class="empty">' +
      (state.allSounds.length === 0 ? 'No sounds yet. Click <strong>+ Upload</strong> or drag & drop audio files.' : 'No matching sounds.') +
      '</div>';
    updateStatus(list.length);
    return;
  }

  soundGrid.innerHTML = page.map(s =>
    '<div class="sound-card' + (multiSelected.has(s.filePath) ? ' multi-selected' : '') + '" data-fp="' + escAttr(s.filePath) + '" data-name="' + escAttr(s.name) + '" data-category="' + escAttr(s.category) + '" tabindex="0" draggable="true">' +
      (hotkeys[s.filePath] ? '<span class="hk-badge">' + esc(hotkeys[s.filePath]) + '</span>' : '') +
      '<span class="star' + (favorites[s.filePath] ? ' active' : '') + '" data-fp="' + escAttr(s.filePath) + '">\u2605</span>' +
      '<div class="name">' + esc(s.name) + '</div>' +
      '<div class="size">' + formatSize(s.size) + '</div>' +
      '<div class="playcount" data-count="0">Played 0x</div>' +
      '<div class="card-vol"><input type="range" min="0" max="100" value="' + (perSoundVolumes[s.filePath] ?? state.volume) + '"><span>' + (perSoundVolumes[s.filePath] ?? state.volume) + '%</span></div>' +
    '</div>'
  ).join('');

  // Playcount for visible cards
  for (const s of page) {
    const el = soundGrid.querySelector('[data-fp="' + CSS.escape(s.filePath) + '"] .playcount');
    if (el) {
      window.sb.getPlaycount(s.filePath).then(c => {
        el.textContent = c > 0 ? 'Played ' + c + 'x' : '';
        el.dataset.count = c;
      });
    }
  }

  soundGrid.querySelectorAll('.sound-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('hk-badge')) { openHotkeyModal(el.dataset.fp, el.dataset.name); return; }
      if (e.target.classList.contains('star')) { toggleFav(el.dataset.fp); return; }
      if (e.ctrlKey || e.metaKey) { toggleMultiSelect(el.dataset.fp); return; }
      if (e.shiftKey) { rangeSelect(el.dataset.fp); return; }
      if (multiSelected.size > 0) { clearMultiSelect(); }
      if (el.classList.contains('playing')) { stopSound(); return; }
      playSound(el.dataset.fp);
    });
    el.addEventListener('dblclick', () => {
      if (multiSelected.size > 0) return;
      playSound(el.dataset.fp);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.sb.showContextMenu(el.dataset.fp, el.dataset.name);
    });
    // Drag to move between categories
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.fp);
      e.dataTransfer.effectAllowed = 'move';
    });

    const volInput = el.querySelector('.card-vol input');
    const volSpan = el.querySelector('.card-vol span');
    volInput.addEventListener('input', async () => {
      const v = parseInt(volInput.value);
      volSpan.textContent = v + '%';
      perSoundVolumes[el.dataset.fp] = v;
      await window.sb.setVolume(el.dataset.fp, v);
      if (currentSource && currentGain && document.querySelector('[data-fp="' + CSS.escape(el.dataset.fp) + '"].playing')) {
        currentGain.gain.value = v / 100;
        if (currentGain2) currentGain2.gain.value = v / 100;
      }
    });
  });

  if (totalPages > 1) {
    const nav = document.createElement('div');
    nav.className = 'pagination';
    nav.innerHTML =
      '<button ' + (state.page === 0 ? 'disabled' : '') + ' id="pg-prev">\u25C0 Prev</button>' +
      '<span>' + (state.page + 1) + ' / ' + totalPages + '</span>' +
      '<button ' + (state.page >= totalPages - 1 ? 'disabled' : '') + ' id="pg-next">Next \u25B6</button>';
    soundGrid.appendChild(nav);
    document.getElementById('pg-prev')?.addEventListener('click', () => { state.page--; render(); });
    document.getElementById('pg-next')?.addEventListener('click', () => { state.page++; render(); });
  }

  updateStatus(list.length);
}

function updateStatus(count) {
  statusBar.textContent = state.allSounds.length + ' sounds total' +
    (count !== state.allSounds.length ? ' \u2022 ' + count + ' shown' : '') +
    (state.category ? ' \u2022 ' + state.category : '') +
    (multiSelected.size > 0 ? ' \u2022 ' + multiSelected.size + ' selected' : '');
}

function formatSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function esc(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

volumeSlider.addEventListener('input', async (e) => {
  state.volume = parseInt(e.target.value);
  volumeLabel.textContent = state.volume + '%';
  updateVolume(state.volume);
});

searchInput.addEventListener('input', () => {
  state.search = searchInput.value;
  clearSearch.classList.toggle('hidden', !state.search);
  state.page = 0;
  render();
});
clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  state.search = '';
  clearSearch.classList.add('hidden');
  state.page = 0;
  render();
  searchInput.focus();
});

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  state.page = 0;
  render();
});

guildSelect.addEventListener('change', async () => {
  state.guildId = guildSelect.value;
  state.volume = 100;
  volumeSlider.value = 100;
  volumeLabel.textContent = '100%';
  multiSelected.clear();
  updateMultiBar();
  await window.sb.setConfig({ lastGuild: state.guildId });
  loadSounds();
});

uploadBtn.addEventListener('click', async () => {
  if (!state.guildId) return;
  const r = await window.sb.uploadSound(state.guildId, state.category);
  if (!r || r.cancelled) return;
  let ok = 0, err = 0, exists = 0;
  (r.uploaded || []).forEach(u => {
    if (u.status === 'ok') ok++;
    else if (u.status === 'error') err++;
    else if (u.status === 'exists') exists++;
  });
  const parts = [];
  if (ok > 0) parts.push(ok + ' uploaded');
  if (exists > 0) parts.push(exists + ' already exist');
  if (err > 0) parts.push(err + ' failed');
  toast(parts.join(', ') || 'No files selected', err > 0 ? 'error' : 'success');
  if (ok > 0) loadSounds();
});

// ========== Drag & Drop Upload ==========
soundGrid.addEventListener('dragover', (e) => { e.preventDefault(); soundGrid.classList.add('drag-over'); });
soundGrid.addEventListener('dragleave', () => { soundGrid.classList.remove('drag-over'); });
soundGrid.addEventListener('drop', async (e) => {
  e.preventDefault();
  soundGrid.classList.remove('drag-over');
  if (!state.guildId) return;
  const files = Array.from(e.dataTransfer.files).filter(f => f.path && /\.(mp3|wav|ogg|flac|m4a|aac|webm|opus)$/i.test(f.name));
  if (files.length === 0) { toast('No audio files found', 'error'); return; }
  const filePaths = files.map(f => f.path).filter(Boolean);
  const r = await window.sb.uploadSoundFiles(state.guildId, state.category, filePaths);
  let ok = 0, err = 0, exists = 0;
  (r.uploaded || []).forEach(u => {
    if (u.status === 'ok') ok++;
    else if (u.status === 'error') err++;
    else if (u.status === 'exists') exists++;
  });
  const parts = [];
  if (ok > 0) parts.push(ok + ' uploaded');
  if (exists > 0) parts.push(exists + ' already exist');
  if (err > 0) parts.push(err + ' failed');
  toast(parts.join(', ') || 'No files uploaded', err > 0 ? 'error' : 'success');
  if (ok > 0) loadSounds();
});

// ========== Multi-Select ==========
function toggleMultiSelect(fp) {
  if (multiSelected.has(fp)) multiSelected.delete(fp);
  else multiSelected.add(fp);
  updateMultiBar();
  render();
}

function rangeSelect(fp) {
  const list = getFiltered();
  const idx = list.findIndex(s => s.filePath === fp);
  if (idx < 0) return;
  for (const s of list.slice(0, idx + 1)) {
    multiSelected.add(s.filePath);
  }
  updateMultiBar();
  render();
}

function clearMultiSelect() {
  multiSelected.clear();
  updateMultiBar();
  render();
}

function updateMultiBar() {
  const bar = document.getElementById('multi-bar');
  if (multiSelected.size === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  document.getElementById('multi-count').textContent = multiSelected.size + ' selected';
}

document.getElementById('multi-play').addEventListener('click', () => {
  const list = getFiltered().filter(s => multiSelected.has(s.filePath));
  addToQueue(list.map(s => s.filePath));
  playNextInQueue();
  clearMultiSelect();
});

document.getElementById('multi-hotkey').addEventListener('click', () => {
  const fps = Array.from(multiSelected);
  if (fps.length === 1) {
    const s = state.allSounds.find(s => s.filePath === fps[0]);
    openHotkeyModal(fps[0], s ? s.name : '');
  } else {
    toast('Select one sound to assign hotkey', 'error');
  }
});

document.getElementById('multi-delete').addEventListener('click', async () => {
  const fps = Array.from(multiSelected);
  if (!await confirmAsync('Delete ' + fps.length + ' sounds?')) return;
  for (const fp of fps) {
    await window.sb.deleteSound(fp);
  }
  toast('Deleted ' + fps.length + ' sounds', 'success');
  clearMultiSelect();
  loadSounds();
});

document.getElementById('multi-clear-hotkeys').addEventListener('click', async () => {
  if (!await confirmAsync('Clear hotkeys for ' + multiSelected.size + ' sounds?')) return;
  for (const fp of multiSelected) {
    await window.sb.removeHotkey(fp);
    delete hotkeys[fp];
  }
  toast('Hotkeys cleared', 'success');
  clearMultiSelect();
  render();
});

document.getElementById('multi-clear').addEventListener('click', clearMultiSelect);

// ========== Queue ==========
function addToQueue(fps) {
  for (const fp of fps) {
    if (!queueFps.has(fp)) {
      playQueue.push(fp);
      queueFps.add(fp);
    }
  }
  updateQueueBtn();
}

function removeFromQueue(fp) {
  playQueue = playQueue.filter(f => f !== fp);
  queueFps.delete(fp);
  updateQueueBtn();
}

function playNextInQueue() {
  if (playQueue.length === 0) return;
  const fp = playQueue.shift();
  queueFps.delete(fp);
  updateQueueBtn();
  playSound(fp);
}

function updateQueueBtn() {
  const btn = document.getElementById('queue-btn');
  btn.classList.toggle('has-queue', playQueue.length > 0);
}

document.getElementById('queue-btn').addEventListener('click', () => {
  const modal = document.getElementById('queue-modal');
  renderQueueList();
  modal.classList.remove('hidden');
});

function renderQueueList() {
  const list = document.getElementById('queue-list');
  if (playQueue.length === 0) {
    list.innerHTML = '<div class="empty" style="padding:20px">Queue is empty</div>';
    return;
  }
  list.innerHTML = playQueue.map(fp => {
    const name = fp.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    return '<div class="queue-item" data-fp="' + escAttr(fp) + '">' +
      '<span class="qi-name">' + esc(name) + '</span>' +
      '<button class="qi-remove" data-fp="' + escAttr(fp) + '">&times;</button>' +
    '</div>';
  }).join('');
  list.querySelectorAll('.qi-remove').forEach(b => {
    b.addEventListener('click', () => removeFromQueue(b.dataset.fp));
  });
}

document.getElementById('queue-play-all').addEventListener('click', () => {
  if (playQueue.length === 0) return;
  playNextInQueue();
  document.getElementById('queue-modal').classList.add('hidden');
});

document.getElementById('queue-clear').addEventListener('click', () => {
  playQueue = [];
  queueFps.clear();
  updateQueueBtn();
  renderQueueList();
});

document.getElementById('queue-close').addEventListener('click', () => {
  document.getElementById('queue-modal').classList.add('hidden');
});

document.getElementById('queue-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) document.getElementById('queue-modal').classList.add('hidden');
});

// ========== Category Management ==========
let catAction = 'create';
let catTarget = null;

function openCategoryModal(action = 'create', catName = null) {
  catAction = action;
  catTarget = catName;
  const title = document.getElementById('cat-modal-title');
  const hint = document.getElementById('cat-modal-hint');
  const input = document.getElementById('cat-input');
  const btn = document.getElementById('cat-confirm');
  if (action === 'create') {
    title.textContent = 'New Category';
    hint.textContent = 'Enter a name for the new category';
    input.value = '';
    input.placeholder = 'Category name';
    btn.textContent = 'Create';
  } else if (action === 'rename') {
    title.textContent = 'Rename Category';
    hint.textContent = 'New name for "' + catName + '"';
    input.value = catName;
    input.placeholder = 'New name';
    btn.textContent = 'Rename';
  }
  document.getElementById('cat-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

document.getElementById('cat-confirm').addEventListener('click', async () => {
  const input = document.getElementById('cat-input');
  const name = input.value.trim();
  if (!name) return;
  if (catAction === 'create') {
    const r = await window.sb.createCategory(state.guildId, name);
    if (r.success) { toast('Category created', 'success'); document.getElementById('cat-modal').classList.add('hidden'); loadSounds(); }
    else toast('Error: ' + (r.error || ''), 'error');
  } else if (catAction === 'rename') {
    const r = await window.sb.renameCategory(state.guildId, catTarget, name);
    if (r.success) { toast('Category renamed', 'success'); document.getElementById('cat-modal').classList.add('hidden'); loadSounds(); }
    else toast('Error: ' + (r.error || ''), 'error');
  }
});

document.getElementById('cat-cancel').addEventListener('click', () => { document.getElementById('cat-modal').classList.add('hidden'); });
document.getElementById('cat-modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal-bg')) document.getElementById('cat-modal').classList.add('hidden'); });
document.getElementById('cat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('cat-confirm').click(); });

function openCategoryMenu(catName, event) {
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;background:var(--surface);border:1px solid var(--overlay);border-radius:6px;padding:4px;z-index:300;box-shadow:var(--shadow)';
  menu.innerHTML =
    '<div style="padding:4px 10px;font-size:11px;cursor:pointer;border-radius:4px" data-action="rename">Rename</div>' +
    '<div style="padding:4px 10px;font-size:11px;cursor:pointer;border-radius:4px" data-action="delete">Delete</div>';
  document.body.appendChild(menu);
  const rect = { x: event.clientX, y: event.clientY };
  menu.style.left = rect.x + 'px';
  menu.style.top = rect.y + 'px';

  const close = () => { if (menu.parentNode) menu.parentNode.removeChild(menu); };
  menu.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async () => {
      const action = el.dataset.action;
      close();
      if (action === 'rename') {
        openCategoryModal('rename', catName);
      } else if (action === 'delete') {
        if (await confirmAsync('Delete category "' + catName + '" and all its sounds?')) {
          const r = await window.sb.deleteCategory(state.guildId, catName);
          if (r.success) { toast('Category deleted', 'success'); loadSounds(); }
          else toast('Error: ' + (r.error || ''), 'error');
        }
      }
    });
  });
  document.addEventListener('click', close, { once: true });
}

// ========== Hotkey Modal ==========
let hkTargetFp = null;

function openHotkeyModal(fp, name) {
  hkTargetFp = fp;
  document.getElementById('hk-sound-name').textContent = name;
  document.getElementById('hk-display').textContent = hotkeys[fp] || 'Press a key combination...';
  document.getElementById('hk-display').className = hotkeys[fp] ? 'hk-combo' : 'hk-placeholder';
  const hint = document.getElementById('hk-hint');
  hint.textContent = '';
  hint.style.color = '';
  document.getElementById('hk-save').disabled = true;
  const rmBtn = document.getElementById('hk-remove');
  rmBtn.style.display = hotkeys[fp] ? '' : 'none';
  document.getElementById('hk-recorder')._pendingCombo = null;
  document.getElementById('hotkey-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('hk-recorder').focus(), 100);
}

function closeHotkeyModal() {
  document.getElementById('hotkey-modal').classList.add('hidden');
  hkTargetFp = null;
}

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

document.getElementById('hk-recorder').addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeHotkeyModal(); return; }
  if (e.key === 'Enter' && !document.getElementById('hk-save').disabled) {
    e.preventDefault(); document.getElementById('hk-save').click(); return;
  }
  if (MODIFIER_KEYS.includes(e.key)) return;
  e.preventDefault();
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (/^F\d{1,2}$/i.test(key)) {
    key = key.toUpperCase();
  } else if (key.length === 1 && /[A-Z0-9]/i.test(key)) {
    key = key.toUpperCase();
    if (parts.length === 0) { document.getElementById('hk-hint').textContent = 'Letters and digits require a modifier (Ctrl, Shift, Alt)'; return; }
  } else {
    return;
  }
  parts.sort();
  parts.push(key);
  const combo = parts.join('+');
  document.getElementById('hk-display').textContent = combo;
  document.getElementById('hk-display').className = 'hk-combo';
  document.getElementById('hk-hint').textContent = '';
  document.getElementById('hk-save').disabled = false;
  this._pendingCombo = combo;
});

document.getElementById('hk-save').addEventListener('click', async () => {
  const recorder = document.getElementById('hk-recorder');
  const combo = recorder._pendingCombo;
  if (!combo || !hkTargetFp) return;
  const r = await window.sb.setHotkey(hkTargetFp, combo);
  if (r.success) {
    hotkeys[hkTargetFp] = combo;
    toast('Hotkey set: ' + combo, 'success');
    closeHotkeyModal();
    render();
  } else if (r.error === 'conflict') {
    document.getElementById('hk-hint').textContent = 'This hotkey is already assigned to another sound';
    document.getElementById('hk-hint').style.color = 'var(--red)';
  } else if (r.error === 'invalid_combo') {
    document.getElementById('hk-hint').textContent = 'Invalid key combination';
    document.getElementById('hk-hint').style.color = 'var(--red)';
  }
});

document.getElementById('hk-remove').addEventListener('click', async () => {
  if (!hkTargetFp) return;
  await window.sb.removeHotkey(hkTargetFp);
  delete hotkeys[hkTargetFp];
  toast('Hotkey removed', 'success');
  closeHotkeyModal();
  render();
});

document.getElementById('hk-cancel').addEventListener('click', closeHotkeyModal);
document.getElementById('hotkey-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) closeHotkeyModal();
});

window.sb.on('hotkey-triggered', (fp) => {
  playSound(fp);
});

window.sb.on('ctx-hotkey', (fp, name) => {
  openHotkeyModal(fp, name);
});

document.getElementById('stop-btn').addEventListener('click', stopSound);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('rename-modal')?.classList.add('hidden');
    document.getElementById('settings-modal')?.classList.add('hidden');
    document.getElementById('hotkey-modal')?.classList.add('hidden');
    document.getElementById('cat-modal')?.classList.add('hidden');
    document.getElementById('queue-modal')?.classList.add('hidden');
    document.getElementById('confirm-modal')?.classList.add('hidden');
    document.getElementById('hotkey-list-modal')?.classList.add('hidden');
    document.getElementById('move-modal')?.classList.add('hidden');
    document.getElementById('help-modal')?.classList.add('hidden');
    stopSound();
    return;
  }
  if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); stopSound(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); uploadBtn.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); clearMultiSelect(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); document.getElementById('fav-btn').click(); }

  // Global volume Ctrl+Up / Ctrl+Down
  if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    state.volume = Math.max(0, Math.min(100, state.volume + (e.key === 'ArrowUp' ? 5 : -5)));
    volumeSlider.value = state.volume;
    volumeLabel.textContent = state.volume + '%';
    updateVolume(state.volume);
    showVolIndicator(state.volume);
    return;
  }

  // Keyboard navigation on grid
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
       e.key === 'Home' || e.key === 'End') && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    const cards = soundGrid.querySelectorAll('.sound-card');
    if (cards.length === 0) return;
    let idx = Array.from(cards).findIndex(c => c === document.activeElement);
    if (idx < 0) idx = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') idx = Math.min(idx + 1, cards.length - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') idx = Math.max(0, idx - 1);
    else if (e.key === 'Home') idx = 0;
    else if (e.key === 'End') idx = cards.length - 1;
    cards[idx].focus();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sound-card') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    e.preventDefault();
    const el = e.target;
    if (el.classList.contains('playing')) { stopSound(); return; }
    playSound(el.dataset.fp);
  }
});

// ========== Rename Modal ==========
let renameTarget = null;
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const renameCurrent = document.getElementById('rename-current');

document.getElementById('rename-confirm').addEventListener('click', async () => {
  if (!renameTarget) return;
  const n = renameInput.value.trim().replace(/[^a-zA-Z0-9_\u0600-\u06FF\s]/g, '_').slice(0, 80);
  if (!n) return;
  const r = await window.sb.renameSound(renameTarget.fp, n);
  if (r.success) { toast('Renamed to "' + r.name + '"', 'success'); renameModal.classList.add('hidden'); renameTarget = null; loadSounds(); }
  else if (r.error === 'exists') toast('Name already exists', 'error');
  else toast('Error: ' + (r.error || ''), 'error');
});
document.getElementById('rename-cancel').addEventListener('click', () => { renameModal.classList.add('hidden'); renameTarget = null; });
renameModal.addEventListener('click', (e) => { if (e.target.classList.contains('modal-bg')) { renameModal.classList.add('hidden'); renameTarget = null; } });
renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('rename-confirm').click(); });

window.sb.on('ctx-rename', (fp, name) => {
  renameTarget = { fp, name };
  renameCurrent.textContent = name;
  renameInput.value = name;
  renameModal.classList.remove('hidden');
  renameInput.focus();
});

window.sb.on('ctx-delete', async (fp) => {
  if (multiSelected.has(fp)) {
    clearMultiSelect();
  }
  const r = await window.sb.deleteSound(fp);
  if (r.success) { toast('Deleted', 'success'); loadSounds(); } else toast('Error: ' + r.error, 'error');
});

window.sb.on('ctx-play', (fp) => {
  playSound(fp);
});

window.sb.on('ctx-add-queue', (fp) => {
  addToQueue([fp]);
  toast('Added to queue', 'success');
});

async function toggleFav(fp) {
  const r = await window.sb.toggleFavorite(fp);
  if (r.favorited) favorites[fp] = true;
  else delete favorites[fp];
  render();
}

window.sb.on('ctx-toggle-fav', async (fp) => {
  await toggleFav(fp);
});

window.sb.on('menu-upload', () => uploadBtn.click());
window.sb.on('menu-refresh', () => loadSounds());
window.sb.on('menu-search', () => { searchInput.focus(); searchInput.select(); });

// ========== Settings: Tray & Hotkeys Export/Import ==========
const updateStatusText = document.getElementById('update-status-text');
let updatePending = false;

window.sb.on('update-status', (status, data) => {
  if (status === 'checking') updateStatusText.textContent = 'Checking...';
  else if (status === 'available') {
    updateStatusText.textContent = 'v' + data.version + ' available';
    updatePending = true;
    toast('Update v' + data.version + ' available', 'info');
  } else if (status === 'not-available') updateStatusText.textContent = 'Up to date';
  else if (status === 'error') updateStatusText.textContent = 'Error: ' + (data || 'unknown');
  else if (status === 'progress') updateStatusText.textContent = 'Downloading... ' + data + '%';
  else if (status === 'downloaded') {
    updateStatusText.textContent = 'Downloaded. Click Install';
    updatePending = true;
    toast('Update downloaded. Restart to install.', 'success');
    addInstallUpdateBtn();
  }
});

function addInstallUpdateBtn() {
  const bar = document.getElementById('status-bar');
  if (bar.querySelector('.update-action')) return;
  const btn = document.createElement('button');
  btn.className = 'update-action';
  btn.textContent = 'Install Update';
  btn.style.cssText = 'margin-left:8px;background:var(--accent);color:var(--bg);border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;font-weight:600';
  btn.addEventListener('click', () => { window.sb.installUpdate(); });
  bar.appendChild(btn);
}

document.getElementById('check-update-btn').addEventListener('click', async () => {
  updateStatusText.textContent = 'Checking...';
  await window.sb.checkForUpdates();
});
document.getElementById('tray-check').addEventListener('change', async () => {
  await window.sb.setConfig({ minimizeToTray: document.getElementById('tray-check').checked });
});

document.getElementById('start-minimized-check').addEventListener('change', async () => {
  await window.sb.setConfig({ startMinimized: document.getElementById('start-minimized-check').checked });
});

document.getElementById('export-hotkeys-btn').addEventListener('click', async () => {
  const r = await window.sb.exportHotkeys();
  if (r.success) toast('Hotkeys exported', 'success');
  else if (!r.cancelled) toast('Export failed: ' + (r.error || ''), 'error');
});

document.getElementById('import-hotkeys-btn').addEventListener('click', async () => {
  const r = await window.sb.importHotkeys();
  if (r.success) {
    hotkeys = await window.sb.getHotkeys();
    toast('Imported ' + r.count + ' hotkeys', 'success');
    render();
  } else if (!r.cancelled) toast('Import failed: ' + (r.error || ''), 'error');
});

// ========== Custom Confirm Modal ==========
async function confirmAsync(msg) {
  return new Promise((resolve) => {
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-modal').classList.remove('hidden');
    const yes = document.getElementById('confirm-yes');
    const no = document.getElementById('confirm-no');
    const cleanup = (val) => {
      document.getElementById('confirm-modal').classList.add('hidden');
      document.removeEventListener('keydown', keyHandler);
      resolve(val);
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };
    document.addEventListener('keydown', keyHandler);
    const yesHandler = () => cleanup(true);
    const noHandler = () => cleanup(false);
    yes.addEventListener('click', yesHandler, { once: true });
    no.addEventListener('click', noHandler, { once: true });
  });
}
document.getElementById('confirm-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) {
    document.getElementById('confirm-modal').classList.add('hidden');
  }
});

// ========== Global Volume Ctrl+Up/Down ==========
function showVolIndicator(vol) {
  const el = document.getElementById('vol-indicator');
  el.textContent = 'Volume: ' + vol + '%';
  el.classList.remove('hidden');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.add('hidden'), 1200);
}

// ========== Favorites Toggle ==========
document.getElementById('fav-btn').addEventListener('click', () => {
  showFavoritesOnly = !showFavoritesOnly;
  document.getElementById('fav-btn').classList.toggle('active', showFavoritesOnly);
  state.page = 0;
  render();
  toast(showFavoritesOnly ? 'Showing favorites only' : 'Showing all sounds', 'info');
});

// ========== Grid Density Toggle ==========
let densityIndex = 1;
const densities = ['compact', 'medium', 'spacious'];
document.getElementById('density-btn').addEventListener('click', () => {
  densityIndex = (densityIndex + 1) % densities.length;
  soundGrid.className = 'drop-zone ' + densities[densityIndex];
  window.sb.setConfig({ gridDensity: densities[densityIndex] });
});

// ========== Hotkey List Modal ==========
document.getElementById('hotkey-list-btn').addEventListener('click', () => {
  const list = getFiltered();
  const body = document.getElementById('hk-list-content');
  const entries = list.filter(s => hotkeys[s.filePath]);
  if (entries.length === 0) {
    body.innerHTML = '<div class="empty" style="padding:20px">No hotkeys assigned</div>';
  } else {
    body.innerHTML = entries.map(s =>
      '<div style="padding:4px 0;font-size:12px;display:flex;justify-content:space-between;gap:8px">' +
        '<span>' + esc(s.name) + '</span>' +
        '<span style="font-weight:600;color:var(--accent)">' + esc(hotkeys[s.filePath]) + '</span>' +
      '</div>'
    ).join('');
  }
  document.getElementById('hotkey-list-modal').classList.remove('hidden');
});
document.getElementById('hk-list-close').addEventListener('click', () => {
  document.getElementById('hotkey-list-modal').classList.add('hidden');
});
document.getElementById('hotkey-list-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) {
    document.getElementById('hotkey-list-modal').classList.add('hidden');
  }
});

// ========== Move to Category (multi-select) ==========
document.getElementById('multi-move').addEventListener('click', () => {
  const cats = [...new Set([...serverCategories, ...state.allSounds.map(s => s.category)])];
  const list = document.getElementById('move-cat-list');
  list.innerHTML = cats.map(c =>
    '<button class="move-cat-item" data-cat="' + escAttr(c) + '">' + esc(c) + '</button>'
  ).join('');
  list.querySelectorAll('.move-cat-item').forEach(b => {
    b.addEventListener('click', async () => {
      const targetCat = b.dataset.cat;
      document.getElementById('move-modal').classList.add('hidden');
      let ok = 0, err = 0;
      for (const fp of multiSelected) {
        const s = state.allSounds.find(s => s.filePath === fp);
        if (s && s.category !== targetCat) {
          const r = await window.sb.moveSound(fp, targetCat);
          if (r.success) {
            ok++;
            if (r.newPath) { favorites[r.newPath] = favorites[fp]; delete favorites[fp]; }
          } else err++;
        }
      }
      toast(ok + ' moved' + (err ? ', ' + err + ' failed' : ''), err > 0 ? 'error' : 'success');
      clearMultiSelect();
      loadSounds();
    });
  });
  document.getElementById('move-modal').classList.remove('hidden');
});
document.getElementById('move-cancel').addEventListener('click', () => {
  document.getElementById('move-modal').classList.add('hidden');
});
document.getElementById('move-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) document.getElementById('move-modal').classList.add('hidden');
});

// ========== Theme Toggle ==========
document.getElementById('theme-btn').addEventListener('click', () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  document.getElementById('theme-btn').innerHTML = isLight ? '&#9790;' : '&#9788;';
  window.sb.setConfig({ lightTheme: isLight });
});

// ========== Help Modal ==========
document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('help-modal').classList.remove('hidden');
});
document.getElementById('help-close').addEventListener('click', () => {
  document.getElementById('help-modal').classList.add('hidden');
});
document.getElementById('help-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) document.getElementById('help-modal').classList.add('hidden');
});

// ========== Toast ==========
const toastBox = document.getElementById('toast-box');
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  toastBox.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
}

init();
