# TopHeroes Stats Fetcher — Design Spec

**Date:** 2026-06-08  
**Status:** Approved

---

## Overview

A scheduled Node.js bot that scrapes guild contribution stats from the desktop game TopHeroes by automating mouse input and reading the game window via Claude Vision API. Stats are stored in PocketBase and exported to CSV for testing. The bot runs automatically at 2:50 AM UTC daily (10 minutes before the 3 AM UTC game reset) and can also be triggered manually.

---

## Architecture & Components

```
top-heroes-stats-fetcher/
├── src/
│   ├── scheduler.js       # node-cron job at 2:50 AM UTC + manual trigger
│   ├── launcher.js        # spawns TopHeroes, waits for load/updates, ensures fullscreen, closes process
│   ├── navigator.js       # mouse automation: clicks, scrolls, navigates game UI
│   ├── capturer.js        # captures the TopHeroes window as image buffer
│   ├── extractor.js       # sends screenshot to Claude Vision API: detects game state, extracts rankings, locates buttons
│   ├── aggregator.js      # deduplicates scroll captures, filters to configured guild only
│   └── writers/
│       ├── csv.js         # writes timestamped CSV file to output/
│       └── pocketbase.js  # INSERTs (GAR/KvK) or UPSERTs (GR) to PocketBase
├── config.js              # screen coordinates, guild tag, scroll step, collection names
├── state.json             # persisted event_start_date for GR upsert keying
├── .env                   # ANTHROPIC_API_KEY, POCKETBASE_URL, POCKETBASE_TOKEN
└── index.js               # entry point
```

### Key Dependencies

| Package | Purpose |
|---|---|
| `@nut-tree/nut-js` | Mouse/scroll/keyboard automation (including Alt+Enter) |
| `node-screenshots` | Capture game window by window title; poll for window presence |
| `@anthropic-ai/sdk` | Claude Haiku Vision API for text extraction, load-state detection, and dynamic button location |
| `node-cron` | Daily schedule at 2:50 AM UTC |
| `pocketbase` | PocketBase REST client |
| `csv-writer` | CSV file output |
| `dotenv` | Environment variable loading |

---

## Navigation Flow

Each run follows these steps in order:

1. **Launch TopHeroes** (`launcher.js`) — spawn the game executable via `child_process.spawn` using the configured `gameExePath`. Store the process reference for later cleanup.
2. **Wait for window** — poll `node-screenshots` every 2 seconds (up to a configurable timeout, default 120s) until the "Top Heroes" window title appears.
3. **Wait for load & updates** — once the window is found, poll by taking screenshots and sending to Claude Vision, checking whether the main game map is visible. Retry every 5 seconds up to a configurable timeout (default 3 minutes). This naturally handles update downloads and loading screens — the bot simply waits until the game is ready.
4. **Ensure fullscreen** — compare the captured window dimensions to the primary screen resolution. If they don't match, send `Alt+Enter` via `@nut-tree/nut-js` and wait 2 seconds for the transition to complete.
5. **Open event screen** — take screenshot; ask Claude Vision to locate the Events icon and return its pixel coordinates; click those coordinates.
6. **Detect event type** — take screenshot of the Routines panel (tab labels are visible at this point); send to Claude Vision to read the tab labels and identify the active event → map to `GR | GAR | KvK`. Note: the KvK tab label reads **"Kingdom Duel"** — the extractor maps this string to `KvK`.
7. **Select guild event tab** — using the same screenshot and the detected event name, call `locateButton` with the specific label text (e.g. `'the tab labeled "Guild Arms Race" in the Routines panel'`); click it. This is more robust than always clicking the second tab, since the event tab's position may occasionally vary.
8. **Navigate to Rankings** — take screenshot; ask Claude Vision to locate the Ranking button (its position differs between GAR and GR/KvK); click it.
9. **Ensure correct ranking tab is active** — take screenshot; ask Claude Vision to locate the "Daily Ranking" tab (GAR/KvK) or "Individual" tab (GR); click it.

