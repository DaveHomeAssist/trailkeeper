/* ── Trail Export Module ──
   Mode 1: Copy plan as plain text (SMS-friendly)
   Mode 2: Download trails backup as JSON
   Reads from live DOM + localStorage on demand. */

(function () {
  'use strict';

  window.TK = window.TK || {};

  /* ── Date formatting ── */

  function formatDate() {
    var d = new Date();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ── Read weather from DOM ── */

  function readWeather() {
    var el = document.getElementById('weatherResult');
    if (!el || !el.classList.contains('is-visible')) return '';
    var text = (el.textContent || '').trim();
    return text || '';
  }

  /* ── Read trails from global array ── */

  function readTrails() {
    if (typeof trails === 'undefined' || !Array.isArray(trails)) return [];
    return trails;
  }

  /* ── Read pack list from DOM ── */

  function readPackList() {
    var el = document.querySelector('#sec-today .field-text');
    if (!el) return '';
    var text = (el.textContent || '').trim();
    return text || '';
  }

  /* ── Read trip notes ── */

  function readTripNotes() {
    var el = document.getElementById('tripNotes');
    if (!el) return '';
    return (el.value || '').trim();
  }

  /* ── Format trail line ── */

  function formatTrailLine(trail, num) {
    if (!trail || typeof trail.name !== 'string') return '';
    var line = num + '. ' + trail.name;
    var details = [];

    if (trail.enrichment && trail.enrichment.fields) {
      var f = trail.enrichment.fields;
      if (f.distance_km != null) details.push(f.distance_km + ' km');
      if (f.difficulty) details.push(f.difficulty);
      if (f.elevation_gain_m != null) details.push(f.elevation_gain_m + 'm gain');
    }

    if (details.length) line += ' \u2014 ' + details.join(', ');

    // Advisories
    if (trail.enrichment && trail.enrichment.fields &&
        Array.isArray(trail.enrichment.fields.advisories) &&
        trail.enrichment.fields.advisories.length) {
      for (var a = 0; a < trail.enrichment.fields.advisories.length; a++) {
        line += '\n   \u26A0 ' + trail.enrichment.fields.advisories[a].text;
      }
    }

    return line;
  }

  /* ── Build plain-text plan ── */

  function buildPlanText() {
    var sections = [];

    // Header
    sections.push('Hiking Plan \u2014 ' + formatDate());

    // Weather
    var weather = readWeather();
    if (weather) {
      sections.push('Weather: ' + weather);
    }

    // Trails
    var trailList = readTrails();
    if (trailList.length) {
      var lines = ['Trails:'];
      for (var i = 0; i < trailList.length; i++) {
        lines.push(formatTrailLine(trailList[i], i + 1));
      }
      sections.push(lines.join('\n'));
    }

    // Pack list
    var pack = readPackList();
    if (pack) {
      sections.push('Pack: ' + pack);
    }

    // Trip notes
    var notes = readTripNotes();
    if (notes) {
      sections.push('Notes:\n' + notes);
    }

    return sections.join('\n\n');
  }

  /* ── Mode 1: Copy plan to clipboard ── */

  function copyPlanToClipboard() {
    var text = buildPlanText();

    try {
      navigator.clipboard.writeText(text).then(function () {
        if (typeof toast === 'function') toast('Plan copied to clipboard', 'success');
      }).catch(function () {
        if (typeof toast === 'function') toast('Could not copy \u2014 try manually', 'error');
      });
    } catch (e) {
      if (typeof toast === 'function') toast('Could not copy \u2014 try manually', 'error');
    }
  }

  /* ── Mode 2: Download backup as JSON ── */

  function downloadBackup() {
    var backup = window.TK && window.TK.storage
      ? window.TK.storage.exportData(typeof tkData !== 'undefined' ? tkData : undefined)
      : readTrails();
    var data = JSON.stringify(backup, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'trailkeeper-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    if (typeof toast === 'function') toast('Backup downloaded', 'success');
  }

  function normalizeBackup(raw) {
    if (window.TK && window.TK.storage) return window.TK.storage.importData(raw);
    var list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.trails) ? raw.trails : null;
    if (!list) throw new Error('Backup must be a Trailkeeper JSON array.');
    return list.map(function (trail) {
      var name = trail && typeof trail.name === 'string' ? trail.name.trim() : '';
      if (!name) return null;
      var status = ['unvisited', 'planned', 'done'].indexOf(trail.status) >= 0 ? trail.status : 'unvisited';
      var category = typeof trail.category === 'string' && trail.category.trim() ? trail.category.trim() : 'Quick';
      return Object.assign({}, trail, { name: name, category: category, status: status });
    }).filter(Boolean);
  }

  function applyImportedTrails(imported) {
    if (typeof store !== 'undefined' && store.set) {
      store.set('tk-trails', imported);
    } else {
      localStorage.setItem('tk-trails', JSON.stringify(imported));
      window.dispatchEvent(new Event('trailkeeper:saved'));
    }
    try { localStorage.removeItem('trails'); } catch (_) {}
    if (typeof trails !== 'undefined' && Array.isArray(trails)) {
      trails.splice(0, trails.length);
      imported.forEach(function (trail) { trails.push(trail); });
    }
    if (typeof renderTrails === 'function') renderTrails();
  }

  function importBackupFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = normalizeBackup(JSON.parse(String(reader.result || '')));
        if (window.TK && window.TK.storage) {
          if (typeof refreshFromData === 'function') refreshFromData();
          if (typeof renderTrails === 'function') renderTrails();
          if (typeof renderLog === 'function') renderLog();
          if (typeof toast === 'function') toast('Backup imported', 'success');
          return;
        }
        applyImportedTrails(imported);
        if (typeof toast === 'function') toast('Backup imported: ' + imported.length + ' trails', 'success');
      } catch (e) {
        if (typeof toast === 'function') toast(e && e.message ? e.message : 'Could not import backup', 'error');
      }
    };
    reader.onerror = function () {
      if (typeof toast === 'function') toast('Could not read backup file', 'error');
    };
    reader.readAsText(file);
  }

  /* ── Init: bind click handlers ── */

  function initExport() {
    var copyBtn = document.getElementById('copyPlanBtn');
    var downloadBtn = document.getElementById('downloadBackupBtn');
    var importBtn = document.getElementById('importBackupBtn');
    var importInput = document.getElementById('importBackupFile');

    if (copyBtn) copyBtn.addEventListener('click', copyPlanToClipboard);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadBackup);
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });
      importInput.addEventListener('change', function () {
        importBackupFile(importInput.files && importInput.files[0]);
        importInput.value = '';
      });
    }
  }

  /* ── Expose on namespace ── */

  window.TK.trailExport = {
    initExport: initExport,
    copyPlanToClipboard: copyPlanToClipboard,
    downloadBackup: downloadBackup,
    importBackupFile: importBackupFile
  };

})();
