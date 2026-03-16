/* ── trailEnrichmentUI.js ─────────────────────────────
   Agent 3: UI rendering + styles for trail enrichment.
   No fetch logic. No localStorage writes. No orchestration.
   ────────────────────────────────────────────────────── */

(function () {
  'use strict';

  window.TK = window.TK || {};

  /* ── helpers ── */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ── renderEnrichmentRow ──
     Inserts (or replaces) the enrichment metadata row inside a .trail-item.
     If trail has no enrichment, inserts the enrich button instead.

     trailItemEl  – the <li class="trail-item"> DOM node
     trail        – the trail data object
     index        – trail index in array (for data binding)
     callbacks    – { onEnrich(index), onRefresh(index) }
  */
  function renderEnrichmentRow(trailItemEl, trail, index, callbacks) {
    // Remove any existing enrichment row
    var existing = trailItemEl.querySelector('.enrich-row');
    if (existing) existing.remove();

    // Remove any existing enrich button
    var existingBtn = trailItemEl.querySelector('.enrich-trigger');
    if (existingBtn) existingBtn.remove();

    var name = (trail.name || '').trim();

    // No name → no enrichment UI at all
    if (!name) return;

    var enrichment = trail.enrichment;

    if (enrichment && enrichment.fields) {
      // ── Render enrichment metadata row ──
      var row = document.createElement('div');
      row.className = 'enrich-row' + (enrichment.stale ? ' is-stale' : '');

      var parts = [];
      var f = enrichment.fields;
      if (f.distance_km != null) parts.push(esc(f.distance_km + ' km'));
      if (f.elevation_gain_m != null) parts.push(esc(f.elevation_gain_m + ' m gain'));
      if (f.surface) parts.push(esc(f.surface.charAt(0).toUpperCase() + f.surface.slice(1)));
      if (f.difficulty) parts.push(esc(f.difficulty.charAt(0).toUpperCase() + f.difficulty.slice(1)));

      var fieldsHtml = parts.length
        ? '<span class="enrich-fields">' + parts.join(' · ') + '</span>'
        : '';

      var sourceHtml = '<span class="enrich-source">via ' + esc(enrichment.source || 'overpass') +
        (enrichment.lastHydratedAt ? ' · cached ' + formatDate(enrichment.lastHydratedAt) : '') +
        '</span>';

      var refreshBtn = '<button class="enrich-refresh" aria-label="Refresh trail data" title="Refresh">↻</button>';

      row.innerHTML = fieldsHtml + sourceHtml + refreshBtn;

      // Wire refresh callback
      var btn = row.querySelector('.enrich-refresh');
      if (btn && callbacks && callbacks.onRefresh) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          callbacks.onRefresh(index);
        });
      }

      trailItemEl.appendChild(row);
    } else {
      // ── Render enrich button ──
      var enrichBtn = document.createElement('button');
      enrichBtn.className = 'enrich-trigger';
      enrichBtn.setAttribute('aria-label', 'Fetch trail data for ' + name);
      enrichBtn.title = 'Fetch trail info';
      enrichBtn.textContent = '🔍';

      if (callbacks && callbacks.onEnrich) {
        enrichBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          callbacks.onEnrich(index);
        });
      }

      // Insert before the delete button (last child)
      var deleteBtn = trailItemEl.querySelector('.trail-delete');
      if (deleteBtn) {
        trailItemEl.insertBefore(enrichBtn, deleteBtn);
      } else {
        trailItemEl.appendChild(enrichBtn);
      }
    }
  }

  /* ── showLoading ──
     Adds a loading indicator to a specific trail item.
  */
  function showLoading(trailItemEl) {
    // Disable enrich/refresh buttons during load
    var trigger = trailItemEl.querySelector('.enrich-trigger');
    var refresh = trailItemEl.querySelector('.enrich-refresh');
    if (trigger) { trigger.disabled = true; trigger.textContent = '⏳'; }
    if (refresh) { refresh.disabled = true; refresh.textContent = '⏳'; }
    trailItemEl.classList.add('enrich-loading');
  }

  /* ── hideLoading ──
     Removes loading indicator from a trail item.
  */
  function hideLoading(trailItemEl) {
    trailItemEl.classList.remove('enrich-loading');
    // Button state is reset by re-render via renderEnrichmentRow
  }

  /* ── showToast ──
     Displays a toast notification using the existing #toastContainer.
     type: '' (default/info), 'success', 'error'
  */
  function showToast(msg, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var t = document.createElement('div');
    t.className = 'toast' + (type === 'success' ? ' success' : '') + (type === 'error' ? ' error' : '');
    t.innerHTML = '<span class="toast-msg">' + esc(msg) + '</span>';
    container.appendChild(t);

    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3000);
  }

  /* ── expose ── */
  window.TK.trailEnrichmentUI = {
    renderEnrichmentRow: renderEnrichmentRow,
    showLoading: showLoading,
    hideLoading: hideLoading,
    showToast: showToast
  };

})();
