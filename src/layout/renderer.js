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

// ── Icon SVG paths (sourced from game-icons.net, CC BY 3.0) ──────────────────
// Replace each REPLACE_WITH_PATH_FROM_GAME_ICONS_NET string with the actual
// `d` attribute value from the downloaded SVG file for that icon.

const ICONS = {
  'military-fort':  'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'watchtower':     'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'barn':           'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'tower':          'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'stakes-fence':   'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
  'castle':         'REPLACE_WITH_PATH_FROM_GAME_ICONS_NET',
};

const STRUCTURE_COLORS = {
  fort:       '#FFD700',
  tower:      '#6B7280',
  building:   '#3B82F6',
  barricade:  '#6B7280',
};

const STRUCTURE_ICONS = {
  fort:       'military-fort',
  tower:      'watchtower',
  barricade:  'stakes-fence',
};

function buildingIcon(subtype) {
  return subtype === 'ranch' ? 'barn' : 'tower';
}

function castleColor(sp, activeCount, activeRank) {
  if (sp.inactive) return '#9CA3AF';
  const t = activeCount > 1 ? activeRank / (activeCount - 1) : 0;
  return lerpColor('#DC2626', '#84CC16', t);
}

const CX = 700, TOP = 40;
const IMG_W = 1400, IMG_H = 560;
const LEGEND_Y = IMG_H - 80;

function structureVisualCenter(col, row, size) {
  const cc = col + (size - 1) / 2;
  const rc = row + (size - 1) / 2;
  const { x, y } = isoToScreen(cc, rc, CX, TOP);
  return { x, y: y + 10 }; // +10 = half tile height to reach tile mid-point
}

function iconSvg(iconName, cx, cy, iconSize) {
  const path = ICONS[iconName];
  if (!path || path.startsWith('REPLACE')) return '';
  const scale = iconSize / 512;
  const tx = cx - iconSize / 2;
  const ty = cy - iconSize;
  return `<g transform="translate(${tx},${ty}) scale(${scale})" fill="white" opacity="0.9"><path d="${path}"/></g>`;
}

function aoePolygon(col, row, cx, top) {
  // 9x9 range: center of 2x2 castle is at (col+1, row+1); Chebyshev ≤4 spans col-3..col+5
  const c0 = col - 3, r0 = row - 3;
  const c1 = col + 5, r1 = row + 5;
  // Bounding diamond of the 9x9 area
  const top_    = isoToScreen(c0,      r0,      cx, top);
  const right   = isoToScreen(c1,      r0,      cx, top);
  const bottom  = isoToScreen(c1,      r1,      cx, top);
  const left    = isoToScreen(c0,      r1,      cx, top);
  return `<polygon points="${top_.x},${top_.y} ${right.x + 32},${right.y + 10} ${bottom.x},${bottom.y + 20} ${left.x - 32},${left.y + 10}" fill="rgba(0,210,210,0.18)" stroke="rgba(0,210,210,0.5)" stroke-width="1"/>`;
}

function renderGroundTiles() {
  const tiles = [];
  for (let col = 0; col < 21; col++) {
    for (let row = 0; row < 21; row++) {
      tiles.push(`<polygon points="${tilePolygonPoints(col, row, CX, TOP)}" fill="#7C9A56" stroke="#6B8A47" stroke-width="0.5"/>`);
    }
  }
  return tiles.join('\n');
}

function renderStructureTiles(placement, color) {
  const tiles = [];
  for (let dc = 0; dc < placement.size; dc++) {
    for (let dr = 0; dr < placement.size; dr++) {
      tiles.push(`<polygon points="${tilePolygonPoints(placement.col + dc, placement.row + dr, CX, TOP)}" fill="${color}" stroke="#000" stroke-width="0.8" opacity="0.85"/>`);
    }
  }
  return tiles.join('\n');
}

