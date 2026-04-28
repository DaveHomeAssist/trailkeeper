/* ── trailLog.js ──────────────────────────────────────
   Trip Log / Post-Hike Journal (Phase 2, Agent A)
   Stores hike logs separately from trail objects.
   Hooks into renderTrails() like trailHydration.js.
   ──────────────────────────────────────────────────── */

(function () {
  'use strict';

  window.TK = window.TK || {};

  var STORAGE_KEY = 'tk-logs';
  var CONDITIONS = [
    { key: 'sunny',  icon: '\u2600\uFE0F', label: 'Sunny' },
    { key: 'cloudy', icon: '\u2601\uFE0F', label: 'Cloudy' },
    { key: 'rainy',  icon: '\uD83C\uDF27\uFE0F', label: 'Rainy' },
    { key: 'muddy',  icon: '\uD83D\uDCA7', label: 'Muddy' },
    { key: 'snowy',  icon: '\u2744\uFE0F', label: 'Snowy' }
  ];

  /* ── helpers ── */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function conditionIcon(key) {
    for (var i = 0; i < CONDITIONS.length; i++) {
      if (CONDITIONS[i].key === key) return CONDITIONS[i].icon;
    }
    return '';
  }

  function starsHTML(rating, filled) {
    var r = Math.max(0, Math.min(5, Math.round(rating || 0)));
    if (filled) {
      return '\u2605'.repeat(r) + '\u2606'.repeat(5 - r);
    }
    return r;
  }

  /* ── storage ── */

  function getLogs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function setLogs(logs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
      window.dispatchEvent(new Event('trailkeeper:saved'));
      if (window.TK && window.TK.runtimeState) window.TK.runtimeState.storageError = '';
    } catch (_) {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.storageError = 'Trail log was not saved. Browser storage may be full.';
      }
      window.dispatchEvent(new Event('trailkeeper:storage-error'));
      if (typeof toast === 'function') toast('Trail log was not saved. Storage may be full.', 'error');
    }
  }

  function getLogsForTrail(trailName) {
    if (!trailName) return [];
    var lower = trailName.toLowerCase();
    return getLogs().filter(function (l) {
      return (l.trailName || '').toLowerCase() === lower;
    });
  }

  function saveLog(logEntry) {
    var logs = getLogs();
    // If editing an existing log, replace it
    var existingIdx = -1;
    if (logEntry.id) {
      for (var i = 0; i < logs.length; i++) {
        if (logs[i].id === logEntry.id) { existingIdx = i; break; }
      }
    }
    if (existingIdx >= 0) {
      logs[existingIdx] = logEntry;
    } else {
      logEntry.id = 'log-' + Date.now();
      logs.push(logEntry);
    }
    setLogs(logs);
    return logEntry;
  }

  function deleteLog(logId) {
    var logs = getLogs();
    setLogs(logs.filter(function (l) { return l.id !== logId; }));
  }

  /* ── form rendering ── */

  function renderLogForm(trailItemEl, trail, index, existingLog) {
    // Remove any existing form on this item
    var old = trailItemEl.querySelector('.trail-log-form');
    if (old) old.remove();

    var form = document.createElement('div');
    form.className = 'trail-log-form';
    form.setAttribute('data-trail-index', index);

    var log = existingLog || {
      id: null,
      trailName: trail.name,
      hikedAt: todayISO(),
      conditions: '',
      rating: 0,
      note: ''
    };
    var formId = 'trail-log-' + index + '-' + Date.now();

    // Date field
    var dateField = document.createElement('div');
    dateField.className = 'trail-log-field';
    dateField.innerHTML =
      '<label class="trail-log-label" for="' + formId + '-date">Date</label>' +
      '<input type="date" class="trail-log-date" id="' + formId + '-date" value="' + esc(log.hikedAt || todayISO()) + '">';
    form.appendChild(dateField);

    // Conditions
    var condField = document.createElement('div');
    condField.className = 'trail-log-field';
    condField.innerHTML = '<div class="trail-log-label">Conditions</div>';
    var condRow = document.createElement('div');
    condRow.className = 'trail-log-conditions';
    CONDITIONS.forEach(function (c) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'trail-log-condition' + (log.conditions === c.key ? ' is-active' : '');
      pill.setAttribute('data-condition', c.key);
      pill.setAttribute('aria-label', c.label);
      pill.textContent = c.icon + ' ' + c.label;
      pill.addEventListener('click', function () {
        condRow.querySelectorAll('.trail-log-condition').forEach(function (p) {
          p.classList.remove('is-active');
        });
        pill.classList.add('is-active');
      });
      condRow.appendChild(pill);
    });
    condField.appendChild(condRow);
    form.appendChild(condField);

    // Rating
    var ratingField = document.createElement('div');
    ratingField.className = 'trail-log-field';
    ratingField.innerHTML = '<div class="trail-log-label">Rating</div>';
    var ratingRow = document.createElement('div');
    ratingRow.className = 'trail-log-rating';
    var currentRating = log.rating || 0;
    for (var s = 1; s <= 5; s++) {
      (function (val) {
        var star = document.createElement('button');
        star.type = 'button';
        star.className = 'trail-log-star' + (val <= currentRating ? ' filled' : '');
        star.setAttribute('data-val', val);
        star.setAttribute('aria-label', val + ' star' + (val > 1 ? 's' : ''));
        star.textContent = '\u2605';
        star.addEventListener('click', function () {
          currentRating = val;
          ratingRow.querySelectorAll('.trail-log-star').forEach(function (st, idx) {
            st.classList.toggle('filled', idx < val);
          });
        });
        ratingRow.appendChild(star);
      })(s);
    }
    ratingField.appendChild(ratingRow);
    form.appendChild(ratingField);

    // Note
    var noteField = document.createElement('div');
    noteField.className = 'trail-log-field';
    noteField.innerHTML = '<label class="trail-log-label" for="' + formId + '-note">Note</label>';
    var textarea = document.createElement('textarea');
    textarea.className = 'trail-log-note';
    textarea.id = formId + '-note';
    textarea.placeholder = 'How was the hike?';
    textarea.rows = 2;
    textarea.value = log.note || '';
    noteField.appendChild(textarea);
    form.appendChild(noteField);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'trail-log-actions';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary trail-log-save';
    saveBtn.textContent = existingLog ? 'Update' : 'Save log';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost trail-log-cancel';
    cancelBtn.textContent = 'Cancel';

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    // Wire save
    saveBtn.addEventListener('click', function () {
      var activeCond = condRow.querySelector('.trail-log-condition.is-active');
      var entry = {
        id: log.id || null,
        trailName: trail.name,
        hikedAt: form.querySelector('.trail-log-date').value || todayISO(),
        conditions: activeCond ? activeCond.getAttribute('data-condition') : '',
        rating: currentRating,
        note: textarea.value.trim()
      };
      saveLog(entry);
      form.remove();
      applyLogUI();
      if (typeof toast === 'function') {
        toast('Hike logged', 'success');
      }
    });

    // Wire cancel
    cancelBtn.addEventListener('click', function () {
      form.remove();
    });

    trailItemEl.appendChild(form);

    // Scroll form into view
    setTimeout(function () {
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  /* ── summary rendering ── */

  function renderLogSummary(trailItemEl, trail, index) {
    // Remove existing summary/prompt
    var existingSummary = trailItemEl.querySelector('.trail-log-summary');
    if (existingSummary) existingSummary.remove();
    var existingPrompt = trailItemEl.querySelector('.trail-log-prompt');
    if (existingPrompt) existingPrompt.remove();

    var status = trail.status || 'unvisited';
    if (status !== 'done') return;

    var logs = getLogsForTrail(trail.name);

    if (logs.length > 0) {
      // Show most recent log as summary
      var latest = logs[logs.length - 1];
      var summary = document.createElement('div');
      summary.className = 'trail-log-summary';
      summary.setAttribute('role', 'button');
      summary.setAttribute('tabindex', '0');
      summary.setAttribute('aria-label', 'Edit hike log for ' + trail.name);

      var parts = [];
      if (latest.hikedAt) parts.push(formatDateShort(latest.hikedAt));
      if (latest.conditions) parts.push(conditionIcon(latest.conditions) + ' ' + latest.conditions);
      if (latest.rating) parts.push(starsHTML(latest.rating, true));
      if (latest.note) parts.push(esc(latest.note));

      summary.innerHTML = parts.join(' &middot; ');
      if (logs.length > 1) {
        summary.innerHTML += ' <span class="trail-log-count">(' + logs.length + ' logs)</span>';
      }

      summary.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleLogForm(trailItemEl, trail, index, latest);
      });

      summary.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleLogForm(trailItemEl, trail, index, latest);
      });

      trailItemEl.appendChild(summary);
    } else {
      // Show "Log this hike" prompt
      var prompt = document.createElement('button');
      prompt.type = 'button';
      prompt.className = 'trail-log-prompt';
      prompt.textContent = 'Log this hike';
      prompt.addEventListener('click', function (e) {
        e.stopPropagation();
        var existingForm = trailItemEl.querySelector('.trail-log-form');
        if (existingForm) {
          existingForm.remove();
        } else {
          renderLogForm(trailItemEl, trail, index);
        }
      });
      trailItemEl.appendChild(prompt);
    }
  }

  function toggleLogForm(trailItemEl, trail, index, existingLog) {
    var existingForm = trailItemEl.querySelector('.trail-log-form');
    if (existingForm) {
      existingForm.remove();
    } else {
      renderLogForm(trailItemEl, trail, index, existingLog);
    }
  }

  /* ── render hook (post-render pass) ── */

  function applyLogUI() {
    var items = document.querySelectorAll('#trailList .trail-item');
    items.forEach(function (li, i) {
      if (typeof trails === 'undefined' || i >= trails.length) return;
      var t = trails[i];
      if (!t || !t.name) return;
      renderLogSummary(li, t, i);
    });
  }

  /* ── status toggle detection ── */

  var _statusHooked = false;

  function hookStatusToggle() {
    // Listen for clicks on status buttons and detect transition to "done"
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.trail-status');
      if (!btn) return;
      var li = btn.closest('.trail-item');
      if (!li) return;

      // After the click handler fires and renderTrails() is called,
      // we check on next tick if the trail is now "done"
      var idx = Array.from(document.querySelectorAll('#trailList .trail-item')).indexOf(li);

      // Use a short delay to let the inline handler run first
      setTimeout(function () {
        if (typeof trails === 'undefined' || idx < 0 || idx >= trails.length) return;
        var t = trails[idx];
        var item = document.querySelectorAll('#trailList .trail-item')[idx];
        if (!t || !item || t.status !== 'done') return;
        var logs = getLogsForTrail(t.name);
        var hasForm = item.querySelector('.trail-log-form');
        if (logs.length === 0 && !hasForm) renderLogForm(item, t, idx);
      }, 50);
    }, true); // capture phase to fire before the inline handler
  }

  /* ── init ── */

  var _hooked = false;

  function initLog() {
    if (_hooked) return;
    _hooked = true;

    // Hook into renderTrails() the same way trailHydration.js does
    if (typeof window.renderTrails === 'function') {
      var origRenderTrails = window.renderTrails;
      window.renderTrails = function () {
        origRenderTrails();
        applyLogUI();
      };
    }

    // Hook status toggle for auto-showing log form
    hookStatusToggle();

    // Apply to current state
    applyLogUI();
  }

  /* ── expose ── */

  window.TK.trailLog = {
    initLog: initLog,
    getLogs: getLogs,
    getLogsForTrail: getLogsForTrail,
    saveLog: saveLog,
    renderLogForm: renderLogForm,
    renderLogSummary: renderLogSummary
  };

})();
