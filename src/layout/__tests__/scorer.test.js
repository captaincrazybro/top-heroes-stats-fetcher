'use strict';
const { computeScore, parseDaysOffline, scorePlayers } = require('../scorer');

describe('computeScore', () => {
  test('uses weighted blend when main_queue_influence is present', () => {
    expect(computeScore({ main_queue_influence: 1000, influence: 500 }))
      .toBeCloseTo(850);
  });

  test('falls back to influence when main_queue_influence is null', () => {
    expect(computeScore({ main_queue_influence: null, influence: 500 })).toBe(500);
  });

  test('falls back to influence when main_queue_influence is 0', () => {
    expect(computeScore({ main_queue_influence: 0, influence: 500 })).toBe(500);
  });

  test('falls back to influence when main_queue_influence is undefined', () => {
    expect(computeScore({ influence: 300 })).toBe(300);
  });
});

describe('parseDaysOffline', () => {
  test('"Online" returns 0', () => expect(parseDaysOffline('Online')).toBe(0));
  test('"5 min ago" returns 0', () => expect(parseDaysOffline('5 min ago')).toBe(0));
  test('"3 hours ago" returns 0', () => expect(parseDaysOffline('3 hours ago')).toBe(0));
  test('"4 days ago" returns 4', () => expect(parseDaysOffline('4 days ago')).toBe(4));
  test('"2 weeks ago" returns 14', () => expect(parseDaysOffline('2 weeks ago')).toBe(14));
  test('null returns Infinity', () => expect(parseDaysOffline(null)).toBe(Infinity));
  test('empty string returns Infinity', () => expect(parseDaysOffline('')).toBe(Infinity));
  test('unknown format returns Infinity', () => expect(parseDaysOffline('last Tuesday')).toBe(Infinity));
});

describe('scorePlayers', () => {
  test('marks player inactive when daysOffline > 7', () => {
    const result = scorePlayers([{ last_online: '10 days ago', influence: 100 }]);
    expect(result[0].inactive).toBe(true);
  });

  test('marks player active when daysOffline <= 7', () => {
    const result = scorePlayers([{ last_online: '7 days ago', influence: 100 }]);
    expect(result[0].inactive).toBe(false);
  });

  test('reads has_aoe_buffs field', () => {
    const result = scorePlayers([{ last_online: 'Online', influence: 100, has_aoe_buffs: true }]);
    expect(result[0].hasAoeBuffs).toBe(true);
  });
});
