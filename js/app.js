/* ── Trailkeeper App Core ──
   Shared application logic for index.html and hiking-page.html.
   All functions that TK modules hook into (renderTrails, etc.)
   are defined as globals on window. */

window.TK = window.TK || {};
window.TK.runtimeState = window.TK.runtimeState || {
  storageError: '',
  weatherStatus: 'empty',
  weatherMessage: '',
  overpassError: '',
  hikeModalOpen: false,
  photoCount: 0
};

const PREFS_KEY = 'tk-preferences';
const PREF_DEFAULTS = {
  lastWeatherCity: '',
  lastActiveSection: 'sec-today',
  lastPlannedTrail: '',
  lastWeatherVerdict: '',
  lastViewedPhotoCount: 0
};
const STATUSES = ['unvisited', 'planned', 'done'];
const SLABELS = { unvisited: 'Unvisited', planned: 'Planned', done: 'Done \u2713' };
const TRAIL_CATEGORIES = ['Quick', 'Half day', 'Full day', 'Nearby'];

/* ── STORAGE ── */
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      window.TK.runtimeState.storageError = '';
      window.dispatchEvent(new Event('trailkeeper:saved'));
    } catch {
      window.TK.runtimeState.storageError = 'Browser storage is unavailable. Keep a backup before leaving this page.';
      window.dispatchEvent(new Event('trailkeeper:storage-error'));
    }
  }
};

function getPrefs() {
  var raw = store.get(PREFS_KEY, null);
  if (!raw || typeof raw !== 'object') return Object.assign({}, PREF_DEFAULTS);
  return Object.assign({}, PREF_DEFAULTS, raw);
}

function setPrefs(nextPrefs) {
  store.set(PREFS_KEY, Object.assign({}, PREF_DEFAULTS, nextPrefs || {}));
}

function updatePrefs(partial) {
  var current = getPrefs();
  setPrefs(Object.assign({}, current, partial || {}));
}

/* ── ONE-TIME STORAGE KEY MIGRATION ──
   Unify the old "trails" key with the canonical "tk-trails" key.
   If "trails" exists but "tk-trails" doesn't, copy over.
   If both exist, prefer "trails" (the user-facing data) and merge enrichments.
   Then delete the old "trails" key. */
(function migrateStorageKeys() {
  try {
    var oldRaw = localStorage.getItem('trails');
    var newRaw = localStorage.getItem('tk-trails');
    var oldData = oldRaw ? JSON.parse(oldRaw) : null;
    var newData = newRaw ? JSON.parse(newRaw) : null;
    var oldValid = Array.isArray(oldData) && oldData.length > 0;
    var newValid = Array.isArray(newData) && newData.length > 0;

    if (oldValid && !newValid) {
      // Old key has data, new doesn't — copy over
      localStorage.setItem('tk-trails', oldRaw);
      localStorage.removeItem('trails');
    } else if (oldValid && newValid) {
      // Both exist — use old data as base, merge enrichments from tk-trails by name
      var enrichMap = {};
      for (var j = 0; j < newData.length; j++) {
        if (newData[j] && newData[j].enrichment && newData[j].name) {
          enrichMap[newData[j].name.toLowerCase().trim()] = newData[j].enrichment;
        }
      }
      for (var i = 0; i < oldData.length; i++) {
        if (!oldData[i].enrichment && oldData[i].name) {
          var key = oldData[i].name.toLowerCase().trim();
          if (enrichMap[key]) {
            oldData[i].enrichment = enrichMap[key];
          }
        }
      }
      localStorage.setItem('tk-trails', JSON.stringify(oldData));
      localStorage.removeItem('trails');
    } else if (!oldValid && newValid) {
      // Only new key has data — already canonical, just remove old if present
      if (oldRaw !== null) localStorage.removeItem('trails');
    } else {
      // Neither has data — clean up
      if (oldRaw !== null) localStorage.removeItem('trails');
    }
  } catch (_) {}
})();

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function isSafeDataImage(src) {
  if (typeof src !== 'string') return false;
  if (src.length > 4_500_000) return false;
  const match = src.match(/^data:image\/(png|jpe?g|webp|gif|avif);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return false;
  return match[2].length % 4 === 0;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTrailList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (trail) {
    if (!trail || typeof trail !== 'object') return null;
    var name = typeof trail.name === 'string' ? trail.name.trim() : '';
    if (!name) return null;
    var category = typeof trail.category === 'string' && trail.category.trim()
      ? trail.category.trim()
      : 'Quick';
    var status = STATUSES.includes(trail.status) ? trail.status : 'unvisited';
    return Object.assign({}, trail, { name: name, category: category, status: status });
  }).filter(Boolean);
}

function normalizeHikeLog(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (entry) {
    if (!entry || typeof entry !== 'object') return null;
    var trail = typeof entry.trail === 'string' ? entry.trail.trim() : '';
    var trailId = typeof entry.trailId === 'string' ? entry.trailId.trim() : '';
    if (!trail && !trailId) return null;
    var rating = Number.isFinite(Number(entry.rating))
      ? Math.min(5, Math.max(0, Math.round(Number(entry.rating))))
      : 0;
    var milesNumber = entry.miles === '' || entry.miles == null ? NaN : Number(entry.miles);
    var elevationNumber = entry.elevation === '' || entry.elevation == null ? NaN : Number(entry.elevation);
    var miles = Number.isFinite(milesNumber) && milesNumber >= 0 ? String(entry.miles) : '';
    var elevation = Number.isFinite(elevationNumber) && elevationNumber >= 0 ? String(entry.elevation) : '';
    return Object.assign({}, entry, {
      trail: trail,
      trailId: trailId,
      trailNameSnapshot: typeof entry.trailNameSnapshot === 'string' ? entry.trailNameSnapshot : trail,
      date: typeof entry.date === 'string' ? entry.date : '',
      miles: miles,
      elevation: elevation,
      elevationFeet: entry.elevationFeet == null ? (elevation ? Number(elevation) : null) : entry.elevationFeet,
      note: typeof entry.note === 'string' ? entry.note : '',
      rating: rating
    });
  }).filter(Boolean);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    return typeof item === 'string' ? item.trim() : '';
  }).filter(Boolean);
}

let tkData = window.TK.storage ? window.TK.storage.load() : null;
let trails = tkData ? window.TK.storage.active(tkData.trails) : normalizeTrailList(store.get('tk-trails', []));
let hikeLog = tkData ? window.TK.storage.active(tkData.hikeLogs) : normalizeHikeLog(store.get('hikeLog', []));
let customGear = tkData ? window.TK.storage.active(tkData.gearItems).filter(item => !item.defaultItem).map(item => item.name) : normalizeStringList(store.get('customGear', []));
let checkedGear = tkData ? window.TK.storage.active(tkData.gearItems).map((item, index) => item.packed ? (item.defaultItem ? 'default_' + index : 'custom_' + customGear.findIndex(name => name === item.name)) : '').filter(Boolean).filter(key => !key.endsWith('_-1')) : normalizeStringList(store.get('checkedGear', []));
let selectedRating = 0;
let selectedTrailId = '';

function refreshFromData() {
  if (!window.TK.storage) return;
  tkData = window.TK.storage.load();
  trails = window.TK.storage.active(tkData.trails);
  hikeLog = window.TK.storage.active(tkData.hikeLogs);
}

function saveData() {
  if (!window.TK.storage) return;
  try {
    const deletedTrails = (tkData.trails || []).filter(record => record && record.deletedAt && !trails.some(active => active.id === record.id));
    const deletedLogs = (tkData.hikeLogs || []).filter(record => record && record.deletedAt && !hikeLog.some(active => active.id === record.id));
    tkData.trails = trails.concat(deletedTrails);
    tkData.hikeLogs = hikeLog.concat(deletedLogs);
    tkData = window.TK.storage.save(tkData);
    trails = window.TK.storage.active(tkData.trails);
    hikeLog = window.TK.storage.active(tkData.hikeLogs);
  } catch (_) {
    window.TK.runtimeState.storageError = 'Browser storage is unavailable. Keep a backup before leaving this page.';
    renderAdaptiveStates();
  }
}

