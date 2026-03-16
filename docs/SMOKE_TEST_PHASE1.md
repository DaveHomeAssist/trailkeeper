# Trailkeeper — Phase 1 Smoke Test

> **Features:** Trail Conditions Advisory + Trail Map Thumbnail
> **Date:** 2026-03-16
> **Pages to test:** `index.html` and `hiking-page.html` (both must behave identically)

---

## Setup

1. Open the live site or local file in a browser
2. Have at least one named trail in the shortlist
3. Have a working internet connection for the first pass (offline tests come later)

---

## Test 1: Trail Conditions Advisory

### 1A — Enrich a trail and check for advisories

1. Add a trail with a name known to have seasonal or access restrictions in OSM (try "Appalachian Trail" or a local trail you know is seasonal)
2. Click the enrich button (magnifying glass)
3. Wait for enrichment to complete
4. Look at the enrichment row below the trail name

**Expected:**
- If OSM data includes advisory-relevant tags (`access`, `seasonal`, `winter_service`, `surface`, `trail_visibility`, `sac_scale`), a yellow/amber advisory line appears below the enrichment fields
- Advisory text is prefixed with a warning symbol
- Multiple advisories are joined with " · "

### 1B — Trail with no advisories

1. Enrich a well-maintained, year-round trail (try a popular local trail)
2. Check the enrichment row

**Expected:**
- No advisory line appears — the enrichment row looks exactly as before
- No errors in console

### 1C — Old cached enrichment (backward compatibility)

1. If you already have enriched trails from before this update, reload the page
2. Check those enrichment rows

**Expected:**
- Old enrichment data renders normally
- No advisory line (old data doesn't have the `advisories` field)
- No console errors

---

## Test 2: Trail Map Thumbnail

### 2A — Enriched trail shows map

1. Enrich a named trail (or use one already enriched after this update)
2. Look at the bottom of the enrichment row

**Expected:**
- A small map thumbnail appears below the enrichment fields
- The map shows a red marker at the trail location
- The map image loads lazily (shouldn't block initial render)

### 2B — Click map opens OpenStreetMap

1. Click the map thumbnail

**Expected:**
- Opens OpenStreetMap in a new tab
- Centered on the trail coordinates at zoom level 14
- The original page stays open (no navigation away)

### 2C — Discovery-sourced trail shows map

1. Enter a ZIP code in the weather field
2. Check weather
3. Click "Find nearby trails"
4. Add one of the discovered trails to the shortlist
5. Check if the map thumbnail appears (discovery trails have coordinates even without enrichment)

**Expected:**
- If the trail has discovery coordinates but no enrichment, check whether the map appears
- If the map only appears after enrichment, that's acceptable for v1

### 2D — Trail without coordinates

1. Manually add a trail name that won't have coordinates (e.g. "My Backyard Walk")
2. Do NOT enrich it

**Expected:**
- No map thumbnail
- No placeholder image
- No console errors

### 2E — Old cached enrichment without coordinates

1. Reload the page with previously enriched trails (from before this update)

**Expected:**
- Old enrichment data without `lat`/`lon` fields shows no map
- No errors — graceful degradation

---

## Test 3: Both features together

### 3A — Full enrichment flow

1. Add a new named trail
2. Enrich it
3. Verify: enrichment fields + advisory line (if applicable) + map thumbnail all appear
4. Reload the page — everything persists from cache

### 3B — Refresh enrichment

1. Click refresh on an enriched trail
2. Verify advisory and map data update (or persist if refresh fails)

### 3C — Delete enriched trail

1. Delete a trail that has enrichment + advisory + map
2. Verify no orphaned UI elements remain

---

## Test 4: Cross-page consistency

1. Run tests 1-3 on `index.html`
2. Run tests 1-3 on `hiking-page.html`
3. Verify identical behavior on both pages

---

## Test 5: Failure modes

### 5A — Offline enrichment attempt

1. Disconnect from internet (or use browser DevTools → Network → Offline)
2. Click enrich on a trail

**Expected:**
- Error toast appears
- No advisory, no map (nothing to show)
- Trail item returns to normal state
- No console crash

### 5B — Slow connection

1. Use DevTools to throttle network (Slow 3G)
2. Enrich a trail

**Expected:**
- Loading state shows during fetch
- Map image loads slowly but eventually appears
- No timeout crash (adapter has 12s timeout)

---

## Console Checks

After all tests, check the browser console for:
- No uncaught errors
- No failed network requests (other than expected Overpass failures in offline mode)
- No warnings about undefined variables

---

## Pass Criteria

- [ ] Advisory line appears when OSM tags warrant it
- [ ] Advisory line absent when no advisory tags exist
- [ ] Old cached enrichment renders without errors
- [ ] Map thumbnail appears for enriched trails with coordinates
- [ ] Map click opens correct OSM location in new tab
- [ ] No map for trails without coordinates
- [ ] Both features survive page reload
- [ ] Delete trail cleans up all UI
- [ ] Both pages behave identically
- [ ] Offline/failure modes degrade gracefully
- [ ] No console errors
