# Agent 0 Handoff — Reconnaissance Results

## Critical Facts

| Item | Value |
|---|---|
| Render function | `renderTrails()` (line ~501 in both files) |
| Trail list container | `ul#trailList` (`.trail-list`) |
| Trail item selector | `li.trail-item` |
| Delete button selector | `.trail-delete` (5th/last child of `.trail-item`) |
| Toast function | `toast(msg, type)` — type can be `'success'` or empty |
| Toast container | `#toastContainer` (`.toast-container`) |
| Toast auto-dismiss | 2600ms |
| Storage key for trails | `'trails'` (NOT `tk-trails`) |
| Store object | `store.get(key, default)` / `store.set(key, value)` — inline, uses localStorage |
| Script style | Classic inline `<script>` — NO modules, NO `type="module"` |
| Namespace strategy | `window.TK = window.TK || {}` is correct |
| Both pages identical? | Yes — only diff is a TODO comment in hiking-page.html |

## Trail Object Shape (actual)

```js
{
  name: "Mount Mansfield",     // string
  category: "Full day",        // "Quick" | "Half day" | "Full day"
  status: "planned"            // "unvisited" | "planned" | "done"
}
```

**No `tag` field** — the spec called it `tag`, the actual field is `category`.
**No `addedAt` field** — does not exist in current code.

## Trail Item DOM Structure

```html
<li class="trail-item">
  <span class="trail-tag">${category}</span>
  <span class="trail-name">${name}</span>
  <button class="trail-set-today btn">→ Today</button>
  <button class="trail-status ${status}">${statusLabel}</button>
  <button class="trail-delete">✕</button>
</li>
```

Children in order: tag, name, set-today button, status button, delete button.

## Render Cycle

- `renderTrails()` clears `#trailList` innerHTML, rebuilds all items
- Called on: page load, add trail, delete trail, status change
- Trail mutations always end with `store.set('trails', trails)`

## fetchWeather() Pattern

```
async function fetchWeather() {
  1. Read input, validate
  2. Set loading state (button text, disabled, CSS class)
  3. try { fetch → parse → DOM update }
     catch { show error in result element }
     finally { reset loading state }
}
```

- Uses `.then(r => r.json())` chaining
- No AbortController (but we should add one for enrichment)
- Loading class: `.weather-loading` (opacity: 0.6, pointer-events: none)

## Two-Click Confirm Pattern

Delete uses `setupTwoClickConfirm(btn, action, label)` — first click shows confirm state (`.is-confirming`), second click executes. Auto-resets after timeout.

## Integration Points for Enrichment

1. **Best hook**: After `renderTrails()` completes, iterate `.trail-item` elements and call `renderEnrichmentRow()` for each
2. **Script loading**: Add `<script src="js/...">` tags BEFORE the closing `</script>` of inline block, or after it. Since scripts are classic, order matters.
3. **Enrichment button placement**: After `.trail-delete` (append as last child), OR before it. CSS flex-wrap on `.trail-item` will handle layout.
4. **Toast reuse**: Call existing `toast()` function directly — it's in global scope from the inline script

## Gotchas

- `renderTrails()` rebuilds the entire list each time. Enrichment rows must be re-rendered after every `renderTrails()` call.
- The `trails` variable is local to the inline script IIFE/closure. External scripts can't access it directly — must go through `store.get('trails', [])`.
- `esc()` helper (HTML escaping) is also local to the inline script. External scripts need their own.
