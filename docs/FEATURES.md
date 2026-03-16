# Trailkeeper — Complete Feature Set

> **Version:** 1.0
> **Updated:** 2026-03-16
> **Architecture:** Static web app, vanilla JS, GitHub Pages, zero backend
> **Namespace:** `window.TK`
> **Live:** https://davehomeassist.github.io/trailkeeper/

---

## System Architecture

Trailkeeper is a single-page hiking day planner with two entry points (`index.html` and `hiking-page.html`) sharing the same CSS and JS modules. All state lives in `localStorage`. External data comes from Open-Meteo (weather) and Overpass/OSM (trail data). The app works fully offline as an installable PWA.

### Module Dependency Graph

```
index.html / hiking-page.html
  └── Inline script (trails CRUD, weather, render, store)
        │
        ├── trailAdapter.js      → Overpass API
        ├── trailStore.js        → localStorage (tk-trails)
        ├── trailEnrichmentUI.js → DOM rendering
        ├── trailHydration.js    → Orchestration + storage bridge
        ├── trailDiscovery.js    → Nearby trail search
        ├── trailLog.js          → Post-hike journal
        ├── trailExport.js       → Copy/download export
        └── sw.js                → Service worker (offline)
```

### Storage Keys

| Key | Owner | Purpose |
|-----|-------|---------|
| `trails` | Inline script | Primary trail array (name, category, status) |
| `tk-trails` | trailStore.js | Enrichment mirror (bridged from `trails`) |
| `tk-logs` | trailLog.js | Hike journal entries |

---

## Feature 1: Trail Shortlist

**Owner:** Inline script in HTML files
**Phase:** Original app

### What it does

Manual trail list with add/delete/status management. The user types a trail name, selects a category, and adds it to the shortlist. Each trail has a status that can be toggled.

### Trail object shape

```js
{
  name: "Mount Mansfield",
  category: "Half day",       // or "Nearby" for discovery-added trails
  status: "unvisited"         // unvisited | planned | done
}
```

### UI

- Text input + category dropdown + Add button
- Trail list with status toggle, delete button per item
- Renders via `renderTrails()` which rebuilds the full `#trailList` DOM

### Storage

- `localStorage` key: `trails`
- Read/write via global `store.get()` / `store.set()`

---

## Feature 2: Weather Check

**Owner:** Inline `fetchWeather()` in HTML files
**Phase:** Original app

### What it does

Enter a city or ZIP code, fetch current weather forecast via Open-Meteo. Displays high/low temp, precipitation probability, and wind speed.

### Integration hook

After successful geocoding, stores coordinates for trail discovery:

```js
window.TK.weatherContext = {
  zip: "Burlington",
  lat: 44.47,
  lon: -73.21,
  placeLabel: "Burlington"
};
```

### External APIs

- `https://geocoding-api.open-meteo.com/v1/search` — ZIP/city → lat/lon
- `https://api.open-meteo.com/v1/forecast` — lat/lon → weather data

---

## Feature 3: Trail Enrichment

**Owner:** `trailAdapter.js`, `trailStore.js`, `trailEnrichmentUI.js`, `trailHydration.js`
**Phase:** 0 (Agent system build)

### What it does

Fetches trail metadata from OpenStreetMap via Overpass API. Each named trail can be enriched with distance, elevation gain, surface type, difficulty rating, advisories, and a map thumbnail — all cached locally.

### Enrichment flow

1. User clicks enrich button (magnifying glass) on a named trail
2. `trailAdapter.enrichTrail(name)` queries Overpass for matching hiking routes and footways
3. Response is normalized into standard fields
4. `trailStore.attachEnrichment(index, fields, "overpass")` persists to localStorage
5. `trailEnrichmentUI.renderEnrichmentRow()` displays the data

### Enrichment fields

```js
{
  distance_km: number | null,
  elevation_gain_m: number | null,
  surface: string | null,
  difficulty: string | null,    // mapped from SAC scale
  osm_id: number,
  lat: number | null,           // center coordinates
  lon: number | null,
  advisories: [                 // from OSM tags
    { type: "seasonal", level: "warning", text: "Seasonal access — verify conditions" }
  ]
}
```

### Storage shape

