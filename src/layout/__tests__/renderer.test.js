'use strict';
const { isoToScreen, tilePolygonPoints, lerpColor, rankBadgeColor } = require('../renderer');

const CX = 700, TOP = 30;

describe('isoToScreen', () => {
  test('center tile (10,10) maps to (CX, TOP + 280)', () => {
    const { x, y } = isoToScreen(10, 10, CX, TOP);
    expect(x).toBe(CX);          // (10-10)*32 = 0
    expect(y).toBe(TOP + 280);   // (10+10)*14 = 280
  });

  test('top-corner tile (0,0) maps to (CX, TOP)', () => {
    const { x, y } = isoToScreen(0, 0, CX, TOP);
    expect(x).toBe(CX);
    expect(y).toBe(TOP);
  });

  test('right-corner tile (20,0) maps to (CX+640, TOP+280)', () => {
    const { x, y } = isoToScreen(20, 0, CX, TOP);
    expect(x).toBe(CX + 640);   // (20-0)*32 = 640
    expect(y).toBe(TOP + 280);  // (20+0)*14 = 280
  });
});

describe('tilePolygonPoints', () => {
  test('returns string of 4 coordinate pairs', () => {
    const pts = tilePolygonPoints(0, 0, CX, TOP);
    const pairs = pts.trim().split(/\s+/);
    expect(pairs.length).toBe(4);
  });

  test('top vertex is the isoToScreen point', () => {
    const { x, y } = isoToScreen(5, 3, CX, TOP);
    const pts = tilePolygonPoints(5, 3, CX, TOP);
    expect(pts).toContain(`${x},${y}`);
  });
});

describe('lerpColor', () => {
  test('t=0 returns first color', () => expect(lerpColor('#ff0000', '#00ff00', 0)).toBe('#ff0000'));
  test('t=1 returns second color', () => expect(lerpColor('#ff0000', '#00ff00', 1)).toBe('#00ff00'));
  test('t=0.5 returns midpoint', () => expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#7f7f7f'));
});

describe('rankBadgeColor', () => {
  test('R5 is gold', () => expect(rankBadgeColor('R5')).toBe('#FFD700'));
  test('R1 is blue', () => expect(rankBadgeColor('R1')).toBe('#3B82F6'));
  test('unknown rank returns grey', () => expect(rankBadgeColor('R9')).toBe('#888888'));
});
