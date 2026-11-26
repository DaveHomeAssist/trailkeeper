/* Bump the build stamp when app shell files change. */
var BUILD_STAMP = '2026-11-26';
var SCOPE = self.registration.scope;
var CACHE_PREFIX = 'trailkeeper:' + SCOPE + '|';
var CACHE_NAME = CACHE_PREFIX + BUILD_STAMP;

/* Notify all active clients of SW errors. */
function notifyClients(type, message) {
  return self.clients.matchAll({ type: 'window' }).then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage({ type: type, message: message });
    });
  });
}

var APP_SHELL = [
  './',
  'index.html',
  'hiking-page.html',
  'manifest.json',
  'shared.css',
  'js/app.js',
  'js/storageAdapter.js',
  'js/photoStore.js',
  'js/trailAdapter.js',
  'js/trailStore.js',
  'js/trailEnrichmentUI.js',
  'js/trailHydration.js',
  'js/trailDiscovery.js',
  'js/trailLog.js',
  'js/trailExport.js',
  'brand.html',
  'images/trailkeeper-header.webp',
  'assets/icons/favicon/favicon.svg',
  'assets/icons/favicon/favicon.png',
  'assets/icons/favicon/apple-touch-icon.png',
  'assets/icons/favicon/icon-192.png',
  'assets/icons/favicon/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(APP_SHELL); })
      .then(function() { return self.skipWaiting(); })
      .catch(async function(error) {
        await notifyClients('sw-error', 'Offline update failed. Reconnect to try again.');
        throw error;
      })
  );
});

async function retireCache(name) {
  if (name === CACHE_NAME) return;
  if (name.startsWith(CACHE_PREFIX)) {
    await caches.delete(name);
    return;
  }
  if (!/^tk-v[1-5]$/.test(name) && name !== 'tk-2026-06-11') return;

  // Older versions shared a short cache name across the origin. Remove only
  // this installation's known shell files and preserve any other entries.
  var cache = await caches.open(name);
  var previousShell = new Set(APP_SHELL.concat('images/trailkeeper-logo-light.png')
    .map(function(file) { return new URL(file, SCOPE).href; }));
  if (!await cache.match(new URL('manifest.json', SCOPE))) return;
  var keys = await cache.keys();
  await Promise.all(keys.filter(function(request) { return previousShell.has(request.url); })
    .map(function(request) { return cache.delete(request); }));
  if (!(await cache.keys()).length) await caches.delete(name);
}

self.addEventListener('activate', function(event) {
  event.waitUntil(caches.keys().then(function(names) {
    return Promise.all(names.map(retireCache));
  }).then(function() { return self.clients.claim(); }));
});

var FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
var API_HOSTS = new Set(['api.open-meteo.com', 'geocoding-api.open-meteo.com',
  'overpass-api.de', 'staticmap.openstreetmap.de']);

async function respond(event, font) {
  var request = event.request;
  var cache;
  try { cache = await caches.open(CACHE_NAME); } catch {}
  if (font && cache) {
    var hit = await cache.match(request);
    if (hit) return hit;
  }
  var response;
  try {
    response = await fetch(request);
  } catch (error) {
    var cached = cache && await cache.match(request);
    if (cached) return cached;
    throw error;
  }
  if (cache && (response.ok || response.type === 'opaque')) {
    event.waitUntil(cache.put(request, response.clone()).catch(function() {}));
  }
  return response;
}

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  var font = FONT_HOSTS.has(url.hostname);
  if (!url.href.startsWith(SCOPE) && !font && !API_HOSTS.has(url.hostname)) return;
  event.respondWith(respond(event, font));
});