```js
trail.enrichment = {
  source: "overpass",
  lastHydratedAt: 1710576000000,
  stale: false,
  fields: { /* enrichment fields above */ }
}
```

### Refresh flow

1. User clicks refresh button (↻)
2. Current enrichment marked stale → stale indicator renders
3. Loading state applied
4. Fresh data fetched from Overpass
5. On success: new data replaces old, stale cleared
6. On failure: cached data preserved, error toast shown

### Storage bridge

`trailHydration.js` bridges the inline script's `trails` key with `trailStore`'s `tk-trails` key. On init, data is migrated. After each store mutation, both keys and the in-memory `trails` array are synced.

### External API

- `https://overpass-api.de/api/interpreter` (POST, 8s timeout)

### CSS classes

`.enrich-row`, `.enrich-row.is-stale`, `.enrich-fields`, `.enrich-source`, `.enrich-refresh`, `.enrich-trigger`, `.enrich-loading`

---

## Feature 4: Trail Conditions Advisory

**Owner:** `trailAdapter.js` (extraction), `trailEnrichmentUI.js` (rendering)
**Phase:** 1

### What it does

After enrichment, checks OSM tags for safety-relevant conditions and displays a warning line on the enrichment row. No additional API call — uses tags already in the Overpass response.

### Tags checked

| Tag | Condition | Advisory |
|-----|-----------|----------|
| `access` | `private` or `no` | "Private access — verify permission" |
| `seasonal` | `yes` | "Seasonal access — verify conditions" |
| `winter_service` | `no` | "No winter maintenance" |
| `surface` | `mud` or `sand` | "Soft surface — check recent weather" |
| `trail_visibility` | `bad` or `horrible` | "Poor trail visibility" |
| `sac_scale` | `demanding_mountain_hiking`+ | "Demanding terrain" |

### Advisory shape

```js
advisories: [
  { type: "seasonal", level: "warning", text: "Seasonal access — verify conditions" }
]
```

### Rendering

Single amber line below enrichment fields, prefixed with ⚠. Multiple advisories joined with " · ". Nothing rendered if no advisories.

### CSS

`.enrich-advisory` — DM Mono 10.5px, `--warn` color, order 11

---

## Feature 5: Trail Map Thumbnail

**Owner:** `trailAdapter.js` (coordinates), `trailEnrichmentUI.js` (rendering)
**Phase:** 1

### What it does

Shows a small static map preview for each enriched trail. Clicking opens the full location on OpenStreetMap in a new tab.

### Coordinate sources (priority order)

1. `trail.enrichment.fields.lat/lon` — computed from Overpass node geometry
2. `trail.discovery.lat/lon` — from nearby trail discovery

### Map URL

```
https://staticmap.openstreetmap.de/staticmap.php
  ?center={lat},{lon}&zoom=13&size=200x120&markers={lat},{lon},red
```

### Click target

```
https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=14/{lat}/{lon}
```

### Behavior

- `loading="lazy"` to avoid blocking render
- `rel="noopener"` on external link
- No map shown if no coordinates available
- Graceful degradation for old cached data

### CSS

`.trail-map-link` (order 12, block), `.trail-map-thumb` (border, hover opacity transition)

---

## Feature 6: Nearby Trail Discovery

**Owner:** `trailDiscovery.js`
**Phase:** 1

### What it does

Uses the weather ZIP → lat/lon geocoding result to find up to 5 nearby named hiking trails via Overpass. Renders a collapsible suggestion panel with "+ Add" buttons. User-selective — no auto-add.

### Flow

1. User enters ZIP and checks weather → `TK.weatherContext` populated
2. "Find nearby trails" button appears
3. Click queries Overpass with `around:25000` radius
4. Results normalized, distance-sorted, limited to 5
5. Panel renders with name, distance in km, and "+ Add" button
6. Adding pushes to `trails` array with `category: 'Nearby'`, `status: 'planned'`

### Overpass query

Searches for `relation["route"="hiking"]["name"]` and `way["highway"~"path|track|footway"]["name"]` within 25km radius. Uses `out center tags` for lightweight response.

### Result shape

```js
{
  osm_id: 123456,
  osm_type: "relation",
  name: "Wissahickon Trail",
  lat: 40.01,
  lon: -75.19,
  distance_km: 6.2
}
```

