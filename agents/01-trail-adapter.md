# Agent Module 1: Trail Enrichment Adapter

## Role

Implement the external API adapter layer that fetches trail metadata from OpenStreetMap's Overpass API.

## Context

- Read `docs/ENRICHMENT-SPEC.md` for full architecture context
- This module is the ONLY file that contains external API logic
- All other modules depend on this adapter's normalized output format
- Pattern precedent: the existing `fetchWeather()` function in `index.html` uses Open-Meteo the same way

## Deliverable

Create `js/trailAdapter.js`

## Interface Contract

```js
/**
 * Fetch enrichment metadata for a trail by name.
 *
 * @param {string} trailName - User-entered trail name
 * @param {object} [options]
 * @param {string} [options.region] - Optional region hint (e.g. "vermont")
 * @param {number} [options.timeoutMs=8000] - Fetch timeout
 * @returns {Promise<object|null>} Normalized fields object, or null on failure
 */
export async function enrichTrail(trailName, options = {}) {}
```

### Return shape (success)

```js
{
  distance_km: 8.4,        // number or null
  elevation_gain_m: 823,   // number or null
  surface: "dirt",          // string or null
  difficulty: "moderate",   // string or null
  osm_id: 123456789        // number — used for dedup/identity
}
```

### Return shape (failure)

```js
null
```

## Implementation Requirements

1. **Build the Overpass QL query**
   - Search for `route=hiking` or `highway=path|footway|track` relations/ways
   - Filter by name matching `trailName` (case-insensitive, partial match)
   - Use `out body; >; out skel qt;` for geometry if computing distance
   - Keep the query bounded (e.g., add a geographic bounding box if region hint is provided, or use a reasonable worldwide search with `limit`)

2. **Normalize the response**
   - Extract `distance_km` from way geometry (sum of segment lengths) or from `distance` tag if present
   - Extract `surface` from the `surface` tag
   - Extract `difficulty` from `sac_scale` tag, mapped to human-readable labels:
     - `hiking` -> "Easy"
     - `mountain_hiking` -> "Moderate"
     - `demanding_mountain_hiking` -> "Difficult"
     - `alpine_hiking` -> "Alpine"
     - Others -> raw value
   - Extract `elevation_gain_m` from node `ele` tags if available (max - min as approximation)
   - Extract `osm_id` from the relation/way ID

3. **Error handling**
   - Wrap fetch in try/catch
   - Implement timeout via AbortController
   - Return `null` on any failure (network, parse, no results)
   - Do NOT throw — callers expect null on failure

4. **No side effects**
   - This module does NOT write to localStorage
   - This module does NOT touch the DOM
   - Pure fetch + normalize + return

## Validation

- `enrichTrail("Mount Mansfield")` returns a fields object with at least `osm_id`
- `enrichTrail("")` returns `null`
- `enrichTrail("xyznonexistent12345")` returns `null`
- Network disabled: returns `null` without throwing

## Files

- Create: `js/trailAdapter.js`
- Read (reference): `docs/ENRICHMENT-SPEC.md`
- Read (pattern reference): `index.html` — look at the existing `fetchWeather()` function for fetch pattern
