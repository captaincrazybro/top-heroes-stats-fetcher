// Mock sharp — returns the original buffer unchanged so tests don't need real PNG data.
const sharp = jest.fn(() => ({
  extract: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
}));

module.exports = sharp;
