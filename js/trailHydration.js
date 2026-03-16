/* ── Trail Enrichment Orchestration (Agent 4) ──
   Wires adapter + store + UI into the render cycle.
   Handles storage key bridge between inline script ("trails")
   and trailStore module ("tk-trails").
   Fails safely if any dependency is missing. */

window.TK = window.TK || {};

window.TK.trailHydration = {
  _hooked: false,

  /* ── Storage bridge ──
     Inline script uses localStorage key "trails".
     trailStore module uses key "tk-trails".
     We sync between them so enrichment data persists correctly. */

  _syncToTkTrails: function () {
    try {
      if (typeof trails !== 'undefined') {
        localStorage.setItem('tk-trails', JSON.stringify(trails));
      }
    } catch (_) {}
  },

  _syncFromTkTrails: function () {
    try {
      var tkData = JSON.parse(localStorage.getItem('tk-trails'));
      if (!Array.isArray(tkData) || typeof trails === 'undefined') return;
      for (var i = 0; i < trails.length && i < tkData.length; i++) {
        if (tkData[i] && tkData[i].enrichment) {
          trails[i].enrichment = tkData[i].enrichment;
        }
      }
      store.set('trails', trails);
    } catch (_) {}
  },

  _migrateStorage: function () {
    try {
      var primary = localStorage.getItem('trails');
      var secondary = localStorage.getItem('tk-trails');

      if (primary && primary !== '[]') {
        localStorage.setItem('tk-trails', primary);
      } else if (secondary && secondary !== '[]') {
        localStorage.setItem('trails', secondary);
        if (typeof trails !== 'undefined') {
          var parsed = JSON.parse(secondary);
          if (Array.isArray(parsed)) {
            trails.length = 0;
            parsed.forEach(function (t) { trails.push(t); });
          }
        }
      }
    } catch (_) {}
  },

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

    this._migrateStorage();
    this._syncToTkTrails();

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
        onRefresh: function () { self._handleRefresh(i); }
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
      UI.showToast('Could not fetch trail info', 'error');
      return;
    }

    this._syncToTkTrails();
    Store.attachEnrichment(index, fields, 'overpass');
    this._syncFromTkTrails();
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
    this._syncToTkTrails();
    Store.markStale(index);
    this._syncFromTkTrails();
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
      this._syncToTkTrails();
      Store.attachEnrichment(index, fields, 'overpass');
      this._syncFromTkTrails();
      renderTrails();
      UI.showToast('Trail info updated', 'success');
    } else {
      UI.hideLoading(li);
      UI.showToast('Refresh failed, using cached data', 'error');
    }
  }
};
