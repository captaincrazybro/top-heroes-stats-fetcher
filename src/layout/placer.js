// src/layout/placer.js
'use strict';
const config = require('../../config');

const GRID_W  = 21; // tile columns (0..GRID_W-1)
const GRID_H  = 21; // tile rows    (0..GRID_H-1)
const CENTER  = 10;

// Fixed structure definitions
const FORT       = { type: 'fort',       col: 9,  row: 9,  size: 3 };
const GUILD_BOSS = { type: 'guild-boss', col: 9,  row: 12, size: 2 };

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
  { type: 'barricade', col: 11, row: 12, size: 1 },
];

const ARROW_TOWERS = [
  { type: 'tower', col: 2,  row: 3,  size: 2 },
  { type: 'tower', col: 16, row: 2,  size: 2 },
  { type: 'tower', col: 3,  row: 17, size: 2 },
  { type: 'tower', col: 17, row: 16, size: 2 },
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

// Row fill priority for the ring layout profile.
// Each entry is [dMin, dMax]; index in array = priority (lower = placed first).
// Row 2 (d7-8) strongest, Row 3 (d5-6), Row 1 (d9-10), Row 4 (d3-4) weakest.
const RING_PRIORITIES = [
  [7, 8],   // Row 2
  [5, 6],   // Row 3
  [9, 10],  // Row 1
  [3, 4],   // Row 4
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

function nearestCandidate(candidates, refCol, refRow) {
  if (candidates.length === 0) return null;
  const orthogonal = candidates.filter(c => c.col === refCol || c.row === refRow);
  const pool = orthogonal.length > 0 ? orthogonal : candidates;
  let best = null, bestDist = Infinity;
  for (const c of pool) {
    const dist = Math.max(Math.abs(c.col - refCol), Math.abs(c.row - refRow));
    if (dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}

function distFromCenter(col, row) {
  return Math.hypot(col + 0.5 - CENTER, row + 0.5 - CENTER);
}

function ringPriority(d) {
  for (let i = 0; i < RING_PRIORITIES.length; i++) {
    const [lo, hi] = RING_PRIORITIES[i];
    if (d >= lo && d <= hi) return i;
  }
  return Infinity;
}

function generateCandidates(occupiedTiles) {
  const candidates = [];
  for (let col = 0; col <= GRID_W - 2; col++) {
    for (let row = 0; row <= GRID_H - 2; row++) {
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
      const ds = [
        Math.max(Math.abs(col - CENTER),     Math.abs(row - CENTER)),
        Math.max(Math.abs(col + 1 - CENTER), Math.abs(row - CENTER)),
        Math.max(Math.abs(col - CENTER),     Math.abs(row + 1 - CENTER)),
        Math.max(Math.abs(col + 1 - CENTER), Math.abs(row + 1 - CENTER)),
      ];
      const priority = ringPriority(ds[0]);
      if (priority === Infinity || ds.some(d => ringPriority(d) !== priority)) continue;
      candidates.push({ col, row, _p: priority, _d: distFromCenter(col, row) });
    }
  }
  candidates.sort((a, b) => a._p !== b._p ? a._p - b._p : b._d - a._d);
  return candidates.map(({ col, row }) => ({ col, row }));
}

function placeLayout(scoredPlayers) {
  const occupied = new Set();

  markTiles(FORT.col, FORT.row, FORT.size, occupied);
  for (const b of GUILD_BUILDINGS) markTiles(b.col, b.row, b.size, occupied);
  for (const b of BARRICADES)      markTiles(b.col, b.row, b.size, occupied);
  for (const t of ARROW_TOWERS)    markTiles(t.col, t.row, t.size, occupied);
  markTiles(GUILD_BOSS.col, GUILD_BOSS.row, GUILD_BOSS.size, occupied);

  const placements = [FORT, GUILD_BOSS, ...GUILD_BUILDINGS, ...BARRICADES, ...ARROW_TOWERS];

  // Sort active players by score descending; inactive go to inner positions last.
  const activeAoe    = scoredPlayers.filter(p => !p.inactive && p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const activeNonAoe = scoredPlayers.filter(p => !p.inactive && !p.hasAoeBuffs)
    .sort((a, b) => b.score - a.score);
  const inactive     = scoredPlayers.filter(p => p.inactive)
    .sort((a, b) => b.score - a.score);

  // Build pair lookup and full active-player map before any placement so pair
  // logic applies to both the AOE reserved-spot phase and the main active phase.
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
    placedIds.add(sp.player.id);

    markTiles(spot.col, spot.row, 2, occupied);
    placements.push({ type: 'castle', col: spot.col, row: spot.row, size: 2, ...sp });

    // BFS over pair graph: place all partners (and their partners) near their paired player.
    const aoePairQueue = [{ id: sp.player.id, col: spot.col, row: spot.row }];
    while (aoePairQueue.length > 0) {
      const { id: fromId, col: fromCol, row: fromRow } = aoePairQueue.shift();
      for (const nextId of (pairLookup.get(fromId) || [])) {
        if (placedIds.has(nextId) || !allActiveById.has(nextId)) continue;
        const next = allActiveById.get(nextId);
        const chainCands = generateCandidates(occupied);
        const nearest = nearestCandidate(chainCands, fromCol, fromRow);
        if (!nearest) continue;
        markTiles(nearest.col, nearest.row, 2, occupied);
        placements.push({ type: 'castle', col: nearest.col, row: nearest.row, size: 2, ...next });
        placedIds.add(nextId);
        aoePairQueue.push({ id: nextId, col: nearest.col, row: nearest.row });
      }
    }
  }

  // Remaining active players (excess AOE then non-AOE) fill outermost open positions.
  // If a player is part of a PLAYER_PAIRS entry, their partner is pulled from the
  // queue and placed at the nearest available position immediately after them.
  let candidates = generateCandidates(occupied);

  const activeAll = [...aoeQueue, ...nonAoeQueue];

  const skipped = [];

  for (const sp of activeAll) {
    if (placedIds.has(sp.player.id)) continue; // already placed as a pair partner
    if (candidates.length === 0) {
      skipped.push(sp);
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
    placedIds.add(sp.player.id);
    placements.push({ type: 'castle', col: pos.col, row: pos.row, size: 2, ...sp });

    // BFS over pair graph: place all partners (and their partners) near their paired player.
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

  // Inactive players fill innermost positions; skip all if the grid is full.
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

module.exports = { chebyshevDistance, generateCandidates, generateRingCandidates, placeLayout, placeLayoutRing };
