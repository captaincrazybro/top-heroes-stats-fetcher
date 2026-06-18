# Guild Castle Layout Generator — Design Spec

## Overview

A standalone Node.js script (`generate-layout.js`) that reads the live guild roster from PocketBase, scores and ranks players by strength and activity, assigns them to positions on a 21×21 isometric castle territory grid, and renders the result as a timestamped PNG image (e.g. `output/guild-layout-2026-06-17.png`).

---

## Architecture

### Files

| File | Responsibility |
|---|---|
| `generate-layout.js` | Entry point — wires fetcher → scorer → placer → renderer, writes PNG |
| `src/layout/fetcher.js` | Fetches all joined members from `topHeroesGuildRoster` via PocketBase |
| `src/layout/scorer.js` | Computes strength score and activity status per player |
| `src/layout/placer.js` | Assigns players and fixed structures to grid tile positions |
| `src/layout/renderer.js` | Builds SVG string; calls `sharp` to rasterize to PNG |

### npm script

```json
"layout": "node generate-layout.js"
```

### Output

`output/guild-layout-YYYY-MM-DD.png` — timestamped, one file per run (overwrites same-day file).

---

## Grid & Coordinate System

### Tile grid

- 21×21 tile grid, all 441 tiles used
- Coordinate system: `(col, row)` where `(0,0)` is the top tip of the rendered diamond and `(20,20)` is the bottom tip
- Rendered using isometric projection to produce an elongated (left–right) diamond shape

### Isometric projection

Tile dimensions: **64px wide × 20px tall** (3.2:1 ratio — deliberately wider than standard 2:1 to produce the elongated diamond).

```
screen_x = (col - row) × 32 + CENTER_X
screen_y = (col + row) × 10 + TOP_PAD
```

Each tile is drawn as a `<polygon>` with 4 vertices:
- Top:    `(screen_x, screen_y)`
- Right:  `(screen_x + 32, screen_y + 10)`
- Bottom: `(screen_x, screen_y + 20)`
- Left:   `(screen_x - 32, screen_y + 10)`

**Canvas size:** approximately 1400 × 500px before padding (plus ~60px top/bottom for labels and legend).

### Fixed structure placements

| Structure | Size | Tile position |
|---|---|---|
| Guild fort | 3×3 | `(9,9)` → `(11,11)` — visual center of the grid |
| 6 guild buildings | 1×1 each | Tiles directly adjacent to the fort perimeter |
| 4 barricades | 1×1 each | Tiles directly adjacent to the fort perimeter |
| Arrow Tower (top) | 2×2 | `(2,2)` → `(3,3)` — just inside outer player ring |
| Arrow Tower (right) | 2×2 | `(17,2)` → `(18,3)` |
| Arrow Tower (left) | 2×2 | `(2,17)` → `(3,18)` |
| Arrow Tower (bottom) | 2×2 | `(17,17)` → `(18,18)` |

Arrow tower positions can be tuned during implementation to ensure one full layer of 2×2 player castles fits between them and the grid edge.

### Player castle tiles

- Each player castle occupies a **2×2** tile block
- Candidate positions: all valid non-overlapping 2×2 slots in tiles not occupied by fixed structures
- Ranked by Euclidean distance from center `(10,10)` — farther = higher strategic value

---

## Player Scoring

### Strength score

```
if main_queue_influence is non-null and non-zero:
  score = main_queue_influence × 0.7 + influence × 0.3
else:
  score = influence
```

### Activity

Parse `last_online` string into elapsed days:

| `last_online` value | Days |
|---|---|
| `"Online"` | 0 |
| `"X min ago"` | 0 |
| `"X hours ago"` | 0 |
| `"X days ago"` | X |
| `"X weeks ago"` | X × 7 |
| Missing / unparseable | treated as inactive |

**Inactive threshold:** > 7 days since last online.

### AOE buff

`has_aoe_buffs` is a boolean field already present on the `topHeroesGuildRoster` PocketBase collection, set manually per player. When `true`, the player's castle emits a 9×9 tile area-of-effect buff zone.

---

## Placement Algorithm

Executed in `src/layout/placer.js`:

