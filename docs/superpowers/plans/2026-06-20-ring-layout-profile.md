# Ring Layout Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--ring` profile to the castle layout generator that places castles in four concentric Chebyshev-distance bands instead of the existing pure outside-in ordering.

**Architecture:** Two new functions are added to `placer.js` — `generateRingCandidates` (replaces `generateCandidates` for this profile) and `placeLayoutRing` (structurally identical to `placeLayout` but uses ring-ordered candidates). The entry point `generate-layout.js` reads a `--ring` flag and routes to the appropriate placer. All fixed structures, AOE reserved spots, pair BFS, and rendering are unchanged.

**Tech Stack:** Node.js (CommonJS), Jest for tests.

## Global Constraints

- Grid is 21×21; CENTER = 10; all castles are 2×2 footprints.
- Row bands (by Chebyshev distance of candidate top-left corner from center):
  - Row 2: d 7–8 — placed first (strongest)
  - Row 3: d 5–6 — placed second
  - Row 1: d 9–10 — placed third
  - Row 4: d 3–4 — placed fourth (weakest)
  - d ≤ 2: excluded (always occupied by fixed structures)
- Within each row band, sort by Euclidean distance from center descending (corner preference, same as existing).
- Inactive players use reversed ring priority (Row 4 first → Row 1 → Row 3 → Row 2) to fill weakest spots first — implemented identically to the existing `[...candidates].reverse()` pattern.
- AOE reserved spots are unchanged: `{ col:4, row:4 }`, `{ col:15, row:4 }`, `{ col:4, row:15 }`, `{ col:15, row:15 }`.
- Pair BFS logic is identical to `placeLayout` — only the candidate source changes to `generateRingCandidates`.
- Output filename for ring profile: `guild-layout-ring-{date}.png` / `.svg`.
- No changes to renderer, scorer, fetcher, or any module other than the three listed below.

---

## File Map

| File | Change |
|------|--------|
| `src/layout/placer.js` | Add `RING_PRIORITIES` constant, `ringPriority(d)` helper, `generateRingCandidates(occupiedTiles)`, `placeLayoutRing(scoredPlayers)`; export both new functions |
| `generate-layout.js` | Parse `--ring` flag; import and route to `placeLayoutRing`; add `-ring` profile suffix to output filenames |
| `package.json` | Add `"layout:ring": "node generate-layout.js --ring"` script |
| `src/layout/__tests__/placer.test.js` | Add `generateRingCandidates` and `placeLayoutRing` to import; add test suites for both |

---

## Task 1: `generateRingCandidates` in placer.js

**Files:**
- Modify: `src/layout/placer.js`
- Test: `src/layout/__tests__/placer.test.js`

**Interfaces:**
- Produces: `generateRingCandidates(occupiedTiles: Set<string>): Array<{col: number, row: number}>` — same shape as `generateCandidates`, but ordered by ring priority then Euclidean distance descending within each row.

- [ ] **Step 1: Add `generateRingCandidates` and `ringPriority` to the import in the test file**

In `src/layout/__tests__/placer.test.js`, change line 3:
```js
const { chebyshevDistance, generateCandidates, placeLayout, generateRingCandidates } = require('../placer');
```

- [ ] **Step 2: Write the failing tests for `generateRingCandidates`**

Append this `describe` block to `src/layout/__tests__/placer.test.js`:

```js
describe('generateRingCandidates', () => {
  test('excludes positions where any of the 4 footprint tiles is occupied', () => {
    const occupied = new Set(['2,2', '2,3', '3,2', '3,3']);
    const candidates = generateRingCandidates(occupied);
    expect(candidates.every(c => c.col !== 2 || c.row !== 2)).toBe(true);
  });

  test('excludes center-zone positions (d <= 2) even when occupied set is empty', () => {
    const candidates = generateRingCandidates(new Set());
    // (10,10) has d = max(0,0) = 0 — must not appear
    expect(candidates.some(c => c.col === 10 && c.row === 10)).toBe(false);
  });

  test('first candidate is in Row 2 (Chebyshev d 7-8) on an empty grid', () => {
    const candidates = generateRingCandidates(new Set());
    const { col, row } = candidates[0];
    const d = Math.max(Math.abs(col - 10), Math.abs(row - 10));
    expect(d).toBeGreaterThanOrEqual(7);
    expect(d).toBeLessThanOrEqual(8);
  });

  test('candidates are ordered Row2 (d7-8) → Row3 (d5-6) → Row1 (d9-10) → Row4 (d3-4)', () => {
    const candidates = generateRingCandidates(new Set());
    function priority(c) {
      const d = Math.max(Math.abs(c.col - 10), Math.abs(c.row - 10));
      if (d >= 7 && d <= 8) return 0;
      if (d >= 5 && d <= 6) return 1;
      if (d >= 9 && d <= 10) return 2;
      if (d >= 3 && d <= 4) return 3;
      return 4;
    }
    const priorities = candidates.map(priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
    }
  });

  test('max col+1 never exceeds 20, row+1 never exceeds 20', () => {
    const candidates = generateRingCandidates(new Set());
    expect(candidates.every(c => c.col + 1 <= 20 && c.row + 1 <= 20)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```
