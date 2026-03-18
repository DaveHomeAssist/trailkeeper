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
  document.getElementById('toastContainer').appendChild(el);
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
  document.getElementById('toastContainer').appendChild(el);
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
  var plannedTrails = trails.filter(function (trail) { return trail && trail.status === 'planned'; });
  var gearDone = document.querySelectorAll('#checklist .check-item input:checked').length;
  var gearAll = document.querySelectorAll('#checklist .check-item input').length;
  var latestLog = hikeLog.length ? hikeLog[hikeLog.length - 1] : null;
  var today = new Date().toISOString().split('T')[0];
  var hasPhoto = (window.TK.runtimeState.photoCount || 0) > 0;
  var weatherVerdict = readWeatherVerdict() || prefs.lastWeatherVerdict;

  ensureGlobalState(window.TK.runtimeState.storageError);

  if (window.TK.runtimeState.weatherStatus === 'error') {
    ensureSectionState('sec-today', 'error', 'Weather unavailable', window.TK.runtimeState.weatherMessage || 'Try another city or retry when service is available.');
  } else if (!prefs.lastWeatherCity && !weatherVerdict) {
    ensureSectionState('sec-today', 'empty', 'Weather not checked yet', 'Add a city or zip code to unlock trail conditions and nearby trail suggestions.');
  } else if (weatherVerdict === 'no-go' || weatherVerdict === 'caution') {
    ensureSectionState('sec-today', 'active', 'Weather alert active', weatherVerdict === 'no-go' ? 'Conditions suggest postponing or choosing a safer route.' : 'Use caution and review wind, precipitation, and footing before heading out.');
  } else if ((document.getElementById('planTrail').textContent || '').trim()) {
    ensureSectionState('sec-today', 'complete', 'Today is set', 'Trail, timing, and weather context are in place for this outing.');
  } else {
    ensureSectionState('sec-today', '', '', '');
  }

  if (window.TK.runtimeState.overpassError) {
    ensureSectionState('sec-trails', 'error', 'Trail data unavailable', window.TK.runtimeState.overpassError);
  } else if (!trails.length) {
    ensureSectionState('sec-trails', 'empty', 'Start a shortlist', 'Add a trail manually or use weather plus nearby trail discovery to seed the list.');
  } else if (plannedTrails.length > 0) {
    ensureSectionState('sec-trails', 'active', 'Trails ready to hike', plannedTrails.length + ' planned trail' + (plannedTrails.length === 1 ? ' is' : 's are') + ' waiting in your shortlist.');
  } else {
    ensureSectionState('sec-trails', 'complete', 'Trail list established', trails.length + ' trail' + (trails.length === 1 ? '' : 's') + ' saved and ready to review.');
  }

  if (!hikeLog.length) {
    ensureSectionState('sec-record', 'empty', 'No hikes logged yet', 'Use the log button after your next outing to build trail history automatically.');
  } else if (window.TK.runtimeState.hikeModalOpen) {
    ensureSectionState('sec-record', 'active', 'Logging in progress', 'Finish the current hike entry to update stats and the trail summary.');
  } else if (latestLog && latestLog.date === today) {
    ensureSectionState('sec-record', 'complete', 'Today’s hike is logged', 'Latest entry: ' + latestLog.trail + '. Add photos or refine the note while details are fresh.');
  } else if ((document.getElementById('planTrail').textContent || '').trim()) {
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
  backToTop.classList.toggle('visible', window.scrollY > threshold);
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
    renderAdaptiveStates();
  });
});