function findTrailById(trailId) {
  return trails.find(trail => trail && trail.id === trailId) || null;
}

function findTrailName(trailId, fallback) {
  const trail = findTrailById(trailId);
  return trail ? trail.name : (fallback || '');
}

function getLastHiked(trailId) {
  const logs = hikeLog.filter(log => log && log.trailId === trailId && !log.deletedAt);
  logs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return logs[0] ? logs[0].date : '';
}

function syncGearData() {
  if (!window.TK.storage || !tkData) return;
  const defaultLabels = [...document.querySelectorAll('#checklist .check-item:not(.custom) label')].map(label => label.textContent.trim());
  const existing = tkData.gearItems || [];
  const nextItems = [];
  defaultLabels.forEach((name, index) => {
    let item = existing.find(record => record && record.defaultItem && record.name === name);
    if (!item) {
      item = { id: window.TK.storage.makeId('gear'), name, category: 'Essentials', defaultItem: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null };
    }
    item.packed = checkedGear.includes('default_' + index);
    window.TK.storage.touch(item);
    nextItems.push(item);
  });
  customGear.forEach((name, index) => {
    let item = existing.find(record => record && !record.defaultItem && record.name === name && !record.deletedAt);
    if (!item) {
      item = { id: window.TK.storage.makeId('gear'), name, category: 'Custom', defaultItem: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null };
    }
    item.packed = checkedGear.includes('custom_' + index);
    window.TK.storage.touch(item);
    nextItems.push(item);
  });
  const deleted = existing.filter(record => record && record.deletedAt);
  tkData.gearItems = nextItems.concat(deleted);
  tkData.gearKits = [{
    id: (tkData.gearKits && tkData.gearKits[0] && tkData.gearKits[0].id) || window.TK.storage.makeId('kit'),
    name: 'Pack Checklist',
    itemIds: nextItems.map(item => item.id),
    notes: '',
    createdAt: (tkData.gearKits && tkData.gearKits[0] && tkData.gearKits[0].createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  }];
  tkData = window.TK.storage.save(tkData);
}

function syncPlanningData() {
  if (!window.TK.storage || !tkData) return;
  const name = (document.getElementById('planTrail')?.textContent || '').trim();
  const trail = name ? window.TK.storage.upsertTrailByName(tkData, name, { status: 'planned', category: 'Planned', tags: ['Planned'] }) : null;
  const existing = (tkData.tripPlans || []).find(plan => plan && !plan.deletedAt && plan.date === new Date().toISOString().split('T')[0]);
  const plan = existing || {
    id: window.TK.storage.makeId('plan'),
    createdAt: new Date().toISOString(),
    deletedAt: null
  };
  plan.trailId = trail ? trail.id : '';
  plan.date = new Date().toISOString().split('T')[0];
  plan.startTime = store.get('planTime', '');
  plan.notes = store.get('tripNotes', '');
  plan.weatherSummary = store.get('weatherCity', '');
  plan.packList = ['water', 'snacks', 'layers', 'headlamp', 'first aid'];
  plan.status = trail ? 'planned' : 'draft';
  plan.updatedAt = new Date().toISOString();
  if (!existing) tkData.tripPlans = (tkData.tripPlans || []).concat(plan);
  tkData = window.TK.storage.save(tkData);
  trails = window.TK.storage.active(tkData.trails);
}

function syncFieldNotesData() {
  if (!window.TK.storage || !tkData) return;
  const terrain = document.getElementById('condTerrain')?.value.trim() || '';
  const access = document.getElementById('condAccess')?.value.trim() || '';
  const existing = tkData.fieldNotes || [];
  const next = existing.filter(note => note && note.deletedAt);
  [
    { type: 'terrain', title: 'Terrain', body: terrain },
    { type: 'access', title: 'Access', body: access }
  ].forEach(item => {
    if (!item.body) return;
    let note = existing.find(record => record && !record.deletedAt && record.type === item.type);
    if (!note) {
      note = { id: window.TK.storage.makeId('note'), createdAt: new Date().toISOString(), deletedAt: null };
    }
    note.type = item.type;
    note.title = item.title;
    note.body = item.body;
    note.updatedAt = new Date().toISOString();
    next.push(note);
  });
  tkData.fieldNotes = next;
  tkData = window.TK.storage.save(tkData);
}

function syncPhotoRecords() {
  if (!window.TK.storage || !tkData) return;
  const existing = tkData.photoRecords || [];
  const now = new Date().toISOString();
  tkData.photoRecords = PHOTO_KEYS.map((slotKey, index) => {
    const current = existing.find(photo => photo && photo.slotKey === slotKey);
    return {
      id: current && current.id ? current.id : window.TK.storage.makeId('photo'),
      slotKey,
      trailId: current && current.trailId ? current.trailId : '',
      hikeLogId: current && current.hikeLogId ? current.hikeLogId : '',
      caption: current && current.caption ? current.caption : '',
      storage: 'indexedDB',
      createdAt: current && current.createdAt ? current.createdAt : now,
      updatedAt: now,
      deletedAt: null
    };
  }).concat(existing.filter(photo => photo && photo.deletedAt));
  tkData = window.TK.storage.save(tkData);
}

function setupTwoClickConfirm(button, onConfirm, confirmText = 'Sure?') {
  let armed = false;
  let resetTimer = null;
  const defaultText = button.textContent;
  const reset = () => {
    armed = false;
    button.textContent = defaultText;
    button.classList.remove('is-confirming');
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  };
  button.addEventListener('click', e => {
    e.preventDefault();
    if (!armed) {
      armed = true;
      button.textContent = confirmText;
      button.classList.add('is-confirming');
      resetTimer = setTimeout(reset, 2000);
      return;
    }
    reset();
    onConfirm();
  });
}

/* ── TOAST ── */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  const text = document.createElement('span');
  text.className = 'toast-msg';
  text.textContent = msg;
  el.appendChild(text);
  const container = document.getElementById('toastContainer');
  if (!container) return;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function showUndoToast(msg, onUndo, timeoutMs = 5000) {
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('span');
  text.className = 'toast-msg';
  text.textContent = msg;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-undo';
  btn.textContent = 'Undo';
  let dismissed = false;
  const remove = () => {
    if (dismissed) return;
    dismissed = true;
    el.remove();
  };
  btn.addEventListener('click', () => {
    if (dismissed) return;
    dismissed = true;
    try { onUndo(); } finally { el.remove(); }
  });
  el.append(text, btn);
  const container = document.getElementById('toastContainer');
  if (!container) return;
  container.appendChild(el);
  setTimeout(remove, timeoutMs);
}

/* ── AUTOSAVE META ── */
const saveMeta = document.getElementById('saveMeta');
let saveMetaInterval = null;
let lastSavedAt = null;
function setSaveMeta(text) {
  if (!saveMeta) return;
  saveMeta.textContent = text;
}
function formatSavedAgo(msAgo) {
  if (msAgo < 5000) return 'Saved just now';
  if (msAgo < 60000) return `Saved ${Math.max(1, Math.floor(msAgo / 1000))}s ago`;
  if (msAgo < 3600000) return `Saved ${Math.floor(msAgo / 60000)}m ago`;
  return `Saved ${Math.floor(msAgo / 3600000)}h ago`;
}
function refreshSaveMeta() {
  if (!lastSavedAt) {
    setSaveMeta('Auto-save active');
    return;
  }
  setSaveMeta(formatSavedAgo(Date.now() - lastSavedAt));
}
window.addEventListener('trailkeeper:saved', () => {
  lastSavedAt = Date.now();
  refreshSaveMeta();
  if (!saveMetaInterval) saveMetaInterval = setInterval(refreshSaveMeta, 30000);
});
refreshSaveMeta();

function readWeatherVerdict() {
  var text = (weatherResult && weatherResult.textContent || '').toLowerCase();
  if (text.indexOf('no-go') >= 0) return 'no-go';
  if (text.indexOf('caution') >= 0) return 'caution';
  if (text.indexOf('go') >= 0) return 'go';
  return '';
}

function ensureSectionState(sectionId, tone, title, message) {
  var section = document.getElementById(sectionId);
  if (!section) return;
  var existing = section.querySelector('.section-state');
  if (!title && !message) {
    if (existing) existing.remove();
    return;
  }
  if (!existing) {
    existing = document.createElement('div');
    existing.className = 'section-state';
    var anchor = section.querySelector('.card, .two-col, .photo-strip, .log-stats, .trail-list');
    if (anchor) section.insertBefore(existing, anchor);
    else section.appendChild(existing);
  }
  existing.className = 'section-state is-' + (tone || 'active');
  existing.innerHTML =
    '<div class="section-state-title">' + esc(title || '') + '</div>' +
    '<div class="section-state-text">' + esc(message || '') + '</div>';
}

function ensureGlobalState(message) {
  var callout = document.querySelector('.callout');
  if (!callout || !callout.parentNode) return;
  var existing = document.getElementById('globalStateBanner');
  if (!message) {
    if (existing) existing.remove();
    return;
  }
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'globalStateBanner';
    existing.className = 'section-state is-error global-state';
    callout.insertAdjacentElement('afterend', existing);
  }
  existing.innerHTML =
    '<div class="section-state-title">Storage issue</div>' +
    '<div class="section-state-text">' + esc(message) + '</div>';
}

