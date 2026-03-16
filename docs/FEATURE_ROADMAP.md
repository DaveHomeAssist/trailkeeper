# Trailkeeper — Feature Roadmap

> **Status:** Proposed — not started
> **Updated:** 2026-03-16
> **Architecture:** Static web app, vanilla JS, GitHub Pages, zero backend
> **Namespace:** `window.TK`

---

## Strategic Direction

Planning → Memory → Offline Tool

Trailkeeper already has trail enrichment (Overpass), nearby discovery (ZIP → 5 closest trails), weather, and a pack checklist. The next layer exposes existing data in new ways before building new engines.

---

## Recommended Build Order

| Order | Feature | Effort | Impact | Rationale |
|-------|---------|--------|--------|-----------|
| 1 | Trail Conditions Advisory | Low | High | Cheapest safety win — uses tags already fetched |
| 2 | Trail Map Thumbnail | Low | High | Spatial comprehension from existing coordinates |
| 3 | Trip Log / Post-Hike Journal | Medium | High | Introduces persistent history |
| 4 | Export / Share Trip Plan | Low | Medium | Leverages all stored data |
| 5 | Offline PWA Install | Medium | High | Polish once UI stabilizes |

---

## Feature 1: Trail Conditions Advisory

**Difficulty:** Low | **Impact:** High | **Priority:** 1

### Description

After enrichment, check OSM seasonal and access tags and show a one-line advisory on the enrichment row. Saves the hiker from showing up to a trail that's seasonally closed, gated, or impassable.

### Technical Impact

- Extended tag parsing in `trailAdapter.js` (already fetches `out tags`)
- New field in enrichment: `advisories: []`
- New conditional UI line in `.enrich-row`
- CSS for `.enrich-advisory`
- No additional API call — uses tags already fetched

### Tags to Check

| Tag | Condition | Advisory |
|-----|-----------|----------|
| `access` | `private` or `no` | "Private access — verify permission" |
| `seasonal` | `yes` | "Seasonal access — verify conditions" |
| `winter_service` | `no` | "No winter maintenance" |
| `surface` | `mud` or `sand` | "Soft surface — check recent weather" |
| `trail_visibility` | `bad` or `horrible` | "Poor trail visibility" |
| `sac_scale` | `demanding_mountain_hiking`+ | "Demanding terrain" |

### Advisory Shape

```js
advisories: [
  { type: "seasonal", level: "warning", text: "Seasonal access — verify conditions" },
  { type: "mud", level: "info", text: "Soft surface — check recent weather" }
]
```

### Rendering

Single line below enrichment fields in `--warn` color. Multiple advisories joined with " · ". Only appears when advisories are non-empty.

---

## Feature 2: Trail Map Thumbnail

**Difficulty:** Low | **Impact:** High | **Priority:** 2

### Description

Show a small static map preview for each enriched trail using its stored coordinates. Tap to open the full location on OpenStreetMap.

### Technical Impact

- New UI element per `.trail-item` (image tag)
- Static map fetch — no API key needed
- CSS for `.trail-map-thumb`
- Uses existing `enrichment.fields.osm_id` and `discovery.lat/lon`
- No new storage

### Implementation

Use OpenStreetMap static map service:

```
https://staticmap.openstreetmap.de/staticmap.php
  ?center={lat},{lon}
  &zoom=13
  &size=200x120
  &markers={lat},{lon},red
```

External link opens:

```
https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=14/{lat}/{lon}
```

Lazy-load with `loading="lazy"`. Only show for enriched trails with coordinates.

---

## Feature 3: Trip Log / Post-Hike Journal

**Difficulty:** Medium | **Impact:** High | **Priority:** 3

### Description

After marking a trail "completed," prompt the user to log: date hiked, conditions, personal rating, and a short note. Builds a personal trail journal over a season.

### Technical Impact

- New module `js/trailLog.js` on `window.TK.trailLog`
- Separate storage collection (not embedded in trail object)
- Inline form triggered by status change to "completed"
- CSS for `.trail-log-entry`, `.trail-log-form`

### Storage Shape

Separate from trails to keep trail objects immutable:

```js
// localStorage key: "tk-logs"
[
  {
    trailName: "Wissahickon Loop",
    hikedAt: "2026-03-16",
    conditions: "sunny",       // sunny | cloudy | rainy | muddy | snowy
    rating: 4,                 // 1-5
    note: "Muddy in shaded areas"
  }
]
```

### UX

- Trigger: status toggle to "completed" opens inline log form (not forced, skippable)
- Conditions: pill-select, not free text
- Rating: 5 filled/empty circles
- Note: auto-saves on blur
- Completed trails show log summary below enrichment row

---

## Feature 4: Export / Share Trip Plan

**Difficulty:** Low | **Impact:** Medium | **Priority:** 4

### Description

One-click export of today's plan as a copyable text block or downloadable JSON backup.

### Technical Impact

- New module `js/trailExport.js` on `window.TK.trailExport`
- Clipboard API for text share
- Blob download for JSON backup
- New button in Today's Plan section
- No new storage

### Two Modes

**Copy plan** — formats as plain text for SMS/iMessage:

```
Hiking Plan — Mar 16, 2026
Weather: Burlington, VT — High 62°F, 10% rain

Trails:
1. Mount Mansfield — 12.4 km, moderate
2. Wissahickon Loop — 5.4 km, easy

Pack: water · snacks · layers · headlamp · first aid
```

**Download backup** — full JSON blob of `trails` array with enrichment and discovery metadata. No import in v1.

---

## Feature 5: Offline PWA Install

**Difficulty:** Medium | **Impact:** High | **Priority:** 5

### Description

Service worker and web manifest so Trailkeeper is installable and works fully offline.

### Technical Impact

- New `sw.js` — cache-first for app shell, stale-while-revalidate for API calls
- New `manifest.json` with theme color and icons
- Cache versioning for CSS/JS updates
- No changes to existing modules

### Cache Strategy

| Resource | Strategy |
|----------|----------|
| HTML, CSS, JS | Cache-first, version-busted |
| Open-Meteo (weather) | Stale-while-revalidate |
| Overpass (enrichment) | Stale-while-revalidate |
| localStorage | Already persists |

### Implementation Notes

Hand-written service worker under 80 lines. No Workbox. Register once. Version-based cache bust on deploy. Install prompt handling is optional — Chrome auto-shows the install banner if manifest is valid.

### Why Last

Service workers introduce cache invalidation complexity. Easier to add after the UI surface stabilizes from features 1-4.

---

## Prioritization Summary

| Feature | User Value | Effort | ROI | Priority |
|---------|-----------|--------|-----|----------|
| Trail Conditions Advisory | High | Low | **9** | 1 |
| Trail Map Thumbnail | High | Low | **9** | 2 |
| Trip Log / Journal | High | Medium | **6** | 3 |
| Export / Share Plan | Medium | Low | **7** | 4 |
| Offline PWA | High | Medium | **7** | 5 |

---

## Rules

- No backend
- No breaking existing trail CRUD
- All failures degrade gracefully
- Local trail data is authoritative
- External data is advisory
- Preserve `window.TK` namespace pattern
- Keep feature additive
