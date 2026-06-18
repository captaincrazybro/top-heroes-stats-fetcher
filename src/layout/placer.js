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

// Four hardcoded positions for AOE buff players, one per quadrant.
// Each zone is 9×9 (Chebyshev ≤ 4 from the castle's bottom tile), so pairwise
// distances of 10+ here mean no overlap. Adjust these to taste.
const AOE_RESERVED_SPOTS = [
  { col: 4,  row: 4  }, // top-left quadrant
  { col: 15, row: 4  }, // top-right quadrant
  { col: 4,  row: 15 }, // bottom-left quadrant
  { col: 15, row: 15 }, // bottom-right quadrant
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

function placeLayout(scoredPlayers) {
  const occupied = new Set();

  markTiles(FORT.col, FORT.row, FORT.size, occupied);
  for (const b of GUILD_BUILDINGS) markTiles(b.col, b.row, b.size, occupied);
  for (const b of BARRICADES)      markTiles(b.col, b.row, b.size, occupied);
  for (const t of ARROW_TOWERS)    markTiles(t.col, t.row, t.size, occupied);

  const placements = [FORT, ...GUILD_BUILDINGS, ...BARRICADES, ...ARROW_TOWERS];

  // Sort active players by score descending; inactive go to inner positions last.
  const activeAoe    = scoredPlayers.filter(p => !p.inactive && p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const activeNonAoe = scoredPlayers.filter(p => !p.inactive && !p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const inactive     = scoredPlayers.filter(p => p.inactive)
    .sort((a, b) => b.score - a.score);

  // Fill each reserved AOE spot: use AOE players first, backfill with non-AOE.
  const aoeQueue    = [...activeAoe];
  const nonAoeQueue = [...activeNonAoe];

  for (const spot of AOE_RESERVED_SPOTS) {
    const spotBlocked =
      occupied.has(tileKey(spot.col, spot.row)) ||
      occupied.has(tileKey(spot.col + 1, spot.row)) ||
      occupied.has(tileKey(spot.col, spot.row + 1)) ||
      occupied.has(tileKey(spot.col + 1, spot.row + 1));
    if (spotBlocked) continue;

    if (aoeQueue.length === 0) continue; // leave spot in candidate pool for regular placement
    const sp = aoeQueue.shift();

    markTiles(spot.col, spot.row, 2, occupied);
    placements.push({ type: 'castle', col: spot.col, row: spot.row, size: 2, ...sp });
  }

  // Remaining active players (excess AOE then non-AOE) fill outermost open positions.
  let candidates = generateCandidates(occupied);

  for (const sp of [...aoeQueue, ...nonAoeQueue]) {
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
    placements.push({ type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp });
  }

  // Inactive players fill innermost positions.
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
    placements.push({ type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp });
  }

  return { placements };
}

module.exports = { chebyshevDistance, generateCandidates, placeLayout };