function renderAdaptiveStates() {
  var prefs = getPrefs();
  var trailState = Array.isArray(trails) ? trails : [];
  var logState = Array.isArray(hikeLog) ? hikeLog : [];
  var plannedTrails = trailState.filter(function (trail) { return trail && trail.status === 'planned'; });
  var gearDone = document.querySelectorAll('#checklist .check-item input:checked').length;
  var gearAll = document.querySelectorAll('#checklist .check-item input').length;
  var latestLog = logState.length ? logState[logState.length - 1] : null;
  var today = new Date().toISOString().split('T')[0];
  var hasPhoto = (window.TK.runtimeState.photoCount || 0) > 0;
  var weatherVerdict = readWeatherVerdict() || prefs.lastWeatherVerdict;
  var plannedTrailEl = document.getElementById('planTrail');
  var plannedTrailText = plannedTrailEl ? (plannedTrailEl.textContent || '').trim() : '';

  ensureGlobalState(window.TK.runtimeState.storageError);

  if (window.TK.runtimeState.weatherStatus === 'error') {
    ensureSectionState('sec-today', 'error', 'Weather unavailable', window.TK.runtimeState.weatherMessage || 'Try another city or retry when service is available.');
  } else if (!prefs.lastWeatherCity && !weatherVerdict) {
    ensureSectionState('sec-today', 'empty', 'Weather not checked yet', 'Add a city or zip code to unlock trail conditions and nearby trail suggestions.');
  } else if (weatherVerdict === 'no-go' || weatherVerdict === 'caution') {
    ensureSectionState('sec-today', 'active', 'Weather alert active', weatherVerdict === 'no-go' ? 'Conditions suggest postponing or choosing a safer route.' : 'Use caution and review wind, precipitation, and footing before heading out.');
  } else if (plannedTrailText) {
    ensureSectionState('sec-today', 'complete', 'Today is set', 'Trail, timing, and weather context are in place for this outing.');
  } else {
    ensureSectionState('sec-today', '', '', '');
  }

  if (window.TK.runtimeState.overpassError) {
    ensureSectionState('sec-trails', 'error', 'Trail data unavailable', window.TK.runtimeState.overpassError);
  } else if (!trailState.length) {
    ensureSectionState('sec-trails', 'empty', 'Start a shortlist', 'Add a trail manually or use weather plus nearby trail discovery to seed the list.');
  } else if (plannedTrails.length > 0) {
    ensureSectionState('sec-trails', 'active', 'Trails ready to hike', plannedTrails.length + ' planned trail' + (plannedTrails.length === 1 ? ' is' : 's are') + ' waiting in your shortlist.');
  } else {
    ensureSectionState('sec-trails', 'complete', 'Trail list established', trailState.length + ' trail' + (trailState.length === 1 ? '' : 's') + ' saved and ready to review.');
  }

  if (!logState.length) {
    ensureSectionState('sec-record', 'empty', 'No hikes logged yet', 'Use the log button after your next outing to build trail history automatically.');
  } else if (window.TK.runtimeState.hikeModalOpen) {
    ensureSectionState('sec-record', 'active', 'Logging in progress', 'Finish the current hike entry to update stats and the trail summary.');
  } else if (latestLog && latestLog.date === today) {
    ensureSectionState('sec-record', 'complete', 'Today’s hike is logged', 'Latest entry: ' + findTrailName(latestLog.trailId, latestLog.trailNameSnapshot) + '. Add photos or refine the note while details are fresh.');
  } else if (plannedTrailText) {
    ensureSectionState('sec-record', 'active', 'Ready to log', 'Today’s trail is selected. Log the hike when you return to capture miles, elevation, and notes.');
  } else {
    ensureSectionState('sec-record', '', '', '');
  }

  if (!gearAll) {
    ensureSectionState('sec-gear', 'empty', 'No gear checklist yet', 'Add a few essentials to create your recurring pack routine.');
  } else if (gearDone === 0) {
    ensureSectionState('sec-gear', 'empty', 'Pack not started', 'Start checking off the basics to build a pre-hike readiness routine.');
  } else if (gearDone < gearAll) {
    ensureSectionState('sec-gear', 'active', 'Packing in progress', (gearAll - gearDone) + ' item' + (gearAll - gearDone === 1 ? '' : 's') + ' left before you are trail-ready.');
  } else {
    ensureSectionState('sec-gear', 'complete', 'Pack ready', 'All checklist items are packed and the hike kit is ready to go.');
  }

  if (!hasPhoto) {
    ensureSectionState('sec-gallery', 'empty', 'No photos yet', 'Add a few field shots after the hike to build a visual log alongside notes and stats.');
  } else {
    ensureSectionState('sec-gallery', 'complete', 'Photo log active', window.TK.runtimeState.photoCount + ' saved photo' + (window.TK.runtimeState.photoCount === 1 ? '' : 's') + ' attached to this trip log.');
  }
}

window.addEventListener('trailkeeper:storage-error', renderAdaptiveStates);

/* ── STAGGER ANIMATIONS ── */
document.querySelectorAll('.section').forEach((el, i) => {
  el.style.animationDelay = (0.1 + i * 0.07) + 's';
});

