# Guild Roster Capture Design

**Date:** 2026-06-14
**Status:** Approved
**Repo:** `top-heroes-stats-fetcher`

## Overview

An additional routine that captures the full guild member roster from the Members screen after each daily event stats fetch. The game is already open at that point, so no extra launch is needed. Results are written to a new `guildRoster` PocketBase collection and a daily CSV snapshot. The roster is synced (not just appended) — departed members are deleted using a fuzzy-matched diff so that the collection always reflects the live roster.

## Module Structure

One new file owns the entire roster pipeline. Existing modules are untouched.

```
src/
  roster.js          — new: navigate → scroll/capture → sync → write
  writers/
    csv.js           — existing, unchanged
    pocketbase.js    — existing, unchanged
config.js            — five new fields added
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
| `syncToPocketBase(records, capturedAt)` | Fetch existing roster, fuzzy diff, upsert matches, insert new, delete departed |

## Navigation Flow

Runs after event stats are written, while the game is still open.

1. **Click back button** — closes the rankings panel, returns to main map (`rosterBackButtonX/Y`)
2. **Click guild button** — opens the guild panel (`guildButtonX/Y`)
3. **Click members button** — opens the Members screen (`membersPanelButtonX/Y`)
4. **Scroll and capture loop** — no pre-load needed; the members list does not use the same scroll buffer as the rankings list
5. **Stop** — when a full scroll pass yields no player names not already seen
6. **Sync to PocketBase + write CSV**

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
| `captured_at` | datetime | auto | Set by PocketBase on create/update |

The collection must have the view rule set to empty string (public read) so the stats UI can query it in future.

### CSV

Written to `output/roster-<YYYY-MM-DD>-<timestamp>.csv` with the same six fields plus `captured_at` supplied from the run timestamp. One file per daily run, never mutated after write.

## Roster Sync Algorithm

After the scroll loop completes, `syncToPocketBase(capturedRecords, capturedAt)` runs:

### Step 1 — Fetch existing

```js
const existing = await pb.collection('guildRoster').getFullList();
```

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

Ambiguous matches are **not merged and not deleted** — the existing record is left untouched and the captured entry is logged as ambiguous. This is intentionally conservative: a false-new is recoverable; a false-merge silently corrupts data.

### Step 5 — Apply changes

| Case | Action |
|---|---|
| Matched, score ≥ threshold, unambiguous | Update existing record with fresh fields |
| No match found (score below threshold) | Insert as new record |
| Existing record not matched by any captured name | Delete from PocketBase |
| Ambiguous match | Log warning; leave existing record; skip insert |

Match threshold: `config.rosterMatchThreshold` (default `0.85`).

### Step 6 — Log summary

```
[roster] 91 matched, 2 new, 1 deleted, 1 ambiguous (review log)
```

## Config Additions

```js
// Navigation coords — UPDATE to match your screen
rosterBackButtonX: 538,      // ← back arrow at bottom-left of rankings screen
rosterBackButtonY: 787,
guildButtonX: 0,             // guild icon on main map — UPDATE
guildButtonY: 0,
membersPanelButtonX: 0,      // members tab inside guild panel — UPDATE
membersPanelButtonY: 0,

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
// After event stats written, game still open:
try {
  const { records, capturedAt } = await roster.capture();
  await csvWriter.writeRoster(records, capturedAt);
  console.log(`[run] Roster: ${records.length} members captured`);
} catch (err) {
  console.error('[run] Roster capture failed:', err.message);
  // non-fatal — launcher.close() still runs
} finally {
  launcher.close();
}
```

Roster failure is best-effort: if it throws, the event stats (already written) are not affected and the game still closes cleanly.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Navigation click fails | `roster.capture()` throws; caught in `run()` as non-fatal |
| Vision parse fails after retries | Returns empty array for that scroll page; captured count will be low; sync proceeds with partial data |
| Captured count < 50% of existing | Log a warning before sync; proceed anyway (human should verify) |
| PocketBase unavailable | Sync throws; CSV still written; error logged |

## Testing

Unit-testable functions in `src/roster.js`:

- `levenshteinDistance(a, b)` — standard string edit distance
- `similarity(a, b)` — normalized score wrapper
- `greedyMatch(captured, existing, threshold, ambiguityGap)` — returns `{ matched, newPlayers, toDelete, ambiguous }` given two arrays of names and their precomputed scores
- `parseInfluence(str)` — converts `"83.5M"` → `83500000`

The sync logic (`syncToPocketBase`) and navigation (`navigate`, `scrollAndCapture`) are not unit tested — they require live PocketBase and a running game respectively.
