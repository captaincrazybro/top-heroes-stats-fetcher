'use strict';

// ── Isometric coordinate math ─────────────────────────────────────────────────

function isoToScreen(col, row, cx, top) {
  return {
    x: (col - row) * 32 + cx,
    y: (col + row) * 10 + top,
  };
}

function tilePolygonPoints(col, row, cx, top) {
  const { x, y } = isoToScreen(col, row, cx, top);
  return `${x},${y} ${x + 32},${y + 10} ${x},${y + 20} ${x - 32},${y + 10}`;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerpColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const r = Math.floor(r1 + (r2 - r1) * t);
  const g = Math.floor(g1 + (g2 - g1) * t);
  const b = Math.floor(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const RANK_COLORS = { R5: '#FFD700', R4: '#C0C0C0', R3: '#CD7F32', R2: '#22C55E', R1: '#3B82F6' };

function rankBadgeColor(rank) {
  return RANK_COLORS[rank] || '#888888';
}

module.exports = { isoToScreen, tilePolygonPoints, lerpColor, hexToRgb, rankBadgeColor };