/* ── BACK TO TOP ── */
const backToTop = document.getElementById('backToTop');
const firstSection = document.getElementById('sec-today');
const sectionNavLinks = [...document.querySelectorAll('.section-nav a')];
const sectionById = sectionNavLinks
  .map(link => {
    const id = (link.getAttribute('href') || '').replace(/^#/, '');
    return { link, section: document.getElementById(id) };
  })
  .filter(x => x.section);

function updateActiveSectionNav() {
  const marker = window.scrollY + 120;
  let activeId = '';
  for (const item of sectionById) {
    if (item.section.offsetTop <= marker) activeId = item.section.id;
  }
  sectionById.forEach(item => item.link.classList.toggle('is-active', item.section.id === activeId));
  if (activeId) updatePrefs({ lastActiveSection: activeId });
}

function updateBackToTop() {
  const threshold = firstSection ? firstSection.offsetTop + firstSection.offsetHeight : 300;
  backToTop.classList.toggle('is-visible', window.scrollY > threshold);
  updateActiveSectionNav();
}
window.addEventListener('scroll', updateBackToTop, { passive: true });
updateBackToTop();

/* ── CONTENTEDITABLE PERSISTENCE ── */
document.querySelectorAll('[data-key]').forEach(el => {
  const key = el.dataset.key;
  const saved = store.get(key, '');
  if (saved) el.textContent = saved;
  el.addEventListener('input', () => {
    var nextValue = el.textContent.trim();
    store.set(key, nextValue);
    if (key === 'planTrail') updatePrefs({ lastPlannedTrail: nextValue });
    if (key === 'planTrail' || key === 'planTime') syncPlanningData();
    renderAdaptiveStates();
  });
});

/* ── TRIP NOTES ── */
const notesToggle = document.getElementById('notesToggle');
const notesBody   = document.getElementById('notesBody');
const tripNotes   = document.getElementById('tripNotes');
function setNotesOpen(open) {
  notesBody.classList.toggle('is-open', open);
  notesToggle.setAttribute('aria-expanded', String(open));
  document.getElementById('notesArrow').setAttribute('points', open ? '18 9 12 15 6 9' : '9 18 15 12 9 6');
}
notesToggle.addEventListener('click', () => {
  const open = !notesBody.classList.contains('is-open');
  setNotesOpen(open);
  store.set('tripNotesOpen', open);
});
setNotesOpen(Boolean(store.get('tripNotesOpen', false)));
tripNotes.value = store.get('tripNotes', '');
tripNotes.addEventListener('input', () => {
  store.set('tripNotes', tripNotes.value);
  syncPlanningData();
});

/* ── WEATHER ── */
const weatherBtn    = document.getElementById('weatherFetch');
const weatherCity   = document.getElementById('weatherCity');
const weatherResult = document.getElementById('weatherResult');
const savedCity = getPrefs().lastWeatherCity || store.get('weatherCity', '');
if (savedCity) weatherCity.value = savedCity;
weatherBtn.addEventListener('click', fetchWeather);
weatherCity.addEventListener('keydown', e => e.key === 'Enter' && fetchWeather());

async function fetchWeather() {
  const city = weatherCity.value.trim();
  if (!city) {
    weatherResult.innerHTML = '<span class="weather-danger">Enter a city or zip code before checking weather.</span>';
    weatherResult.classList.add('is-visible');
    window.TK.runtimeState.weatherStatus = 'error';
    window.TK.runtimeState.weatherMessage = 'Enter a city or zip code before checking weather.';
    renderAdaptiveStates();
    weatherCity.focus();
    return;
  }
  store.set('weatherCity', city);
  syncPlanningData();
  updatePrefs({ lastWeatherCity: city });
  weatherBtn.textContent = '...';
  weatherBtn.disabled = true;
  weatherBtn.classList.add('weather-loading');
  window.TK.runtimeState.weatherStatus = 'loading';
  window.TK.runtimeState.weatherMessage = 'Checking forecast…';
  renderAdaptiveStates();
  try {
    const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!geoResp.ok) throw new Error('geo-http');
    const geo = await geoResp.json();
    if (!geo.results?.length) throw new Error('not-found');
    const { latitude, longitude, name, country_code } = geo.results[0];
    window.TK = window.TK || {}; window.TK.weatherContext = { zip: city, lat: latitude, lon: longitude, placeLabel: name || city };
    const wxResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=1`);
    if (!wxResp.ok) throw new Error('forecast-http');
    const wx = await wxResp.json();
    const d = wx.daily;
    if (!d || !Array.isArray(d.temperature_2m_max) || !Array.isArray(d.temperature_2m_min) ||
        !Array.isArray(d.precipitation_probability_max) || !Array.isArray(d.windspeed_10m_max)) {
      throw new Error('forecast-shape');
    }
    const high = Math.round(d.temperature_2m_max[0]);
    const low = Math.round(d.temperature_2m_min[0]);
    const precip = d.precipitation_probability_max[0];
    const wind = Math.round(d.windspeed_10m_max[0]);
    if (![high, low, precip, wind].every(Number.isFinite)) throw new Error('forecast-shape');
    let verdict, cls, icon;
    if (precip >= 70 || wind >= 35) { verdict = 'No-go'; cls = 'weather-no'; icon = '[X]'; }
    else if (precip >= 40 || wind >= 20) { verdict = 'Caution'; cls = 'weather-warn'; icon = '[!]'; }
    else { verdict = 'Go'; cls = 'weather-go'; icon = '[OK]'; }
    weatherResult.innerHTML = `<span class="${cls}">${esc(icon)} ${esc(verdict)}</span> - ${esc(name)}, ${esc((country_code || '').toUpperCase())}<span class="weather-detail">High ${esc(high)}F · Low ${esc(low)}F · Precip ${esc(precip)}% · Wind ${esc(wind)} mph</span>`;
    weatherResult.classList.add('is-visible');
    window.TK.runtimeState.weatherStatus = verdict.toLowerCase() === 'go' ? 'ready' : 'alert';
    window.TK.runtimeState.weatherMessage = verdict;
    updatePrefs({ lastWeatherVerdict: verdict.toLowerCase() });
  } catch (err) {
    const reason = err && err.message === 'not-found'
      ? 'Location not found. Try a different city or zip code.'
      : err && err.message === 'forecast-http'
        ? 'Weather forecast service returned an error. Try again later.'
        : err && err.message === 'forecast-shape'
          ? 'Weather forecast data was incomplete. Try again later.'
          : 'Weather service is unreachable. Check your connection and try again.';
    weatherResult.innerHTML = `<span class="weather-danger">${esc(reason)}</span>`;
    weatherResult.classList.add('is-visible');
    window.TK.runtimeState.weatherStatus = 'error';
    window.TK.runtimeState.weatherMessage = reason;
  } finally {
    weatherBtn.textContent = 'Check';
    weatherBtn.disabled = false;
    weatherBtn.classList.remove('weather-loading');
    renderAdaptiveStates();
  }
}

/* ── TRAIL SHORTLIST ── */
function renderTrails() {
  const list = document.getElementById('trailList');
  if (!list) return;
  trails = normalizeTrailList(trails);
  list.innerHTML = '';
  if (!trails.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.innerHTML = `<span class="empty-state-icon" aria-hidden="true">\uD83E\uDD7E</span>
      <div class="empty-state-title">No trails yet</div>
      <div class="empty-state-hint">Add your first trail below, or press <kbd>/</kbd> to jump to the input.</div>`;
    list.appendChild(empty);
    return;
  }
  let statusUpdated = false;
  trails.forEach((t, i) => {
    const safeStatus = STATUSES.includes(t.status) ? t.status : 'unvisited';
    const safeCategory = TRAIL_CATEGORIES.includes(t.category) ? t.category : t.category || 'Quick';
    if (safeStatus !== t.status || safeCategory !== t.category) statusUpdated = true;
    trails[i].status = safeStatus;
    trails[i].category = safeCategory;
    const safeStatusLabel = esc(SLABELS[safeStatus]);
    const li = document.createElement('li');
    li.className = 'trail-item';
    li.innerHTML = `
      <span class="trail-tag">${esc(safeCategory)}</span>
      <span class="trail-name${safeStatus==='done'?' done':''}">${esc(t.name)}</span>
      <button class="trail-set-today btn" aria-label="Set as today's trail">\u2192 Today</button>
      <button class="trail-detail-open btn" aria-label="View ${esc(t.name)} detail">Detail</button>
      <button class="trail-status ${safeStatus}" aria-label="Status: ${safeStatusLabel}">${safeStatusLabel}</button>
      <button class="trail-delete" aria-label="Remove ${esc(t.name)}">\u2715</button>`;
    li.querySelector('.trail-set-today').addEventListener('click', () => {
      const el = document.getElementById('planTrail');
      el.textContent = t.name;
      store.set('planTrail', t.name);
      updatePrefs({ lastPlannedTrail: t.name });
      syncPlanningData();
      renderAdaptiveStates();
      toast(`"${t.name}" set as today's trail`, 'success');
    });
    li.querySelector('.trail-detail-open').addEventListener('click', () => {
      selectedTrailId = t.id;
      renderTrailLibrary();
      document.getElementById('sec-library').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    li.querySelector('.trail-status').addEventListener('click', () => {
      const statusTrailName = t.name;
      const previousStatus = trails[i].status;
      const nextStatus = STATUSES[(STATUSES.indexOf(safeStatus) + 1) % STATUSES.length];
      trails[i].status = nextStatus;
      if (window.TK.storage) window.TK.storage.touch(trails[i]);
      saveData();
      renderTrails();
      showUndoToast(`Status changed to ${SLABELS[nextStatus]}`, () => {
        const targetIndex = trails.findIndex((trail) => trail && trail.name === statusTrailName);
        if (targetIndex < 0) return;
        trails[targetIndex].status = previousStatus;
        if (window.TK.storage) window.TK.storage.touch(trails[targetIndex]);
        saveData();
        renderTrails();
        toast('Status restored', 'success');
      });
    });
    li.querySelector('.trail-delete').addEventListener('click', () => {
      const prevTrails = deepClone(trails);
      const removedName = t.name;
      if (window.TK.storage) window.TK.storage.softDelete(trails[i]);
      else trails.splice(i, 1);
      saveData();
      renderTrails();
      toast('Trail removed');
      showUndoToast(`Removed "${removedName}"`, () => {
        trails = prevTrails;
        saveData();
        renderTrails();
        toast('Trail restored', 'success');
      });
    });
    list.appendChild(li);
  });
  if (statusUpdated) saveData();
  renderTrailLibrary();
  renderAdaptiveStates();
}

