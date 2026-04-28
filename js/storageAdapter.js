/* Trailkeeper versioned storage adapter */
window.TK = window.TK || {};

(function () {
  'use strict';

  var KEY = 'tk-data-v2';
  var SCHEMA_VERSION = 2;
  var TRAIL_STATUSES = ['unvisited', 'planned', 'done', 'archived'];
  var DEFAULT_GEAR = [
    'Shoes & socks',
    'Water',
    'Snacks',
    'Layers',
    'Headlamp',
    'First aid',
    'Bug spray & sunscreen',
    'Map (offline)'
  ];

  function nowISO() {
    return new Date().toISOString();
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      if (window.TK && window.TK.runtimeState) {
        window.TK.runtimeState.storageError = 'Browser storage is unavailable. Keep a backup before leaving this page.';
      }
      return false;
    }
  }

  function makeId(prefix) {
    var stamp = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 9);
    return 'tk_' + prefix + '_' + stamp + '_' + rand;
  }

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  }

  function deterministicId(prefix, seed, index) {
    return 'tk_' + prefix + '_' + (slug(seed) || 'item') + '_' + String(index + 1);
  }

  function numOrNull(value) {
    if (value === '' || value == null) return null;
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function str(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function withRecordBase(record, prefix, seed, index) {
    var ts = nowISO();
    var out = record && typeof record === 'object' ? Object.assign({}, record) : {};
    out.id = str(out.id) || deterministicId(prefix, seed, index || 0);
    out.createdAt = str(out.createdAt) || ts;
    out.updatedAt = str(out.updatedAt) || out.createdAt;
    out.deletedAt = str(out.deletedAt) || null;
    return out;
  }

  function blankDoc() {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: null,
      trails: [],
      hikeLogs: [],
      tripPlans: [],
      gearItems: [],
      gearKits: [],
      fieldNotes: [],
      photoRecords: []
    };
  }

  function makeTrail(raw, index) {
    var trail = withRecordBase(raw, 'trail', raw && raw.name, index);
    trail.name = str(trail.name);
    if (!trail.name) return null;
    trail.location = str(trail.location);
    trail.distanceMiles = numOrNull(trail.distanceMiles);
    trail.elevationFeet = numOrNull(trail.elevationFeet);
    trail.difficulty = str(trail.difficulty);
    trail.status = TRAIL_STATUSES.indexOf(trail.status) >= 0 ? trail.status : 'unvisited';
    trail.tags = asArray(trail.tags).map(str).filter(Boolean);
    if (!trail.tags.length && trail.category) trail.tags = [str(trail.category)].filter(Boolean);
    trail.category = str(trail.category) || (trail.tags[0] || 'Quick');
    trail.notes = str(trail.notes);
    trail.nextTimeNote = str(trail.nextTimeNote);
    trail.links = asArray(trail.links).map(function (link, li) {
      return {
        id: str(link && link.id) || deterministicId('link', trail.id + '_' + li, li),
        label: str(link && link.label),
        url: str(link && link.url)
      };
    }).filter(function (link) { return link.label || link.url; });
    trail.enrichment = trail.enrichment && typeof trail.enrichment === 'object' ? trail.enrichment : null;
    return trail;
  }

  function makeHikeLog(raw, index, trailLookup) {
    var log = withRecordBase(raw, 'log', raw && (raw.trail || raw.trailName || raw.trailId), index);
    var legacyName = str(log.trail) || str(log.trailName);
    log.trailId = str(log.trailId) || (legacyName ? trailLookup[legacyName.toLowerCase()] : '');
    if (!log.trailId && !legacyName) return null;
    log.date = str(log.date) || str(log.hikedAt) || todayISO();
    log.miles = numOrNull(log.miles);
    log.elevationFeet = numOrNull(log.elevationFeet != null ? log.elevationFeet : log.elevation);
    log.rating = Number.isFinite(Number(log.rating)) ? Math.min(5, Math.max(0, Math.round(Number(log.rating)))) : 0;
    log.conditions = str(log.conditions);
    log.note = str(log.note);
    log.trailNameSnapshot = legacyName;
    return log;
  }

  function makeTripPlan(raw, index, trailLookup) {
    var plan = withRecordBase(raw, 'plan', raw && (raw.date || raw.trailId || raw.trailName), index);
    var legacyName = str(plan.trailName);
    plan.trailId = str(plan.trailId) || (legacyName ? trailLookup[legacyName.toLowerCase()] : '');
    plan.date = str(plan.date) || todayISO();
    plan.startTime = str(plan.startTime);
    plan.weatherSummary = str(plan.weatherSummary);
    plan.packList = asArray(plan.packList).map(str).filter(Boolean);
    plan.notes = str(plan.notes);
    plan.status = str(plan.status) || 'draft';
    return plan;
  }

  function makeGearItem(raw, index) {
    var item = withRecordBase(raw, 'gear', raw && raw.name, index);
    item.name = str(item.name);
    if (!item.name) return null;
    item.category = str(item.category) || 'General';
    item.packed = Boolean(item.packed);
    item.defaultItem = Boolean(item.defaultItem);
    return item;
  }

  function makeGearKit(raw, index) {
    var kit = withRecordBase(raw, 'kit', raw && raw.name, index);
    kit.name = str(kit.name) || 'Default Kit';
    kit.itemIds = asArray(kit.itemIds).map(str).filter(Boolean);
    kit.notes = str(kit.notes);
    return kit;
  }

  function makeFieldNote(raw, index, trailLookup) {
    var note = withRecordBase(raw, 'note', raw && (raw.title || raw.type), index);
    var legacyName = str(note.trailName);
    note.trailId = str(note.trailId) || (legacyName ? trailLookup[legacyName.toLowerCase()] : '');
    note.type = str(note.type) || 'general';
    note.title = str(note.title);
    note.body = str(note.body);
    return note.body || note.title ? note : null;
  }

  function makePhotoRecord(raw, index, trailLookup) {
    var photo = withRecordBase(raw, 'photo', raw && (raw.slotKey || raw.caption), index);
    var legacyName = str(photo.trailName);
    photo.trailId = str(photo.trailId) || (legacyName ? trailLookup[legacyName.toLowerCase()] : '');
    photo.hikeLogId = str(photo.hikeLogId);
    photo.slotKey = str(photo.slotKey);
    photo.caption = str(photo.caption);
    photo.storage = str(photo.storage) || 'indexedDB';
    return photo.slotKey || photo.caption ? photo : null;
  }

  function lookupByTrailName(trails) {
    var lookup = {};
    trails.forEach(function (trail) {
      if (trail && trail.name) lookup[trail.name.toLowerCase()] = trail.id;
    });
    return lookup;
  }

  function validateDoc(doc) {
    var out = blankDoc();
    var rawTrails = asArray(doc && doc.trails);
    out.trails = rawTrails.map(makeTrail).filter(Boolean);
    var trailLookup = lookupByTrailName(out.trails);
    out.hikeLogs = asArray(doc && (doc.hikeLogs || doc.logs)).map(function (log, i) {
      return makeHikeLog(log, i, trailLookup);
    }).filter(Boolean);
    out.tripPlans = asArray(doc && doc.tripPlans).map(function (plan, i) {
      return makeTripPlan(plan, i, trailLookup);
    }).filter(Boolean);
    out.gearItems = asArray(doc && doc.gearItems).map(makeGearItem).filter(Boolean);
    out.gearKits = asArray(doc && doc.gearKits).map(makeGearKit).filter(Boolean);
    out.fieldNotes = asArray(doc && doc.fieldNotes).map(function (note, i) {
      return makeFieldNote(note, i, trailLookup);
    }).filter(Boolean);
    out.photoRecords = asArray(doc && doc.photoRecords).map(function (photo, i) {
      return makePhotoRecord(photo, i, trailLookup);
    }).filter(Boolean);
    return out;
  }

  function migrateLegacy() {
    var doc = blankDoc();
    var legacyTrails = asArray(readJSON('tk-trails', readJSON('trails', [])));
    doc.trails = legacyTrails.map(function (trail, i) {
      return makeTrail(trail, i);
    }).filter(Boolean);

    var trailLookup = lookupByTrailName(doc.trails);
    var legacyHikes = asArray(readJSON('hikeLog', []));
    var inlineLogs = asArray(readJSON('tk-logs', [])).map(function (log) {
      return {
        id: log.id,
        trailName: log.trailName,
        date: log.hikedAt,
        conditions: log.conditions,
        rating: log.rating,
        note: log.note
      };
    });
    doc.hikeLogs = legacyHikes.concat(inlineLogs).map(function (log, i) {
      return makeHikeLog(log, i, trailLookup);
    }).filter(Boolean);

    var planTrailName = str(readJSON('planTrail', ''));
    var planTrailId = planTrailName ? trailLookup[planTrailName.toLowerCase()] : '';
    if (planTrailName && !planTrailId) {
      var created = makeTrail({ name: planTrailName, status: 'planned', category: 'Planned', tags: ['Planned'] }, doc.trails.length);
      if (created) {
        doc.trails.push(created);
        trailLookup[created.name.toLowerCase()] = created.id;
        planTrailId = created.id;
      }
    }
    if (planTrailName || readJSON('tripNotes', '') || readJSON('planTime', '')) {
      doc.tripPlans.push(makeTripPlan({
        trailId: planTrailId || '',
        trailName: planTrailName,
        date: todayISO(),
        startTime: readJSON('planTime', ''),
        notes: readJSON('tripNotes', ''),
        weatherSummary: readJSON('weatherCity', ''),
        packList: DEFAULT_GEAR,
        status: planTrailId ? 'planned' : 'draft'
      }, 0, trailLookup));
    }

    var checked = asArray(readJSON('checkedGear', []));
    var custom = asArray(readJSON('customGear', []));
    doc.gearItems = DEFAULT_GEAR.map(function (name, i) {
      return makeGearItem({ name: name, category: 'Essentials', defaultItem: true, packed: checked.indexOf('default_' + i) >= 0 }, i);
    }).concat(custom.map(function (name, i) {
      return makeGearItem({ name: name, category: 'Custom', defaultItem: false, packed: checked.indexOf('custom_' + i) >= 0 }, DEFAULT_GEAR.length + i);
    })).filter(Boolean);
    doc.gearKits = [makeGearKit({ name: 'Pack Checklist', itemIds: doc.gearItems.map(function (item) { return item.id; }) }, 0)];

    var terrain = str(readJSON('condTerrain', ''));
    var access = str(readJSON('condAccess', ''));
    if (terrain) doc.fieldNotes.push(makeFieldNote({ type: 'terrain', title: 'Terrain', body: terrain }, 0, trailLookup));
    if (access) doc.fieldNotes.push(makeFieldNote({ type: 'access', title: 'Access', body: access }, 1, trailLookup));

    ['photo0', 'photo1', 'photo2'].forEach(function (slotKey, i) {
      doc.photoRecords.push(makePhotoRecord({ slotKey: slotKey, storage: 'indexedDB' }, i, trailLookup));
    });

    return validateDoc(doc);
  }

  function syncLegacy(doc) {
    var activeTrails = doc.trails.filter(function (trail) { return !trail.deletedAt; });
    var activeLogs = doc.hikeLogs.filter(function (log) { return !log.deletedAt; });
    var ok = writeJSON('tk-trails', activeTrails);
    ok = writeJSON('hikeLog', activeLogs.map(function (log) {
      var trail = activeTrails.find(function (t) { return t.id === log.trailId; });
      return {
        trail: trail ? trail.name : log.trailNameSnapshot || '',
        trailId: log.trailId,
        date: log.date,
        miles: log.miles == null ? '' : String(log.miles),
        elevation: log.elevationFeet == null ? '' : String(log.elevationFeet),
        note: log.note,
        rating: log.rating
      };
    })) && ok;
    var customItems = doc.gearItems.filter(function (item) { return !item.deletedAt && !item.defaultItem; });
    var checked = [];
    doc.gearItems.filter(function (item) { return !item.deletedAt; }).forEach(function (item, index) {
      if (!item.packed) return;
      checked.push(item.defaultItem ? 'default_' + index : 'custom_' + customItems.findIndex(function (custom) { return custom.id === item.id; }));
    });
    ok = writeJSON('customGear', customItems.map(function (item) { return item.name; })) && ok;
    ok = writeJSON('checkedGear', checked.filter(function (key) { return key.indexOf('_-1') < 0; })) && ok;
    return ok;
  }

  function load() {
    var raw = readJSON(KEY, null);
    var doc = raw && raw.schemaVersion ? validateDoc(raw) : migrateLegacy();
    save(doc);
    return clone(doc);
  }

  function save(doc) {
    var valid = validateDoc(doc);
    var ok = writeJSON(KEY, valid);
    ok = syncLegacy(valid) && ok;
    if (ok && window.TK && window.TK.runtimeState) window.TK.runtimeState.storageError = '';
    window.dispatchEvent(new Event('trailkeeper:saved'));
    return clone(valid);
  }

  function exportData(doc) {
    var valid = validateDoc(doc || load());
    valid.exportedAt = nowISO();
    return clone(valid);
  }

  function importData(raw) {
    var candidate = Array.isArray(raw) ? { trails: raw } : raw;
    if (!candidate || typeof candidate !== 'object') throw new Error('Backup must be a Trailkeeper JSON object.');
    var imported = validateDoc(candidate);
    if (!imported.trails.length && !imported.hikeLogs.length) throw new Error('Backup did not contain Trailkeeper records.');
    return save(imported);
  }

  function active(collection) {
    return asArray(collection).filter(function (record) { return record && !record.deletedAt; });
  }

  function touch(record) {
    record.updatedAt = nowISO();
    return record;
  }

  function createTrail(attrs) {
    return makeTrail(Object.assign({ id: makeId('trail'), createdAt: nowISO(), updatedAt: nowISO() }, attrs || {}), 0);
  }

  function upsertTrailByName(doc, name, attrs) {
    var cleanName = str(name);
    if (!cleanName) return null;
    var trails = asArray(doc.trails);
    var found = trails.find(function (trail) {
      return !trail.deletedAt && trail.name.toLowerCase() === cleanName.toLowerCase();
    });
    if (found) {
      Object.assign(found, attrs || {});
      found.name = found.name || cleanName;
      return touch(found);
    }
    var trail = createTrail(Object.assign({ name: cleanName }, attrs || {}));
    trails.push(trail);
    doc.trails = trails;
    return trail;
  }

  function createHikeLog(attrs) {
    return makeHikeLog(Object.assign({ id: makeId('log'), createdAt: nowISO(), updatedAt: nowISO() }, attrs || {}), 0, {});
  }

  function softDelete(record) {
    if (!record) return null;
    record.deletedAt = nowISO();
    return touch(record);
  }

  window.TK.storage = {
    key: KEY,
    schemaVersion: SCHEMA_VERSION,
    makeId: makeId,
    load: load,
    save: save,
    exportData: exportData,
    importData: importData,
    validate: validateDoc,
    active: active,
    touch: touch,
    softDelete: softDelete,
    createTrail: createTrail,
    upsertTrailByName: upsertTrailByName,
    createHikeLog: createHikeLog
  };
})();
