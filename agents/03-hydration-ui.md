# Agent Module 3: Hydration UI + Rendering

## Role

Implement the DOM rendering for enrichment data on trail items, plus the enrich/refresh button controls. This module reads enrichment state and renders it — it does NOT handle fetching or storage.

## Context

- Read `docs/ENRICHMENT-SPEC.md` for full architecture context
- Trail items are rendered as `.trail-item` elements in both `index.html` and `hiking-page.html`
- Styles must use classes defined in `shared.css` or new classes added to `shared.css`
- The existing toast system (`.toast-container`) is used for notifications

## Deliverables

1. Create `js/trailEnrichmentUI.js`
2. Add new CSS classes to `shared.css`

## Interface Contract

```js
/**
 * Render enrichment data row inside a trail item element.
 * If the trail has no enrichment, renders nothing.
 * If enrichment exists, renders the metadata row + source info.
 *
 * @param {HTMLElement} trailItemEl - The .trail-item DOM element
 * @param {object} trail - Trail object (may include enrichment property)
 * @param {number} index - Trail index (for button callbacks)
 * @param {object} callbacks
 * @param {function} callbacks.onEnrich - Called with (index) when user clicks enrich
 * @param {function} callbacks.onRefresh - Called with (index) when user clicks refresh
 */
export function renderEnrichmentRow(trailItemEl, trail, index, callbacks) {}

/**
 * Show a loading indicator on a specific trail item.
 * @param {HTMLElement} trailItemEl
 */
export function showLoading(trailItemEl) {}

/**
 * Remove the loading indicator from a trail item.
 * @param {HTMLElement} trailItemEl
 */
export function hideLoading(trailItemEl) {}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {string} [type="info"] - "info" | "success" | "error"
 */
export function showToast(message, type) {}
```

## Implementation Requirements

### 1. Enrichment Row Rendering

When a trail has enrichment data, render a secondary row below the trail name/tag:

```html
<div class="trail-enrichment">
  <span class="trail-enrichment-fields">
    8.4 km  ·  823 m gain  ·  Dirt  ·  Moderate
  </span>
  <button class="trail-enrichment-refresh" aria-label="Refresh trail data">
    <!-- refresh icon SVG -->
  </button>
</div>
<div class="trail-enrichment-meta">
  via Overpass · cached Mar 15
</div>
```

**Field rendering rules:**
- Only render fields that are non-null
- Join with ` · ` separator
- `distance_km` → format as `"X.X km"`
- `elevation_gain_m` → format as `"X m gain"`
- `surface` → capitalize first letter
- `difficulty` → display as-is (already human-readable from adapter)
- If no fields are non-null, don't render the row at all

### 2. Enrich Button (for trails without enrichment)

When a trail has a name but no enrichment, render a small enrich button:

```html
<button class="trail-enrichment-btn" aria-label="Fetch trail info">
  <!-- search/download icon SVG -->
</button>
```

- Only show for trails where `trail.name` is a non-empty string
- Position: after the trail delete button, same row
- Click calls `callbacks.onEnrich(index)`

### 3. Refresh Button (for trails with enrichment)

When a trail has enrichment, show refresh icon instead of enrich button:
- Click calls `callbacks.onRefresh(index)`
- If enrichment is stale, add `.is-stale` class for visual indicator

### 4. Loading State

- `showLoading()`: Add a `.trail-enrichment-loading` class to the trail item, which shows a subtle spinner or pulse
- `hideLoading()`: Remove that class

### 5. Toast Integration

Use the existing `.toast-container` element:
- Create toast element, append to container
- Auto-remove after 3 seconds
- Match existing toast styling (`.toast` class in `shared.css`)

## CSS Classes (add to shared.css)

```css
/* ── ENRICHMENT ── */
.trail-enrichment {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 6px;
}
.trail-enrichment-fields {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: var(--stone);
  letter-spacing: 0.02em;
}
.trail-enrichment-meta {
  width: 100%;
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  color: var(--mist);
  padding: 0 6px;
  letter-spacing: 0.02em;
}
.trail-enrichment-btn,
.trail-enrichment-refresh {
  background: none;
  border: 1px solid var(--mist);
  border-radius: 4px;
  color: var(--stone);
  cursor: pointer;
  padding: 4px;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.trail-enrichment-btn:hover,
.trail-enrichment-refresh:hover {
  border-color: var(--fern);
  color: var(--fern);
}
.trail-enrichment-refresh.is-stale {
  border-color: var(--amber);
  color: var(--amber);
}
.trail-enrichment-btn:focus-visible,
.trail-enrichment-refresh:focus-visible {
  outline: 2px solid var(--fern);
  outline-offset: 2px;
}
.trail-enrichment-loading {
  opacity: 0.6;
  pointer-events: none;
}
```

## Validation

- Trail with enrichment: renders field row + meta row + refresh button
- Trail without enrichment but with name: renders enrich button only
- Trail without name: no enrich button rendered
- Only non-null fields appear in the field row
- Loading state visually dims the trail item
- Toast appears and auto-dismisses
- All buttons keyboard accessible (focusable, operable with Enter/Space)

## Files

- Create: `js/trailEnrichmentUI.js`
- Modify: `shared.css` (add enrichment CSS classes)
- Read (reference): `docs/ENRICHMENT-SPEC.md`
- Read (pattern reference): `index.html` — look at existing trail item DOM structure and toast rendering
