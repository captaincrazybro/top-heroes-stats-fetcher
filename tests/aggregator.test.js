const aggregator = require('../src/aggregator');

const e = (overrides) => ({
  rank: 1, server: '#10607', guild_tag: 'WAR', player_name: 'Alpha', score: 100,
  ...overrides,
});

describe('aggregator.process', () => {
  test('flattens and deduplicates entries across scroll pages by player_name+server', () => {
    const pages = [
      [e({ player_name: 'Alpha' }), e({ player_name: 'Beta' })],
      [e({ player_name: 'Beta' }), e({ player_name: 'Gamma' })],
    ];
    const result = aggregator.process(pages, 'WAR');
    expect(result.map(r => r.player_name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('filters out entries whose guild_tag does not match', () => {
    const pages = [[
      e({ guild_tag: 'WAR', player_name: 'Friend' }),
      e({ guild_tag: 'FOE', player_name: 'Enemy' }),
    ]];
    const result = aggregator.process(pages, 'WAR');
    expect(result).toHaveLength(1);
    expect(result[0].player_name).toBe('Friend');
  });

  test('treats same player_name on different servers as distinct entries', () => {
    const pages = [[
      e({ player_name: 'Alpha', server: '#10607' }),
      e({ player_name: 'Alpha', server: '#10608' }),
    ]];
    const result = aggregator.process(pages, 'WAR');
    expect(result).toHaveLength(2);
  });

  test('returns empty array for empty input', () => {
    expect(aggregator.process([], 'WAR')).toEqual([]);
  });
});
