jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({ pid: 12345, kill: jest.fn() }),
  execSync: jest.fn(),
}));
jest.mock('../src/capturer', () => ({ capture: jest.fn() }));
jest.mock('../src/extractor', () => ({ detectGameState: jest.fn() }));

const { spawn, execSync } = require('child_process');
const capturer = require('../src/capturer');
const extractor = require('../src/extractor');
const launcher = require('../src/launcher');

beforeEach(() => {
  jest.clearAllMocks();
  launcher._reset();
});

describe('launcher.launch', () => {
  test('spawns the game process using configured path', async () => {
    execSync.mockReturnValue('1'); // window visible immediately
    capturer.capture.mockResolvedValue(Buffer.from('img'));
    extractor.detectGameState.mockResolvedValue({ isMainMap: true, eventTitle: null });

    await launcher.launch();

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('TopHeroes'),
      [],
      expect.objectContaining({ detached: true })
    );
  });

  test('throws if window does not appear within timeout', async () => {
    execSync.mockReturnValue('0'); // window never appears
    launcher._setTimeouts(100, 100); // short timeouts for test

    await expect(launcher.launch()).rejects.toThrow('timed out waiting for window');
  });

  test('throws if main map not detected within load timeout', async () => {
    execSync.mockReturnValue('1'); // window visible
    capturer.capture.mockResolvedValue(Buffer.from('img'));
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: null });
    launcher._setTimeouts(5000, 100); // load timeout is short

    await expect(launcher.launch()).rejects.toThrow('timed out waiting for game to load');
  });
});

describe('launcher.close', () => {
  test('kills the spawned process', async () => {
    execSync.mockReturnValue('1');
    capturer.capture.mockResolvedValue(Buffer.from('img'));
    extractor.detectGameState.mockResolvedValue({ isMainMap: true, eventTitle: null });

    await launcher.launch();
    launcher.close();

    const proc = spawn.mock.results[0].value;
    expect(proc.kill).toHaveBeenCalled();
  });

  test('does not throw if no process was launched', () => {
    expect(() => launcher.close()).not.toThrow();
  });
});
