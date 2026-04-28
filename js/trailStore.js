/* trailStore.js — Snapshot storage for trail enrichment (Agent 2) */
window.TK = window.TK || {};

(function () {
  'use strict';

  var KEY = 'tk-trails';

  /* ── Helpers ── */

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw === null) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function write(trails) {
    try {
      localStorage.setItem(KEY, JSON.stringify(trails));
      if (window.TK && window.TK.runtimeState) window.TK.runtimeState.storageError = '';
      window.dispatchEvent(new Event('trailkeeper:saved'));
    } catch (_) {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.storageError = 'Trail list was not saved. Browser storage may be full.';
      }
      window.dispatchEvent(new Event('trailkeeper:storage-error'));
      if (typeof toast === 'function') toast('Trail list was not saved. Storage may be full.', 'error');
    }
  }

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
  }

  function validIndex(trails, idx) {
    return Number.isInteger(idx) && idx >= 0 && idx < trails.length;
  }

  /* ── Public API ── */

  function getTrails() {
    return read();
  }

  function saveTrails(trails) {
    if (!Array.isArray(trails)) return;
    write(trails);
  }

  function attachEnrichment(trailIndex, enrichmentFields, source) {
    try {
      var trails = read();
      if (!validIndex(trails, trailIndex)) return trails;
      var trail = trails[trailIndex];
      trail.enrichment = {
        source: String(source || 'unknown'),
        lastHydratedAt: Date.now(),
        stale: false,
        fields: {
          distance_km:      enrichmentFields && enrichmentFields.distance_km != null ? enrichmentFields.distance_km : null,
          elevation_gain_m:  enrichmentFields && enrichmentFields.elevation_gain_m != null ? enrichmentFields.elevation_gain_m : null,
          surface:           enrichmentFields && enrichmentFields.surface != null ? enrichmentFields.surface : null,
          difficulty:        enrichmentFields && enrichmentFields.difficulty != null ? enrichmentFields.difficulty : null,
          osm_id:            enrichmentFields && enrichmentFields.osm_id != null ? enrichmentFields.osm_id : null,
          advisories:        enrichmentFields && Array.isArray(enrichmentFields.advisories) ? enrichmentFields.advisories : [],
          lat:               enrichmentFields && enrichmentFields.lat != null ? enrichmentFields.lat : null,
          lon:               enrichmentFields && enrichmentFields.lon != null ? enrichmentFields.lon : null
        }
      };
      write(trails);
      return trails;
    } catch (_) {
      return read();
    }
  }

  function markStale(trailIndex) {
    try {
      var trails = read();
      if (!validIndex(trails, trailIndex)) return trails;
      if (!trails[trailIndex].enrichment) return trails;
      trails[trailIndex].enrichment.stale = true;
      write(trails);
      return trails;
    } catch (_) {
      return read();
    }
  }

  function clearEnrichment(trailIndex) {
    try {
      var trails = read();
      if (!validIndex(trails, trailIndex)) return trails;
      delete trails[trailIndex].enrichment;
      write(trails);
      return trails;
    } catch (_) {
      return read();
    }
  }

  function hasEnrichment(trail) {
    try {
      return trail != null
        && trail.enrichment != null
        && typeof trail.enrichment === 'object'
        && trail.enrichment.fields != null;
    } catch (_) {
      return false;
    }
  }

  function isStale(trail) {
    try {
      return hasEnrichment(trail) && trail.enrichment.stale === true;
    } catch (_) {
      return false;
    }
  }

  /* ── Expose ── */

  window.TK.trailStore = {
    getTrails: getTrails,
    saveTrails: saveTrails,
    attachEnrichment: attachEnrichment,
    markStale: markStale,
    clearEnrichment: clearEnrichment,
    hasEnrichment: hasEnrichment,
    isStale: isStale
  };
})();

/*
 * Agent 2 Handoff
 * Exposed API: window.TK.trailStore.{getTrails, saveTrails, attachEnrichment, markStale, clearEnrichment, hasEnrichment, isStale}
 * Persisted enrichment shape: trail.enrichment = { source, lastHydratedAt, stale, fields: { distance_km, elevation_gain_m, surface, difficulty, osm_id } }
 * Index validation: out-of-bounds returns unchanged array
 * Corrupt localStorage: returns [] safely
 */
