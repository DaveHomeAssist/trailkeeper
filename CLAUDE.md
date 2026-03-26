# CLAUDE.md

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

## Documentation Maintenance

- **Issues**: Track in the issue tracker table below
- **Session log**: Append to `/Users/daverobertson/Desktop/Code/95-docs-personal/today.csv` after each meaningful change

## Issue Tracker

| ID | Severity | Status | Title | Notes |
|----|----------|--------|-------|-------|
| 001 | P1 | open | Service worker registration swallows errors silently | sw.js register catch is empty; user never knows if offline support failed |
| 002 | P1 | open | Overpass API timeout returns null with no error context | trailDiscovery.js abort produces same message as network error |
| 003 | P1 | open | Trail status toggle has no undo | Cycling status via button can lose planned state without recovery |
| 004 | P2 | open | No data import functionality | Export works but users cannot restore JSON backups on new devices |
| 005 | P2 | open | localStorage quota exceeded fails silently on log save | trailLog.js setLogs catches errors but never notifies user |
| 006 | P2 | open | Service worker cache version never auto-increments | tk-v3 hardcoded; users may never see updates without force-refresh |
| 007 | P2 | open | Weather geocoding conflates network error with location not found | app.js shows same message for both failure modes |

## Session Log

[2026-03-18] [Trailkeeper] [docs] Add AGENTS baseline
