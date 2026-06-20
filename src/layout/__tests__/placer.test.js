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
