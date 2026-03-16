# Trailkeeper

A local-first hiking companion for planning, tracking, and discovering trails. All data stays in your browser — no accounts, no backend, works offline after first load.

**Live:** [davehomeassist.github.io/trailkeeper](https://davehomeassist.github.io/trailkeeper/)

---

## What it does

### Plan your day
- Set today's trail, start time, and pack list
- Check weather by ZIP or city (Open-Meteo)
- Collapsible trip notes for trailhead directions and parking

### Build a trail shortlist
- Add trails with a category tag (Quick / Half day / Full day)
- Cycle status: Unvisited → Planned → Done
- Set any trail as "Today" with one click
- Two-click delete with undo

### Discover nearby trails
- After checking weather, click **Find nearby trails**
- Shows 5 closest named hiking routes within 25 km (via OpenStreetMap Overpass API)
- One-click add to your shortlist

### Enrich trail data
- Click the enrich button on any named trail to fetch metadata from OpenStreetMap
- Shows distance, elevation gain, surface type, difficulty, and source info
- Data caches locally — survives reload and works offline
- Refresh button re-fetches when you want fresh data

### Log hikes
- Record trail name, date, miles, elevation, difficulty (1-5 stars), and a note
- Running stats: total hikes, miles, elevation, longest

### Field notes and gear
- Terrain and access condition textareas
- Gear checklist with 8 defaults + custom items
- Check progress counter with reset and undo

### Extras
- Saved links (AllTrails, park website, weather, offline map)
- Photo gallery (3 slots, stored as base64)
- Keyboard shortcuts: `/` Trails, `L` Log, `G` Gear
- Print-friendly layout
- Dark mode (system preference)

---

## Architecture

```
trailkeeper/
  index.html              Main page
  hiking-page.html        Hiking page (same app, alternate entry point)
  shared.css              All styles, responsive + dark mode
  js/
    trailAdapter.js       Overpass API adapter (fetch + normalize)
    trailStore.js         localStorage enrichment management
    trailEnrichmentUI.js  Enrichment row + button rendering
    trailHydration.js     Integration orchestration (wires adapter + store + UI)
    trailDiscovery.js     Nearby trail search from ZIP coordinates
  docs/
    ENRICHMENT-SPEC.md    Enrichment feature architecture spec
```

### Design principles

- **No backend.** Everything runs client-side. localStorage + IndexedDB-free.
- **Local data is authoritative.** External API data is advisory and cached.
- **Offline-first.** App loads and renders from cache. Network calls are optional enrichment.
- **Additive features.** Enrichment and discovery fail gracefully — core trail CRUD always works.
- **Vanilla JS.** No framework, no build step, no dependencies. Classic script loading with `window.TK` namespace.

### External APIs

| API | Purpose | Auth |
|-----|---------|------|
| [Open-Meteo](https://open-meteo.com/) | Weather forecast + geocoding | None |
| [Overpass API](https://overpass-api.de/) | Trail enrichment + nearby discovery | None |

Both are free, CORS-friendly, and require no API keys.

### Storage

All data lives in `localStorage` under simple keys:

| Key | Contents |
|-----|----------|
| `trails` | Trail shortlist array (with optional enrichment) |
| `hikeLog` | Logged hike entries |
| `checkedGear` | Gear checkbox state |
| `customGear` | User-added gear items |
| `planTrail`, `planTime` | Today's plan fields |
| `tripNotes`, `tripNotesOpen` | Trip notes content + toggle state |
| `weatherCity` | Last searched weather location |
| `condTerrain`, `condAccess` | Field notes |
| `photo0`-`photo2` | Gallery images (base64) |

---

## Development

No build step. Open `index.html` in a browser or serve locally:

```bash
cd trailkeeper
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

### Deployment

Hosted on GitHub Pages from the repo root. Push to `main` and it's live.
