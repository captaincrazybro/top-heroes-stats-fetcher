# Guild Castle Layout Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a timestamped isometric PNG map of the guild's castle territory layout, pulling live player data from PocketBase and placing structures/players by strategic strength and activity.

**Architecture:** Six modules wire together in a straight pipeline — fetcher → scorer → placer → renderer → sharp → PNG. Each module has one responsibility and exports pure functions (except the fetcher which does I/O). The entry point (`generate-layout.js`) owns the async orchestration and file write.

**Tech Stack:** Node.js (CommonJS), PocketBase JS SDK, sharp (SVG→PNG rasterization), Jest (unit tests), game-icons.net (SVG path constants embedded inline)

---

## File Map

| File | Create/Modify | Purpose |
|---|---|---|
| `src/layout/fetcher.js` | Create | Fetch joined members from PocketBase |
| `src/layout/scorer.js` | Create | Compute strength score + activity per player |
| `src/layout/placer.js` | Create | Assign players and fixed structures to grid |
| `src/layout/renderer.js` | Create | Build SVG string, rasterize to PNG via sharp |
| `src/layout/__tests__/scorer.test.js` | Create | Unit tests for scorer |
| `src/layout/__tests__/placer.test.js` | Create | Unit tests for placer |
| `src/layout/__tests__/renderer.test.js` | Create | Unit tests for renderer utilities |
| `generate-layout.js` | Create | Entry point — orchestrates pipeline, writes PNG |
| `package.json` | Modify | Add `"layout"` npm script |

---

## Task 1: Fetcher

**Files:**
- Create: `src/layout/fetcher.js`

- [ ] **Step 1: Create the fetcher module**

```js
// src/layout/fetcher.js
'use strict';
const PocketBase = require('pocketbase').default;
const config = require('../../config');

async function fetchRoster() {
  const pb = new PocketBase(config.pb.url);
  await pb.collection('_superusers').authWithPassword(
    config.pb.email,
    config.pb.password
  );
  const records = await pb.collection(config.pb.rosterCollection).getFullList({
    filter: 'joined = true',
  });
  return records;
}

module.exports = { fetchRoster };
```

- [ ] **Step 2: Verify it loads without error**

Run: `node -e "require('./src/layout/fetcher'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/layout/fetcher.js
git commit -m "feat: add layout fetcher"
```

---

## Task 2: Scorer

**Files:**
- Create: `src/layout/scorer.js`
- Create: `src/layout/__tests__/scorer.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// src/layout/__tests__/scorer.test.js
'use strict';
const { computeScore, parseDaysOffline, scorePlayers } = require('../scorer');

describe('computeScore', () => {
  test('uses weighted blend when main_queue_influence is present', () => {
    expect(computeScore({ main_queue_influence: 1000, influence: 500 }))
      .toBeCloseTo(850);
  });

  test('falls back to influence when main_queue_influence is null', () => {
    expect(computeScore({ main_queue_influence: null, influence: 500 })).toBe(500);
  });

  test('falls back to influence when main_queue_influence is 0', () => {
    expect(computeScore({ main_queue_influence: 0, influence: 500 })).toBe(500);
  });

  test('falls back to influence when main_queue_influence is undefined', () => {
    expect(computeScore({ influence: 300 })).toBe(300);
  });
});

describe('parseDaysOffline', () => {
  test('"Online" returns 0', () => expect(parseDaysOffline('Online')).toBe(0));
  test('"5 min ago" returns 0', () => expect(parseDaysOffline('5 min ago')).toBe(0));
  test('"3 hours ago" returns 0', () => expect(parseDaysOffline('3 hours ago')).toBe(0));
  test('"4 days ago" returns 4', () => expect(parseDaysOffline('4 days ago')).toBe(4));
  test('"2 weeks ago" returns 14', () => expect(parseDaysOffline('2 weeks ago')).toBe(14));
  test('null returns Infinity', () => expect(parseDaysOffline(null)).toBe(Infinity));
  test('empty string returns Infinity', () => expect(parseDaysOffline('')).toBe(Infinity));
  test('unknown format returns Infinity', () => expect(parseDaysOffline('last Tuesday')).toBe(Infinity));
});

describe('scorePlayers', () => {
  test('marks player inactive when daysOffline > 7', () => {
    const result = scorePlayers([{ last_online: '10 days ago', influence: 100 }]);
    expect(result[0].inactive).toBe(true);
  });

  test('marks player active when daysOffline <= 7', () => {
    const result = scorePlayers([{ last_online: '7 days ago', influence: 100 }]);
    expect(result[0].inactive).toBe(false);
  });

  test('reads has_aoe_buffs field', () => {
    const result = scorePlayers([{ last_online: 'Online', influence: 100, has_aoe_buffs: true }]);
    expect(result[0].hasAoeBuffs).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest src/layout/__tests__/scorer.test.js --no-coverage`