document.getElementById('trailAdd').addEventListener('click', addTrail);
document.getElementById('trailInput').addEventListener('keydown', e => e.key==='Enter' && addTrail());
function addTrail() {
  const name = document.getElementById('trailInput').value.trim();
  if (!name) return;
  const duplicate = trails.some(function (trail) {
    return trail && trail.name && trail.name.toLowerCase().trim() === name.toLowerCase();
  });
  if (duplicate) {
    toast('Trail already in shortlist');
    return;
  }
  const category = document.getElementById('trailCategory').value;
  if (window.TK.storage) {
    window.TK.storage.upsertTrailByName(tkData, name, { category, tags: [category], status: 'unvisited' });
    trails = window.TK.storage.active(tkData.trails);
    saveData();
  } else {
    trails.push({ name, category, status: 'unvisited' });
    store.set('tk-trails', trails);
  }
  document.getElementById('trailInput').value = '';
  renderTrails();
  updatePrefs({ lastPlannedTrail: name });
  toast(`"${name}" added`, 'success');
}

function renderTrailLibrary() {
  const library = document.getElementById('trailLibrary');
  const detail = document.getElementById('trailDetail');
  if (!library || !detail) return;
  library.innerHTML = '';
  const visibleTrails = trails.filter(trail => trail && !trail.deletedAt);
  if (!visibleTrails.length) {
    library.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">+</span><div class="empty-state-title">No trail records</div><div class="empty-state-hint">Add a trail or create one from the hike log form.</div></div>';
  } else {
    visibleTrails.forEach(trail => {
      const enrich = trail.enrichment && trail.enrichment.fields ? trail.enrichment.fields : {};
      const distance = trail.distanceMiles != null ? trail.distanceMiles + ' mi' : enrich.distance_km != null ? (Number(enrich.distance_km) * 0.621371).toFixed(1) + ' mi' : 'Distance open';
      const elevation = trail.elevationFeet != null ? Number(trail.elevationFeet).toLocaleString() + ' ft' : enrich.elevation_gain_m != null ? Math.round(Number(enrich.elevation_gain_m) * 3.28084).toLocaleString() + ' ft' : 'Elev open';
      const difficulty = trail.difficulty || enrich.difficulty || 'Difficulty open';
      const lastHiked = getLastHiked(trail.id);
      const card = document.createElement('article');
      card.className = 'trail-library-card' + (trail.id === selectedTrailId ? ' is-selected' : '');
      card.innerHTML = `
        <div class="trail-library-topline">
          <span class="trail-library-status">${esc(trail.status || 'unvisited')}</span>
          <span class="trail-library-last">${esc(lastHiked ? 'Last ' + lastHiked : 'Not hiked')}</span>
        </div>
        <h3 class="trail-library-name">${esc(trail.name)}</h3>
        <div class="trail-library-location">${esc(trail.location || 'Location open')}</div>
        <div class="trail-library-metrics">
          <span>${esc(distance)}</span>
          <span>${esc(elevation)}</span>
          <span>${esc(difficulty)}</span>
        </div>
        <div class="trail-library-tags">${(trail.tags || []).map(tag => '<span>' + esc(tag) + '</span>').join('') || '<span>untagged</span>'}</div>
        <div class="trail-library-note">${esc(trail.nextTimeNote || 'No next time note yet')}</div>
        <button class="btn btn-ghost trail-card-open" type="button">Open detail</button>`;
      card.querySelector('.trail-card-open').addEventListener('click', () => {
        selectedTrailId = trail.id;
        renderTrailLibrary();
      });
      library.appendChild(card);
    });
  }
  renderTrailDetail();
}

