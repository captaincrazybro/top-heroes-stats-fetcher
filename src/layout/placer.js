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
