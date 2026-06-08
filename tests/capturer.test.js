jest.mock('screenshot-desktop', () => jest.fn());

const screenshot = require('screenshot-desktop');
const capturer = require('../src/capturer');

describe('capturer', () => {
  test('capture() returns a Buffer', async () => {
    const fakeBuffer = Buffer.from('fake-png');
    screenshot.mockResolvedValue(fakeBuffer);

    const result = await capturer.capture();

    expect(screenshot).toHaveBeenCalledWith({ format: 'png' });
    expect(result).toBe(fakeBuffer);
  });

  test('capture() propagates errors from screenshot-desktop', async () => {
    screenshot.mockRejectedValue(new Error('no display'));

    await expect(capturer.capture()).rejects.toThrow('no display');
  });
});
