/* ── Trail Enrichment Orchestration (Agent 4) ──
   Wires adapter + store + UI into the render cycle.
   Both the app and trailStore now use the same "tk-trails" key,
   so no storage bridge is needed.
   Fails safely if any dependency is missing. */

window.TK = window.TK || {};

window.TK.trailHydration = {
  _hooked: false,

  /* ── Init ── */

  initEnrichment: function () {
    if (!window.TK.trailAdapter || !window.TK.trailStore || !window.TK.trailEnrichmentUI) {
      return;
    }
    if (typeof window.renderTrails !== 'function') {
      return;
    }
    if (this._hooked) return;
    this._hooked = true;

    var origRenderTrails = window.renderTrails;
    var self = this;
    window.renderTrails = function () {
      origRenderTrails();
      self._applyEnrichmentUI();
    };

    this._applyEnrichmentUI();
  },

  /* ── Render hook ── */

  _applyEnrichmentUI: function () {
    var UI = window.TK.trailEnrichmentUI;
    if (!UI) return;

    var items = document.querySelectorAll('#trailList .trail-item');
    var self = this;

    items.forEach(function (li, i) {
      if (typeof trails === 'undefined' || i >= trails.length) return;
      var t = trails[i];
      if (!t.name || !t.name.trim()) return;

      li.setAttribute('data-trail-index', i);

      UI.renderEnrichmentRow(li, t, i, {
        onEnrich: function () { self._handleEnrich(i); },
        onRefresh: function () { self._handleRefresh(i); },
        onClear: function () { self._handleClear(i); }
      });
    });
  },

  /* ── Enrich flow ── */

  _handleEnrich: async function (index) {
    var Adapter = window.TK.trailAdapter;
    var Store = window.TK.trailStore;
    var UI = window.TK.trailEnrichmentUI;
    if (!Adapter || !Store || !UI) return;

    if (typeof trails === 'undefined' || index >= trails.length) return;
    var t = trails[index];
    if (!t || !t.name) return;

    var li = document.querySelector('#trailList .trail-item[data-trail-index="' + index + '"]');
    if (!li) return;

    UI.showLoading(li);

    var fields;
    try {
      fields = await Adapter.enrichTrail(t.name);
    } catch (_) {
      fields = null;
    }

    UI.hideLoading(li);

    if (!fields) {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.overpassError = 'Could not fetch trail data from Overpass. Try again when the connection is stable.';
      }
      if (typeof renderAdaptiveStates === 'function') renderAdaptiveStates();
      UI.showToast('Could not fetch trail info', 'error');
      return;
    }

    if (window.TK && window.TK.runtimeState) {
      window.TK.runtimeState.overpassError = '';
    }
    Store.attachEnrichment(index, fields, 'overpass');
    // Reload trails from storage so the global array reflects enrichment
    if (typeof store !== 'undefined') {
      var updated = Store.getTrails();
      trails.length = 0;
      for (var i = 0; i < updated.length; i++) trails.push(updated[i]);
    }
    renderTrails();
    UI.showToast('Trail info loaded', 'success');
  },

  /* ── Refresh flow ── */

  _handleRefresh: async function (index) {
    var Store = window.TK.trailStore;
    var UI = window.TK.trailEnrichmentUI;
    if (!Store || !UI) return;

    if (typeof trails === 'undefined' || index >= trails.length) return;
    var t = trails[index];
    if (!t || !t.name) return;

    // 1. Mark stale and re-render to show stale indicator
    Store.markStale(index);
    if (typeof store !== 'undefined') {
      var staleTrails = Store.getTrails();
      trails.length = 0;
      for (var j = 0; j < staleTrails.length; j++) trails.push(staleTrails[j]);
    }
    renderTrails();

    // 2. Get fresh li reference after re-render
    var li = document.querySelector('#trailList .trail-item[data-trail-index="' + index + '"]');
    if (!li) return;

    UI.showLoading(li);

    var fields;
    try {
      fields = await window.TK.trailAdapter.enrichTrail(t.name);
    } catch (_) {
      fields = null;
    }

    if (fields) {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.overpassError = '';
      }
      Store.attachEnrichment(index, fields, 'overpass');
      var updated = Store.getTrails();
      trails.length = 0;
      for (var k = 0; k < updated.length; k++) trails.push(updated[k]);
      renderTrails();
      UI.showToast('Trail info updated', 'success');
    } else {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.overpassError = 'Refresh failed. Cached trail data is still available.';
      }
      if (typeof renderAdaptiveStates === 'function') renderAdaptiveStates();
      UI.hideLoading(li);
      UI.showToast('Refresh failed, using cached data', 'error');
    }
  },

  _handleClear: function (index) {
    var Store = window.TK.trailStore;
    var UI = window.TK.trailEnrichmentUI;
    if (!Store || !UI) return;
    if (typeof trails === 'undefined' || index >= trails.length) return;

    var prevTrails = JSON.parse(JSON.stringify(trails));
    Store.clearEnrichment(index);
    var updated = Store.getTrails();
    trails.length = 0;
    for (var i = 0; i < updated.length; i++) trails.push(updated[i]);
    renderTrails();
    UI.showToast('Trail data cleared');
    if (typeof showUndoToast === 'function') {
      showUndoToast('Trail data cleared', function () {
        if (typeof store !== 'undefined') {
          store.set('tk-trails', prevTrails);
          trails.length = 0;
          for (var j = 0; j < prevTrails.length; j++) trails.push(prevTrails[j]);
          renderTrails();
          UI.showToast('Trail data restored', 'success');
        }
      });
    }
  }
};
