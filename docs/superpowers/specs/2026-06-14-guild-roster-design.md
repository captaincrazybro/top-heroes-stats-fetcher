# Guild Roster Capture Design

**Date:** 2026-06-14
**Status:** Approved
**Repo:** `top-heroes-stats-fetcher`

## Overview

An additional routine that captures the full guild member roster from the Members screen **before** the daily event stats fetch. The game is already open at that point, so no extra launch is needed. Results are written to a new `guildRoster` PocketBase collection and a daily CSV snapshot. The roster is synced using a fuzzy-matched diff — members who appear on screen have their fields updated and `joined` set to `true`; members no longer seen have `joined` set to `false`. Records are never deleted. Two fields (`main_queue_influence` and `main_queue_faction`) are manually managed and never touched by the bot.

The daily schedule is shifted to **02:45 UTC** — 15 minutes before the event reset — so both roster and event stats are captured before the weekly scores clear.

## Module Structure

One new file owns the entire roster pipeline. Existing modules are untouched.

```
src/
  roster.js          — new: navigate → scroll/capture → sync → write
  writers/
    csv.js           — existing, unchanged
    pocketbase.js    — existing, unchanged
config.js            — new fields added
index.js             — calls roster.capture() after event stats are written
```

`src/roster.js` exports a single function:

```js
async function capture() → { records: RosterRecord[], capturedAt: string }
```

Internally it is composed of four private functions:

| Function | Responsibility |
|---|---|
| `navigate()` | Click back → guild → members; wait for each screen |
| `extractMembers(imageBuffer)` | Crop screenshot, call Claude Vision, return parsed entries |
| `scrollAndCapture()` | Loop: screenshot → extract → deduplicate → scroll; stop when no new names |
| `syncToPocketBase(records, capturedAt)` | Fetch existing roster, fuzzy diff, upsert matches, mark departed, insert new |

## Navigation Flow

Runs immediately after the game loads (main map visible), before event stats are fetched.

1. **Click guild button** — opens the guild panel from the main map (`guildButtonX/Y`)
2. **Click members button** — opens the Members screen (`membersPanelButtonX/Y`)
3. **Scroll and capture loop** — no pre-load needed; the members list does not use the same scroll buffer as the rankings list
4. **Stop** — when a full scroll pass yields no player names not already seen
5. **Sync to PocketBase + write CSV**
6. **Click guild close button** — closes the guild panel and returns to the main map (`guildCloseButtonX/Y`), so `navigator.navigate()` can start fresh

Each click uses the same `clickAt()` helper as the existing navigator. A configurable `delayMs` pause follows each click to allow the screen to load.

## Extraction

### Vision Prompt

`extractMembers(imageBuffer)` crops the screenshot using `membersCropBounds`, then calls Claude Vision with this prompt:

```
Look at this Top Heroes guild Members screen.
Extract ALL visible member entries. Return ONLY valid JSON:
{"members":[{"player_name":"string","rank":"R1","influence":341000000,"castle_level":62,"last_online":"22 min ago"}]}

Rules:
- rank: the rank badge shown on the member card — one of R1, R2, R3, R4, R5
- influence: the power/strength value converted to a full integer (341M → 341000000, 83.5M → 83500000)
- castle_level: the numeric level shown next to the castle icon
- last_online: the exact text shown — "Online", "22 min ago", "5 days ago", etc.
- The R5 player appears prominently at the top of the screen — include them
- Do NOT include yourself or any entry without a visible player name
```

Two retries on parse failure (same pattern as `extractRankings`).

### Deduplication

The scroll loop accumulates entries in a `Map` keyed by `player_name`. If the same name appears on two scroll pages the second occurrence is ignored. Stop condition: a scroll pass where `map.size` does not increase.

## Data Model

### PocketBase — `guildRoster` collection

