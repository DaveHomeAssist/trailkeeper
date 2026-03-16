/**
 * Agent 1: Trail Enrichment Adapter
 *
 * Fetches trail metadata from OpenStreetMap Overpass API.
 * Returns normalized fields or null on any failure.
 * No DOM. No localStorage. Pure fetch + normalize.
 */
(function () {
  'use strict';

  window.TK = window.TK || {};

  // ── SAC scale → human-readable difficulty ──
  var SAC_MAP = {
    hiking: 'Easy',
    mountain_hiking: 'Moderate',
    demanding_mountain_hiking: 'Difficult',
    alpine_hiking: 'Alpine',
    demanding_alpine_hiking: 'Expert',
    difficult_alpine_hiking: 'Expert',
  };

  /**
   * Build an Overpass QL query for hiking trails matching a name.
   * Searches relations and ways tagged as hiking routes or footways.
   */
  function buildQuery(trailName) {
    var safe = trailName.replace(/"/g, '\\"');
    return [
      '[out:json][timeout:10];',
      '(',
      '  relation["route"="hiking"]["name"~"' + safe + '",i];',
      '  way["highway"~"path|footway|track"]["name"~"' + safe + '",i];',
      ');',
      'out body 5;',  // limit to 5 results
      '>;',
      'out skel qt;',
    ].join('\n');
  }

  /**
   * Compute great-circle distance between two lat/lon points (Haversine), in km.
   */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Given Overpass elements, compute total distance in km from node geometry.
   * Builds a node lookup, then traces ways in order.
   */
  function computeDistance(elements) {
    var nodes = {};
    var ways = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.type === 'node') nodes[el.id] = el;
      if (el.type === 'way' && el.nodes) ways.push(el);
    }

    var totalKm = 0;
    for (var w = 0; w < ways.length; w++) {
      var nds = ways[w].nodes;
      for (var n = 1; n < nds.length; n++) {
        var a = nodes[nds[n - 1]];
        var b = nodes[nds[n]];
        if (a && b) totalKm += haversine(a.lat, a.lon, b.lat, b.lon);
      }
    }
    return totalKm > 0 ? Math.round(totalKm * 10) / 10 : null;
  }

  /**
   * Estimate elevation gain from node ele tags (max - min).
   * This is a rough approximation — not cumulative gain.
   */
  function computeElevation(elements) {
    var elevations = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.type === 'node' && el.tags && el.tags.ele) {
        var val = parseFloat(el.tags.ele);
        if (!isNaN(val)) elevations.push(val);
      }
    }
    if (elevations.length < 2) return null;
    var min = Math.min.apply(null, elevations);
    var max = Math.max.apply(null, elevations);
    var gain = Math.round(max - min);
    return gain > 0 ? gain : null;
  }

  /**
   * Extract the best matching element (relation preferred over way).
   * Returns its tags and id.
   */
  function pickBestMatch(elements) {
    var relations = [];
    var ways = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.type === 'relation' && el.tags) relations.push(el);
      if (el.type === 'way' && el.tags) ways.push(el);
    }

    // Prefer relations (full routes) over individual ways
    return relations[0] || ways[0] || null;
  }

  // ── SAC scales considered "demanding" or harder ──
  var DEMANDING_SAC = {
    demanding_mountain_hiking: true,
    alpine_hiking: true,
    demanding_alpine_hiking: true,
    difficult_alpine_hiking: true,
  };

  /**
   * Build advisories array from OSM tags already present in the response.
   * Pure tag inspection — no additional API call.
   */
  function buildAdvisories(tags) {
    var advisories = [];

    var access = (tags.access || '').toLowerCase();
    if (access === 'private' || access === 'no') {
      advisories.push({ type: 'access', level: 'warning', text: 'Private access \u2014 verify permission' });
    }

    if ((tags.seasonal || '').toLowerCase() === 'yes') {
      advisories.push({ type: 'seasonal', level: 'warning', text: 'Seasonal access \u2014 verify conditions' });
    }

    if ((tags.winter_service || '').toLowerCase() === 'no') {
      advisories.push({ type: 'winter', level: 'info', text: 'No winter maintenance' });
    }

    var surface = (tags.surface || '').toLowerCase();
    if (surface === 'mud' || surface === 'sand') {
      advisories.push({ type: 'surface', level: 'info', text: 'Soft surface \u2014 check recent weather' });
    }

    var vis = (tags.trail_visibility || '').toLowerCase();
    if (vis === 'bad' || vis === 'horrible') {
      advisories.push({ type: 'visibility', level: 'warning', text: 'Poor trail visibility' });
    }

    var sac = (tags.sac_scale || '').toLowerCase();
    if (DEMANDING_SAC[sac]) {
      advisories.push({ type: 'terrain', level: 'warning', text: 'Demanding terrain' });
    }

    return advisories;
  }

  /**
   * Compute center lat/lon from all node elements (simple average).
   */
  function computeCenter(elements) {
    var sumLat = 0, sumLon = 0, count = 0;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
        sumLat += el.lat;
        sumLon += el.lon;
        count++;
      }
    }
    if (count === 0) return { lat: null, lon: null };
    return {
      lat: Math.round((sumLat / count) * 1e6) / 1e6,
      lon: Math.round((sumLon / count) * 1e6) / 1e6,
    };
  }

  /**
   * Normalize an Overpass response into the shared enrichment field shape.
   */
  function normalize(elements) {
    var match = pickBestMatch(elements);
    if (!match) return null;

    var tags = match.tags || {};

    // Surface
    var surface = tags.surface || null;

    // Difficulty from sac_scale
    var sacRaw = tags.sac_scale || null;
    var difficulty = sacRaw ? (SAC_MAP[sacRaw] || sacRaw) : null;

    // Distance: prefer tag, fall back to geometry computation
    var distanceKm = null;
    if (tags.distance) {
      var parsed = parseFloat(tags.distance);
      if (!isNaN(parsed)) distanceKm = Math.round(parsed * 10) / 10;
    }
    if (!distanceKm) {
      distanceKm = computeDistance(elements);
    }

    // Elevation
    var elevationGain = computeElevation(elements);

    // Trail condition advisories
    var advisories = buildAdvisories(tags);

    // Center coordinates from node geometry
    var center = computeCenter(elements);

    return {
      distance_km: distanceKm,
      elevation_gain_m: elevationGain,
      surface: surface,
      difficulty: difficulty,
      osm_id: match.id,
      advisories: advisories,
      lat: center.lat,
      lon: center.lon,
    };
  }

  /**
   * Fetch enrichment metadata for a trail by name.
   *
   * @param {string} trailName - User-entered trail name
   * @param {object} [options]
   * @param {number} [options.timeoutMs=8000] - Fetch timeout in ms
   * @returns {Promise<object|null>} Normalized fields object, or null on failure
   */
  async function enrichTrail(trailName, options) {
    options = options || {};
    var timeoutMs = options.timeoutMs || 8000;

    if (!trailName || typeof trailName !== 'string' || !trailName.trim()) {
      return null;
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);

    try {
      var query = buildQuery(trailName.trim());
      var response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });

      if (!response.ok) return null;

      var data = await response.json();
      if (!data || !Array.isArray(data.elements) || data.elements.length === 0) {
        return null;
      }

      return normalize(data.elements);
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Expose on namespace ──
  window.TK.trailAdapter = { enrichTrail: enrichTrail };

})();