### Added trail shape

```js
{
  name: "Wissahickon Trail",
  category: "Nearby",
  status: "planned",
  addedAt: 1710576000000,
  osm_id: 123456,
  osm_type: "relation",
  discovery: {
    source: "overpass",
    lat: 40.01,
    lon: -75.19,
    distance_km: 6.2
  }
}
```

### States

- Loading: "Searching nearby trails…"
- Empty: "No named trails found within 25 km."
- Error: "Could not reach trail data. Check your connection."
- Duplicate: Toast "Trail already in shortlist"

### CSS

`.trail-discovery`, `.trail-discovery-trigger`, `.trail-discovery-panel`, `.trail-discovery-header`, `.trail-discovery-list`, `.nearby-trail-row`, `.nearby-trail-meta`, `.nearby-trail-name`, `.nearby-trail-distance`, `.nearby-trail-add`, `.trail-discovery-empty`, `.trail-discovery-error`, `.trail-discovery-loading`

---

## Feature 7: Trip Log / Post-Hike Journal

**Owner:** `trailLog.js`
**Phase:** 2

### What it does

When a trail status is toggled to "completed," an inline log form appears for recording the hike: date, conditions, rating, and a note. Logs are stored separately from trail objects and persist independently.

### Log entry shape

```js
{
  id: "log-1710576000000",
  trailName: "Wissahickon Loop",
  hikedAt: "2026-03-16",
  conditions: "sunny",        // sunny | cloudy | rainy | muddy | snowy
  rating: 4,                  // 1-5
  note: "Muddy in shaded areas"
}
```

### UI components

**Log form** — triggered on status → "done":
- Date input (default today)
- 5 condition pills: ☀️ sunny, ☁️ cloudy, 🌧️ rainy, 💧 muddy, ❄️ snowy
- 5-star rating buttons
- Note textarea
- Save / Cancel buttons
- Optional — user can dismiss without saving

**Log summary** — for completed trails with logs:
- Compact one-liner: "Mar 16 · ☀️ sunny · ★★★★☆ · Muddy in shaded areas"
- Click to expand for editing
- "(3 logs)" count if multiple

**Log prompt** — for completed trails without logs:
- Subtle "Log this hike" link

### Storage

- `localStorage` key: `tk-logs`
- Separate from trail objects
- Matched by `trailName` (case-insensitive)
- Multiple logs per trail allowed
- Deleting a trail does NOT delete its logs

### Render integration

Hooks into `renderTrails()` via the same wrapping pattern as enrichment. Render chain: `renderTrails()` → `_applyEnrichmentUI()` → `applyLogUI()`. Log UI uses CSS `order: 21` (after enrichment at order 10).

### CSS

`.trail-log-form`, `.trail-log-field`, `.trail-log-label`, `.trail-log-date`, `.trail-log-conditions`, `.trail-log-condition`, `.trail-log-condition.active`, `.trail-log-rating`, `.trail-log-star`, `.trail-log-star.filled`, `.trail-log-note`, `.trail-log-actions`, `.trail-log-summary`, `.trail-log-count`, `.trail-log-prompt`

---

## Feature 8: Export / Share Trip Plan

**Owner:** `trailExport.js`
**Phase:** 2

### What it does

Two export modes from buttons in the Today's Plan section.

### Mode 1: Copy plan as text

Reads current plan state from the live DOM and formats as plain text for SMS/iMessage:

```
Hiking Plan — Mar 16, 2026

Weather: Burlington, VT — High 62°F, 10% rain, Wind 8 mph

Trails:
1. Mount Mansfield — 12.4 km, moderate, 820m gain
   ⚠ Seasonal access — verify conditions
2. Wissahickon Loop — 5.4 km, easy

Pack: water · snacks · layers · headlamp · first aid

Notes:
Watch for mud on north-facing slopes.
```

**Data sources:**
- Weather: `#weatherResult` text content
- Trails: global `trails` array with enrichment fields + advisories
- Pack list: `#sec-today .field-text` DOM element
- Trip notes: `#tripNotes` textarea
- Sections with no data are omitted

Uses `navigator.clipboard.writeText()` with error fallback.

### Mode 2: Download backup as JSON