For steps 5, 6, 8, and 9, `extractor.locateButton(imageBuffer, description)` is called with a plain-English description of the target element (e.g. `"the Ranking button"`). It returns `{ x, y }` pixel coordinates. If the element cannot be found with sufficient confidence, it throws an error — the run aborts rather than clicking a wrong location.
10. **Scroll & capture loop** — the rankings list loads data in increments of 20 items. Scrolling is done via **click-drag-release** (not scroll wheel):
    - Take screenshot; send to Claude Vision → extract all visible entries
    - **Glitch detection:** if the first visible entry's rank has dropped significantly below the highest rank seen so far (threshold: `scrollGlitchThreshold`, default 15), the list has glitched back to the start. Recovery drag count is calculated as `Math.ceil((highestRankSeen - lastVisibleRank) / scrollEntriesPerDrag) + 1`, where `lastVisibleRank` is the rank of the last entry currently on screen and `scrollEntriesPerDrag` is 5. The `+1` ensures we scroll just past the known position so fresh entries load. After recovery drags, retry the screenshot.
    - Apply **maxRank cutoff** (KvK only): if any entry has rank > `kvkMaxRank`, keep entries up to that point and stop.
    - **End-of-list detection:** if the last visible entry's rank equals `highestRankSeen` (the highest rank recorded so far), stop. A normal scroll that loads new items always causes a rebound that moves the list up, so the last visible entry will be below `highestRankSeen`. Only a scroll at the true end of the list reproduces the exact same final entry. This check runs at the top of the loop before processing entries, guarded by `seen.size > 0` to skip the first page.
    - **Drag scroll:** press and hold the left mouse button at `scrollDragFromY`, drag up to `scrollDragToY` on the same X, then release. Release triggers the game to load the next 20 items.
    - **Rebound wait:** after release, wait `scrollReboundWaitMs` (default 1500ms) for the new items to load and the list to settle after its upward rebound.
    - Deduplication is tracked internally by `rank + player_name`; the aggregator's `player_name + server` dedup acts as a second safety layer.
11. **Filter** — aggregator discards any record where `guild_tag !== config.guildTag`; for GAR/KvK this is a safety net, for GR it is the primary filter
12. **Write output** — pass filtered records to both writers
13. **Close TopHeroes** (`launcher.js`) — terminate the stored process reference; if process is no longer running, log and continue

---

## Event Types & Cycle

Events cycle in order: **GR → GAR → GR → KvK → repeat**

The active event is detected automatically from the screen each run. Since the cycle can go off-schedule for season changes, auto-detection is used rather than a calendar calculation.

### Weekly Cadence

