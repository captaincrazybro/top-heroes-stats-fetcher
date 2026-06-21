// src/layout/__tests__/placer.test.js
'use strict';
const { chebyshevDistance, generateCandidates, placeLayout, generateRingCandidates, placeLayoutRing } = require('../placer');

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

  test('max col+1 never exceeds 20, row+1 never exceeds 20', () => {
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

  test('AOE buff player is placed at an AOE reserved spot', () => {
    const players = [
      { player: { player_name: 'AoePlayer', rank: 'R2' }, score: 1000, inactive: false, hasAoeBuffs: true },
      { player: { player_name: 'Regular', rank: 'R2' }, score: 900, inactive: false, hasAoeBuffs: false },
    ];
    const AOE_SPOTS = [
      { col: 4, row: 4 },
      { col: 15, row: 4 },
      { col: 4, row: 15 },
      { col: 15, row: 15 },
    ];
    const { placements } = placeLayoutRing(players);
    const aoeCastle = placements.find(p => p.type === 'castle' && p.player && p.player.player_name === 'AoePlayer');
    expect(aoeCastle).toBeDefined();
    const onReservedSpot = AOE_SPOTS.some(s => s.col === aoeCastle.col && s.row === aoeCastle.row);
    expect(onReservedSpot).toBe(true);
  });
});
