const Anthropic = require('@anthropic-ai/sdk');
const extractor = require('../src/extractor');

const mockCreate = Anthropic._mockCreate;
const fakeBuffer = Buffer.from('fake-png');

function mockResponse(text) {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }] });
}

beforeEach(() => jest.clearAllMocks());

describe('extractor.detectGameState', () => {
  test('returns parsed state when Claude responds with valid JSON', async () => {
    mockResponse('{"isMainMap":true,"eventTitle":null}');
    const result = await extractor.detectGameState(fakeBuffer);
    expect(result).toEqual({ isMainMap: true, eventTitle: null });
  });

  test('parses eventTitle from event panel response', async () => {
    mockResponse('{"isMainMap":false,"eventTitle":"Guild Arms Race"}');
    const result = await extractor.detectGameState(fakeBuffer);
    expect(result).toEqual({ isMainMap: false, eventTitle: 'Guild Arms Race' });
  });

  test('retries once on bad JSON and returns null fallback on second failure', async () => {
    mockResponse('not valid json at all');
    const result = await extractor.detectGameState(fakeBuffer);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ isMainMap: false, eventTitle: null });
  });
});

describe('extractor.locateButton', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns {x, y} scaled by visionCoordScaleX/Y', async () => {
    mockResponse('{"x":1415,"y":100,"found":true}');
    const result = await extractor.locateButton(fakeBuffer, 'the Ranking button');
    // config.visionCoordScaleX/Y = 1: no scaling applied
    expect(result).toEqual({ x: 1415, y: 100 });
  });

  test('throws when Claude reports element not found', async () => {
    mockResponse('{"found":false}');
    await expect(extractor.locateButton(fakeBuffer, 'the Ranking button')).rejects.toThrow('Could not locate');
  });

  test('throws when Claude returns bad JSON', async () => {
    mockResponse('not json');
    await expect(extractor.locateButton(fakeBuffer, 'the Ranking button')).rejects.toThrow('Could not locate');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('extractor.extractRankings', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed player entries from valid Claude response', async () => {
    const entries = [
      { rank: 1, server: '#10607', guild_tag: 'WAR', player_name: 'CaptinLevi', score: 3876069 },
    ];
    mockResponse(JSON.stringify({ entries }));
    const result = await extractor.extractRankings(fakeBuffer);
    expect(result).toEqual(entries);
  });

  test('returns empty array after two failed parse attempts', async () => {
    mockResponse('garbage response');
    const result = await extractor.extractRankings(fakeBuffer);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });
});
