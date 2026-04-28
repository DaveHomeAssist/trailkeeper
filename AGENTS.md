> **DEPRECATED** — This file is superseded by `CLAUDE.md`. Issues, session log, and project metadata now live in CLAUDE.md. This file is retained as a historical archive only.

# AGENTS.md

Inherits root rules from `/Users/daverobertson/Desktop/Code/AGENTS.md`.

## Project Overview

Trailkeeper is a local first hiking log and field dashboard. It supports planning, shortlist management, hike logging, notes, saved links, and nearby trail discovery in a static browser app.

## Stack

- Vanilla JavaScript
- Static HTML and CSS
- Local storage for persistence
- OpenStreetMap Overpass API for trail lookup
- No build step

## Key Decisions

- Keep the app framework free and local first for field reliability
- Use direct browser storage instead of a backend
- Keep hiking workflows organized around one dashboard instead of multi page navigation

## Issue Tracker

| ID | Severity | Status | Title | Notes |
|----|----------|--------|-------|-------|
| 001 | P1 | resolved | Service worker registration swallows errors silently | Fixed: registration failures update runtime state, render the warning, and show a toast |
| 002 | P1 | resolved | Overpass API timeout returns null with no error context | Fixed: fetchNearbyTrails returns typed timeout, HTTP, and network errors with user visible messages |
| 003 | P1 | resolved | Trail status toggle has no undo | Fixed: status changes now show an undo toast and restore by trail name |
| 004 | P2 | resolved | No data import functionality | Fixed: JSON backup restore is available from the Today export controls |
| 005 | P2 | resolved | localStorage quota exceeded fails silently on log save | Fixed: trail log and trail list save failures now update runtime state and show a toast |
| 006 | P2 | resolved | Service worker cache version never auto-increments | Fixed: cache bumped to tk-v5 and local app shell requests now use network first refresh with cache fallback |
| 007 | P2 | resolved | Weather geocoding conflates network error with location not found | Fixed: weather now distinguishes no location, forecast service errors, and unreachable network |

## Session Log

[2026-03-18] [Trailkeeper] [docs] Add AGENTS baseline
