# Stats UI Design

**Date:** 2026-06-12
**Status:** Approved
**Repo:** `../top-heroes-stats-ui` (separate git repo, sibling to `top-heroes-stats-fetcher`)

## Overview

A SvelteKit static site that visualizes Top Heroes guild event rankings stored in PocketBase. The browser fetches data directly from the PocketBase REST API at runtime — no server required after build. Filters update URL query params so any view is bookmarkable and shareable.

## Repo Structure

```
../top-heroes-stats-ui/
├── src/
│   ├── lib/
│   │   ├── pb.js                   — PocketBase fetch helpers
│   │   └── components/
│   │       ├── FilterBar.svelte    — event type / week / day dropdowns
│   │       └── Leaderboard.svelte  — sortable rank table
│   └── routes/
│       └── +page.svelte            — main page, owns filter state
├── .env                            — PUBLIC_PB_URL (not committed)
├── .env.example                    — template committed to repo
├── svelte.config.js                — adapter-static
├── vite.config.js
└── package.json
```

## Data Layer — `pb.js`

Two exported async functions:

### `getEventWeeks(eventType)`

Fetches the distinct `event_start_date` values for the given event type, sorted descending (most recent first). Used to populate the week dropdown.

PocketBase query:
```
GET /api/collections/topHeroesEventRecords/records
  ?filter=(event_type='GAR')
  &fields=event_start_date
  &sort=-event_start_date
  &perPage=500
```

Returns a deduplicated array of ISO date strings: `['2026-06-09', '2026-06-02', ...]`

### `getRecords(eventType, eventStartDate)`

Fetches all records for a specific event type + week, sorted by rank ascending.

PocketBase query:
```
GET /api/collections/topHeroesEventRecords/records
  ?filter=(event_type='GAR'&&event_start_date='2026-06-09')
  &sort=rank
  &perPage=500
```

Returns the raw PocketBase record array. Day-of-week filtering is applied client-side from this result set.

**PocketBase requirement:** The `topHeroesEventRecords` collection's view rule must be set to an empty string (public read). This has been configured.

## Components

### `FilterBar.svelte`

Renders three `<select>` dropdowns:

1. **Event type** — static options: `GAR`, `GR`, `KvK`
2. **Week** — populated from `getEventWeeks()` result; labels formatted as human-readable dates (e.g., "Jun 9, 2026")
3. **Day** — options: `All`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`

Emits a `change` event with `{ eventType, week, day }` whenever any dropdown changes. Does not own state — the page drives it via props.

### `Leaderboard.svelte`

Accepts a `records` prop (array of record objects, already filtered by day). Renders a table with three columns:

| Rank | Player | Score |
|------|--------|-------|
| 1 | PlayerName | 3,876,069 |

Columns are sortable: clicking a header toggles ascending/descending sort on that column. Default sort is rank ascending.

Score values are formatted with locale-aware thousand separators.

States:
- **Loading** — shows a single spinner row while fetch is in progress
- **Error** — shows the error message in place of the table body
- **Empty** — shows "No records found" if the filtered result is empty
- **Populated** — renders the sorted table

### `+page.svelte`

Owns all filter state. On mount:

1. Read URL params `?event`, `?week`, `?day` — use as initial state if present
2. Call `getEventWeeks(eventType)` to populate the week list
3. Auto-select the most recent week if `?week` param is absent
4. Call `getRecords(eventType, selectedWeek)` to load all records for the week
5. Update the URL to reflect the resolved state (handles the no-param case)

Reactive behavior:
- **Event type changes** → re-run `getEventWeeks` → reset week to most recent → re-run `getRecords` → reset day to `All` → update URL
- **Week changes** → re-run `getRecords` → reset day to `All` → update URL
- **Day changes** → filter already-loaded records in memory (no network call) → update URL

URL updates use `goto('?' + params.toString(), { replaceState: true, noScroll: true, keepFocus: true })` so filter changes do not create browser history entries.

## Day-of-Week Filtering

All records for the selected event + week are fetched in a single call. Day filtering is applied in memory:

- **All** — keep only records whose `captured_at` date matches the most recent capture date in the set (i.e., the latest daily snapshot of the week)
- **Mon / Tue / Wed / Thu / Fri / Sat** — keep records where `new Date(record.captured_at).getUTCDay()` matches the corresponding day index

Since the bot runs once per day, each day's capture produces a full snapshot of all guild members. Selecting a specific day shows the standings as they stood at that day's capture.

## URL Parameters

| Param | Values | Default |
|-------|--------|---------|
| `event` | `GAR`, `GR`, `KvK` | `GAR` |
| `week` | ISO date string e.g. `2026-06-09` | most recent available |
| `day` | `All`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat` | `All` |

Example: `http://localhost:4173/?event=KvK&week=2026-05-26&day=Thu`

## Environment Configuration

```env
# .env (not committed)
PUBLIC_PB_URL=http://localhost:8090
```

SvelteKit bakes `PUBLIC_*` variables into the client bundle at build time via Vite. The built files make fetch calls directly to this URL with no server intermediary.

**CORS:** PocketBase must allow the origin where the static site is served. Configure allowed origins in PocketBase admin → Settings → Application.

## Build & Deployment

```bash
cd ../top-heroes-stats-ui
npm install
npm run build          # outputs to build/
npx serve build        # serve locally
```

The `build/` directory is self-contained static files. It can be:
- Served locally with `npx serve build` or `python -m http.server`
- Deployed to any static host (Netlify, GitHub Pages, Cloudflare Pages, etc.)
- Served from the same host/port as PocketBase to avoid CORS config entirely

`svelte.config.js` uses `adapter-static` with `fallback: 'index.html'` to support client-side navigation.

## Out of Scope

- Authentication — collection is public read; no login flow
- Write operations — read-only UI
- Player search / filtering beyond event type, week, and day
- Score history charts (leaderboard table only)
- Mobile-specific layout optimizations
