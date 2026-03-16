/* ── Trail Discovery Module ──
   Finds nearby named hiking trails via Overpass API
   using coordinates from the weather geocoding step.
   Renders a suggestion panel with "+ Add" buttons. */

(function () {
  'use strict';

  window.TK = window.TK || {};

  var RADIUS_M = 25000;
  var MAX_RESULTS = 5;
  var TIMEOUT_MS = 12000;
  var KM_TO_MI = 0.621371;

  /* ── Haversine ── */

  function haversine(lat1, lon1, lat2, lon2) {
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

  function parseResults(elements, originLat, originLon) {
    var seen = {};
    var results = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el.tags || !el.tags.name) continue;

      var nameKey = el.tags.name.toLowerCase().trim();
      if (seen[nameKey]) continue;
      seen[nameKey] = true;

      var lat = el.center ? el.center.lat : el.lat;
      var lon = el.center ? el.center.lon : el.lon;
      if (lat == null || lon == null) continue;

      var distKm = haversine(originLat, originLon, lat, lon);

      results.push({
        name: el.tags.name,
        osm_id: el.id,
        kind: el.type,
        lat: lat,
        lon: lon,
        distance_km: Math.round(distKm * 10) / 10,
        distance_mi: Math.round(distKm * KM_TO_MI * 10) / 10
      });
    }

    results.sort(function (a, b) { return a.distance_km - b.distance_km; });
    return results.slice(0, MAX_RESULTS);
  }

  /* ── Check if trail name already in shortlist ── */

  function isAlreadyAdded(name) {
    if (typeof trails === 'undefined') return false;
    var lower = name.toLowerCase().trim();
    for (var i = 0; i < trails.length; i++) {
      if (trails[i].name && trails[i].name.toLowerCase().trim() === lower) return true;
    }
    return false;
  }

  /* ── Render panel ── */

  function renderPanel(container, results) {
    container.innerHTML = '';

    if (!results.length) {
      container.innerHTML = '<div class="discovery-empty">No named trails found within 25 km.</div>';
      return;
    }

    for (var i = 0; i < results.length; i++) {
      (function (r) {
        var row = document.createElement('div');
        row.className = 'discovery-item';

        var nameEl = document.createElement('span');
        nameEl.className = 'discovery-name';
        nameEl.textContent = r.name;

        var distEl = document.createElement('span');
        distEl.className = 'discovery-dist';
        distEl.textContent = r.distance_mi + ' mi';

        var addBtn = document.createElement('button');
        addBtn.className = 'btn btn-primary discovery-add';
        var already = isAlreadyAdded(r.name);
        addBtn.textContent = already ? 'Added' : '+ Add';
        addBtn.disabled = already;
        addBtn.setAttribute('aria-label', 'Add ' + r.name + ' to shortlist');

        addBtn.addEventListener('click', function () {
          if (typeof trails === 'undefined' || typeof store === 'undefined') return;
          trails.push({ name: r.name, category: 'Half day', status: 'unvisited' });
          store.set('trails', trails);
          if (typeof renderTrails === 'function') renderTrails();
          if (typeof toast === 'function') toast('"' + r.name + '" added', 'success');
          addBtn.textContent = 'Added';
          addBtn.disabled = true;
        });

        row.appendChild(nameEl);
        row.appendChild(distEl);
        row.appendChild(addBtn);
        container.appendChild(row);
      })(results[i]);
    }
  }

  /* ── Fetch nearby trails ── */

  async function findNearby(lat, lon) {
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
      if (!resp.ok) return null;
      var data = await resp.json();
      if (!data || !Array.isArray(data.elements) || !data.elements.length) return [];
      return parseResults(data.elements, lat, lon);
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── Init: create button + panel, wire events ── */

  function init() {
    var weatherResult = document.getElementById('weatherResult');
    if (!weatherResult) return;
    var parent = weatherResult.parentElement;
    if (!parent) return;

    // Create discover button
    var btn = document.createElement('button');
    btn.className = 'btn btn-ghost discovery-btn';
    btn.id = 'discoveryBtn';
    btn.textContent = 'Find nearby trails';
    btn.style.display = 'none';

    // Create panel
    var panel = document.createElement('div');
    panel.className = 'discovery-panel';
    panel.id = 'discoveryPanel';

    parent.appendChild(btn);
    parent.appendChild(panel);

    // Show the button after a successful weather check
    var observer = new MutationObserver(function () {
      var geo = window.TK && window.TK._lastGeo;
      btn.style.display = geo ? '' : 'none';
    });
    observer.observe(weatherResult, { childList: true, attributes: true });

    // Also check immediately
    if (window.TK && window.TK._lastGeo) btn.style.display = '';

    // Button click handler
    var lastGeoKey = '';
    btn.addEventListener('click', async function () {
      var geo = window.TK && window.TK._lastGeo;
      if (!geo) {
        if (typeof toast === 'function') toast('Check weather first to get coordinates');
        return;
      }

      var geoKey = geo.lat + ',' + geo.lon;

      // Toggle panel if already showing results for same location
      if (panel.classList.contains('open') && geoKey === lastGeoKey) {
        panel.classList.remove('open');
        return;
      }

      btn.textContent = 'Searching\u2026';
      btn.disabled = true;
      panel.classList.remove('open');

      var results = await findNearby(geo.lat, geo.lon);

      btn.textContent = 'Find nearby trails';
      btn.disabled = false;

      if (results === null) {
        panel.innerHTML = '<div class="discovery-empty">Could not reach trail data. Check your connection.</div>';
      } else {
        renderPanel(panel, results);
      }

      panel.classList.add('open');
      lastGeoKey = geoKey;
    });
  }

  window.TK.trailDiscovery = { init: init, findNearby: findNearby };

})();