function renderTrailDetail() {
  const detail = document.getElementById('trailDetail');
  if (!detail) return;
  const trail = selectedTrailId ? findTrailById(selectedTrailId) : null;
  if (!trail) {
    detail.hidden = true;
    detail.innerHTML = '';
    return;
  }
  detail.hidden = false;
  const logs = hikeLog.filter(log => log.trailId === trail.id && !log.deletedAt).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const plans = (tkData.tripPlans || []).filter(plan => plan && !plan.deletedAt && plan.trailId === trail.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const links = (trail.links || []).filter(link => link.label || link.url);
  detail.innerHTML = `
    <div class="trail-detail-header">
      <div>
        <div class="section-label">Trail Detail</div>
        <h3 class="trail-detail-title">${esc(trail.name)}</h3>
      </div>
      <div class="trail-detail-actions">
        <button class="btn btn-primary" id="detailLogTrail" type="button">Log hike</button>
        <button class="btn btn-ghost" id="detailSetToday" type="button">Today</button>
      </div>
    </div>
    <div class="trail-detail-grid">
      <label class="modal-field"><span class="modal-label">Location</span><input class="modal-input" id="detailLocation" value="${esc(trail.location || '')}" placeholder="Town, park, region"></label>
      <label class="modal-field"><span class="modal-label">Distance miles</span><input class="modal-input" id="detailDistance" type="number" step="0.1" min="0" value="${trail.distanceMiles == null ? '' : esc(trail.distanceMiles)}"></label>
      <label class="modal-field"><span class="modal-label">Elevation feet</span><input class="modal-input" id="detailElevation" type="number" min="0" value="${trail.elevationFeet == null ? '' : esc(trail.elevationFeet)}"></label>
      <label class="modal-field"><span class="modal-label">Difficulty</span><input class="modal-input" id="detailDifficulty" value="${esc(trail.difficulty || '')}" placeholder="Easy, moderate, hard"></label>
      <label class="modal-field trail-detail-wide"><span class="modal-label">Tags</span><input class="modal-input" id="detailTags" value="${esc((trail.tags || []).join(', '))}" placeholder="ridge, lake, winter"></label>
      <label class="modal-field trail-detail-wide"><span class="modal-label">Next time note</span><textarea class="modal-textarea" id="detailNext">${esc(trail.nextTimeNote || '')}</textarea></label>
      <label class="modal-field trail-detail-wide"><span class="modal-label">Notes</span><textarea class="modal-textarea" id="detailNotes">${esc(trail.notes || '')}</textarea></label>
    </div>
    <div class="trail-detail-block">
      <div class="trail-detail-subtitle">Links</div>
      ${links.length ? links.map(link => '<a class="trail-detail-link" href="' + esc(link.url) + '" target="_blank" rel="noopener">' + esc(link.label || link.url) + '</a>').join('') : '<div class="trail-detail-empty">No trail links saved.</div>'}
    </div>
    <div class="trail-detail-block">
      <div class="trail-detail-subtitle">Hike History</div>
      ${logs.length ? logs.map(log => '<div class="trail-detail-row"><strong>' + esc(log.date || '') + '</strong><span>' + esc(log.miles == null ? '' : log.miles + ' mi') + '</span><span>' + esc(log.note || '') + '</span></div>').join('') : '<div class="trail-detail-empty">No hikes logged for this trail.</div>'}
    </div>
    <div class="trail-detail-block">
      <div class="trail-detail-subtitle">Planned Hikes</div>
      ${plans.length ? plans.map(plan => '<div class="trail-detail-row"><strong>' + esc(plan.date || '') + '</strong><span>' + esc(plan.startTime || '') + '</span><span>' + esc(plan.notes || plan.status || '') + '</span></div>').join('') : '<div class="trail-detail-empty">No planned hikes for this trail.</div>'}
    </div>`;

  ['detailLocation', 'detailDistance', 'detailElevation', 'detailDifficulty', 'detailTags', 'detailNext', 'detailNotes'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      const currentTrail = (tkData.trails || []).find(record => record && record.id === trail.id) || trail;
      currentTrail.location = document.getElementById('detailLocation').value.trim();
      currentTrail.distanceMiles = document.getElementById('detailDistance').value ? Number(document.getElementById('detailDistance').value) : null;
      currentTrail.elevationFeet = document.getElementById('detailElevation').value ? Number(document.getElementById('detailElevation').value) : null;
      currentTrail.difficulty = document.getElementById('detailDifficulty').value.trim();
      currentTrail.tags = document.getElementById('detailTags').value.split(',').map(tag => tag.trim()).filter(Boolean);
      currentTrail.category = currentTrail.tags[0] || currentTrail.category || 'Quick';
      currentTrail.nextTimeNote = document.getElementById('detailNext').value.trim();
      currentTrail.notes = document.getElementById('detailNotes').value.trim();
      if (window.TK.storage) window.TK.storage.touch(currentTrail);
      trails = window.TK.storage.active(tkData.trails);
      saveData();
    });
  });

  document.getElementById('detailLogTrail').addEventListener('click', () => openModal(trail.id));
  document.getElementById('detailSetToday').addEventListener('click', () => {
    const el = document.getElementById('planTrail');
    el.textContent = trail.name;
    store.set('planTrail', trail.name);
    updatePrefs({ lastPlannedTrail: trail.name });
    syncPlanningData();
    renderAdaptiveStates();
    toast(`"${trail.name}" set as today's trail`, 'success');
  });
}

document.getElementById('clearTrailDetail').addEventListener('click', () => {
  selectedTrailId = '';
  renderTrailLibrary();
});
renderTrails();

/* ── HIKE LOG ── */
function renderLog() {
  const entries = document.getElementById('logEntries');
  if (!entries) return;
  hikeLog = normalizeHikeLog(hikeLog);
  entries.innerHTML = '';
  if (!hikeLog.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.innerHTML = `<span class="empty-state-icon" aria-hidden="true">\uD83D\uDCCB</span>
      <div class="empty-state-title">No hikes logged</div>
      <div class="empty-state-hint">Press <kbd>L</kbd> or hit <strong>+ Log hike</strong> above to record your first outing.</div>`;
    entries.appendChild(empty);
  } else {
    [...hikeLog].reverse().forEach((h, ri) => {
      const i = hikeLog.length - 1 - ri;
      const li = document.createElement('li');
      li.className = 'log-entry';
      const safeRating = Number.isFinite(Number(h.rating)) ? Math.min(5, Math.max(0, Math.round(Number(h.rating)))) : 0;
      const trailName = findTrailName(h.trailId, h.trailNameSnapshot || h.trail);
      const stars = safeRating ? `<span class="log-stars">${'\u2605'.repeat(safeRating)}${'\u2606'.repeat(5 - safeRating)}</span>` : '';
      const milesText = h.miles != null ? ` \u00B7 ${esc(h.miles)} mi` : '';
      const elevation = h.elevationFeet != null ? h.elevationFeet : h.elevation;
      const elevationValue = elevation ? Number(elevation) : NaN;
      const elevationText = elevation
        ? ` \u00B7 ${Number.isFinite(elevationValue) ? esc(elevationValue.toLocaleString()) : esc(elevation)} ft`
        : '';
      li.innerHTML = `
        <div>
          <div class="log-entry-header"><span class="log-entry-name">${esc(trailName)}</span><button class="copy-btn" aria-label="Copy trail name">Copy</button></div>
          <div class="log-entry-meta">${esc(h.date || '')}${milesText}${elevationText}${safeRating ? ' \u00B7 ' + stars : ''}</div>
          ${h.note ? `<div class="log-entry-note">${esc(h.note)}</div>` : ''}
        </div>
        <button class="btn btn-danger" aria-label="Delete entry">\u2715</button>`;
      li.querySelector('.btn-danger').addEventListener('click', () => {
        const prevLog = deepClone(hikeLog);
        const removedTrailName = trailName;
        if (window.TK.storage) window.TK.storage.softDelete(hikeLog[i]);
        else hikeLog.splice(i, 1);
        saveData();
        renderLog();
        toast('Entry removed');
        showUndoToast(`Removed "${removedTrailName}" log`, () => {
          hikeLog = prevLog;
          saveData();
          renderLog();
          toast('Entry restored', 'success');
        });
      });
      const logCopyBtn = li.querySelector('.copy-btn');
      if (logCopyBtn) logCopyBtn.addEventListener('click', () => copyText(trailName, logCopyBtn));
      entries.appendChild(li);
    });
  }
  const miles = hikeLog.reduce((s, h) => s + (parseFloat(h.miles) || 0), 0);
  const elev = hikeLog.reduce((s, h) => s + (parseInt(h.elevationFeet != null ? h.elevationFeet : h.elevation) || 0), 0);
  const longest = hikeLog.reduce((m, h) => Math.max(m, parseFloat(h.miles) || 0), 0);
  document.getElementById('statHikes').textContent = hikeLog.length;
  document.getElementById('statMiles').textContent = miles.toFixed(1);
  document.getElementById('statElev').textContent = elev >= 1000 ? (elev / 1000).toFixed(1) + 'k' : elev;
  document.getElementById('statLongest').textContent = longest.toFixed(1);
  renderTrailLibrary();
  renderAdaptiveStates();
}

let previouslyFocused = null;
const logModal = document.getElementById('logModal');
const pageEl = document.querySelector('.page');
const modalCard = logModal.querySelector('.modal');

function getModalFocusable() {
  return [...modalCard.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.hasAttribute('hidden'));
}

function populateTrailSelect(preferredTrailId) {
  const select = document.getElementById('logTrailSelect');
  if (!select) return;
  select.innerHTML = '';
  trails.forEach(trail => {
    if (!trail || trail.deletedAt) return;
    const option = document.createElement('option');
    option.value = trail.id;
    option.textContent = trail.name;
    select.appendChild(option);
  });
  const createOption = document.createElement('option');
  createOption.value = '__new';
  createOption.textContent = 'Create new trail';
  select.appendChild(createOption);
  select.value = preferredTrailId && trails.some(trail => trail.id === preferredTrailId) ? preferredTrailId : (select.options[0] ? select.options[0].value : '__new');
  const newInput = document.getElementById('logTrailNew');
  newInput.hidden = select.value !== '__new';
  newInput.toggleAttribute('required', select.value === '__new');
}

