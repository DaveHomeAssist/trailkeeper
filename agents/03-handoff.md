# Agent 3 Handoff — UI Rendering + Styles

## Exposed API

```js
window.TK.trailEnrichmentUI = {
  renderEnrichmentRow(trailItemEl, trail, index, { onEnrich, onRefresh }),
  showLoading(trailItemEl),
  hideLoading(trailItemEl),
  showToast(msg, type)    // type: '', 'success', 'error'
};
```

## DOM Insertion Approach

**Enrichment row** (`.enrich-row`): Appended as last child of `.trail-item`. Uses `order: 10` in CSS + the existing `flex-wrap: wrap` on `.trail-item` to flow onto a second line below the trail name/tag/buttons.

**Enrich button** (`.enrich-trigger`): Inserted before `.trail-delete` (the ✕ button) so it sits in the button row between status and delete.

**On re-render**: `renderEnrichmentRow` removes any existing `.enrich-row` or `.enrich-trigger` before inserting fresh content. Safe to call repeatedly.

## Button Class Names

| Element | Class | Purpose |
|---------|-------|---------|
| Enrich button | `.enrich-trigger` | Magnifying glass (🔍), appears when no enrichment exists |
| Refresh button | `.enrich-refresh` | Refresh arrow (↻), appears inside enrichment row |
| Enrichment row | `.enrich-row` | Full-width second line with fields + source |
| Stale state | `.enrich-row.is-stale` | Dims fields, appends "· stale" to source |
| Loading state | `.enrich-loading` | Applied to `.trail-item`, reduces opacity |

## CSS Classes Added to shared.css

```
.enrich-row
.enrich-fields
.enrich-source
.enrich-row.is-stale
.enrich-refresh
.enrich-trigger
.enrich-loading
.toast.error
```

All use existing CSS variables (`--stone`, `--mist`, `--fern`, `--warn`, `--danger`). Dark mode inherits automatically via the existing `prefers-color-scheme: dark` variable overrides.

## Toast Behavior

- Uses existing `#toastContainer`
- Creates `.toast` divs matching existing pattern
- Types: default (dark), `.success` (moss green — existing), `.error` (danger red — new)
- Auto-removes after 3000ms
- No undo button (enrichment is non-destructive)

## Assumptions for Agent 4

- `renderEnrichmentRow` must be called after each `.trail-item` is created by `renderTrails()`
- Loading state should be set before fetch starts, cleared after fetch completes (whether success or failure)
- The `index` parameter must match the trail's position in the `trails` array for callback binding
- Trail items are fully re-rendered on each `renderTrails()` call, so enrichment UI must be re-applied each cycle
