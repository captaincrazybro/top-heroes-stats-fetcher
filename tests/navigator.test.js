jest.setTimeout(60000);

jest.mock('@nut-tree-fork/nut-js', () => ({
  mouse: {
    setPosition: jest.fn().mockResolvedValue(undefined),
    leftClick: jest.fn().mockResolvedValue(undefined),
    pressButton: jest.fn().mockResolvedValue(undefined),
    releaseButton: jest.fn().mockResolvedValue(undefined),
  },
  keyboard: {
    pressKey: jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key: { LeftAlt: 'LeftAlt', Return: 'Return' },
  Button: { LEFT: 'LEFT' },
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

  test('throws on unrecognized event title', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Unknown Event' });
    await expect(navigator.detectEventType(img)).rejects.toThrow('Unrecognized event title');
  });
});

describe('navigator.scrollAndCapture', () => {
  test('stops when last visible rank matches highest rank seen (end of list)', async () => {
    const page1 = [{ rank: 1, player_name: 'A', score: 100 }, { rank: 2, player_name: 'B', score: 90 }];
    const page2 = [{ rank: 2, player_name: 'B', score: 90 }, { rank: 3, player_name: 'C', score: 80 }];
    const page3 = [{ rank: 3, player_name: 'C', score: 80 }]; // lastVisible.rank (3) === highestRankSeen (3) → stop

    extractor.extractRankings
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3);

    const [allEntries] = await navigator.scrollAndCapture();

    expect(allEntries).toHaveLength(3); // A, B, C deduplicated
    expect(mouse.pressButton).toHaveBeenCalledTimes(2); // dragged twice (page1→2, page2→3)
    expect(mouse.releaseButton).toHaveBeenCalledTimes(2);
  });

  test('stops and trims entries when a rank exceeds maxRank', async () => {
    const page1 = [{ rank: 198, player_name: 'A', score: 50 }, { rank: 199, player_name: 'B', score: 40 }];
    const page2 = [{ rank: 200, player_name: 'C', score: 30 }, { rank: 201, player_name: 'D', score: 20 }];

    extractor.extractRankings
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const [allEntries] = await navigator.scrollAndCapture(200);

    expect(allEntries.map(e => e.rank)).toEqual([198, 199, 200]); // 201 excluded
    expect(mouse.pressButton).toHaveBeenCalledTimes(1); // only one drag before cutoff
  });

  test('calculates recovery drags from rank gap: ceil((highestSeen - lastVisible) / 5) + 1', async () => {
    // highestRankSeen = 20; glitch page shows rank 1–5 (lastVisible = 5)
    // rankDiff = 20 - 5 = 15 → ceil(15/5) + 1 = 3 + 1 = 4 recovery drags
    const normalPage   = [{ rank: 20, player_name: 'X', score: 50 }];
    const glitchPage   = [
      { rank: 1, player_name: 'A', score: 999 },
      { rank: 5, player_name: 'B', score: 900 },
    ];
    const recoveryPage = [{ rank: 21, player_name: 'Y', score: 40 }];
    const endPage      = [{ rank: 21, player_name: 'Y', score: 40 }]; // lastVisible.rank (21) === highestRankSeen (21) → stop

    extractor.extractRankings
      .mockResolvedValueOnce(normalPage)
      .mockResolvedValueOnce(glitchPage)
      .mockResolvedValueOnce(recoveryPage)
      .mockResolvedValueOnce(endPage);

    const [allEntries] = await navigator.scrollAndCapture();

    // Glitch entries (ranks 1, 5) excluded from output
    expect(allEntries.map(e => e.rank).sort((a, b) => a - b)).toEqual([20, 21]);
    // 1 normal drag + 4 recovery drags + 1 post-recovery drag = 6 total pressButton calls
    expect(mouse.pressButton).toHaveBeenCalledTimes(6);
  });
});