/* ── TRIP NOTES ── */
const notesToggle = document.getElementById('notesToggle');
const notesBody   = document.getElementById('notesBody');
const tripNotes   = document.getElementById('tripNotes');
function setNotesOpen(open) {
  notesBody.classList.toggle('open', open);
  notesToggle.setAttribute('aria-expanded', String(open));
  document.getElementById('notesArrow').setAttribute('points', open ? '18 9 12 15 6 9' : '9 18 15 12 9 6');
}
notesToggle.addEventListener('click', () => {
  const open = !notesBody.classList.contains('open');
  setNotesOpen(open);
  store.set('tripNotesOpen', open);
});
setNotesOpen(Boolean(store.get('tripNotesOpen', false)));
tripNotes.value = store.get('tripNotes', '');
tripNotes.addEventListener('input', () => store.set('tripNotes', tripNotes.value));

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
  if (!city) return;
  store.set('weatherCity', city);
  updatePrefs({ lastWeatherCity: city });
  weatherBtn.textContent = '...';
  weatherBtn.disabled = true;
  weatherBtn.classList.add('weather-loading');
  window.TK.runtimeState.weatherStatus = 'loading';
  window.TK.runtimeState.weatherMessage = 'Checking forecast…';
  renderAdaptiveStates();
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`).then(r => r.json());
    if (!geo.results?.length) throw new Error('not found');
    const { latitude, longitude, name, country_code } = geo.results[0];
    window.TK = window.TK || {}; window.TK.weatherContext = { zip: city, lat: latitude, lon: longitude, placeLabel: name || city };
    const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=1`).then(r => r.json());
    const d = wx.daily;
    const high = Math.round(d.temperature_2m_max[0]);
    const low = Math.round(d.temperature_2m_min[0]);
    const precip = d.precipitation_probability_max[0];
    const wind = Math.round(d.windspeed_10m_max[0]);
    let verdict, cls, icon;
    if (precip >= 70 || wind >= 35) { verdict = 'No-go'; cls = 'weather-no'; icon = '[X]'; }
    else if (precip >= 40 || wind >= 20) { verdict = 'Caution'; cls = 'weather-warn'; icon = '[!]'; }
    else { verdict = 'Go'; cls = 'weather-go'; icon = '[OK]'; }
    weatherResult.innerHTML = `<span class="${cls}">${esc(icon)} ${esc(verdict)}</span> - ${esc(name)}, ${esc((country_code || '').toUpperCase())}<span class="weather-detail">High ${esc(high)}F · Low ${esc(low)}F · Precip ${esc(precip)}% · Wind ${esc(wind)} mph</span>`;
    weatherResult.classList.add('visible');
    window.TK.runtimeState.weatherStatus = verdict.toLowerCase() === 'go' ? 'ready' : 'alert';
    window.TK.runtimeState.weatherMessage = verdict;
    updatePrefs({ lastWeatherVerdict: verdict.toLowerCase() });
  } catch {
    weatherResult.innerHTML = `<span class="weather-danger">${esc('Location not found - try a different city name.')}</span>`;
    weatherResult.classList.add('visible');
    window.TK.runtimeState.weatherStatus = 'error';
    window.TK.runtimeState.weatherMessage = 'Location not found. Try another city or zip code.';
  } finally {
    weatherBtn.textContent = 'Check';
    weatherBtn.disabled = false;
    weatherBtn.classList.remove('weather-loading');
    renderAdaptiveStates();
  }
}

/* ── TRAIL SHORTLIST ── */
let trails = store.get('tk-trails', []);
const STATUSES = ['unvisited','planned','done'];
const SLABELS  = { unvisited:'Unvisited', planned:'Planned', done:'Done \u2713' };