npx jest placer.test.js --no-coverage
```

Expected: 5 failures in the `generateRingCandidates` suite with `TypeError: generateRingCandidates is not a function`.

- [ ] **Step 4: Add `RING_PRIORITIES` constant to `placer.js`**

In `src/layout/placer.js`, after the `AOE_RESERVED_SPOTS` block (after line 44), insert:

```js
// Row fill priority for the ring layout profile.
// Each entry is [dMin, dMax]; index in array = priority (lower = placed first).
// Row 2 (d7-8) strongest, Row 3 (d5-6), Row 1 (d9-10), Row 4 (d3-4) weakest.
const RING_PRIORITIES = [
  [7, 8],   // Row 2
  [5, 6],   // Row 3
  [9, 10],  // Row 1
  [3, 4],   // Row 4
];
```

- [ ] **Step 5: Add `ringPriority(d)` helper to `placer.js`**

After the `distFromCenter` function (after line 72), insert:

```js
function ringPriority(d) {
  for (let i = 0; i < RING_PRIORITIES.length; i++) {
    const [lo, hi] = RING_PRIORITIES[i];
    if (d >= lo && d <= hi) return i;
  }
  return Infinity;
}
```

- [ ] **Step 6: Add `generateRingCandidates(occupiedTiles)` to `placer.js`**

After the `generateCandidates` function (after line 88), insert:

```js
function generateRingCandidates(occupiedTiles) {
  const candidates = [];
  for (let col = 0; col <= GRID_W - 2; col++) {
    for (let row = 0; row <= GRID_H - 2; row++) {
      const blocked =
        occupiedTiles.has(tileKey(col, row)) ||
        occupiedTiles.has(tileKey(col + 1, row)) ||
        occupiedTiles.has(tileKey(col, row + 1)) ||
        occupiedTiles.has(tileKey(col + 1, row + 1));
      if (blocked) continue;
      const d = Math.max(Math.abs(col - CENTER), Math.abs(row - CENTER));
      const priority = ringPriority(d);
      if (priority === Infinity) continue;
      candidates.push({ col, row, _p: priority, _d: distFromCenter(col, row) });
    }
  }
  candidates.sort((a, b) => a._p !== b._p ? a._p - b._p : b._d - a._d);
  return candidates.map(({ col, row }) => ({ col, row }));
}
```

- [ ] **Step 7: Export `generateRingCandidates`**

Change the last line of `src/layout/placer.js` from:

```js
module.exports = { chebyshevDistance, generateCandidates, placeLayout };
```

to:

```js
module.exports = { chebyshevDistance, generateCandidates, generateRingCandidates, placeLayout };
```

- [ ] **Step 8: Run tests to confirm they pass**

```
npx jest placer.test.js --no-coverage
```

Expected: all tests pass, including the new `generateRingCandidates` suite.

- [ ] **Step 9: Commit**

```
git add src/layout/placer.js src/layout/__tests__/placer.test.js
git commit -m "feat: add generateRingCandidates with ring-priority ordering"
```

---

## Task 2: `placeLayoutRing` in placer.js

**Files:**
- Modify: `src/layout/placer.js`
- Test: `src/layout/__tests__/placer.test.js`

**Interfaces:**
- Consumes: `generateRingCandidates` (from Task 1)
- Produces: `placeLayoutRing(scoredPlayers: ScoredPlayer[]): { placements, skipped, skippedInactive }` — identical return shape to `placeLayout`.

- [ ] **Step 1: Add `placeLayoutRing` to the import in the test file**

In `src/layout/__tests__/placer.test.js`, change the first line to:

```js
const { chebyshevDistance, generateCandidates, placeLayout, generateRingCandidates, placeLayoutRing } = require('../placer');
```

- [ ] **Step 2: Write the failing tests for `placeLayoutRing`**

Append this `describe` block to `src/layout/__tests__/placer.test.js`:

```js
describe('placeLayoutRing', () => {
  const mockPlayers = Array.from({ length: 5 }, (_, i) => ({
    player: { player_name: `P${i}`, rank: 'R2' },
    score: 1000 - i * 100,
    inactive: i >= 3,
    hasAoeBuffs: false,
  }));

  test('includes fort structure', () => {
    const { placements } = placeLayoutRing(mockPlayers);
    expect(placements.some(p => p.type === 'fort')).toBe(true);
  });

  test('includes 4 arrow towers', () => {
    const { placements } = placeLayoutRing(mockPlayers);
    expect(placements.filter(p => p.type === 'tower').length).toBe(4);
  });

  test('includes 6 guild buildings', () => {
    const { placements } = placeLayoutRing(mockPlayers);
    expect(placements.filter(p => p.type === 'building').length).toBe(6);
  });

  test('includes 4 barricades', () => {
    const { placements } = placeLayoutRing(mockPlayers);
    expect(placements.filter(p => p.type === 'barricade').length).toBe(4);
  });

  test('all player castles are on non-overlapping tiles', () => {
    const { placements } = placeLayoutRing(mockPlayers);
    const usedTiles = new Set();
    for (const p of placements.filter(p => p.type === 'castle')) {
      for (let dc = 0; dc < 2; dc++) {
        for (let dr = 0; dr < 2; dr++) {
          const key = `${p.col + dc},${p.row + dr}`;
          expect(usedTiles.has(key)).toBe(false);
          usedTiles.add(key);
        }
      }
    }
  });

  test('strongest active player is placed in Row 2 (Chebyshev d 7-8)', () => {
    const { placements } = placeLayoutRing(mockPlayers);
    const castles = placements.filter(p => p.type === 'castle');
    // P0 (score 1000) is strongest; find their placement
    const strongest = castles.find(p => p.player && p.player.player_name === 'P0');
    expect(strongest).toBeDefined();
    const d = Math.max(Math.abs(strongest.col - 10), Math.abs(strongest.row - 10));
    expect(d).toBeGreaterThanOrEqual(7);
    expect(d).toBeLessThanOrEqual(8);
  });

  test('returns skipped and skippedInactive arrays', () => {
    const { skipped, skippedInactive } = placeLayoutRing(mockPlayers);
    expect(Array.isArray(skipped)).toBe(true);
    expect(Array.isArray(skippedInactive)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```
npx jest placer.test.js --no-coverage
```

Expected: 7 failures in the `placeLayoutRing` suite with `TypeError: placeLayoutRing is not a function`.

- [ ] **Step 4: Add `placeLayoutRing` to `placer.js`**

After the closing brace of `placeLayout` and before `module.exports`, insert the full function. It is structurally identical to `placeLayout` with `generateRingCandidates` substituted for `generateCandidates`:

```js
function placeLayoutRing(scoredPlayers) {
  const occupied = new Set();

  markTiles(FORT.col, FORT.row, FORT.size, occupied);
  for (const b of GUILD_BUILDINGS) markTiles(b.col, b.row, b.size, occupied);
  for (const b of BARRICADES)      markTiles(b.col, b.row, b.size, occupied);
  for (const t of ARROW_TOWERS)    markTiles(t.col, t.row, t.size, occupied);
  markTiles(GUILD_BOSS.col, GUILD_BOSS.row, GUILD_BOSS.size, occupied);

  const placements = [FORT, GUILD_BOSS, ...GUILD_BUILDINGS, ...BARRICADES, ...ARROW_TOWERS];

  const activeAoe    = scoredPlayers.filter(p => !p.inactive && p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const activeNonAoe = scoredPlayers.filter(p => !p.inactive && !p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const inactive     = scoredPlayers.filter(p => p.inactive)
    .sort((a, b) => b.score - a.score);

  const pairLookup = new Map();
  for (const [a, b] of (config.playerPairs || [])) {
    if (!pairLookup.has(a)) pairLookup.set(a, []);
    if (!pairLookup.has(b)) pairLookup.set(b, []);
    pairLookup.get(a).push(b);
    pairLookup.get(b).push(a);
  }
  const allActiveById = new Map([
    ...activeAoe.map(sp => [sp.player.id, sp]),
    ...activeNonAoe.map(sp => [sp.player.id, sp]),
  ]);
  const placedIds = new Set();

  const aoeQueue    = [...activeAoe];
  const nonAoeQueue = [...activeNonAoe];

  for (const spot of AOE_RESERVED_SPOTS) {
    const spotBlocked =
      occupied.has(tileKey(spot.col, spot.row)) ||
      occupied.has(tileKey(spot.col + 1, spot.row)) ||
      occupied.has(tileKey(spot.col, spot.row + 1)) ||
      occupied.has(tileKey(spot.col + 1, spot.row + 1));
    if (spotBlocked) continue;

    if (aoeQueue.length === 0) continue;
    const sp = aoeQueue.shift();
    placedIds.add(sp.player.id);

    markTiles(spot.col, spot.row, 2, occupied);
    placements.push({ type: 'castle', col: spot.col, row: spot.row, size: 2, ...sp });

    const aoePairQueue = [{ id: sp.player.id, col: spot.col, row: spot.row }];
    while (aoePairQueue.length > 0) {
      const { id: fromId, col: fromCol, row: fromRow } = aoePairQueue.shift();
      for (const nextId of (pairLookup.get(fromId) || [])) {
        if (placedIds.has(nextId) || !allActiveById.has(nextId)) continue;
        const next = allActiveById.get(nextId);
        const chainCands = generateRingCandidates(occupied);
        const nearest = nearestCandidate(chainCands, fromCol, fromRow);
        if (!nearest) continue;
        markTiles(nearest.col, nearest.row, 2, occupied);
        placements.push({ type: 'castle', col: nearest.col, row: nearest.row, size: 2, ...next });
        placedIds.add(nextId);
        aoePairQueue.push({ id: nextId, col: nearest.col, row: nearest.row });
      }
    }
  }

  let candidates = generateRingCandidates(occupied);
  const activeAll = [...aoeQueue, ...nonAoeQueue];
  const skipped = [];

  for (const sp of activeAll) {
    if (placedIds.has(sp.player.id)) continue;
    if (candidates.length === 0) { skipped.push(sp); continue; }
    const pos = candidates.shift();
    markTiles(pos.col, pos.row, 2, occupied);
    candidates = candidates.filter(c =>
      !occupied.has(tileKey(c.col, c.row)) &&
      !occupied.has(tileKey(c.col + 1, c.row)) &&
      !occupied.has(tileKey(c.col, c.row + 1)) &&
      !occupied.has(tileKey(c.col + 1, c.row + 1))
    );
    placedIds.add(sp.player.id);
    placements.push({ type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp });

    const pairQueue = [{ id: sp.player.id, col: pos.col, row: pos.row }];
    while (pairQueue.length > 0) {
      const { id: fromId, col: fromCol, row: fromRow } = pairQueue.shift();
      for (const nextId of (pairLookup.get(fromId) || [])) {
        if (placedIds.has(nextId) || !allActiveById.has(nextId)) continue;
        const next = allActiveById.get(nextId);
        const nearest = nearestCandidate(candidates, fromCol, fromRow);
        if (!nearest) continue;
        markTiles(nearest.col, nearest.row, 2, occupied);
        candidates = candidates.filter(c =>
          !occupied.has(tileKey(c.col, c.row)) &&
          !occupied.has(tileKey(c.col + 1, c.row)) &&
          !occupied.has(tileKey(c.col, c.row + 1)) &&
          !occupied.has(tileKey(c.col + 1, c.row + 1))
        );
        placedIds.add(nextId);
        placements.push({ type: 'castle', col: nearest.col, row: nearest.row, size: 2, ...next });
        pairQueue.push({ id: nextId, col: nearest.col, row: nearest.row });
      }
    }
  }

  // Inactive players fill weakest spots first.
  // Reversing ring candidates gives Row4 → Row1 → Row3 → Row2 order.
  let innerCandidates = [...candidates].reverse();
  let inactivePlaced = 0;
  for (const sp of inactive) {
    if (innerCandidates.length === 0) break;
    const pos = innerCandidates.shift();
    markTiles(pos.col, pos.row, 2, occupied);
    innerCandidates = innerCandidates.filter(c =>
      !occupied.has(tileKey(c.col, c.row)) &&
      !occupied.has(tileKey(c.col + 1, c.row)) &&
      !occupied.has(tileKey(c.col, c.row + 1)) &&
      !occupied.has(tileKey(c.col + 1, c.row + 1))
    );
    placements.push({ type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp });
    inactivePlaced++;
  }
  const skippedInactive = inactive.slice(inactivePlaced);

  return { placements, skipped, skippedInactive };
}
```

- [ ] **Step 5: Export `placeLayoutRing`**

Change the `module.exports` line in `src/layout/placer.js` to:

```js
module.exports = { chebyshevDistance, generateCandidates, generateRingCandidates, placeLayout, placeLayoutRing };
```

- [ ] **Step 6: Run tests to confirm they pass**

```
npx jest placer.test.js --no-coverage
```

Expected: all tests pass, including the new `placeLayoutRing` suite.

- [ ] **Step 7: Commit**

```
git add src/layout/placer.js src/layout/__tests__/placer.test.js
git commit -m "feat: add placeLayoutRing with ring-ordered candidate placement"
```

---

## Task 3: Wire `--ring` flag into entry point and package.json

**Files:**
- Modify: `generate-layout.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `placeLayoutRing` from Task 2
- CLI: `node generate-layout.js --ring` → ring profile; no flag → standard profile (unchanged)

- [ ] **Step 1: Update `generate-layout.js`**

Replace the entire file with:

```js
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { fetchRoster }  = require('./src/layout/fetcher');
const { scorePlayers } = require('./src/layout/scorer');
const { placeLayout, placeLayoutRing } = require('./src/layout/placer');
const { renderSVG }    = require('./src/layout/renderer');

async function run() {
  const useRing = process.argv.includes('--ring');
  console.log(`[layout] Fetching guild roster... (profile: ${useRing ? 'ring' : 'standard'})`);
  const records = await fetchRoster();

  if (records.length === 0) {
    console.error('[layout] No joined members found in PocketBase. Aborting.');
    process.exit(1);
  }

  console.log(`[layout] ${records.length} members loaded.`);

  const scored = scorePlayers(records);
  const { placements, skipped, skippedInactive } = useRing
    ? placeLayoutRing(scored)
    : placeLayout(scored);

  const castlePlaced = placements.filter(p => p.type === 'castle').length;
  console.log(`[layout] Placed ${castlePlaced} / ${records.length} members.`);
  if (skipped.length > 0) {
    console.warn(`[layout] ${skipped.length} active player(s) skipped — grid full:`);
    for (const sp of skipped) console.warn(`  - ${sp.player.player_name}`);
  }
  if (skippedInactive.length > 0) {
    console.warn(`[layout] ${skippedInactive.length} inactive player(s) skipped — grid full:`);
    for (const sp of skippedInactive) console.warn(`  - ${sp.player.player_name}`);
  }

  const svg = renderSVG(placements);

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const profileSuffix = useRing ? '-ring' : '';
  const pngPath = path.join(outputDir, `guild-layout${profileSuffix}-${date}.png`);
  const svgPath = path.join(outputDir, `guild-layout${profileSuffix}-${date}.svg`);

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(pngPath, png);
    console.log(`[layout] PNG written to ${pngPath}`);
  } catch (err) {
    console.error('[layout] sharp rasterization failed:', err.message);
    fs.writeFileSync(svgPath, svg);
    console.log(`[layout] Raw SVG written to ${svgPath}`);
  }
}

run().catch(err => {
  console.error('[layout] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `layout:ring` script to `package.json`**

In `package.json`, inside the `"scripts"` object, add after the `"layout"` line:

```json
"layout:ring": "node generate-layout.js --ring",
```

The scripts block should look like:

```json
"scripts": {
  "start": "node index.js",
  "run-now": "node index.js --run-now",
  "run-roster": "node run-roster.js",
  "run-events": "node run-events.js",
  "layout": "node generate-layout.js",
  "layout:ring": "node generate-layout.js --ring",
  "install-service": "node install-service.js",
  "uninstall-service": "node uninstall-service.js",
  "test": "jest",
  "test:integration": "jest --config jest.integration.config.js"
},
```

- [ ] **Step 3: Run the full test suite to confirm nothing is broken**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add generate-layout.js package.json
git commit -m "feat: add --ring CLI flag and layout:ring npm script"
```
