const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const scope = 'https://example.test/trailkeeper/';

function worker() {
  const storage = new Map();
  const handlers = {};
  let failInstall = false;
  const caches = {
    keys: async () => [...storage.keys()],
    delete: async name => storage.delete(name),
    open: async name => {
      if (!storage.has(name)) storage.set(name, new Map());
      const items = storage.get(name);
      return {
        addAll: async files => {
          if (failInstall) throw Error('Offline');
          for (const file of files) items.set(new URL(file, scope).href, file);
        },
        keys: async () => [...items.keys()].map(url => ({url})),
        match: async url => items.get(String(url)),
        delete: async request => items.delete(request.url)
      };
    }
  };
  const self = {registration: {scope}, skipWaiting: async () => {}, clients: {claim: async () => {}, matchAll: async () => []},
    addEventListener: (name, action) => { handlers[name] = action; }};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), {self, caches, URL});
  function fire(type) {
    let lifetime;
    handlers[type]({waitUntil: promise => { lifetime = promise; }});
    return lifetime;
  }
  return {storage, fire, fail: value => { failInstall = value; }};
}

test('an incomplete shell keeps the previous install and a successful update preserves neighboring caches', async () => {
  const {storage, fire, fail} = worker();
  const neighbor = new Map([['https://example.test/another/index.html','Saved']]);
  const mixed = new Map([[scope + 'manifest.json','old'], ...neighbor]);
  storage.set('neighbor-v1', neighbor);
  storage.set('tk-2026-06-11', mixed);
  fail(true);
  await assert.rejects(fire('install'), /Offline/);
  assert.equal(mixed.get(scope + 'manifest.json'), 'old');
  fail(false);
  await fire('install');
  await fire('activate');
  assert.deepEqual(storage.get('neighbor-v1'), neighbor);
  assert.equal(mixed.has(scope + 'manifest.json'), false);
  assert.deepEqual(storage.get('tk-2026-06-11'), neighbor);
  const current = [...storage.values()].find(cache => cache.has(scope + 'index.html'));
  assert.ok(current.has(scope + 'js/storageAdapter.js'));
  assert.ok(current.has(scope + 'images/trailkeeper-header.webp'));
});

test('both entry pages expose the library and log controls used by the shared application', () => {
  for (const file of ['index.html','hiking-page.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const id of ['clearTrailDetail','trailLibrary','logTrailSelect','logTrailNew']) {
      assert.ok(html.includes('id="' + id + '"'), file + ' missing ' + id);
    }
    assert.match(html, /src="js\/storageAdapter\.js"/);
    assert.match(html, /href="#sec-library"/);
  }
});