function renderTrails() {
  const list = document.getElementById('trailList');
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
    if (safeStatus !== t.status) {
      trails[i].status = safeStatus;
      statusUpdated = true;
    }
    const safeStatusLabel = esc(SLABELS[safeStatus]);
    const li = document.createElement('li');
    li.className = 'trail-item';
    li.innerHTML = `
      <span class="trail-tag">${esc(t.category)}</span>
      <span class="trail-name${safeStatus==='done'?' done':''}">${esc(t.name)}</span>
      <button class="trail-set-today btn" aria-label="Set as today's trail">\u2192 Today</button>
      <button class="trail-status ${safeStatus}" aria-label="Status: ${safeStatusLabel}">${safeStatusLabel}</button>
      <button class="trail-delete" aria-label="Remove ${esc(t.name)}">\u2715</button>`;
    li.querySelector('.trail-set-today').addEventListener('click', () => {
      const el = document.getElementById('planTrail');
      el.textContent = t.name;
      store.set('planTrail', t.name);
      updatePrefs({ lastPlannedTrail: t.name });
      renderAdaptiveStates();
      toast(`"${t.name}" set as today's trail`, 'success');
    });
    li.querySelector('.trail-status').addEventListener('click', () => {
      trails[i].status = STATUSES[(STATUSES.indexOf(safeStatus) + 1) % STATUSES.length];
      store.set('tk-trails', trails);
      renderTrails();
    });
    li.querySelector('.trail-delete').addEventListener('click', () => {
      const prevTrails = deepClone(trails);
      const removedName = t.name;
      trails.splice(i, 1);
      store.set('tk-trails', trails);
      renderTrails();
      toast('Trail removed');
      showUndoToast(`Removed "${removedName}"`, () => {
        trails = prevTrails;
        store.set('tk-trails', trails);
        renderTrails();
        toast('Trail restored', 'success');
      });
    });
    list.appendChild(li);
  });
  if (statusUpdated) store.set('tk-trails', trails);
  renderAdaptiveStates();
}

document.getElementById('trailAdd').addEventListener('click', addTrail);
document.getElementById('trailInput').addEventListener('keydown', e => e.key==='Enter' && addTrail());
function addTrail() {
  const name = document.getElementById('trailInput').value.trim();
  if (!name) return;
  trails.push({ name, category: document.getElementById('trailCategory').value, status: 'unvisited' });
  store.set('tk-trails', trails);
  document.getElementById('trailInput').value = '';
  renderTrails();
  updatePrefs({ lastPlannedTrail: name });
  toast(`"${name}" added`, 'success');
}
renderTrails();

/* ── HIKE LOG ── */
let hikeLog = store.get('hikeLog', []);
let selectedRating = 0;

function renderLog() {
  const entries = document.getElementById('logEntries');
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
      const stars = safeRating ? `<span class="log-stars">${'\u2605'.repeat(safeRating)}${'\u2606'.repeat(5 - safeRating)}</span>` : '';
      const milesText = h.miles ? ` \u00B7 ${esc(h.miles)} mi` : '';
      const elevationValue = h.elevation ? Number(h.elevation) : NaN;
      const elevationText = h.elevation
        ? ` \u00B7 ${Number.isFinite(elevationValue) ? esc(elevationValue.toLocaleString()) : esc(h.elevation)} ft`
        : '';
      li.innerHTML = `
        <div>
          <div class="log-entry-header"><span class="log-entry-name">${esc(h.trail)}</span><button class="copy-btn" aria-label="Copy trail name">Copy</button></div>
          <div class="log-entry-meta">${esc(h.date || '')}${milesText}${elevationText}${safeRating ? ' \u00B7 ' + stars : ''}</div>
          ${h.note ? `<div class="log-entry-note">${esc(h.note)}</div>` : ''}
        </div>
        <button class="btn btn-danger" aria-label="Delete entry">\u2715</button>`;
      li.querySelector('.btn-danger').addEventListener('click', () => {
        const prevLog = deepClone(hikeLog);
        const removedTrailName = h.trail;
        hikeLog.splice(i, 1);
        store.set('hikeLog', hikeLog);
        renderLog();
        toast('Entry removed');
        showUndoToast(`Removed "${removedTrailName}" log`, () => {
          hikeLog = prevLog;
          store.set('hikeLog', hikeLog);
          renderLog();
          toast('Entry restored', 'success');
        });
      });
      const logCopyBtn = li.querySelector('.copy-btn');
      if (logCopyBtn) logCopyBtn.addEventListener('click', () => copyText(h.trail, logCopyBtn));
      entries.appendChild(li);
    });
  }
  const miles = hikeLog.reduce((s, h) => s + (parseFloat(h.miles) || 0), 0);
  const elev = hikeLog.reduce((s, h) => s + (parseInt(h.elevation) || 0), 0);
  const longest = hikeLog.reduce((m, h) => Math.max(m, parseFloat(h.miles) || 0), 0);
  document.getElementById('statHikes').textContent = hikeLog.length;
  document.getElementById('statMiles').textContent = miles.toFixed(1);
  document.getElementById('statElev').textContent = elev >= 1000 ? (elev / 1000).toFixed(1) + 'k' : elev;
  document.getElementById('statLongest').textContent = longest.toFixed(1);
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

