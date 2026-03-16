/* ── photoStore.js ──────────────────────────────────
   IndexedDB-backed photo storage for Trailkeeper.
   Moves base64 photo data out of localStorage to avoid
   the ~5MB quota. Falls back to localStorage if IDB
   is unavailable (private browsing, old browsers).
   ──────────────────────────────────────────────────── */

window.TK = window.TK || {};

(function () {
  'use strict';

  var DB_NAME = 'tk-photos';
  var STORE_NAME = 'photos';
  var DB_VERSION = 1;

  var _db = null;
  var _idbAvailable = null; // null = unknown, true/false after first check

  /* ── IDB helpers ── */

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(_db); return; }
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = function (e) {
          _db = e.target.result;
          _idbAvailable = true;
          resolve(_db);
        };
        req.onerror = function () {
          _idbAvailable = false;
          reject(new Error('IDB open failed'));
        };
      } catch (_) {
        _idbAvailable = false;
        reject(new Error('IDB not available'));
      }
    });
  }

  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var req = store.get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req = store.put(value, key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var req = store.delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGetAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var result = {};
        var req = store.openCursor();
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            result[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* ── localStorage fallback ── */

  var LS_PREFIX = 'tk-photo-';

  function lsKey(slotKey) { return LS_PREFIX + slotKey; }

  function lsGet(slotKey) {
    try {
      var raw = localStorage.getItem(lsKey(slotKey));
      return raw || null;
    } catch (_) { return null; }
  }

  function lsPut(slotKey, base64) {
    try { localStorage.setItem(lsKey(slotKey), base64); } catch (_) {}
  }

  function lsDelete(slotKey) {
    try { localStorage.removeItem(lsKey(slotKey)); } catch (_) {}
  }

  function lsGetAll() {
    var result = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) {
          var slotKey = k.slice(LS_PREFIX.length);
          result[slotKey] = localStorage.getItem(k);
        }
      }
    } catch (_) {}
    return result;
  }

  /* ── Public API ── */

  function savePhoto(slotKey, base64Data) {
    return idbPut(slotKey, base64Data).catch(function () {
      lsPut(slotKey, base64Data);
    });
  }

  function getPhoto(slotKey) {
    return idbGet(slotKey).catch(function () {
      return lsGet(slotKey);
    });
  }

  function deletePhoto(slotKey) {
    return idbDelete(slotKey).catch(function () {
      lsDelete(slotKey);
    }).then(function () {
      // Also clean localStorage fallback if IDB succeeded
      lsDelete(slotKey);
    });
  }

  function getAllPhotos() {
    return idbGetAll().catch(function () {
      return lsGetAll();
    });
  }

  /* ── Migration: move old localStorage photo keys into IDB ──
     Old keys: "photo0", "photo1", "photo2" (raw base64 in localStorage)
     Called once at boot from app.js. */

  function migrateFromLocalStorage() {
    var oldKeys = ['photo0', 'photo1', 'photo2'];
    var migrated = false;

    var promises = oldKeys.map(function (oldKey) {
      var data;
      try { data = localStorage.getItem(oldKey); } catch (_) { return Promise.resolve(); }
      if (!data) return Promise.resolve();

      migrated = true;
      return savePhoto(oldKey, data).then(function () {
        try { localStorage.removeItem(oldKey); } catch (_) {}
      }).catch(function () {
        // IDB failed — leave in localStorage, fallback will find it
      });
    });

    return Promise.all(promises).then(function () { return migrated; });
  }

  /* ── Expose ── */

  window.TK.photoStore = {
    savePhoto: savePhoto,
    getPhoto: getPhoto,
    deletePhoto: deletePhoto,
    getAllPhotos: getAllPhotos,
    migrateFromLocalStorage: migrateFromLocalStorage
  };

})();