Serializes the full `trails` array (with enrichment + discovery metadata) as a downloadable file.

Filename: `trailkeeper-backup-YYYY-MM-DD.json`

Uses `Blob` + `URL.createObjectURL()` for download.

### CSS

`.trail-export`, `.trail-export-btn`, `.trail-export-secondary`

---

## Feature 9: Offline PWA

**Owner:** `sw.js`, `manifest.json`
**Phase:** 3

### What it does

Makes Trailkeeper installable as a standalone app and fully functional offline. Check weather and enrich trails at home on WiFi, use the app on the trail with no signal.

### Service worker (77 lines)

**Cache name:** `tk-v1`

**App shell (pre-cached on install):**
- Both HTML pages
- `shared.css`
- All 7 JS modules
- Images/icons

**Fetch strategies:**

| Resource | Strategy |
|----------|----------|
| App shell (HTML, CSS, JS, images) | Cache-first |
| Google Fonts (googleapis, gstatic) | Cache-first after first load |
| Open-Meteo (weather, geocoding) | Network-first, cache fallback |
| Overpass API (enrichment, discovery) | Network-first, cache fallback |
| Static map tiles (openstreetmap.de) | Network-first, cache fallback |

### Manifest

```json
{
  "name": "Trailkeeper",
  "short_name": "Trailkeeper",
  "display": "standalone",
  "theme_color": "#0a0e0c",
  "background_color": "#0a0e0c",
  "start_url": ".",
  "icons": [{ "src": "images/tk.png", "sizes": "192x192" }]
}
```

### HTML additions

- `<link rel="manifest" href="manifest.json">`
- `<meta name="theme-color" content="#0a0e0c">`
- Apple PWA meta tags (`apple-mobile-web-app-capable`, etc.)
- SW registration: `navigator.serviceWorker.register('sw.js')`

### Cache versioning

Bump `CACHE_NAME` from `tk-v1` to `tk-v2` on deploy. Activate event cleans old caches.

---

## API Summary

| Module | Namespace | Key Methods |
|--------|-----------|-------------|
| trailAdapter | `TK.trailAdapter` | `enrichTrail(name, opts)` |
| trailStore | `TK.trailStore` | `getTrails`, `saveTrails`, `attachEnrichment`, `markStale`, `clearEnrichment`, `hasEnrichment`, `isStale` |
| trailEnrichmentUI | `TK.trailEnrichmentUI` | `renderEnrichmentRow`, `showLoading`, `hideLoading`, `showToast` |
| trailHydration | `TK.trailHydration` | `initEnrichment` |
| trailDiscovery | `TK.trailDiscovery` | `initDiscovery`, `loadNearbyTrails`, `renderNearbyTrails`, `addNearbyTrail` |
| trailLog | `TK.trailLog` | `initLog`, `getLogs`, `getLogsForTrail`, `saveLog`, `renderLogForm`, `renderLogSummary` |
| trailExport | `TK.trailExport` | `initExport`, `copyPlanToClipboard`, `downloadBackup` |

---

## External Dependencies

| Service | Usage | API Key |
|---------|-------|---------|
| Open-Meteo Geocoding | ZIP/city → lat/lon | None |
| Open-Meteo Forecast | Weather data | None |
| Overpass API | Trail enrichment + discovery | None |
| OSM Static Map | Map thumbnails | None |
| Google Fonts | DM Sans, DM Mono | None |

All external services are free and keyless. All failures degrade gracefully.

---

## File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `index.html` | Primary page (Today's Plan) | ~980 |
| `hiking-page.html` | Secondary page (Hiking focus) | ~980 |
| `shared.css` | All styles | ~600 |
| `js/trailAdapter.js` | Overpass enrichment adapter | ~130 |
| `js/trailStore.js` | Enrichment localStorage layer | ~100 |
| `js/trailEnrichmentUI.js` | Enrichment row rendering | ~150 |
| `js/trailHydration.js` | Orchestration + storage bridge | ~200 |
| `js/trailDiscovery.js` | Nearby trail search + panel | ~230 |
| `js/trailLog.js` | Post-hike journal | ~250 |
| `js/trailExport.js` | Copy/download export | ~120 |
| `sw.js` | Service worker | 77 |
| `manifest.json` | PWA manifest | 20 |