Expected: FAIL — `Cannot find module '../scorer'`

- [ ] **Step 3: Implement the scorer**

```js
// src/layout/scorer.js
'use strict';

function computeScore(player) {
  const mqi = player.main_queue_influence;
  const inf = player.influence || 0;
  if (mqi != null && mqi !== 0) return mqi * 0.7 + inf * 0.3;
  return inf;
}

function parseDaysOffline(lastOnline) {
  if (!lastOnline || typeof lastOnline !== 'string') return Infinity;
  const s = lastOnline.trim();
  if (s === 'Online') return 0;
  let m;
  if ((m = s.match(/^(\d+)\s*min/i))) return 0;
  if ((m = s.match(/^(\d+)\s*hour/i))) return 0;
  if ((m = s.match(/^(\d+)\s*day/i))) return parseInt(m[1], 10);
  if ((m = s.match(/^(\d+)\s*week/i))) return parseInt(m[1], 10) * 7;
  return Infinity;
}

function scorePlayers(players) {
  return players.map(p => ({
    player: p,
    score: computeScore(p),
    daysOffline: parseDaysOffline(p.last_online),
    inactive: parseDaysOffline(p.last_online) > 7,
    hasAoeBuffs: !!p.has_aoe_buffs,
  }));
}

module.exports = { computeScore, parseDaysOffline, scorePlayers };
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest src/layout/__tests__/scorer.test.js --no-coverage`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/layout/scorer.js src/layout/__tests__/scorer.test.js
git commit -m "feat: add layout scorer"
```

---

## Task 3: Placer

**Files:**
- Create: `src/layout/placer.js`
- Create: `src/layout/__tests__/placer.test.js`

The placer assigns fixed structures to hardcoded positions, then distributes players across valid 2×2 candidate positions by strength and activity. Output is a flat array of placement objects consumed by the renderer.

- [ ] **Step 1: Write the failing tests**

```js
// src/layout/__tests__/placer.test.js
'use strict';
const { chebyshevDistance, generateCandidates, placeLayout } = require('../placer');

