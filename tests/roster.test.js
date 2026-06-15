const { levenshteinDistance, similarity, parseInfluence, greedyMatch } = require('../src/roster');

describe('levenshteinDistance', () => {
  test('identical strings → 0', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });
  test('empty vs non-empty → length of non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
  test('single substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });
  test('single insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });
  test('single deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });
  test('completely different strings same length', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('similarity', () => {
  test('identical strings → 1.0', () => {
    expect(similarity('Nyra', 'Nyra')).toBe(1.0);
  });
  test('case insensitive', () => {
    expect(similarity('Nyra', 'nyra')).toBe(1.0);
  });
  test('completely different strings same length → 0.0', () => {
    expect(similarity('abc', 'xyz')).toBe(0.0);
  });
  test('one char off on a 4-char string → 0.75', () => {
    expect(similarity('Nyra', 'Nyda')).toBeCloseTo(0.75);
  });
});

describe('parseInfluence', () => {
  test('M suffix', () => {
    expect(parseInfluence('341M')).toBe(341_000_000);
  });
  test('decimal M suffix', () => {
    expect(parseInfluence('83.5M')).toBe(83_500_000);
  });
  test('K suffix', () => {
    expect(parseInfluence('500K')).toBe(500_000);
  });
  test('B suffix', () => {
    expect(parseInfluence('1.5B')).toBe(1_500_000_000);
  });
  test('plain number string', () => {
    expect(parseInfluence('341000000')).toBe(341_000_000);
  });
  test('number type passthrough', () => {
    expect(parseInfluence(341_000_000)).toBe(341_000_000);
  });
  test('unrecognized format → 0', () => {
    expect(parseInfluence('???')).toBe(0);
  });
});

describe('greedyMatch', () => {
  test('exact match → matched', () => {
    const r = greedyMatch(['Nyra'], ['Nyra'], 0.85);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0]).toMatchObject({ capturedIndex: 0, existingIndex: 0 });
    expect(r.newPlayers).toHaveLength(0);
    expect(r.departed).toHaveLength(0);
  });

  test('below-threshold captured → newPlayer', () => {
    const r = greedyMatch(['Zyxqwv'], ['Nyra'], 0.85);
    expect(r.matched).toHaveLength(0);
    expect(r.newPlayers).toEqual([0]);
    expect(r.departed).toEqual([0]);
  });

  test('unmatched existing → departed', () => {
    const r = greedyMatch(['Alice'], ['Alice', 'Bob'], 0.85);
    expect(r.matched).toHaveLength(1);
    expect(r.departed).toEqual([1]);
  });

  test('one-to-one: two captures cannot both claim same existing', () => {
    // 'Alexandrow' (ci=1) scores 1.0; 'Alexandros' (ci=0) scores 0.9 — existing is taken first
    const r = greedyMatch(['Alexandros', 'Alexandrow'], ['Alexandrow'], 0.85);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].capturedIndex).toBe(1);
    expect(r.newPlayers).toContain(0);
    expect(r.departed).toHaveLength(0);
  });

  test('empty captured → all existing departed', () => {
    const r = greedyMatch([], ['Alice', 'Bob'], 0.85);
    expect(r.matched).toHaveLength(0);
    expect(r.departed).toEqual([0, 1]);
  });

  test('empty existing → all captured new', () => {
    const r = greedyMatch(['Alice', 'Bob'], [], 0.85);
    expect(r.matched).toHaveLength(0);
    expect(r.newPlayers).toEqual([0, 1]);
  });
});
