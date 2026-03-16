var CACHE_NAME = 'tk-v2';
var APP_SHELL = [
  './',
  'index.html',
  'hiking-page.html',
  'shared.css',
  'js/trailAdapter.js',
  'js/trailStore.js',
  'js/trailEnrichmentUI.js',
  'js/trailHydration.js',
  'js/trailDiscovery.js',
  'js/trailLog.js',
  'js/trailExport.js',
  'images/trailkeeper-logo-light.png',
  'images/tk.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  // Network-first for APIs (weather, enrichment, discovery, static maps)
  if (url.hostname.indexOf('open-meteo') !== -1 ||
      url.hostname.indexOf('overpass-api') !== -1 ||
      url.hostname.indexOf('geocoding-api') !== -1 ||
      url.hostname.indexOf('staticmap') !== -1) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        return resp;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  // Cache-first for Google Fonts (long-lived)
  if (url.hostname.indexOf('fonts.googleapis.com') !== -1 ||
      url.hostname.indexOf('fonts.gstatic.com') !== -1) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(resp) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
          return resp;
        });
      })
    );
    return;
  }
  // Cache-first for app shell and local assets
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