describe('chebyshevDistance', () => {
  test('same point = 0', () => expect(chebyshevDistance({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe(0));
  test('diagonal 4 = 4', () => expect(chebyshevDistance({ col: 0, row: 0 }, { col: 4, row: 4 })).toBe(4));
  test('horizontal 3 = 3', () => expect(chebyshevDistance({ col: 0, row: 2 }, { col: 3, row: 2 })).toBe(3));
});

describe('generateCandidates', () => {
  test('returns only positions where all 4 tiles are free', () => {
    const occupied = new Set(['0,0', '0,1', '1,0', '1,1']);
    const candidates = generateCandidates(occupied);
    expect(candidates.every(c => c.col !== 0 || c.row !== 0)).toBe(true);
  });

  test('top-left position (0,0) is present when grid is empty', () => {
    const candidates = generateCandidates(new Set());
    expect(candidates.some(c => c.col === 0 && c.row === 0)).toBe(true);
  });

  test('sorted so farther-from-center positions come first', () => {
    const candidates = generateCandidates(new Set());
    const d0 = Math.hypot(candidates[0].col + 0.5 - 10, candidates[0].row + 0.5 - 10);
    const dLast = Math.hypot(
      candidates[candidates.length - 1].col + 0.5 - 10,
      candidates[candidates.length - 1].row + 0.5 - 10
    );
    expect(d0).toBeGreaterThan(dLast);
  });

  test('max col+1 and row+1 never exceed 20', () => {
    const candidates = generateCandidates(new Set());
    expect(candidates.every(c => c.col + 1 <= 20 && c.row + 1 <= 20)).toBe(true);
  });
});

describe('placeLayout', () => {
  const mockPlayers = Array.from({ length: 5 }, (_, i) => ({
    player: { player_name: `P${i}`, rank: 'R2' },
    score: 1000 - i * 100,
    inactive: i >= 3,
    hasAoeBuffs: i === 1,
  }));

  test('includes fort structure', () => {
    const { placements } = placeLayout(mockPlayers);
    expect(placements.some(p => p.type === 'fort')).toBe(true);
  });

  test('includes 4 arrow towers', () => {
    const { placements } = placeLayout(mockPlayers);
    expect(placements.filter(p => p.type === 'tower').length).toBe(4);
  });

  test('includes 6 guild buildings', () => {
    const { placements } = placeLayout(mockPlayers);
    expect(placements.filter(p => p.type === 'building').length).toBe(6);
  });

  test('includes 4 barricades', () => {
    const { placements } = placeLayout(mockPlayers);
    expect(placements.filter(p => p.type === 'barricade').length).toBe(4);
  });

  test('all player castles are on non-overlapping tiles', () => {
    const { placements } = placeLayout(mockPlayers);
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
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest src/layout/__tests__/placer.test.js --no-coverage`
Expected: FAIL — `Cannot find module '../placer'`

- [ ] **Step 3: Implement the placer**

```js
// src/layout/placer.js
'use strict';

const GRID = 21;
const CENTER = 10;

// Fixed structure definitions
const FORT = { type: 'fort', col: 9, row: 9, size: 3 };

const GUILD_BUILDINGS = [
  { type: 'building', col: 8, row: 9,  size: 1, subtype: 'ranch' },
  { type: 'building', col: 8, row: 10, size: 1, subtype: 'decoration' },
  { type: 'building', col: 8, row: 11, size: 1, subtype: 'decoration' },
  { type: 'building', col: 12, row: 9,  size: 1, subtype: 'decoration' },
  { type: 'building', col: 12, row: 10, size: 1, subtype: 'decoration' },
  { type: 'building', col: 12, row: 11, size: 1, subtype: 'decoration' },
];

const BARRICADES = [
  { type: 'barricade', col: 9,  row: 8,  size: 1 },
  { type: 'barricade', col: 10, row: 8,  size: 1 },
  { type: 'barricade', col: 11, row: 8,  size: 1 },
  { type: 'barricade', col: 10, row: 12, size: 1 },
];

const ARROW_TOWERS = [
  { type: 'tower', col: 2,  row: 2,  size: 2 },
  { type: 'tower', col: 17, row: 2,  size: 2 },
  { type: 'tower', col: 2,  row: 17, size: 2 },
  { type: 'tower', col: 17, row: 17, size: 2 },
];

function tileKey(col, row) { return `${col},${row}`; }

function markTiles(col, row, size, set) {
  for (let dc = 0; dc < size; dc++)
    for (let dr = 0; dr < size; dr++)
      set.add(tileKey(col + dc, row + dr));
}

function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function distFromCenter(col, row) {
  return Math.hypot(col + 0.5 - CENTER, row + 0.5 - CENTER);
}

function generateCandidates(occupiedTiles) {
  const candidates = [];
  for (let col = 0; col <= GRID - 2; col++) {
    for (let row = 0; row <= GRID - 2; row++) {
      const blocked =
        occupiedTiles.has(tileKey(col, row)) ||
        occupiedTiles.has(tileKey(col + 1, row)) ||
        occupiedTiles.has(tileKey(col, row + 1)) ||
        occupiedTiles.has(tileKey(col + 1, row + 1));
      if (!blocked) candidates.push({ col, row });
    }
  }
  candidates.sort((a, b) => distFromCenter(b.col, b.row) - distFromCenter(a.col, a.row));
  return candidates;
}

function aoeScore(candidateCol, candidateRow, placedCastles) {
  const cc = { col: candidateCol + 0.5, row: candidateRow + 0.5 };
  return placedCastles.filter(c => {
    const pc = { col: c.col + 0.5, row: c.row + 0.5 };
    return chebyshevDistance(cc, pc) <= 4;
  }).length;
}

function placeLayout(scoredPlayers) {
  const occupied = new Set();

  // Mark all fixed structures
  markTiles(FORT.col, FORT.row, FORT.size, occupied);
  for (const b of GUILD_BUILDINGS) markTiles(b.col, b.row, b.size, occupied);
  for (const b of BARRICADES)      markTiles(b.col, b.row, b.size, occupied);
  for (const t of ARROW_TOWERS)    markTiles(t.col, t.row, t.size, occupied);

  const placements = [FORT, ...GUILD_BUILDINGS, ...BARRICADES, ...ARROW_TOWERS];

  const activeNonAoe = scoredPlayers.filter(p => !p.inactive && !p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const activeAoe    = scoredPlayers.filter(p => !p.inactive && p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const inactive     = scoredPlayers.filter(p => p.inactive)
    .sort((a, b) => b.score - a.score);

  let candidates = generateCandidates(occupied);

  const castles = [];

  // Assign non-AOE active players to outermost positions
  for (const sp of activeNonAoe) {
    if (candidates.length === 0) {
      console.warn(`[layout] No position available for ${sp.player.player_name}`);
      continue;
    }
    const pos = candidates.shift();
    markTiles(pos.col, pos.row, 2, occupied);
    candidates = candidates.filter(c =>
      !occupied.has(tileKey(c.col, c.row)) &&
      !occupied.has(tileKey(c.col + 1, c.row)) &&
      !occupied.has(tileKey(c.col, c.row + 1)) &&
      !occupied.has(tileKey(c.col + 1, c.row + 1))
    );
    const castle = { type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp };
    castles.push(castle);
    placements.push(castle);
  }

  // Assign AOE players to positions maximizing coverage
  for (const sp of activeAoe) {
    if (candidates.length === 0) {
      console.warn(`[layout] No position available for ${sp.player.player_name}`);
      continue;
    }
    let best = candidates[0], bestScore = -1;
    for (const c of candidates) {
      const s = aoeScore(c.col, c.row, castles);
      if (s > bestScore || (s === bestScore && distFromCenter(c.col, c.row) > distFromCenter(best.col, best.row))) {
        best = c; bestScore = s;
      }
    }
    candidates = candidates.filter(c => c !== best);
    markTiles(best.col, best.row, 2, occupied);
    candidates = candidates.filter(c =>
      !occupied.has(tileKey(c.col, c.row)) &&
      !occupied.has(tileKey(c.col + 1, c.row)) &&
      !occupied.has(tileKey(c.col, c.row + 1)) &&
      !occupied.has(tileKey(c.col + 1, c.row + 1))
    );
    const castle = { type: 'castle', col: best.col, row: best.row, size: 2, ...sp };
    castles.push(castle);
    placements.push(castle);
  }

  // Assign inactive players to innermost positions
  let innerCandidates = [...candidates].reverse();
  for (const sp of inactive) {
    if (innerCandidates.length === 0) {
      console.warn(`[layout] No position available for ${sp.player.player_name}`);
      continue;
    }
    const pos = innerCandidates.shift();
    markTiles(pos.col, pos.row, 2, occupied);
    innerCandidates = innerCandidates.filter(c =>
      !occupied.has(tileKey(c.col, c.row)) &&
      !occupied.has(tileKey(c.col + 1, c.row)) &&
      !occupied.has(tileKey(c.col, c.row + 1)) &&
      !occupied.has(tileKey(c.col + 1, c.row + 1))
    );
    const castle = { type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp };
    castles.push(castle);
    placements.push(castle);
  }

  return { placements };
}

module.exports = { chebyshevDistance, generateCandidates, placeLayout };
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest src/layout/__tests__/placer.test.js --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/layout/placer.js src/layout/__tests__/placer.test.js
git commit -m "feat: add layout placer"
```

---

## Task 4: Renderer Utilities

**Files:**
- Create: `src/layout/renderer.js` (utility functions only — full SVG in Task 5)
- Create: `src/layout/__tests__/renderer.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// src/layout/__tests__/renderer.test.js
'use strict';
const { isoToScreen, tilePolygonPoints, lerpColor, rankBadgeColor } = require('../renderer');

const CX = 700, TOP = 30;

describe('isoToScreen', () => {
  test('center tile (10,10) maps to (CX, TOP + 200)', () => {
    const { x, y } = isoToScreen(10, 10, CX, TOP);
    expect(x).toBe(CX);          // (10-10)*32 = 0
    expect(y).toBe(TOP + 200);   // (10+10)*10 = 200
  });

  test('top-corner tile (0,0) maps to (CX, TOP)', () => {
    const { x, y } = isoToScreen(0, 0, CX, TOP);
    expect(x).toBe(CX);
    expect(y).toBe(TOP);
  });

  test('right-corner tile (20,0) maps to (CX+640, TOP+200)', () => {
    const { x, y } = isoToScreen(20, 0, CX, TOP);
    expect(x).toBe(CX + 640);   // (20-0)*32 = 640
    expect(y).toBe(TOP + 200);  // (20+0)*10 = 200
  });
});

describe('tilePolygonPoints', () => {
  test('returns string of 4 coordinate pairs', () => {
    const pts = tilePolygonPoints(0, 0, CX, TOP);
    const pairs = pts.trim().split(/\s+/);
    expect(pairs.length).toBe(4);
  });

  test('top vertex is the isoToScreen point', () => {
    const { x, y } = isoToScreen(5, 3, CX, TOP);
    const pts = tilePolygonPoints(5, 3, CX, TOP);
    expect(pts).toContain(`${x},${y}`);
  });
});

describe('lerpColor', () => {
  test('t=0 returns first color', () => expect(lerpColor('#ff0000', '#00ff00', 0)).toBe('#ff0000'));
  test('t=1 returns second color', () => expect(lerpColor('#ff0000', '#00ff00', 1)).toBe('#00ff00'));
  test('t=0.5 returns midpoint', () => expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#7f7f7f'));
});

describe('rankBadgeColor', () => {
  test('R5 is gold', () => expect(rankBadgeColor('R5')).toBe('#FFD700'));
  test('R1 is blue', () => expect(rankBadgeColor('R1')).toBe('#3B82F6'));
  test('unknown rank returns grey', () => expect(rankBadgeColor('R9')).toBe('#888888'));
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest src/layout/__tests__/renderer.test.js --no-coverage`
Expected: FAIL — `Cannot find module '../renderer'`

- [ ] **Step 3: Implement renderer utilities**

```js
// src/layout/renderer.js
'use strict';

// ── Isometric coordinate math ─────────────────────────────────────────────────

function isoToScreen(col, row, cx, top) {
  return {
    x: (col - row) * 32 + cx,
    y: (col + row) * 10 + top,
  };
}

function tilePolygonPoints(col, row, cx, top) {
  const { x, y } = isoToScreen(col, row, cx, top);
  return `${x},${y} ${x + 32},${y + 10} ${x},${y + 20} ${x - 32},${y + 10}`;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerpColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const RANK_COLORS = { R5: '#FFD700', R4: '#C0C0C0', R3: '#CD7F32', R2: '#22C55E', R1: '#3B82F6' };

function rankBadgeColor(rank) {
  return RANK_COLORS[rank] || '#888888';
}

module.exports = { isoToScreen, tilePolygonPoints, lerpColor, hexToRgb, rankBadgeColor };
```

- [ ] **Step 4: Run to confirm tests pass**

Run: `npx jest src/layout/__tests__/renderer.test.js --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/layout/renderer.js src/layout/__tests__/renderer.test.js
git commit -m "feat: add renderer utilities"
```

---

## Task 5: SVG Renderer — Full Layout

**Files:**
- Modify: `src/layout/renderer.js` (add icon constants + `renderSVG` function)

**Before starting this task:** Source the SVG path data for each icon from game-icons.net:
1. Go to https://game-icons.net
2. Search for each icon name below, click it, then click the download arrow → "SVG"
3. Open the downloaded SVG file, copy the `d="..."` attribute value from the `<path>` element
4. Paste it as the value in the `ICONS` constant below

Icons needed: `military-fort`, `watchtower`, `barn`, `tower`, `stakes-fence`, `castle`

- [ ] **Step 1: Add icon path constants and structure color map to `renderer.js`**

Add after the existing `module.exports` line (replace the whole file bottom section):

```js
// ── Icon SVG paths (sourced from game-icons.net, CC BY 3.0) ──────────────────
// Replace each REPLACE_WITH_PATH_FROM_GAME_ICONS_NET string with the actual
// `d` attribute value from the downloaded SVG file for that icon.

const ICONS = {
  'military-fort':  'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'watchtower':     'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'barn':           'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'tower':          'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'stakes-fence':   'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'castle':         'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
};

const STRUCTURE_COLORS = {
  fort:       '#FFD700',
  tower:      '#6B7280',
  building:   '#3B82F6',
  barricade:  '#6B7280',
};

const STRUCTURE_ICONS = {
  fort:       'military-fort',
  tower:      'watchtower',
  barricade:  'stakes-fence',
};

function buildingIcon(subtype) {
  return subtype === 'ranch' ? 'barn' : 'tower';
}

function castleColor(sp, activeCount, activeRank) {
  if (sp.inactive) return '#9CA3AF';
  const t = activeCount > 1 ? activeRank / (activeCount - 1) : 0;
  return lerpColor('#DC2626', '#84CC16', t);
}
```

- [ ] **Step 2: Add the `renderSVG` function to `renderer.js`**

Append after the constants above (before `module.exports`):

```js
const CX = 700, TOP = 40;
const IMG_W = 1400, IMG_H = 560;
const LEGEND_Y = IMG_H - 80;

function structureVisualCenter(col, row, size) {
  const cc = col + (size - 1) / 2;
  const rc = row + (size - 1) / 2;
  const { x, y } = isoToScreen(cc, rc, CX, TOP);
  return { x, y: y + 10 }; // +10 = half tile height to reach tile mid-point
}

function iconSvg(iconName, cx, cy, iconSize) {
  const path = ICONS[iconName];
  if (!path || path.startsWith('REPLACE')) return '';
  const scale = iconSize / 512;
  const tx = cx - iconSize / 2;
  const ty = cy - iconSize;
  return `<g transform="translate(${tx},${ty}) scale(${scale})" fill="white" opacity="0.9"><path d="${path}"/></g>`;
}

function aoePolygon(col, row, cx, top) {
  // 9x9 range: extends 4 tiles in each direction from center of 2x2 castle
  const c0 = col - 4, r0 = row - 4;
  const c1 = col + 5, r1 = row + 5;
  // Bounding diamond of the 9x9 area
  const top_    = isoToScreen(c0,      r0,      cx, top);
  const right   = isoToScreen(c1,      r0,      cx, top);
  const bottom  = isoToScreen(c1,      r1,      cx, top);
  const left    = isoToScreen(c0,      r1,      cx, top);
  return `<polygon points="${top_.x},${top_.y} ${right.x + 32},${right.y + 10} ${bottom.x},${bottom.y + 20} ${left.x - 32},${left.y + 10}" fill="rgba(0,210,210,0.18)" stroke="rgba(0,210,210,0.5)" stroke-width="1"/>`;
}

function renderGroundTiles() {
  const tiles = [];
  for (let col = 0; col < 21; col++) {
    for (let row = 0; row < 21; row++) {
      tiles.push(`<polygon points="${tilePolygonPoints(col, row, CX, TOP)}" fill="#7C9A56" stroke="#6B8A47" stroke-width="0.5"/>`);
    }
  }
  return tiles.join('\n');
}

function renderStructureTiles(placement, color) {
  const tiles = [];
  for (let dc = 0; dc < placement.size; dc++) {
    for (let dr = 0; dr < placement.size; dr++) {
      tiles.push(`<polygon points="${tilePolygonPoints(placement.col + dc, placement.row + dr, CX, TOP)}" fill="${color}" stroke="#000" stroke-width="0.8" opacity="0.85"/>`);
    }
  }
  return tiles.join('\n');
}

function renderLabel(placement, cx, cy) {
  const name = placement.player?.player_name ?? '';
  const rank = placement.player?.rank ?? '';
  const badge = rankBadgeColor(rank);
  const inactive = placement.inactive;
  const displayName = inactive ? `${name} (away)` : name;
  const labelY = cy - (placement.size === 2 ? 52 : 36);
  return [
    `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="white" stroke="#000" stroke-width="2.5" paint-order="stroke">${displayName}</text>`,
    rank ? `<circle cx="${cx + 2}" cy="${labelY - 12}" r="7" fill="${badge}"/>` : '',
    rank ? `<text x="${cx + 2}" y="${labelY - 8}" text-anchor="middle" font-size="7" font-family="sans-serif" fill="white" font-weight="bold">${rank}</text>` : '',
  ].join('\n');
}

function renderLegend() {
  const items = [
    { color: '#FFD700', label: 'Guild Fort' },
    { color: '#6B7280', label: 'Arrow Tower / Barricade' },
    { color: '#3B82F6', label: 'Guild Building' },
    { color: '#DC2626', label: 'Active (strongest)' },
    { color: '#84CC16', label: 'Active (weakest)' },
    { color: '#9CA3AF', label: 'Inactive (>7 days)' },
    { color: 'rgba(0,210,210,0.5)', label: 'AOE Buff Zone' },
  ];
  return items.map((item, i) =>
    `<rect x="${20 + i * 170}" y="${LEGEND_Y}" width="12" height="12" fill="${item.color}"/>` +
    `<text x="${36 + i * 170}" y="${LEGEND_Y + 10}" font-size="10" font-family="sans-serif" fill="#ccc">${item.label}</text>`
  ).join('\n');
}

function renderSVG(placements) {
  const castles = placements.filter(p => p.type === 'castle');
  const activeCount = castles.filter(p => !p.inactive).length;
  let activeRank = 0;

  const layers = {
    ground: renderGroundTiles(),
    aoe: '',
    structures: '',
    icons: '',
    labels: '',
    legend: renderLegend(),
  };

  for (const p of placements) {
    let color, iconName, iconSize;

    if (p.type === 'castle') {
      const rank = p.inactive ? null : activeRank++;
      color = castleColor(p, activeCount, rank);
      iconName = 'castle';
      iconSize = 40;
    } else if (p.type === 'building') {
      color = STRUCTURE_COLORS.building;
      iconName = buildingIcon(p.subtype);
      iconSize = 28;
    } else {
      color = STRUCTURE_COLORS[p.type] || '#888';
      iconName = STRUCTURE_ICONS[p.type];
      iconSize = p.size === 3 ? 56 : p.size === 2 ? 40 : 24;
    }

    layers.structures += renderStructureTiles(p, color) + '\n';

    const { x: cx, y: cy } = structureVisualCenter(p.col, p.row, p.size);

    if (iconName) layers.icons += iconSvg(iconName, cx, cy, iconSize) + '\n';

    if (p.type === 'castle') {
      if (p.hasAoeBuffs) layers.aoe += aoePolygon(p.col, p.row, CX, TOP) + '\n';
      layers.labels += renderLabel(p, cx, cy) + '\n';
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}">
<rect width="${IMG_W}" height="${IMG_H}" fill="#1a1a2e"/>
${layers.ground}
${layers.aoe}
${layers.structures}
${layers.icons}
${layers.labels}
${layers.legend}
</svg>`;
}
```

- [ ] **Step 3: Update `module.exports` at the bottom of `renderer.js` to include `renderSVG`**

Replace the existing `module.exports` line:

```js
module.exports = { isoToScreen, tilePolygonPoints, lerpColor, hexToRgb, rankBadgeColor, renderSVG };
```

- [ ] **Step 4: Verify the module loads**

Run: `node -e "const r = require('./src/layout/renderer'); console.log(typeof r.renderSVG)"`
Expected: `function`

- [ ] **Step 5: Run all renderer tests to confirm nothing broke**

Run: `npx jest src/layout/__tests__/renderer.test.js --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/layout/renderer.js
git commit -m "feat: add SVG renderer with full layout generation"
```

---

## Task 6: Entry Point + npm Script

**Files:**
- Create: `generate-layout.js`
- Modify: `package.json`

- [ ] **Step 1: Create the entry point**

```js
// generate-layout.js
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { fetchRoster }  = require('./src/layout/fetcher');
const { scorePlayers } = require('./src/layout/scorer');
const { placeLayout }  = require('./src/layout/placer');
const { renderSVG }    = require('./src/layout/renderer');

async function run() {
  console.log('[layout] Fetching guild roster...');
  const records = await fetchRoster();

  if (records.length === 0) {
    console.error('[layout] No joined members found in PocketBase. Aborting.');
    process.exit(1);
  }

  console.log(`[layout] ${records.length} members loaded.`);

  const scored = scorePlayers(records);
  const { placements } = placeLayout(scored);
  const svg = renderSVG(placements);

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const pngPath = path.join(outputDir, `guild-layout-${date}.png`);
  const svgPath = path.join(outputDir, `guild-layout-${date}.svg`);

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

- [ ] **Step 2: Add npm script to `package.json`**

In `package.json`, add to the `"scripts"` object:

```json
"layout": "node generate-layout.js"
```

The scripts section should look like:

```json
"scripts": {
  "start": "node index.js",
  "run-now": "node index.js --run-now",
  "run-roster": "node run-roster.js",
  "run-events": "node run-events.js",
  "layout": "node generate-layout.js",
  "install-service": "node install-service.js",
  "uninstall-service": "node uninstall-service.js",
  "test": "jest",
  "test:integration": "jest --config jest.integration.config.js"
}
```

- [ ] **Step 3: Verify the script loads without error (does not run — no PocketBase needed)**

Run: `node -e "require('./generate-layout')" 2>&1 | head -1`

If PocketBase is not reachable it will error after fetch — that is expected. The goal is just to confirm it imports cleanly without a syntax error.

- [ ] **Step 4: Run the full test suite to confirm nothing regressed**

Run: `npm test`
Expected: All previously passing tests still pass

- [ ] **Step 5: Commit**

```bash
git add generate-layout.js package.json
git commit -m "feat: add castle layout generator entry point and npm script"
```

---

## Verification

After all tasks are complete, do a live end-to-end run against PocketBase:

```bash
npm run layout
```

Expected:
- Console logs member count, placement summary
- `output/guild-layout-<today>.png` is created
- Open the PNG — diamond grid visible, fort at center, towers at corners, player names and rank badges on castles, AOE zones shown for relevant players

If the PNG looks wrong but the SVG was also written, open `output/guild-layout-<today>.svg` in a browser for easier debugging of the layout logic.