function renderLabel(placement, cx, cy) {
  const name = placement.player?.player_name ?? '';
  const rank = placement.player?.rank ?? '';
  const badge = rankBadgeColor(rank);
  const inactive = placement.inactive;
  const displayName = inactive ? `${name} (away)` : name;
  const labelY = cy - (placement.size === 2 ? 52 : 36);
  return [
    `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="white" stroke="#000" stroke-width="2.5" paint-order="stroke">${displayName}</text>`,
    rank ? `<circle cx="${cx + 2}" cy="${labelY - 12}" r="7" fill="${badge}"/>` : '',
    rank ? `<text x="${cx + 2}" y="${labelY - 8}" text-anchor="middle" font-size="7" font-family="sans-serif" fill="white" font-weight="bold">${rank}</text>` : '',
  ].join('\n');
}

function renderLegend() {
  const items = [
    { color: '#FFD700', label: 'Guild Fort' },
    { color: '#6B7280', label: 'Arrow Tower / Barricade' },
    { color: '#3B82F6', label: 'Guild Building' },
    { color: '#DC2626', label: 'Active (strongest)' },
    { color: '#84CC16', label: 'Active (weakest)' },
    { color: '#9CA3AF', label: 'Inactive (>7 days)' },
    { color: 'rgba(0,210,210,0.5)', label: 'AOE Buff Zone' },
  ];
  return items.map((item, i) =>
    `<rect x="${20 + i * 170}" y="${LEGEND_Y}" width="12" height="12" fill="${item.color}"/>` +
    `<text x="${36 + i * 170}" y="${LEGEND_Y + 10}" font-size="10" font-family="sans-serif" fill="#ccc">${item.label}</text>`
  ).join('\n');
}

function renderSVG(placements) {
  // Build a score-sorted rank map so AOE and non-AOE players are ranked by actual strength.
  // Castle placements have shape { type, col, row, size, player, score, inactive, hasAoeBuffs, … }
  // where `player` is the raw player object and `inactive` / `score` are scored-player fields.
  const activePlacements = placements
    .filter(p => p.type === 'castle' && !p.inactive)
    .sort((a, b) => b.score - a.score);
  const activeRankMap = new Map(
    activePlacements.map((p, i) => [p.player.player_name, i])
  );
  const activeCount = activePlacements.length;

  const layers = {
    ground: renderGroundTiles(),
    aoe: '',
    structures: '',
    icons: '',
    labels: '',
    legend: renderLegend(),
  };

  for (const p of placements) {
    let color, iconName, iconSize;

    if (p.type === 'castle') {
      const activeRank = !p.inactive
        ? (activeRankMap.get(p.player?.player_name) ?? 0)
        : null;
      color = castleColor(p, activeCount, activeRank);
      iconName = 'castle';
      iconSize = 40;
    } else if (p.type === 'building') {
      color = STRUCTURE_COLORS.building;
      iconName = buildingIcon(p.subtype);
      iconSize = 28;
    } else {
      color = STRUCTURE_COLORS[p.type] || '#888';
      iconName = STRUCTURE_ICONS[p.type];
      iconSize = p.size === 3 ? 56 : p.size === 2 ? 40 : 24;
    }

    layers.structures += renderStructureTiles(p, color) + '\n';

    const { x: cx, y: cy } = structureVisualCenter(p.col, p.row, p.size);

    if (iconName) layers.icons += iconSvg(iconName, cx, cy, iconSize) + '\n';

    if (p.type === 'castle') {
      if (p.hasAoeBuffs && !p.inactive) layers.aoe += aoePolygon(p.col, p.row, CX, TOP) + '\n';
      layers.labels += renderLabel(p, cx, cy) + '\n';
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}">
<rect width="${IMG_W}" height="${IMG_H}" fill="#1a1a2e"/>
${layers.ground}
${layers.aoe}
${layers.structures}
${layers.icons}
${layers.labels}
${layers.legend}
</svg>`;
}

module.exports = { isoToScreen, tilePolygonPoints, lerpColor, hexToRgb, rankBadgeColor, renderSVG };
