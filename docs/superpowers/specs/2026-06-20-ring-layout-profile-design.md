# Ring Layout Profile — Design Spec

## Overview

Add a second castle layout profile accessible via `node generate-layout.js --ring` (npm: `npm run layout:ring`). The existing layout (`npm run layout`) is unchanged. The ring profile places castles in four concentric Chebyshev-distance bands ("rows"), with the strongest players placed in Row 2 and filling outward per priority order.

## Background

The existing layout places all active players sorted strongest-first into the outermost available positions (pure Chebyshev-descending candidate ordering). The ring profile instead constrains placement to four named rows, each exactly 2 Chebyshev units wide, and fills them in a specific priority order rather than strictly outside-in.

## Row Definitions

Rows are defined by the Chebyshev distance of a candidate's top-left corner from the grid center (tile 10, 10):

| Row | Chebyshev d | Description       | Fill order |
|-----|-------------|-------------------|------------|
| 2   | 7–8         | Strongest players | 1st        |
| 3   | 5–6         | Medium-strong     | 2nd        |
| 1   | 9–10        | Medium (outermost)| 3rd        |
| 4   | 3–4         | Weakest           | 4th        |

The center zone (d ≤ 2) is fully occupied by fixed structures and is never a candidate.

## Placement Algorithm

### Candidate Ordering (`generateRingCandidates`)

Same footprint validity as the existing `generateCandidates` (2×2 tiles, none occupied). Candidates are sorted:

1. **By row priority index** (Row 2 = 0, Row 3 = 1, Row 1 = 2, Row 4 = 3). Candidates outside all four rows are excluded.
2. **Within each row, by Euclidean distance from center descending** — this replicates the existing corner-preference behavior so the strongest players within Row 2 land at its corners first.

### Active Player Placement (`placeLayoutRing`)

Uses the same sorted player list as the existing layout (active AOE players first by score, then active non-AOE by score). Placement proceeds:

1. **AOE reserved spots** — unchanged: the four hardcoded `AOE_RESERVED_SPOTS` positions are filled with AOE buff players first, then backfilled with non-AOE players if AOE slots run out. Pair BFS runs after each AOE spot placement exactly as today.
2. **Remaining active players** — placed in ring-priority order (Row 2 first, overflow to Row 3, then Row 1, then Row 4). Pair BFS runs after each player is placed, same as existing.
3. **Inactive players** — placed using ring candidates in **reversed** priority (Row 4 first → Row 1 → Row 3 → Row 2) so they fill the weakest spots. This mirrors the existing layout's `.reverse()` behaviour.

### Unchanged Behaviour

- Fixed structures (fort, guild boss, guild buildings, barricades, arrow towers): identical positions
- `AOE_RESERVED_SPOTS`: identical positions
- Pair BFS (including multi-partner and chain placement): identical logic, uses `nearestCandidate` with orthogonal preference
- Renderer (`renderSVG`): called identically; no changes needed

## Entry Point Changes (`generate-layout.js`)

- Parse `process.argv` for the `--ring` flag
- Import both `placeLayout` (existing) and `placeLayoutRing` (new) from `placer.js`
- Call the appropriate function based on the flag
- Output filename: `guild-layout-ring-{date}.png` for ring profile, existing name unchanged

## Package.json

Add script:
```json
"layout:ring": "node generate-layout.js --ring"
```

## File Changes

| File | Change |
|------|--------|
| `src/layout/placer.js` | Add `generateRingCandidates(occupiedTiles)` and `placeLayoutRing(scoredPlayers)`; add both to `module.exports` |
| `generate-layout.js` | Parse `--ring` flag; route to appropriate placer function; adjust output filename |
| `package.json` | Add `layout:ring` script |
| `src/layout/__tests__/placer.test.js` | Add tests for `generateRingCandidates` sort order and `placeLayoutRing` row assignment |

## Out of Scope

- No changes to the renderer, scorer, fetcher, or any other module
- No changes to the existing `layout` script or its output
- No config changes needed for row boundaries (hardcoded to the 2-unit-wide bands)