| Field | Type | Example | Notes |
|---|---|---|---|
| `player_name` | string | `"Nyra"` | Unique identifier for sync |
| `rank` | string | `"R5"` | R1 – R5 |
| `influence` | number | `341000000` | Full integer, not abbreviated |
| `castle_level` | number | `62` | |
| `last_online` | string | `"22 min ago"` | Raw text from screen |
| `joined` | boolean | `true` | `true` = currently in guild; `false` = has left |
| `main_queue_influence` | number | `250000000` | Manually set; **never written by the bot** |
| `main_queue_faction` | string | `"horde"` | `horde`, `league`, or `nature`; **never written by the bot** |
| `captured_at` | datetime | auto | Set by PocketBase on create/update |

`main_queue_influence` and `main_queue_faction` default to `null` on insert and are never included in any update payload sent by the bot. They exist solely for manual configuration by the guild leader.

The collection must have the view rule set to empty string (public read) so the stats UI can query it in future.

### CSV

Written to `output/roster-<YYYY-MM-DD>-<timestamp>.csv` with the bot-managed fields only (`player_name`, `rank`, `influence`, `castle_level`, `last_online`, `joined`, `captured_at`). The manually-managed fields are omitted from CSV since they are not sourced from the game. One file per daily run, never mutated after write.

## Roster Sync Algorithm

After the scroll loop completes, `syncToPocketBase(capturedRecords, capturedAt)` runs:

### Step 1 — Fetch existing

```js
const existing = await pb.collection('guildRoster').getFullList();
```

This includes all records regardless of `joined` status — a returning member who previously left should be re-matched and their `joined` flag flipped back to `true`.

### Step 2 — Score all pairs

For every (captured, existing) pair compute a normalized similarity score:

```
similarity(a, b) = 1 - (levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / Math.max(a.length, b.length))
```

A simple iterative Levenshtein implementation is included in `roster.js` — no new npm dependency.

### Step 3 — One-to-one greedy assignment (Approach A)

Sort all (captured, existing, score) triples by score descending. Walk the list:
- If both names are still unassigned, assign them as a match and lock both.
- Skip pairs where either name is already assigned.

This ensures each captured name matches at most one existing record and vice versa — prevents two similarly-named players from both being claimed by one captured name.

### Step 4 — Ambiguity guard (Approach B)

Before accepting a match, check the **score gap**: the difference between the best-match score and the second-best match score for that captured name. If the gap is below `config.rosterAmbiguityGap` (default `0.05`), the match is flagged as ambiguous.

Ambiguous matches are **not merged and not marked departed** — the existing record is left untouched and the captured entry is logged as ambiguous. This is intentionally conservative: a false-new is recoverable; a false-merge silently corrupts data.

### Step 5 — Apply changes

The update payload sent to PocketBase for matched and new records **never includes `main_queue_influence` or `main_queue_faction`** — those fields are omitted entirely so PocketBase retains whatever value was set manually.

| Case | Action |
|---|---|
| Matched, score ≥ threshold, unambiguous | Update `rank`, `influence`, `castle_level`, `last_online`, set `joined = true` |
| Returning member (was `joined = false`, now matched) | Same update as above — `joined` flips back to `true` |
| No match found (score below threshold) | Insert new record: all bot fields set, `joined = true`, `main_queue_influence = null`, `main_queue_faction = null` |
| Existing record not matched by any captured name | Update only `joined = false`; all other fields left as-is |
| Ambiguous match | Log warning; leave existing record entirely unchanged; skip insert |

Match threshold: `config.rosterMatchThreshold` (default `0.85`).

### Step 6 — Log summary

```
[roster] 91 matched (3 rejoined), 2 new, 1 departed, 1 ambiguous (review log)
```

## Config Additions

```js
// Navigation coords — UPDATE to match your screen
guildButtonX: 0,             // guild icon on main map — UPDATE
guildButtonY: 0,
membersPanelButtonX: 0,      // members tab inside guild panel — UPDATE
membersPanelButtonY: 0,
guildCloseButtonX: 0,        // close/back button to dismiss guild panel — UPDATE
guildCloseButtonY: 0,

// Crop region for the members panel screenshot — UPDATE
membersCropBounds: { left: 500, top: 60, width: 460, height: 720 },

// Fuzzy sync tuning
rosterMatchThreshold: 0.85,  // minimum similarity to count as same player
rosterAmbiguityGap: 0.05,    // score gap below which a match is flagged ambiguous

pb: {
  // ... existing fields ...
  rosterCollection: 'guildRoster',
},
```