1. **Mark fixed tiles** — fort, guild buildings, and arrow towers are placed first and their tiles marked unavailable.
2. **Generate candidate 2×2 positions** — all valid non-overlapping 2×2 slots from remaining tiles, sorted by descending distance from center (outer = index 0).
3. **Place non-AOE active players** — sorted by strength descending, assigned to positions starting from outermost.
4. **Place AOE buff players** — for each AOE player (in descending strength order), score every remaining position by counting how many already-placed castles have their center within 4 tiles (Chebyshev distance) of the candidate position's center (equivalent to a 9×9 tile range); assign to the highest-scoring slot. Ties broken by distance from center (outermost wins).
5. **Place inactive players** — sorted by strength descending, assigned to remaining positions starting from innermost (lowest strategic value first).

---

## Rendering

Implemented in `src/layout/renderer.js`. Produces an SVG string which is rasterized to PNG via `sharp`.

### SVG layer order (back to front)

1. Background fill (dark void)
2. Ground tiles — all 441 isometric diamonds
3. AoE zones — semi-transparent overlay polygons for each AOE buff player's 9×9 range
4. Structure fills — tiles colored by structure type
5. Icons — game-icons.net SVG paths, one per structure type, scaled and centered over the structure
6. Labels — player name + rank badge per castle
7. Legend — bottom corner, color/icon key

### Color scheme

| Element | Color |
|---|---|
| Ground tile | `#7C9A56` (grass green) |
| Guild fort | `#FFD700` (gold) |
| Arrow towers | `#6B7280` (steel gray) |
| Guild buildings | `#3B82F6` (blue) |
| Active castles | Gradient — `#DC2626` (strongest/outer) → `#84CC16` (weakest active/inner) |
| Inactive castles | `#9CA3AF` (muted gray) |
| AoE zone overlay | `rgba(0, 210, 210, 0.18)` (aqua, semi-transparent) |

Active castle color is interpolated linearly between the two endpoints based on the player's normalized rank among active players.

### Icons (game-icons.net, SVG paths embedded inline)

| Structure | Icon name |
|---|---|
| Guild fort | `military-fort` |
| Arrow towers | `watchtower` |
| Guild buildings (ranch) | `barn` |
| Guild buildings (territory decorations) | `tower` |
| Barricades | `stakes-fence` |
| Player castles (active and inactive) | `castle` |

Icons are scaled via `<g transform="translate(cx,cy) scale(s)">` to fit within the structure's isometric footprint. Exact icon paths are sourced from game-icons.net at implementation time and embedded as string constants in `renderer.js`.

### Labels

- **Player name:** white text, dark stroke, centered horizontally on the castle's screen midpoint, positioned above the castle
- **Rank badge:** small filled circle (colored by rank: R5=gold, R4=silver, R3=bronze, R2=green, R1=blue) with rank text
- **Inactive indicator:** `(away)` appended to name in muted style
- Font: system sans-serif (rendered by sharp's libvips text engine)

### Rasterization

```js
const png = await sharp(Buffer.from(svgString)).png().toBuffer();
await fs.promises.writeFile(outputPath, png);
```

---

## Data Flow

```
PocketBase (topHeroesGuildRoster)
  └─ fetcher.js        → raw player records (joined=true only)
  └─ scorer.js         → { player, score, inactive, hasAoeBuffs }[]
  └─ placer.js         → { structure, player?, tileX, tileY }[] grid assignment
  └─ renderer.js       → SVG string
  └─ sharp             → PNG buffer
  └─ fs.writeFile      → output/guild-layout-YYYY-MM-DD.png
```

---

## Configuration

No new config.js entries required. PocketBase connection reuses existing `config.pb` values. Output directory (`output/`) is created if it doesn't exist.

---

## Error Handling

- If PocketBase returns 0 joined members: exit with a clear error message, no image written.
- If a player's `last_online` cannot be parsed: log a warning, treat as inactive.
- If `main_queue_influence` is null/undefined/0: silently fall back to `influence` alone.
- If more players than available positions: log a warning, extra players are omitted from the layout (lowest-ranked inactive players dropped first).
- If sharp SVG rasterization fails: write the raw SVG to `output/guild-layout-YYYY-MM-DD.svg` instead and log an error.
