# Agent Module 2: Snapshot Storage Layer

## Role

Implement the localStorage read/write layer that manages trail enrichment data. This module handles merging enrichment into existing trail records, reading cached snapshots, and managing stale/refresh state.

## Context

- Read `docs/ENRICHMENT-SPEC.md` for full architecture context
- The existing trail storage uses a `store` object in `index.html` with `store.get(key, default)` and `store.set(key, value)` methods backed by `localStorage`
- Trail data lives under the key `tk-trails` as a JSON array
- This module wraps that existing pattern — it does NOT replace the core store

## Deliverable

Create `js/trailStore.js`

## Interface Contract

```js
/**
 * Get all trails from localStorage.
 * @returns {Array<object>} Array of trail objects (may include enrichment property)
 */
export function getTrails() {}

/**
 * Save all trails to localStorage.
 * @param {Array<object>} trails
 */
export function saveTrails(trails) {}

/**
 * Attach enrichment metadata to a specific trail by index.
 * Merges enrichment into the trail object and persists.
 *
 * @param {number} index - Trail index in the array
 * @param {object} fields - Normalized fields from trailAdapter.enrichTrail()
 * @param {string} source - API source identifier (e.g. "overpass")
 * @returns {object} The updated trail object
 */
export function attachEnrichment(index, fields, source) {}

/**
 * Mark a trail's enrichment as stale (pending refresh).
 * @param {number} index
 */
export function markStale(index) {}

/**
 * Remove enrichment from a trail (revert to Core mode).
 * @param {number} index
 */
export function clearEnrichment(index) {}

/**
 * Check if a trail has cached enrichment data.
 * @param {object} trail
 * @returns {boolean}
 */
export function hasEnrichment(trail) {}

/**
 * Check if a trail's enrichment is marked stale.
 * @param {object} trail
 * @returns {boolean}
 */
export function isStale(trail) {}
```

## Implementation Requirements

1. **Read/write trails**
   - `getTrails()`: Parse `localStorage.getItem('tk-trails')`, return `[]` on failure
   - `saveTrails(trails)`: `localStorage.setItem('tk-trails', JSON.stringify(trails))`
   - Handle corrupt JSON gracefully (return empty array, do not throw)

2. **Attach enrichment**
   - Read current trails, merge enrichment object at the given index:
     ```js
     trail.enrichment = {
       source: source,
       lastHydratedAt: Date.now(),
       stale: false,
       fields: { ...fields }
     }
     ```
   - Save back to localStorage
   - Return the updated trail object

3. **Mark stale**
   - Set `trail.enrichment.stale = true` without clearing cached fields
   - Save back to localStorage

4. **Clear enrichment**
   - Delete `trail.enrichment` property entirely
   - Save back to localStorage

5. **Validation helpers**
   - `hasEnrichment(trail)`: returns `true` if `trail.enrichment?.fields` is a non-empty object
   - `isStale(trail)`: returns `true` if `trail.enrichment?.stale === true`

6. **Defensive coding**
   - Never throw. Return safe defaults on any error.
   - Validate index bounds before writing.
   - If `trail.enrichment` is corrupt (not an object), treat as no enrichment.

## Compatibility

- This module must work alongside the existing `store.get('tk-trails')` / `store.set('tk-trails')` pattern in `index.html`
- Both read/write the same `tk-trails` key
- Existing trail properties (`name`, `tag`, `status`, `addedAt`) are never modified by this module

## Validation

- `attachEnrichment(0, { distance_km: 5.2 }, "overpass")` adds enrichment to first trail
- After attach, `hasEnrichment(trail)` returns `true`
- `markStale(0)` sets stale flag, `isStale(trail)` returns `true`
- `clearEnrichment(0)` removes enrichment, `hasEnrichment(trail)` returns `false`
- Corrupt localStorage value: `getTrails()` returns `[]`

## Files

- Create: `js/trailStore.js`
- Read (reference): `docs/ENRICHMENT-SPEC.md`
- Read (pattern reference): `index.html` — search for `store.get` and `store.set` to understand existing storage pattern