function openModal() {
  previouslyFocused = document.activeElement;
  const suggestedTrail =
    document.getElementById('planTrail').textContent.trim() ||
    (trails.find(t => t.status === 'planned') || trails[0] || {}).name ||
    '';
  if (suggestedTrail) document.getElementById('logTrail').value = suggestedTrail;
  document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
  logModal.classList.add('open');
  window.TK.runtimeState.hikeModalOpen = true;
  pageEl.setAttribute('aria-hidden', 'true');
  renderAdaptiveStates();
  setTimeout(() => {
    const focusable = getModalFocusable();
    if (focusable.length) focusable[0].focus();
  }, 50);
}

function closeModal() {
  if (!logModal.classList.contains('open')) return;
  logModal.classList.remove('open');
  window.TK.runtimeState.hikeModalOpen = false;
  pageEl.removeAttribute('aria-hidden');
  document.getElementById('logTrail').value = '';
  document.getElementById('logNote').value = '';
  document.getElementById('logMiles').value = '';
  document.getElementById('logElevation').value = '';
  selectedRating = 0;
  document.querySelectorAll('.rating-star').forEach(s => s.classList.remove('active'));
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
  if (!logModal.classList.contains('open') || e.key !== 'Tab') return;
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

document.getElementById('openLogModal').addEventListener('click', openModal);
document.getElementById('logCancel').addEventListener('click', closeModal);
logModal.addEventListener('click', e => e.target === e.currentTarget && closeModal());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && logModal.classList.contains('open')) closeModal(); });

function isTypingTarget(el) {
  if (!el) return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

document.addEventListener('keydown', e => {
  if (isTypingTarget(document.activeElement) || logModal.classList.contains('open')) return;
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
  const trail = document.getElementById('logTrail').value.trim();
  if (!trail) { document.getElementById('logTrail').focus(); return; }
  hikeLog.push({
    trail,
    date: document.getElementById('logDate').value,
    miles: document.getElementById('logMiles').value,
    elevation: document.getElementById('logElevation').value,
    note: document.getElementById('logNote').value.trim(),
    rating: selectedRating
  });
  store.set('hikeLog', hikeLog);
  updatePrefs({ lastPlannedTrail: trail });
  renderLog();
  closeModal();
  toast(`"${trail}" logged!`, 'success');
});

document.querySelectorAll('.rating-star').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRating = +btn.dataset.val;
    document.querySelectorAll('.rating-star').forEach((s,i) => s.classList.toggle('active', i < selectedRating));
  });
});

renderLog();

/* ── GEAR CHECKLIST ── */
let customGear  = store.get('customGear', []);
let checkedGear = store.get('checkedGear', []);

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
      renderCustomGear();
      syncChecklistFromState();
      updateProgress();
      showUndoToast(`Removed "${label}"`, () => {
        customGear = prevCustomGear;
        checkedGear = prevCheckedGear;
        store.set('customGear', customGear);
        store.set('checkedGear', checkedGear);
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
  syncChecklistFromState();
  updateProgress();
  toast('Checklist reset');
  showUndoToast('Checklist reset', () => {
    checkedGear = prevCheckedGear;
    store.set('checkedGear', checkedGear);
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
  el.addEventListener('input', () => store.set(id, el.value));
});

/* ── PHOTOS (IndexedDB via photoStore) ── */
const PHOTO_KEYS = ['photo0','photo1','photo2'];

function buildPhotoSlots() {
  const strip = document.getElementById('photoStrip');
  strip.innerHTML = '';

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
    navigator.clipboard.writeText(text).then(() => {
      flashCopied(btn);
      toast('Copied to clipboard', 'success');
    });
  });
});

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) flashCopied(btn);
    toast('Copied to clipboard', 'success');
  });
}
