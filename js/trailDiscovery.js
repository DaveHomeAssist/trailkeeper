/* ── Trail Discovery Module ──
   Finds nearby named hiking trails via Overpass API
   using coordinates from the weather geocoding step.
   Renders a suggestion panel with "+ Add" buttons.
   Does not auto-add — user chooses what to save. */

(function () {
  'use strict';

  window.TK = window.TK || {};

  var RADIUS_M = 25000;
  var MAX_RESULTS = 5;
  var TIMEOUT_MS = 12000;

  /* ── Haversine (km) ── */

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* ── Overpass query ── */

  function buildQuery(lat, lon) {
    return [
      '[out:json][timeout:12];',
      '(',
      '  relation["route"="hiking"]["name"](around:' + RADIUS_M + ',' + lat + ',' + lon + ');',
      '  way["highway"~"path|track|footway"]["name"](around:' + RADIUS_M + ',' + lat + ',' + lon + ');',
      ');',
      'out center tags;'
    ].join('\n');
  }

  /* ── Parse + rank results ── */

  function normalizeNearbyResults(elements, originLat, originLon) {
    if (!Array.isArray(elements)) return [];
    var seen = {};
    var results = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el || !el.tags || !el.tags.name) continue;

      var nameKey = el.tags.name.toLowerCase().trim();
      if (seen[nameKey]) continue;
      seen[nameKey] = true;

      var lat = el.center ? el.center.lat : el.lat;
      var lon = el.center ? el.center.lon : el.lon;
      if (lat == null || lon == null) continue;

      var distKm = haversineKm(originLat, originLon, lat, lon);

      results.push({
        osm_id: el.id,
        osm_type: el.type,
        name: el.tags.name,
        lat: lat,
        lon: lon,
        distance_km: Math.round(distKm * 10) / 10
      });
    }

    results.sort(function (a, b) { return a.distance_km - b.distance_km; });
    return results.slice(0, MAX_RESULTS);
  }

  /* ── Check if trail already in shortlist ── */

  function isAlreadyAdded(name) {
    if (typeof name !== 'string' || typeof trails === 'undefined' || !Array.isArray(trails)) return false;
    var lower = name.toLowerCase().trim();
    for (var i = 0; i < trails.length; i++) {
      if (trails[i] && trails[i].name && trails[i].name.toLowerCase().trim() === lower) return true;
    }
    return false;
  }

  /* ── Render discovery state (loading/empty/error) ── */

  function renderDiscoveryState(list, type, message) {
    if (!list) return;
    list.innerHTML = '<div class="trail-discovery-' + type + '">' +
      (typeof esc === 'function' ? esc(message) : message) + '</div>';
  }

  /* ── Render suggestion rows ── */

  function renderNearbyTrails(results, label) {
    var list = document.getElementById('nearbyTrailsList');
    var title = document.getElementById('nearbyTrailsTitle');
    if (!list) return;

    if (title && label) {
      title.textContent = results.length
        ? results.length + ' trails near ' + label
        : 'Nearby trails';
    }

    list.innerHTML = '';

    if (!results.length) {
      renderDiscoveryState(list, 'empty', 'No named trails found within 25 km.');
      return;
    }

    for (var i = 0; i < results.length; i++) {
      (function (r) {
        var row = document.createElement('div');
        row.className = 'nearby-trail-row';

        var meta = document.createElement('div');
        meta.className = 'nearby-trail-meta';

        var nameEl = document.createElement('div');
        nameEl.className = 'nearby-trail-name';
        nameEl.textContent = r.name;

        var distEl = document.createElement('div');
        distEl.className = 'nearby-trail-distance';
        distEl.textContent = r.distance_km + ' km away';

        meta.appendChild(nameEl);
        meta.appendChild(distEl);

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'nearby-trail-add';
        var already = isAlreadyAdded(r.name);
        addBtn.textContent = already ? 'Added' : '+ Add';
        addBtn.disabled = already;
        addBtn.setAttribute('aria-label', 'Add ' + r.name + ' to shortlist');

        addBtn.addEventListener('click', function () {
          addNearbyTrail(r, addBtn);
        });

        row.appendChild(meta);
        row.appendChild(addBtn);
        list.appendChild(row);
      })(results[i]);
    }
  }

  /* ── Add trail to shortlist ── */

  function addNearbyTrail(result, btnEl) {
    if (!result || typeof result.name !== 'string' || typeof trails === 'undefined' || !Array.isArray(trails) || typeof store === 'undefined') return;

    if (isAlreadyAdded(result.name)) {
      if (typeof toast === 'function') toast('Trail already in shortlist');
      return;
    }

    trails.push({
      name: result.name,
      category: 'Nearby',
      status: 'planned',
      addedAt: Date.now(),
      osm_id: result.osm_id,
      osm_type: result.osm_type,
      discovery: {
        source: 'overpass',
        lat: result.lat,
        lon: result.lon,
        distance_km: result.distance_km
      }
    });

    store.set('tk-trails', trails);
    if (typeof renderTrails === 'function') renderTrails();
    if (typeof toast === 'function') toast('\u201c' + result.name + '\u201d added', 'success');

    if (btnEl) {
      btnEl.textContent = 'Added';
      btnEl.disabled = true;
    }
  }

  /* ── Fetch nearby trails from Overpass ── */

  async function fetchNearbyTrails(lat, lon) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
      return { error: 'invalid-location', message: 'Trail search needs a valid weather location first.' };
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    try {
      var query = buildQuery(lat, lon);
      var resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal
      });
      if (!resp.ok) return { error: 'http', message: 'Trail service returned HTTP ' + resp.status + '. Retry later.' };
      var data = await resp.json();
      if (!data || !Array.isArray(data.elements) || !data.elements.length) return [];
      return normalizeNearbyResults(data.elements, lat, lon);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { error: 'timeout', message: 'Trail search timed out after 12 seconds. Try again with a steadier connection.' };
      }
      return { error: 'network', message: 'Trail search could not reach Overpass. Check your connection and retry.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── Load + render nearby trails ── */

  async function loadNearbyTrails() {
    var ctx = window.TK && window.TK.weatherContext;
    if (!ctx || ctx.lat == null || ctx.lon == null) {
      if (typeof toast === 'function') toast('Check weather first to load nearby trails');
      return;
    }

    var panel = document.getElementById('nearbyTrailsPanel');
    var btn = document.getElementById('findNearbyTrailsBtn');
    var list = document.getElementById('nearbyTrailsList');
    if (!panel || !list) return;

    // Toggle closed if already open for same location
    if (!panel.hidden && panel.dataset.geoKey === ctx.lat + ',' + ctx.lon) {
      panel.hidden = true;
      return;
    }

    // Show loading state
    if (btn) { btn.textContent = 'Searching\u2026'; btn.disabled = true; }
    renderDiscoveryState(list, 'loading', 'Searching nearby trails\u2026');
    panel.hidden = false;

    var results = await fetchNearbyTrails(ctx.lat, ctx.lon);

    if (btn) { btn.textContent = 'Find nearby trails'; btn.disabled = false; }

    if (results && results.error) {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.overpassError = results.message;
      }
      if (typeof renderAdaptiveStates === 'function') renderAdaptiveStates();
      renderDiscoveryState(list, 'error', results.message);
    } else {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.overpassError = '';
      }
      if (typeof renderAdaptiveStates === 'function') renderAdaptiveStates();
      renderNearbyTrails(results, ctx.placeLabel || '');
    }

    panel.dataset.geoKey = ctx.lat + ',' + ctx.lon;
  }

  /* ── Init: bind UI events ── */

  function initDiscovery() {
    var btn = document.getElementById('findNearbyTrailsBtn');
    if (!btn) return;

    // Show button only when weather context is available
    function updateVisibility() {
      var ctx = window.TK && window.TK.weatherContext;
      btn.style.display = (ctx && ctx.lat != null) ? '' : 'none';
    }

    // Watch for weather result changes
    var weatherResult = document.getElementById('weatherResult');
    if (weatherResult) {
      new MutationObserver(updateVisibility).observe(weatherResult, { childList: true, attributes: true });
    }

    updateVisibility();

    btn.addEventListener('click', loadNearbyTrails);
  }

  /* ── Expose on namespace ── */

  window.TK.trailDiscovery = {
    initDiscovery: initDiscovery,
    loadNearbyTrails: loadNearbyTrails,
    renderNearbyTrails: renderNearbyTrails,
    addNearbyTrail: addNearbyTrail
  };

})();
