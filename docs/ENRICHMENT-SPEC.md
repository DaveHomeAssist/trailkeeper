# Trailkeeper Trail Enrichment Spec

## Architecture

Three operating modes, layered on top of each other:

```
Core mode        Local-only. Manual entry, localStorage persistence, offline after load.
                 This is the source of truth. Always works.

Hydrated mode    Optional live fetch from external trail APIs.
                 Annotates existing trail entries with supplemental metadata.
                 If fetch fails, trail renders normally from local data.

Snapshot mode    Default after a successful hydration.
                 Fetched metadata is cached in localStorage per trail.
                 Operates offline using cached data until user explicitly refreshes.
```

### Design Principles

- User data is authoritative. External data is advisory.
- Trail list renders from local data only. No hard dependency on external APIs.
- Network operations are non-blocking for core app usage.
- Follows the same pattern as the existing Open-Meteo weather fetch.
- No backend. Client-side only.

---

## Data Model

### Existing Trail Record (unchanged)

```js
{
  name: "Mount Mansfield",
  tag: "4K",           // difficulty tag
  status: "planned",   // unvisited | planned | done
  addedAt: 1710600000000
}
```

### Enrichment Metadata (new, stored alongside trail)

```js
{
  enrichment: {
    source: "overpass",           // API source identifier
    lastHydratedAt: 1710600000000,
    stale: false,                 // true if user requests refresh
    fields: {
      distance_km: 8.4,
      elevation_gain_m: 823,
      surface: "dirt",
      difficulty: "moderate",
      osm_id: 123456789
    }
  }
}
```

### localStorage Schema

Key: `tk-trails` (existing array of trail objects)

Each trail object gains an optional `enrichment` property. No separate storage key needed.

```js
// Before
{ name: "Mount Mansfield", tag: "4K", status: "planned" }

// After (enriched)
{ name: "Mount Mansfield", tag: "4K", status: "planned",
  enrichment: { source: "overpass", lastHydratedAt: 1710600000000,
    fields: { distance_km: 8.4, elevation_gain_m: 823, surface: "dirt" } } }

// After (enrichment failed or not requested)
{ name: "Mount Mansfield", tag: "4K", status: "planned" }
// No enrichment property = Core mode. Renders normally.
```

---

## External API

### v1: OpenStreetMap Overpass API

- Free, no auth required, client-side fetchable
- Endpoint: `https://overpass-api.de/api/interpreter`
- Query by trail name within a bounding box or geographic region
- Returns tagged way/relation data including `distance`, `sac_scale`, `surface`, `ele`

### Enriched Fields (v1 priority)

| Field | Source tag | Display |
|---|---|---|
| Distance | computed from way geometry | "8.4 km" |
| Elevation gain | `ele` tags on nodes | "823 m gain" |
| Surface type | `surface` tag | "Dirt" |
| Difficulty | `sac_scale` or `trail_visibility` | "Moderate" |

### Adapter Pattern

All API-specific logic lives in a single adapter module. The adapter:

1. Takes a trail name (and optional region hint)
2. Returns a normalized `fields` object or `null` on failure
3. Handles its own error catching and timeout
4. Is replaceable without touching core trail logic

```
trailAdapter.enrich("Mount Mansfield", { region: "vermont" })
  -> { distance_km: 8.4, elevation_gain_m: 823, surface: "dirt", difficulty: "moderate", osm_id: 123456789 }
  -> null  // on failure
```

---

## UI Behavior

### Trail Card (enriched)

```
Mount Mansfield                         [planned]  [Today]  [x]
  4K
  8.4 km  ·  823 m gain  ·  Dirt                    [refresh icon]
  ──────────────────────────
  via Overpass · cached Mar 15
```

- Enriched fields appear as a secondary row below the trail name/tag
- Styled as muted/advisory text (use `--stone` color, smaller font)
- Source + cache date shown in micro text
- Refresh icon triggers re-hydration for that trail
- If no enrichment: secondary row simply doesn't render. No empty state.

### Enrichment Trigger

- **Per-trail button**: small icon button on the trail item (magnifying glass or download icon)
- Only appears for trails that have a name (can't search for empty trails)
- Click triggers async fetch, shows brief loading indicator on that trail only
- Success: enrichment data appears, cached to localStorage
- Failure: toast notification "Could not fetch trail info", trail unchanged

### Refresh Behavior

- Trails with cached enrichment show a refresh icon instead of the enrich button
- Click marks enrichment as `stale: true`, triggers re-fetch
- Stale data still displays while refresh is in progress
- Success: updates cached data, clears stale flag
- Failure: keeps existing cached data, shows toast

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Offline on first load | Core mode. No enrichment UI attempts fetch. |
| API returns partial data | Render only available fields. Missing fields omitted. |
| API returns no results for trail name | Toast: "No trail data found for [name]". No enrichment stored. |
| Corrupt cache entry | `enrichment` property is deleted, trail reverts to Core mode. |
| Multiple trails with same name | Each trail has its own `enrichment` object. No shared cache. |
| User renames trail | Enrichment stays attached (it's per-object, not per-name). User can re-enrich. |
| User deletes trail | Enrichment is deleted with the trail object. |

---

## File Structure

```
trailkeeper/
  index.html              # Main page
  hiking-page.html        # Hiking page
  shared.css              # Unified styles
  js/
    trailAdapter.js       # External API adapter (Overpass)
    trailStore.js         # localStorage read/write + enrichment merge
    trailHydration.js     # Hydration orchestration (fetch, cache, refresh)
    trailEnrichmentUI.js  # DOM rendering for enrichment rows + controls
```

---

## Test Checklist (Manual)

- [ ] App loads and renders trails with network disabled
- [ ] Manual trail add/edit/delete works without enrichment
- [ ] Clicking enrich button fetches data and displays enriched fields
- [ ] Enriched data persists across page reload (localStorage)
- [ ] App loads enriched trails correctly when offline
- [ ] Failed fetch shows toast, trail unchanged
- [ ] Refresh button re-fetches and updates cached data
- [ ] Partial API response renders only available fields
- [ ] Styles consistent between index.html and hiking-page.html
- [ ] Enrich button does not appear for unnamed trails
- [ ] Keyboard accessible: enrich/refresh buttons focusable and operable
