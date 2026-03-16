# Trailkeeper — Phase 2 Build Instructions

> **Prerequisite:** Phase 1 smoke tested and committed
> **Features:** Trip Log (#3), Export/Share (#4)
> **Estimated agents:** 2 (parallel)

---

## Agent A: Trip Log / Post-Hike Journal

### Owns

- New file: `js/trailLog.js`
- Modifications to: `js/trailEnrichmentUI.js`, `shared.css`
- Modifications to: `index.html`, `hiking-page.html` (script tag + init)

### What to build

When a user toggles a trail status to "completed," show an inline log form: date hiked, conditions, rating, and a short note. Logs are stored separately from trail objects.

### Storage

```js
// localStorage key: "tk-logs"
[
  {
    id: "log-{timestamp}",
    trailName: "Wissahickon Loop",
    hikedAt: "2026-03-16",
    conditions: "sunny",        // sunny | cloudy | rainy | muddy | snowy
    rating: 4,                  // 1-5
    note: "Muddy in shaded areas after morning rain"
  }
]
```

Separate from trail objects. Matched by `trailName` (case-insensitive).

### Exposed API

```js
window.TK.trailLog = {
  initLog,
  getLogs,
  getLogsForTrail,
  saveLog,
  renderLogForm,
  renderLogSummary
};
```

### UI behavior

**Trigger:** Status toggle to "completed" → inline form expands below trail item

**Log form (`.trail-log-form`):**
- Date: input type="date", default today
- Conditions: 5 pill buttons (sunny, cloudy, rainy, muddy, snowy)
- Rating: 5 circle buttons (filled = selected, empty = unselected)
- Note: small textarea, auto-save on blur
- Save button + Cancel (collapse without saving)

**Log summary (`.trail-log-summary`):**
- For completed trails with a log: show compact one-liner below enrichment row
- Format: "Mar 16 · sunny · ★★★★☆ · Muddy in shaded areas"
- Click to expand full log form for editing

**No log:** If status is "completed" but no log exists, show a subtle "Log this hike" link

### CSS classes to add

```
.trail-log-form
.trail-log-field
.trail-log-conditions
.trail-log-condition (pill button)
.trail-log-condition.active
.trail-log-rating
.trail-log-star
.trail-log-star.filled
.trail-log-note
.trail-log-summary
.trail-log-prompt
```

### Rules

- Log form is optional — user can dismiss without logging
- Logs persist independently from trail objects
- Deleting a trail does NOT delete its log (hike happened, trail removal is a list action)
- Multiple logs per trail are allowed (hiked same trail twice)
- Use existing CSS variables and DM Mono for dates/ratings
- No external dependencies

### Integration with existing code

- Hook into the status toggle handler in the inline script
- After status changes to "completed," call `renderLogForm(trailItemEl, trail, index)`
- On trail list render, check for existing logs and call `renderLogSummary` if found
- Follow the same pattern as enrichment: hook into `renderTrails()` via `_applyEnrichmentUI` or a similar post-render pass

---

## Agent B: Export / Share Trip Plan

### Owns

- New file: `js/trailExport.js`
- Modifications to: `index.html`, `hiking-page.html` (markup + script tag + init)
- Modifications to: `shared.css`

### What to build

Two export modes accessible from a button in the Today's Plan section:

**Mode 1 — Copy plan as text**

Formats current plan as plain text and copies to clipboard. Designed for texting to a hiking partner.

Output format:
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

Rules for text export:
- Include weather if available (read from `#weatherResult`)
- Include all trails with enrichment data if available
- Include advisories if present
- Include pack list (read from DOM)
- Include trip notes if non-empty
- Omit sections that have no data
- Keep it SMS-friendly (no fancy formatting)

**Mode 2 — Download backup as JSON**

Serializes the full `trails` array (including enrichment and discovery metadata) as a downloadable JSON file.

Filename: `trailkeeper-backup-{YYYY-MM-DD}.json`

### Exposed API

```js
window.TK.trailExport = {
  initExport,
  copyPlanToClipboard,
  downloadBackup
};
```

### UI

Add to the Today's Plan section (near weather or below it):

```html
<div class="trail-export">
  <button id="copyPlanBtn" type="button" class="trail-export-btn">Copy plan</button>
  <button id="downloadBackupBtn" type="button" class="trail-export-btn trail-export-secondary">Download backup</button>
</div>
```

- "Copy plan" → clipboard + success toast
- "Download backup" → file download + success toast
- Both buttons always visible (unlike discovery which needs weather first)

### CSS classes to add

```
.trail-export
.trail-export-btn
.trail-export-secondary
```

Style to match existing button patterns. Compact, inline, not dominant.

### Rules

- Use `navigator.clipboard.writeText()` with fallback for older browsers
- Use `URL.createObjectURL(new Blob(...))` for download
- No import functionality in v1
- No modal — just buttons with toast feedback
- If clipboard write fails, show error toast
- Read plan data from live DOM + localStorage, not from any intermediate model

### Integration

- Add markup to both HTML files
- Add script tag + init call
- `initExport` binds click handlers to the two buttons
- No hooks into render cycle needed — export reads current state on demand

---

## Execution Plan

```
Phase 2:
  Agent A (Trip Log)      ──────────►  parallel
  Agent B (Export/Share)   ──────────►  parallel

  Smoke test Phase 2
  Commit + push both projects
```

### Dependencies

- Neither feature depends on the other
- Both depend on Phase 1 being committed (advisory + map data may appear in exports and log summaries)
- Trip Log hooks into the status toggle → read the inline script's status change handler before coding
- Export reads from DOM + localStorage → read the live page structure before coding

### Post-Phase 2

After smoke test, remaining features are:

| Project | Feature | Effort |
|---------|---------|--------|
| Trailkeeper | Offline PWA (#5) | Medium |
| Garden OS | Planting Calendar (#3) | Medium |
| Garden OS | Garden Plan Print (#4) | Low |
| Garden OS | Harvest Tracker (#5) | Medium |

Phase 3 recommendation: Garden OS #3 (Planting Calendar) + Garden OS #4 (Print Layout) in parallel, since they share the temporal/print concern and TK's PWA is better saved for last.