function openModal(preferredTrailId) {
  previouslyFocused = document.activeElement;
  populateTrailSelect(preferredTrailId);
  const suggestedTrail =
    document.getElementById('planTrail').textContent.trim() ||
    (trails.find(t => t.status === 'planned') || trails[0] || {}).name ||
    '';
  if (!preferredTrailId && suggestedTrail) {
    const found = trails.find(t => t.name.toLowerCase() === suggestedTrail.toLowerCase());
    if (found) {
      document.getElementById('logTrailSelect').value = found.id;
      document.getElementById('logTrailNew').hidden = true;
    } else {
      document.getElementById('logTrailSelect').value = '__new';
      document.getElementById('logTrailNew').hidden = false;
      document.getElementById('logTrailNew').value = suggestedTrail;
    }
  }
  document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
  logModal.classList.add('is-open');
  window.TK.runtimeState.hikeModalOpen = true;
  pageEl.setAttribute('aria-hidden', 'true');
  renderAdaptiveStates();
  setTimeout(() => {
    const focusable = getModalFocusable();
    if (focusable.length) focusable[0].focus();
  }, 50);
}

function closeModal() {
  if (!logModal.classList.contains('is-open')) return;
  logModal.classList.remove('is-open');
  window.TK.runtimeState.hikeModalOpen = false;
  pageEl.removeAttribute('aria-hidden');
  document.getElementById('logTrailSelect').value = '';
  document.getElementById('logTrailNew').value = '';
  document.getElementById('logTrailNew').hidden = true;
  document.getElementById('logNote').value = '';
  document.getElementById('logMiles').value = '';
  document.getElementById('logElevation').value = '';
  selectedRating = 0;
  document.querySelectorAll('.rating-star').forEach(s => s.classList.remove('is-active'));
  if (previouslyFocused) { previouslyFocused.focus(); previouslyFocused = null; }
  renderAdaptiveStates();
}

/* Focus trap inside modal */
logModal.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('logSave').click();
    return;
  }
  if (!logModal.classList.contains('is-open') || e.key !== 'Tab') return;
  const focusable = getModalFocusable();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

document.getElementById('openLogModal').addEventListener('click', () => openModal());
document.getElementById('logTrailSelect').addEventListener('change', () => {
  const isNew = document.getElementById('logTrailSelect').value === '__new';
  document.getElementById('logTrailNew').hidden = !isNew;
  if (isNew) document.getElementById('logTrailNew').focus();
});
document.getElementById('logCancel').addEventListener('click', closeModal);
logModal.addEventListener('click', e => e.target === e.currentTarget && closeModal());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && logModal.classList.contains('is-open')) closeModal(); });

function isTypingTarget(el) {
  if (!el) return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

document.addEventListener('keydown', e => {
  if (isTypingTarget(document.activeElement) || logModal.classList.contains('is-open')) return;
  const key = e.key.toLowerCase();
  if (e.key === '/') {
    e.preventDefault();
    document.getElementById('trailInput').focus();
    return;
  }
  if (key === 'l') {
    e.preventDefault();
    openModal();
    return;
  }
  if (key === 'g') {
    e.preventDefault();
    document.getElementById('gearInput').focus();
  }
});

document.getElementById('logSave').addEventListener('click', () => {
  const select = document.getElementById('logTrailSelect');
  const newTrailInput = document.getElementById('logTrailNew');
  let trailId = select.value;
  let trailName = findTrailName(trailId, '');
  if (trailId === '__new') {
    trailName = newTrailInput.value.trim();
    if (!trailName) { newTrailInput.focus(); return; }
    const created = window.TK.storage ? window.TK.storage.upsertTrailByName(tkData, trailName, { category: 'Quick', tags: ['Quick'], status: 'done' }) : null;
    if (created) {
      trailId = created.id;
      trails = window.TK.storage.active(tkData.trails);
      saveData();
    }
  }
  if (!trailId || trailId === '__new') { select.focus(); return; }
  const miles = document.getElementById('logMiles').value;
  const elevation = document.getElementById('logElevation').value;
  if (miles && Number(miles) < 0) { document.getElementById('logMiles').focus(); return; }
  if (elevation && Number(elevation) < 0) { document.getElementById('logElevation').focus(); return; }
  const trail = findTrailById(trailId);
  if (!trailName && trail) trailName = trail.name;
  if (trail && trail.status !== 'done') {
    trail.status = 'done';
    if (window.TK.storage) window.TK.storage.touch(trail);
  }
  hikeLog.push({
    id: window.TK.storage ? window.TK.storage.makeId('log') : undefined,
    trailId,
    trailNameSnapshot: trailName,
    date: document.getElementById('logDate').value,
    miles: miles ? Number(miles) : null,
    elevationFeet: elevation ? Number(elevation) : null,
    note: document.getElementById('logNote').value.trim(),
    rating: selectedRating,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  });
  saveData();
  updatePrefs({ lastPlannedTrail: trailName });
  renderTrails();
  renderLog();
  closeModal();
  toast(`"${trailName}" logged!`, 'success');
});

document.querySelectorAll('.rating-star').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRating = +btn.dataset.val;
    document.querySelectorAll('.rating-star').forEach((s,i) => s.classList.toggle('is-active', i < selectedRating));
  });
});

renderLog();

/* ── GEAR CHECKLIST ── */
function updateProgress() {
  const all  = document.querySelectorAll('#checklist .check-item input').length;
  const done = document.querySelectorAll('#checklist .check-item input:checked').length;
  document.getElementById('checkProgress').textContent = `${done} / ${all} packed`;
  renderAdaptiveStates();
}

function syncChecklistFromState() {
  document.querySelectorAll('#checklist .check-item').forEach(li => li.classList.remove('checked-label'));
  document.querySelectorAll('#checklist .check-item:not(.custom)').forEach((item, i) => {
    const cb = item.querySelector('input');
    const checked = checkedGear.includes('default_' + i);
    cb.checked = checked;
    if (checked) item.classList.add('checked-label');
  });
  document.querySelectorAll('#checklist .check-item.custom').forEach((item, i) => {
    const cb = item.querySelector('input');
    const checked = checkedGear.includes('custom_' + i);
    cb.checked = checked;
    if (checked) item.classList.add('checked-label');
  });
}

function renderCustomGear() {
  document.querySelectorAll('#checklist .custom').forEach(el => el.remove());
  customGear.forEach((label, ci) => {
    const li = document.createElement('li');
    li.className = 'check-item custom';
    const key = 'custom_' + ci;
    const checked = checkedGear.includes(key);
    li.innerHTML = `<input type="checkbox" aria-label="${esc(label)}"${checked?' checked':''}> ${esc(label)}<button class="check-delete" aria-label="Remove ${esc(label)}">\u2715</button>`;
    if (checked) li.classList.add('checked-label');
    li.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) { if (!checkedGear.includes(key)) checkedGear.push(key); li.classList.add('checked-label'); }
      else { checkedGear = checkedGear.filter(k => k !== key); li.classList.remove('checked-label'); }
      store.set('checkedGear', checkedGear);
      syncGearData();
      updateProgress();
    });
    li.addEventListener('click', e => {
      if (e.target.closest('.check-delete') || e.target.tagName === 'INPUT') return;
      li.querySelector('input').click();
    });
    li.querySelector('.check-delete').addEventListener('click', () => {
      const prevCustomGear = deepClone(customGear);
      const prevCheckedGear = deepClone(checkedGear);
      customGear.splice(ci, 1);
      checkedGear = checkedGear.filter(k => !k.startsWith('custom_'));
      store.set('customGear', customGear);
      store.set('checkedGear', checkedGear);
      syncGearData();
      renderCustomGear();
      syncChecklistFromState();
      updateProgress();
      showUndoToast(`Removed "${label}"`, () => {
        customGear = prevCustomGear;
        checkedGear = prevCheckedGear;
        store.set('customGear', customGear);
        store.set('checkedGear', checkedGear);
        syncGearData();
        renderCustomGear();
        syncChecklistFromState();
        updateProgress();
        toast('Gear restored', 'success');
      });
    });
    document.getElementById('checklist').appendChild(li);
  });
}