## Integration with `run()`

```js
async function run() {
  await launcher.launch();
  try {
    // 1. Roster first — game on main map, guild panel not yet open
    try {
      const { records, capturedAt } = await roster.capture();
      await csvWriter.writeRoster(records, capturedAt);
      console.log(`[run] Roster: ${records.length} members captured`);
    } catch (err) {
      console.error('[run] Roster capture failed:', err.message);
      // non-fatal — continue to event stats
    }

    // 2. Event stats — roster.capture() left the game on main map
    const { eventType, pages } = await navigator.navigate();
    // ... rest of existing flow unchanged ...
  } finally {
    launcher.close();
  }
}
```

Roster failure is non-fatal: if it throws the game is still on the main map (or close to it) and event stats capture proceeds. If roster navigation leaves the game in an unexpected state, `navigator.navigate()` may also fail, but that is caught separately and the game still closes cleanly.

## Scheduler

`src/scheduler.js` cron expression changes from `50 2 * * *` to `45 2 * * *` (02:45 UTC daily). This fires 15 minutes before the event reset, leaving enough time for both roster and event stats captures to complete before scores clear.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Navigation click fails | `roster.capture()` throws; caught in `run()` as non-fatal |
| Vision parse fails after retries | Returns empty array for that scroll page; captured count will be low; sync proceeds with partial data |
| Captured count < 50% of existing `joined` members | Log a warning before sync; proceed anyway (human should verify) |
| PocketBase unavailable | Sync throws; CSV still written; error logged |

## Testing

Unit-testable functions in `src/roster.js`:

- `levenshteinDistance(a, b)` — standard string edit distance
- `similarity(a, b)` — normalized score wrapper
- `greedyMatch(captured, existing, threshold, ambiguityGap)` — returns `{ matched, newPlayers, departed, ambiguous }` given two arrays of names and their precomputed scores
- `parseInfluence(str)` — converts `"83.5M"` → `83500000`

The sync logic (`syncToPocketBase`) and navigation (`navigate`, `scrollAndCapture`) are not unit tested — they require live PocketBase and a running game respectively.

## Phase 2 — Event Stats Attribution (out of scope for current implementation)

> **Prerequisite:** Roster capture must be running reliably in production before this phase begins.

Once the roster is stable, each event stats record in `topHeroesEventRecords` will be attributed to its matching roster entry by storing the roster record's PocketBase `id`.

### Schema change

Add one nullable field to `topHeroesEventRecords`:

| Field | Type | Example | Notes |
|---|---|---|---|
| `roster_id` | string | `"abc123xyz"` | PocketBase id of the matching `guildRoster` record; `null` if no confident match |

### Attribution logic

After `roster.capture()` runs and the in-memory roster records are available, the enrichment step in `run()` passes the roster into the event stats writer. For each event record, a fuzzy name lookup is performed against the current session's captured roster (already in memory — no extra PocketBase fetch needed):

1. Compute `similarity(eventRecord.player_name, rosterEntry.player_name)` for all roster entries
2. Apply the same one-to-one greedy assignment and ambiguity guard used in roster sync (reuse the shared `greedyMatch` utility from `roster.js`)
3. If a confident, unambiguous match is found: set `roster_id` to that roster entry's PocketBase `id`
4. If no match or ambiguous: set `roster_id` to `null`; log the unmatched name

The same `rosterMatchThreshold` and `rosterAmbiguityGap` config values are reused.

### Implementation notes

- `greedyMatch` is exported from `roster.js` so `index.js` can import it without duplicating the algorithm
- Roster records passed to attribution must include their PocketBase `id` field (returned by `getFullList()` in the sync step)
- If roster capture failed for the current run, `roster_id` is `null` for all event records that run — no attribution attempted on a failed roster
- Existing event records are not backfilled; attribution applies only to records written after Phase 2 ships
