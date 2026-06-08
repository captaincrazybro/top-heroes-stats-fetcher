const fs = require('fs');
const path = require('path');
const os = require('os');

let state;
let tmpPath;

beforeEach(() => {
  tmpPath = path.join(os.tmpdir(), `state-test-${Date.now()}.json`);
  jest.resetModules();
  state = require('../src/state');
  state._setPath(tmpPath);
});

afterEach(() => {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
});

describe('state', () => {
  test('getGrEventStartDate returns null when file does not exist', () => {
    expect(state.getGrEventStartDate()).toBeNull();
  });

  test('setGrEventStartDate writes date; getGrEventStartDate reads it back', () => {
    state.setGrEventStartDate('2026-06-01');
    expect(state.getGrEventStartDate()).toBe('2026-06-01');
  });

  test('setGrEventStartDate overwrites existing value', () => {
    state.setGrEventStartDate('2026-06-01');
    state.setGrEventStartDate('2026-06-08');
    expect(state.getGrEventStartDate()).toBe('2026-06-08');
  });

  test('clearGrEventStartDate resets stored date to null', () => {
    state.setGrEventStartDate('2026-06-01');
    state.clearGrEventStartDate();
    expect(state.getGrEventStartDate()).toBeNull();
  });
});