document.querySelectorAll('#checklist .check-item:not(.custom)').forEach((item, i) => {
  const cb = item.querySelector('input');
  const key = 'default_' + i;
  if (checkedGear.includes(key)) { cb.checked = true; item.classList.add('checked-label'); }
  cb.addEventListener('change', () => {
    if (cb.checked) { if (!checkedGear.includes(key)) checkedGear.push(key); item.classList.add('checked-label'); }
    else { checkedGear = checkedGear.filter(k => k !== key); item.classList.remove('checked-label'); }
    store.set('checkedGear', checkedGear);
    syncGearData();
    updateProgress();
  });
  item.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT' || e.target.closest('.check-delete')) return;
    cb.click();
  });
});

document.getElementById('checkReset').addEventListener('click', () => {
  const prevCheckedGear = deepClone(checkedGear);
  checkedGear = [];
  store.set('checkedGear', checkedGear);
  syncGearData();
  syncChecklistFromState();
  updateProgress();
  toast('Checklist reset');
  showUndoToast('Checklist reset', () => {
    checkedGear = prevCheckedGear;
    store.set('checkedGear', checkedGear);
    syncGearData();
    syncChecklistFromState();
    updateProgress();
    toast('Checklist restored', 'success');
  });
});

document.getElementById('gearAdd').addEventListener('click', addGear);
document.getElementById('gearInput').addEventListener('keydown', e => e.key === 'Enter' && addGear());
function addGear() {
  const val = document.getElementById('gearInput').value.trim();
  if (!val) return;
  customGear.push(val);
  store.set('customGear', customGear);
  syncGearData();
  document.getElementById('gearInput').value = '';
  renderCustomGear();
  updateProgress();
  toast(`"${val}" added`, 'success');
}
renderCustomGear();
syncChecklistFromState();
updateProgress();

/* ── CONDITIONS ── */
['condTerrain','condAccess'].forEach(id => {
  const el = document.getElementById(id);
  el.value = store.get(id, '');
  el.addEventListener('input', () => {
    store.set(id, el.value);
    syncFieldNotesData();
  });
});

/* ── PHOTOS (IndexedDB via photoStore) ── */
const PHOTO_KEYS = ['photo0','photo1','photo2'];

function buildPhotoSlots() {
  const strip = document.getElementById('photoStrip');
  strip.innerHTML = '';
  syncPhotoRecords();

  // Use photoStore if available, otherwise fall back to localStorage
  const PS = window.TK && window.TK.photoStore;

  if (PS) {
    // Load all photos from IndexedDB asynchronously, then build slots
    var loadPromises = PHOTO_KEYS.map(function (key) {
      return PS.getPhoto(key).then(function (data) {
        return { key: key, data: data };
      }).catch(function () {
        return { key: key, data: null };
      });
    });

    Promise.all(loadPromises).then(function (results) {
      strip.innerHTML = '';
      window.TK.runtimeState.photoCount = results.filter(function (r) { return !!r.data; }).length;
      updatePrefs({ lastViewedPhotoCount: window.TK.runtimeState.photoCount });
      results.forEach(function (r, i) {
        buildSinglePhotoSlot(strip, r.key, i, r.data, PS);
      });
      renderAdaptiveStates();
    });
  } else {
    // Fallback: localStorage (original behavior)
    var count = 0;
    PHOTO_KEYS.forEach((key, i) => {
      const saved = store.get(key, null);
      if (saved) count += 1;
      buildSinglePhotoSlot(strip, key, i, saved, null);
    });
    window.TK.runtimeState.photoCount = count;
    updatePrefs({ lastViewedPhotoCount: count });
    renderAdaptiveStates();
  }
}

function buildSinglePhotoSlot(strip, key, i, saved, photoStoreRef) {
  const slot = document.createElement('div');
  slot.className = 'photo-slot';
  slot.setAttribute('aria-label', `Photo slot ${i+1}`);

  if (saved && !isSafeDataImage(saved)) {
    saved = null;
    // Clean up invalid data
    if (photoStoreRef) {
      photoStoreRef.deletePhoto(key).catch(function () {});
    }
  }

  if (saved && isSafeDataImage(saved)) {
    slot.classList.add('has-photo');
    const img = document.createElement('img');
    img.src = saved;
    img.alt = `Hike photo ${i + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'photo-remove';
    removeBtn.setAttribute('aria-label', 'Remove photo');
    removeBtn.textContent = '\u2715';
    slot.appendChild(img);
    slot.appendChild(removeBtn);
    slot.querySelector('.photo-remove').addEventListener('click', e => {
      e.stopPropagation();
      var removedPhoto = saved;
      var restore = function () {
        if (photoStoreRef) {
          photoStoreRef.savePhoto(key, removedPhoto).then(buildPhotoSlots).catch(buildPhotoSlots);
        } else {
          store.set(key, removedPhoto);
          buildPhotoSlots();
        }
      };
      if (photoStoreRef) {
        photoStoreRef.deletePhoto(key).then(function () {
          buildPhotoSlots();
          showUndoToast('Photo removed', function () {
            restore();
            toast('Photo restored', 'success');
          });
        }).catch(function () {
          buildPhotoSlots();
        });
      } else {
        store.set(key, null);
        buildPhotoSlots();
        showUndoToast('Photo removed', function () {
          restore();
          toast('Photo restored', 'success');
        });
      }
    });
  } else {
    slot.innerHTML = `
      <input type="file" accept="image/*" aria-label="Upload photo ${i+1}">
      <div class="photo-slot-content">
        <span class="photo-slot-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </span>
        <span class="photo-slot-text">Add photo</span>
      </div>`;
    slot.querySelector('input[type="file"]').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { toast('Image too large (max 3MB)'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        const base64 = ev.target.result;
        if (photoStoreRef) {
          photoStoreRef.savePhoto(key, base64).then(function () {
            buildPhotoSlots();
            toast('Photo saved', 'success');
          }).catch(function () {
            // Fallback: try localStorage
            store.set(key, base64);
            buildPhotoSlots();
            toast('Photo saved', 'success');
          });
        } else {
          store.set(key, base64);
          buildPhotoSlots();
          toast('Photo saved', 'success');
        }
      };
      reader.readAsDataURL(file);
    });
  }
  strip.appendChild(slot);
}

/* Migrate old localStorage photos to IndexedDB at boot */
(function migratePhotos() {
  var PS = window.TK && window.TK.photoStore;
  if (PS) {
    PS.migrateFromLocalStorage().catch(function () {});
  }
})();

buildPhotoSlots();

/* ── OVERFLOW AFFORDANCES ── */
function setupScrollFade(el) {
  if (!el) return;
  function update() {
    el.classList.toggle('can-scroll-left', el.scrollLeft > 4);
    el.classList.toggle('can-scroll-right', el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }
  el.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(el);
  update();
}
setupScrollFade(document.getElementById('sectionNav'));

/* ── QUICK COPY ── */
function flashCopied(btn) {
  const orig = btn.textContent;
  btn.textContent = 'Copied';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
}

document.querySelectorAll('.copy-btn[data-copy-from]').forEach(btn => {
  btn.addEventListener('click', () => {
    const src = document.getElementById(btn.dataset.copyFrom);
    if (!src) return;
    const text = (src.textContent || src.value || '').trim();
    if (!text) { toast('Nothing to copy'); return; }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      toast('Clipboard unavailable in this browser', 'error');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      flashCopied(btn);
      toast('Copied to clipboard', 'success');
    }).catch(() => {
      toast('Could not copy to clipboard', 'error');
    });
  });
});

function copyText(text, btn) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    toast('Clipboard unavailable in this browser', 'error');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    if (btn) flashCopied(btn);
    toast('Copied to clipboard', 'success');
  }).catch(() => {
    toast('Could not copy to clipboard', 'error');
  });
}
