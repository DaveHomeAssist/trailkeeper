# Trailkeeper -- Feature Analysis

**Date:** 2026-03-25
**Scope:** All source files in trailkeeper (index.html, js/*.js, shared.css, sw.js, manifest.json)

---

## Summary Table

| Feature | Status | Data Source / Persistence | Critical Gap |
|---|---|---|---|
| Today's Plan (trail, time, weather, pack list) | Complete | localStorage (contenteditable fields) | None |
| Trail shortlist management | Complete | localStorage (tk-trails) | No data import/restore (issue #004) |
| Hike logging (modal form) | Complete | localStorage (via app.js store) | None |
| Trail log system (post-hike journal) | Complete | localStorage (tk-logs) | Quota exceeded fails silently (issue #005) |
| Trail enrichment via Overpass API | Complete | localStorage (enrichment attached to trail objects) | Timeout returns null with no error context (issue #002) |
| Trail discovery (nearby trails) | Complete | Overpass API radius query from weather coordinates | None |
| Weather forecast | Complete | Open-Meteo API via geocoding | Conflates network error with location not found (issue #007) |
| Trail export (copy plan / download backup) | Complete | Clipboard API + JSON blob download | Export only; no import (issue #004) |
| Photo gallery | Complete | IndexedDB (primary) + localStorage (fallback) | None |
| Gear checklist | Complete | localStorage | None |
| Saved links / resources | Complete | localStorage | None |
| Field notes (trip notes textarea) | Complete | localStorage | None |
| Adaptive section states | Complete | Computed from runtime state | None |
| PWA / Service worker | Complete | sw.js with cache-first app shell | Cache version hardcoded tk-v4 (issue #006) |
| Keyboard shortcuts | Complete | / (Trails), L (Log), G (Gear) | None |
| Toast notifications with undo | Complete | DOM injection + timeout | None |
| Autosave with timestamp display | Complete | Event-driven (trailkeeper:saved) | None |
| Storage key migration | Complete | Migrates "trails" to "tk-trails" | None |
| OSM map thumbnails | Complete | staticmap.openstreetmap.de | None |
| Trail advisories (OSM tags) | Complete | Parsed from Overpass response tags | None |
| Two-click confirm pattern | Complete | Armed/confirm UX for destructive actions | No undo on trail status toggle (issue #003) |
| Section navigation | Complete | Scroll-spy active section highlighting | None |
| Print support | Complete | window.print() for today's plan | None |
| Dark/light mode | Complete | prefers-color-scheme in shared.css | No manual toggle |
| Responsive design | Complete | CSS media queries | None |
| Accessibility | Good | aria-labels, role attributes, skip-link, focus-visible | None |

---

## Detailed Feature Analysis

### 1. Modular Architecture (TK Namespace)

**Problem solved:** Organize a vanilla JS app with no build step into independently maintainable modules that can be developed and tested in isolation.

**Implementation:** All modules attach to `window.TK` namespace. The module loading order is: `trailStore.js` (data layer), `trailAdapter.js` (API layer), `trailEnrichmentUI.js` (UI rendering), `trailHydration.js` (orchestration), `trailLog.js` (post-hike journal), `trailDiscovery.js` (nearby trails), `trailExport.js` (export), `photoStore.js` (IndexedDB photos), `app.js` (core application). Each module is an IIFE that exposes a public API.

**Files:** `js/app.js` (core), `js/trailStore.js`, `js/trailAdapter.js`, `js/trailEnrichmentUI.js`, `js/trailHydration.js`, `js/trailLog.js`, `js/trailDiscovery.js`, `js/trailExport.js`, `js/photoStore.js`.

**Tradeoffs:** The namespace pattern works without a bundler and supports script-tag loading order, but lacks the isolation guarantees of ES modules. Some modules rely on globals (`trails`, `store`, `renderTrails`, `toast`) rather than explicit imports. The monkey-patching pattern for `renderTrails` (used by trailHydration and trailLog to inject post-render hooks) is fragile if loading order changes.

### 2. Trail Enrichment Pipeline

**Problem solved:** Automatically fetch trail metadata (distance, elevation, surface, difficulty, advisories, coordinates) from OpenStreetMap to supplement user-entered trail names with real data.

**Implementation:** Four-layer architecture:
- **trailAdapter.js** (Agent 1): Pure fetch + normalize. Queries Overpass API for hiking relations/ways matching the trail name. Computes distance via Haversine on way nodes, extracts elevation from ele tags, maps SAC scale to difficulty, parses condition advisories from access/seasonal/surface/visibility tags, and computes center coordinates.
- **trailStore.js** (Agent 2): Snapshot storage. Attaches enrichment data to trail objects in localStorage with source, timestamp, stale flag, and normalized fields.
- **trailEnrichmentUI.js** (Agent 3): Renders enrichment metadata rows, loading states, enrich/refresh/clear buttons, advisory lines, and OSM map thumbnails. No data logic.
- **trailHydration.js** (Agent 4): Orchestrates the pipeline. Hooks into renderTrails() to apply enrichment UI on each render cycle. Handles enrich, refresh, and clear flows with proper error handling and undo support.

**Tradeoffs:** The four-layer separation is clean and each layer can be tested independently. However, the Overpass API is rate-limited and unreliable -- timeouts return null with no distinction from network errors or empty results (issue #002). The enrichment is trail-name-based fuzzy matching, so common trail names may return incorrect results.

### 3. Trail Discovery (Nearby Trails)

**Problem solved:** Help users find hiking trails near their location by leveraging weather geocoding coordinates to query OpenStreetMap.

**Implementation:** `trailDiscovery.js` fires an Overpass query for hiking relations and named footways/paths within 25km of the weather-fetched coordinates. Results are deduplicated by name, sorted by distance, and displayed as a suggestion panel with "+ Add" buttons. Added trails are inserted into the shortlist with discovery metadata (source, lat, lon, distance_km).

**Files:** `js/trailDiscovery.js`

**Tradeoffs:** Discovery depends on weather being checked first (to get coordinates), which is an unintuitive prerequisite. The 25km radius and 5-result cap are hardcoded. The "Find nearby trails" button only appears after weather is fetched, via a MutationObserver on the weather result element.

### 4. Photo Storage (IndexedDB with localStorage Fallback)

**Problem solved:** Store trail photos in the browser without hitting localStorage's ~5MB quota limit.

**Implementation:** `photoStore.js` provides a unified API (`savePhoto`, `getPhoto`, `deletePhoto`, `getAllPhotos`) that uses IndexedDB as the primary store and falls back to localStorage if IDB is unavailable (private browsing, old browsers). A migration function moves legacy localStorage photo keys (photo0, photo1, photo2) into IDB on first boot.

**Files:** `js/photoStore.js`

**Tradeoffs:** IndexedDB provides much larger storage (~50MB+ depending on browser) but adds async complexity. The fallback to localStorage means photos work everywhere but may hit quota limits on older browsers. Photos are stored as base64 strings with a 4.5MB size guard (`isSafeDataImage` in app.js).

### 5. Service Worker and PWA Support

**Problem solved:** Enable offline access for field use where cell coverage is unreliable.

**Implementation:** `sw.js` implements a three-tier caching strategy:
- **Network-first** for APIs (Open-Meteo weather, Overpass trail data, static map tiles) -- fetches fresh data when online, falls back to cache when offline
- **Cache-first** for Google Fonts (long-lived, rarely change)
- **Cache-first** for app shell (HTML, CSS, JS, images) -- serves instantly from cache, falls back to network

The app shell list includes all 9 JS modules, both HTML pages, shared.css, and all icon assets. `manifest.json` enables home screen installation.

**Files:** `sw.js`, `manifest.json`

**Limitations:** Cache version is hardcoded as `tk-v4`. There is no auto-increment mechanism, so users may not see updates without a force-refresh unless the developer manually bumps the version string (issue #006). The service worker registration error handler is empty, so users are never informed if offline support fails to install (issue #001).

### 6. Adaptive Section States

**Problem solved:** Provide contextual guidance that adapts to what the user has and hasn't done, turning a static dashboard into a responsive workflow.

**Implementation:** `renderAdaptiveStates()` in app.js evaluates runtime state across all sections and renders contextual banners:
- **Today:** Weather status, trail selection, alert conditions
- **Trails:** Empty list, planned trails count, enrichment errors
- **Record:** No logs, logging in progress, today's hike logged
- **Gear:** Pack not started, in progress, complete
- **Gallery:** No photos, photo count

States are classified as empty, active, complete, or error, each with distinct visual treatment.

**Tradeoffs:** The adaptive state system adds significant value for new users (onboarding) and returning users (status at a glance). However, the logic is a long conditional chain that will grow harder to maintain as sections are added.

---

## Top 3 Priorities

1. **Add data import functionality (issue #004).** Export works (JSON backup download) but there is no way to restore a backup on a new device or after clearing browser data. Adding a file-drop or file-picker import to the Today section would close the backup/restore loop and is critical for a local-first app.

2. **Differentiate Overpass error types (issue #002).** The trail adapter returns null for timeouts, network errors, and empty results alike. Returning distinct error codes would allow the UI to show actionable messages ("No trails found" vs "Network unavailable" vs "Service overloaded, retry later").

3. **Auto-increment service worker cache version (issue #006).** The hardcoded `tk-v4` cache name means code updates are not automatically picked up. Using a content hash or build timestamp in the cache name would ensure users get fresh code on their next visit.
