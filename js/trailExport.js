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
    if (!el || !el.classList.contains('visible')) return '';
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
    var trailList = readTrails();
    var data = JSON.stringify(trailList, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'trailkeeper-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    if (typeof toast === 'function') toast('Backup downloaded', 'success');
  }

  /* ── Init: bind click handlers ── */

  function initExport() {
    var copyBtn = document.getElementById('copyPlanBtn');
    var downloadBtn = document.getElementById('downloadBackupBtn');

    if (copyBtn) copyBtn.addEventListener('click', copyPlanToClipboard);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadBackup);
  }

  /* ── Expose on namespace ── */

  window.TK.trailExport = {
    initExport: initExport,
    copyPlanToClipboard: copyPlanToClipboard,
    downloadBackup: downloadBackup
  };

})();
