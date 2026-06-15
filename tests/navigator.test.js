jest.setTimeout(60000);

jest.mock('@nut-tree-fork/nut-js', () => ({
  mouse: {
    config: { mouseSpeed: 500 },
    setPosition: jest.fn().mockResolvedValue(undefined),
    leftClick: jest.fn().mockResolvedValue(undefined),
    pressButton: jest.fn().mockResolvedValue(undefined),
    releaseButton: jest.fn().mockResolvedValue(undefined),
    move: jest.fn().mockResolvedValue(undefined),
    drag: jest.fn().mockResolvedValue(undefined),
  },
  keyboard: {
    pressKey: jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key: { LeftAlt: 'LeftAlt', Return: 'Return' },
  Button: { LEFT: 'LEFT' },
  straightTo: jest.fn(target => target),
}));
jest.mock('../src/capturer', () => ({ capture: jest.fn() }));
jest.mock('../src/extractor', () => ({
  detectGameState: jest.fn(),
  locateButton: jest.fn().mockResolvedValue({ x: 100, y: 200 }),
  extractRankings: jest.fn(),
}));

const { mouse } = require('@nut-tree-fork/nut-js');
const capturer = require('../src/capturer');
const extractor = require('../src/extractor');
const navigator = require('../src/navigator');

const img = Buffer.from('img');

beforeEach(() => {
  jest.clearAllMocks();
  capturer.capture.mockResolvedValue(img);
});

describe('navigator.detectEventType', () => {
  test('maps "Guild Arms Race" to GAR', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Guild Arms Race' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('GAR');
  });

  test('maps "Guild Race" to GR', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Guild Race' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('GR');
  });

  test('maps "Kingdom Duel" to KvK', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Kingdom Duel' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('KvK');
  });

  test('retries and succeeds when the first attempt returns an unrecognized title', async () => {
    extractor.detectGameState
      .mockResolvedValueOnce({ isMainMap: false, eventTitle: null })
      .mockResolvedValueOnce({ isMainMap: false, eventTitle: 'Guild Race' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('GR');
    expect(extractor.detectGameState).toHaveBeenCalledTimes(2);
  });

  test('throws on unrecognized event title after all retries', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Unknown Event' });
    await expect(navigator.detectEventType(img)).rejects.toThrow('Unrecognized event title');
    expect(extractor.detectGameState).toHaveBeenCalledTimes(3);
  });
});

describe('navigator.scrollAndCapture', () => {
  test('stops when highest visible rank wraps below the highest rank seen (end of list)', async () => {
    // After pre-loading, the game wraps back to the start when scrolled past the last entry.
    const page1 = [{ rank: 1, player_name: 'A', score: 100 }, { rank: 5, player_name: 'B', score: 90 }];
    const page2 = [{ rank: 5, player_name: 'B', score: 90 }, { rank: 10, player_name: 'C', score: 80 }];
    const page3 = [{ rank: 1, player_name: 'A', score: 100 }, { rank: 3, player_name: 'X', score: 50 }]; // max visible 3 < highestRankSeen 10 → wrapped, stop

    extractor.extractRankings
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3);

    const [allEntries] = await navigator.scrollAndCapture('GAR');

    expect(allEntries.map(e => e.rank).sort((a, b) => a - b)).toEqual([1, 5, 10]); // page3 not added
    expect(mouse.pressButton).toHaveBeenCalledTimes(2); // page1→2, page2→3; page3 triggers break
    expect(mouse.releaseButton).toHaveBeenCalledTimes(2);
  });

  test('stops and trims entries when a rank exceeds maxRank', async () => {
    const page1 = [{ rank: 198, player_name: 'A', score: 50 }, { rank: 199, player_name: 'B', score: 40 }];
    const page2 = [{ rank: 200, player_name: 'C', score: 30 }, { rank: 201, player_name: 'D', score: 20 }];

    extractor.extractRankings
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const [allEntries] = await navigator.scrollAndCapture('KvK', 200);

    expect(allEntries.map(e => e.rank)).toEqual([198, 199, 200]); // 201 excluded
    expect(mouse.pressButton).toHaveBeenCalledTimes(1); // one drag before cutoff
  });
});
