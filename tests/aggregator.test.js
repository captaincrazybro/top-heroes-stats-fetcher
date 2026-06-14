const aggregator = require('../src/aggregator');

const e = (overrides) => ({
  rank: 1, server: '#10607', guild_tag: 'WAR', player_name: 'Alpha', score: 100,
  ...overrides,
});

describe('aggregator.process', () => {
  test('flattens and deduplicates entries across scroll pages by rank', () => {
    const pages = [
      [e({ rank: 1, player_name: 'Alpha' }), e({ rank: 2, player_name: 'Beta' })],
      [e({ rank: 2, player_name: 'Beta' }),  e({ rank: 3, player_name: 'Gamma' })],
    ];
    const result = aggregator.process(pages, 'WAR');
    expect(result.map(r => r.player_name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('filters out entries whose guild_tag does not match', () => {
    const pages = [[
      e({ rank: 1, guild_tag: 'WAR', player_name: 'Friend' }),
      e({ rank: 2, guild_tag: 'FOE', player_name: 'Enemy' }),
    ]];
    const result = aggregator.process(pages, 'WAR');
    expect(result).toHaveLength(1);
    expect(result[0].player_name).toBe('Friend');
  });

  test('keeps only the first-seen entry when the same rank appears twice (OCR duplicate)', () => {
    const pages = [[
      e({ rank: 1, player_name: 'Alpha' }),
      e({ rank: 1, player_name: 'AlphaOCRVariant' }),
    ]];
    const result = aggregator.process(pages, 'WAR');
    expect(result).toHaveLength(1);
    expect(result[0].player_name).toBe('Alpha');
  });

  test('returns empty array for empty input', () => {
    expect(aggregator.process([], 'WAR')).toEqual([]);
  });
});
