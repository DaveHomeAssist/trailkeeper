# Agent Module 4: Integration + Wiring

## Role

Wire together the adapter, storage, and UI modules into the existing Trailkeeper pages. This is the orchestration layer that connects user actions to fetch/store/render operations.

## Context

- Read `docs/ENRICHMENT-SPEC.md` for full architecture context
- Modules 1-3 must be completed before this module
- Trailkeeper is a vanilla HTML/CSS/JS app with no build step
- Scripts are loaded via `<script>` tags in the HTML files
- Both `index.html` and `hiking-page.html` need the same wiring

## Deliverables

1. Create `js/trailHydration.js` — orchestration module
2. Modify `index.html` — add script tags and init call
3. Modify `hiking-page.html` — add script tags and init call

## Interface Contract

```js
/**
 * Initialize the trail enrichment system.
 * Wires up the adapter, storage, and UI modules.
 * Should be called once after DOM is ready.
 *
 * Hooks into the existing trail render cycle:
 * after trails are rendered to the DOM, calls renderEnrichmentRow
 * for each trail item.
 */
export function initEnrichment() {}

/**
 * Handle enrich request for a specific trail.
 * Called by UI when user clicks the enrich button.
 *
 * Flow:
 * 1. Show loading state on trail item
 * 2. Call trailAdapter.enrichTrail(trailName)
 * 3. On success: attachEnrichment(), re-render enrichment row, show toast
 * 4. On failure: show error toast, hide loading
 *
 * @param {number} index - Trail index
 */
async function handleEnrich(index) {}

/**
 * Handle refresh request for a specific trail.
 * Called by UI when user clicks the refresh button.
 *
 * Flow:
 * 1. Mark enrichment as stale (visual indicator)
 * 2. Show loading state
 * 3. Call trailAdapter.enrichTrail(trailName)
 * 4. On success: attachEnrichment() with fresh data, re-render, toast
 * 5. On failure: keep existing cached data, show error toast
 *
 * @param {number} index - Trail index
 */
async function handleRefresh(index) {}
```

## Implementation Requirements

### 1. Script Loading

Add to both `index.html` and `hiking-page.html`, before the closing `</body>` tag but after the existing `<script>` block:

```html
<script src="js/trailAdapter.js"></script>
<script src="js/trailStore.js"></script>
<script src="js/trailEnrichmentUI.js"></script>
<script src="js/trailHydration.js"></script>
```

**Important**: The existing app code is in an inline `<script>` tag. The enrichment modules must be compatible with this. Two approaches:

- **Option A (preferred)**: Use plain JS modules with global-scope functions (no `import`/`export` — those require `type="module"` which changes script loading behavior). Instead, attach functions to a global namespace like `window.TK = window.TK || {}`.
- **Option B**: Use `<script type="module">` tags. This works but requires refactoring existing inline script to also be a module. Only use this if the existing code already uses modules.

Check the existing `<script>` tag in `index.html` to determine which approach fits.

### 2. Hook Into Trail Render Cycle

The existing code renders trail items to the DOM via a `renderTrails()` or similar function. After that function runs, the enrichment system needs to:

1. Find all `.trail-item` elements
2. For each, call `renderEnrichmentRow(el, trail, index, { onEnrich, onRefresh })`

**Two wiring strategies:**

- **Patch**: Override/wrap the existing render function to add enrichment rendering after each render cycle
- **Observer**: Use a MutationObserver on the trail list container to detect when trail items are added/updated

Prefer patching if the render function is clearly identifiable. Use observer as fallback.

### 3. Orchestration Flow

```
User clicks Enrich button
  -> handleEnrich(index)
    -> showLoading(trailItemEl)
    -> result = await enrichTrail(trail.name)
    -> if result:
         attachEnrichment(index, result, "overpass")
         renderEnrichmentRow(trailItemEl, updatedTrail, index, callbacks)
         showToast("Trail info loaded", "success")
       else:
         showToast("Could not fetch trail info", "error")
    -> hideLoading(trailItemEl)

User clicks Refresh button
  -> handleRefresh(index)
    -> markStale(index)
    -> renderEnrichmentRow(trailItemEl, trail, index, callbacks)  // shows stale indicator
    -> showLoading(trailItemEl)
    -> result = await enrichTrail(trail.name)
    -> if result:
         attachEnrichment(index, result, "overpass")
         renderEnrichmentRow(trailItemEl, updatedTrail, index, callbacks)
         showToast("Trail info updated", "success")
       else:
         showToast("Refresh failed — using cached data", "error")
    -> hideLoading(trailItemEl)
```

### 4. Init Guard

- `initEnrichment()` should be idempotent (safe to call multiple times)
- Should not run if the trail list container doesn't exist in the DOM
- Should gracefully degrade if any module fails to load

### 5. No Breaking Changes

- Existing trail CRUD (add, edit, delete, status toggle) must continue working
- The enrichment system is additive only
- If enrichment JS fails to load, the app works exactly as before

## Validation

- Load page with network on: enrich button visible on named trails
- Click enrich: loading state appears, then enrichment row renders
- Reload page: enrichment data persists from cache
- Load page offline: cached enrichment data displays, enrich buttons still appear but fail gracefully on click
- Delete a trail: no orphaned enrichment data
- Add new trail: appears without enrichment, enrich button available
- Both `index.html` and `hiking-page.html` behave identically

## Files

- Create: `js/trailHydration.js`
- Modify: `index.html` (add script tags + init call)
- Modify: `hiking-page.html` (add script tags + init call)
- Read (dependencies): `js/trailAdapter.js`, `js/trailStore.js`, `js/trailEnrichmentUI.js`
- Read (reference): `docs/ENRICHMENT-SPEC.md`