Each event lasts exactly one week: **Sunday 3 AM UTC → following Sunday 3 AM UTC** (aligned with the game's daily reset time).

- **Active capture days:** Monday–Saturday at 2:50 AM UTC (days 2–7 of the event week, before each daily reset)
- **Skipped day (GAR/KvK only):** Sunday at 2:50 AM UTC — this falls within the final 10 minutes of the "Saturday after reset → Sunday before reset" period. At this point the event has technically ended and no meaningful daily data is produced. The bot exits early for GAR/KvK on this day without writing any records.
- **GR is not skipped on Sunday** — GR uses UPSERT and capturing final standings before the reset is valid.

The `event_start_date` for GAR/KvK records is set to the **Sunday start date of the current event week** (the most recent past Sunday in UTC), not the capture date. This allows all daily records within the same event week to be grouped by `event_start_date` in the dashboard.

| Event | Tab label | In-game guild filter | Ranking tab | Records strategy | Skip Sunday? |
|---|---|---|---|---|---|
| Guild Race (GR) | Guild Race | None — scroll all ~300 entries, filter by guild tag in aggregator | Individual | UPSERT per player | No |
| Guild Arms Race (GAR) | Guild Arms Race | "Your Guild" pre-applied — only guild members visible | Daily Ranking | INSERT per day | Yes |
| Kingdom vs Kingdom (KvK) | Kingdom Duel | None — shows all players from both kingdoms; scroll until rank > 200, then stop; filter by guild tag in aggregator | Daily Ranking | INSERT per day | Yes |

A `kvkMaxRank` config value (default: 200) controls the KvK scroll cutoff. The scroll loop stops as soon as it encounters any entry with rank > `kvkMaxRank`, discarding that entry and everything after it.

---

## Data Model

Each record (PocketBase collection field / CSV column):

| Field | Type | Notes |
|---|---|---|
| `player_name` | string | Name without guild tag, e.g. `CaptinLevi` |
| `guild_tag` | string | e.g. `WAR` |
| `server` | string | e.g. `#10607` |
| `rank` | number | Position in the daily ranking |
| `score` | number | Daily points/contribution score |
| `event_type` | string | `GR` \| `GAR` \| `KvK` |
| `event_start_date` | date | GAR/KvK: Sunday start date of the current event week. GR: first capture date of this GR instance (see GR upsert logic below). |
| `captured_at` | datetime | UTC timestamp of this run |

### PocketBase Collections

- **`event_records`** — used for GAR and KvK. A new record is inserted per player per run. Overall/cumulative totals are derived by summing daily records in the dashboard.
- **`gr_records`** — used for GR only. One record per player per GR event instance. Updated (not duplicated) each daily run.

### GR Upsert Key & Event Instance Tracking

Since GR repeats in the cycle, a `state.json` file persists the `event_start_date` for the current GR instance. Logic:

1. On a GR run, check `state.json` for an existing `gr_event_start_date`
2. Query `gr_records` for records matching that start date
3. If records exist → this is an ongoing GR; use the stored start date as upsert key anchor
4. If no records exist → this is a new GR instance; write today's date to `state.json` as the new `gr_event_start_date`
5. Upsert key: `player_name + event_start_date`

---

## Output

### CSV

- Path: `output/YYYY-MM-DD_HH-mm_<event_type>.csv`
- One file per run containing all filtered guild member records
- Always written regardless of PocketBase availability (data safety net)

### PocketBase

- Authenticates using the PocketBase JS SDK with `POCKETBASE_EMAIL` + `POCKETBASE_PASSWORD` at the start of each run
- GAR/KvK: `INSERT` each record
- GR: `UPSERT` matching on `player_name + event_start_date`; update `score`, `rank`, `captured_at`
- If PocketBase is unreachable or authentication fails, log the error and continue — CSV write is not affected

---

## Configuration

`config.js` — committed, no secrets:

```js
module.exports = {
  guildTag: 'WAR',
  windowTitle: 'Top Heroes',
  gameExePath: 'C:\\path\\to\\TopHeroes.exe',  // path to game executable
  launchTimeoutMs: 120_000,    // max wait for window to appear (ms)
  loadTimeoutMs: 180_000,      // max wait for main map to be visible (ms)
  // Button click coordinates are determined dynamically at runtime via Claude Vision —
  // no manual calibration needed. Only the drag scroll region is hardcoded because
  // it targets a general area of the list, not a specific button.
  scrollDragX: 727,          // X coordinate for drag (horizontal center of the rankings list)
  scrollDragFromY: 650,      // placeholder — Y where drag starts (near list bottom); calibrate once
  scrollDragToY: 250,        // placeholder — Y where drag ends (near list top); calibrate once
  scrollReboundWaitMs: 1500,                    // ms to wait after release for load + rebound to settle
  scrollEntriesPerDrag: 5,                      // entries scrolled per drag (used in glitch recovery)
  scrollGlitchThreshold: 15,                    // rank drop below max-seen that signals a glitch
  pb: {
    eventRecordsCollection: 'event_records',
    grRecordsCollection: 'gr_records',
  },
};
```

`.env` — not committed:

```
ANTHROPIC_API_KEY=...
POCKETBASE_URL=http://localhost:8090
POCKETBASE_EMAIL=...
POCKETBASE_PASSWORD=...
```

---

## Scheduling

- `node-cron` fires at `50 2 * * *` (2:50 AM UTC daily)
- Manual trigger: `node index.js --run-now`
- The scheduler and manual path call the same `run()` function

---

## Error Handling

- If the game executable fails to launch: log error and exit — do not attempt to continue
- If the window does not appear within `launchTimeoutMs`: log error, attempt to kill the process, and exit
- If the main map is not detected within `loadTimeoutMs` (stuck on loading/update screen): log error, close the process, and exit
- If the game is not fullscreen and Alt+Enter fails to make it fullscreen: log a warning and continue (coordinates may be misaligned)
- If `locateButton` cannot find the target element with confidence: throw an error, abort the run, and close the game — do not click a random coordinate
- If Claude Vision returns unparseable output for rankings: retry once, then log and skip that scroll page
- If PocketBase write fails: log error, continue — CSV is always written regardless
- TopHeroes is always closed at the end of a run, even if an error occurred mid-run (use try/finally)
- All errors are logged to console with timestamps; no silent failures
