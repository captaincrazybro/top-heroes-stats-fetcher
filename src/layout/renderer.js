'use strict';

// ── Isometric coordinate math ─────────────────────────────────────────────────

const HH = 14; // tile half-height in px (HW is fixed at 32; increase HH for a taller diamond)

function isoToScreen(col, row, cx, top) {
  return {
    x: (col - row) * 32 + cx,
    y: (col + row) * HH + top,
  };
}

function tilePolygonPoints(col, row, cx, top) {
  const { x, y } = isoToScreen(col, row, cx, top);
  return `${x},${y} ${x + 32},${y + HH} ${x},${y + HH * 2} ${x - 32},${y + HH}`;
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
  'military-fort':  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="height: 512px; width: 512px;"><g class="" transform="translate(-1,0)" style=""><path d="M256 21c-66.72 0-121 54.28-121 121s54.28 121 121 121 121-54.28 121-121S322.72 21 256 21zm0 18c56.992 0 103 46.008 103 103s-46.008 103-103 103-103-46.008-103-103S199.008 39 256 39zm0 11.75-69.4 52.05 10.8 14.4L256 73.25l58.6 43.95 10.8-14.4L256 50.75zm0 48-69.4 52.05 10.8 14.4 58.6-43.95 58.6 43.95 10.8-14.4L256 98.75zm0 48-69.4 52.05 10.8 14.4 58.6-43.95 58.6 43.95 10.8-14.4-69.4-52.05zM53.562 185l-7 14h66.876l-7-14H53.562zm352 0-7 14h66.875l-7-14h-52.875zM41 217v46h78v-46H41zm352 0v46h78v-46h-78zM64 231h32v18H64v-18zm352 0h32v18h-32v-18zM38.486 281l-10 30h455.028l-10-30H38.486zM25 329v158h199v-87h64v87h199V329H25zm55 14h32v18H80v-18zm80 0h32v18h-32v-18zm80 0h32v18h-32v-18zm80 0h32v18h-32v-18zm80 0h32v18h-32v-18z" fill="#fff" fill-opacity="1"></path></g></svg>',
  'watchtower':     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="height: 512px; width: 512px;"><g class="" transform="translate(-1,0)" style=""><path d="m256 32-96 48h23v71h-32v50h30.945L155.36 440.244l-.653.477.522.72-4.175 37.566-.994 8.945 17.89 1.99.995-8.946L171.61 457h168.78l2.665 23.994.994 8.945 17.89-1.99-.995-8.944-4.174-37.567.523-.72-.654-.476L330.054 201H361v-50h-32V80h23l-96-48zm-48 64h32v48h-32V96zm64 0h32v48h-32V96zm-103 73h14v14h-14v-14zm32 0h14v14h-14v-14zm32 0h14v14h-14v-14zm32 0h14v14h-14v-14zm32 0h14v14h-14v-14zm32 0h14v14h-14v-14zm-113.328 32h80.656L256 236.848 215.672 201zm-16.65 9.283L240.33 247h-45.385l4.08-36.717zm113.955 0 4.08 36.717h-45.385l41.305-36.717zM192.945 265h31.383l-34.822 30.953 3.44-30.953zm58.477 0h9.156l51.75 46H199.672l51.75-46zm36.25 0h31.383l3.44 30.953L287.67 265zm-83.994 64h104.644L256 367.053 203.678 329zm-18.8 8.586L236.323 375h-55.6l4.157-37.414zm142.243 0L331.278 375h-55.6l51.444-37.414zM178.724 393h41.6l-45.26 32.914 3.66-32.914zm72.205 0h10.144l63.25 46H187.678l63.25-46zm40.75 0h41.6l3.658 32.914L291.678 393z" fill="#fff" fill-opacity="1"></path></g></svg>',
  'barn':           '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="height: 512px; width: 512px;"><g class="" transform="translate(-1,0)" style=""><path d="M256 23.38 89.844 89.845l-64.9 162.254 14.85 5.943c20.312-50.766 40.62-101.535 60.93-152.304l1.432-3.58L256 40.616l153.844 61.54 1.43 3.58 60.93 152.305 14.853-5.942-64.9-162.254C366.77 67.69 311.386 45.534 256 23.38zm0 36.624-139.996 55.998L72.8 224h.2v263h78V329h-39v-18h297v176h30V224h.2c-14.402-36-28.802-72-43.204-107.998L256 60.004zM151 135h210v114H151V135zm23.563 18L199 201.873V153h-24.438zM313 153v48.873L337.438 153H313zm-144 29.127V231h24.438L169 182.127zm174 0L318.562 231H343v-48.873zm-98.73 18.69c-1.207-.02-2.31.02-3.288.128-2.823.31-10.76 3.708-16.86 7.3a147.204 147.204 0 0 0-7.122 4.484V231h78v-16.97a282.317 282.317 0 0 0-17.578-6.368c-11.206-3.63-24.71-6.71-33.152-6.846zM160 263h192v18H160v-18zm15.16 66L208 389.205 240.84 329h-65.68zm144 0L352 389.205 384.84 329h-65.68zM169 355.295v105.41L197.748 408 169 355.295zm78 0L218.252 408 247 460.705v-105.41zm66 0v105.41L341.748 408 313 355.295zm78 0L362.252 408 391 460.705v-105.41zm-183 71.5L175.16 487h65.68L208 426.795zm144 0L319.16 487h65.68L352 426.795z" fill="#fff" fill-opacity="1"></path></g></svg>',
  'tower':          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="height: 512px; width: 512px;"><g class="" transform="translate(-1,0)" style=""><path d="M97.812 23.375v92.875l46.22 51.72V351h-25.845L94.594 491.906H414.53L390.938 351h-25.875V167.97l46.22-51.72V23.375h-53.938v43.97H324.5v-43.97h-53.938v43.97h-32.437v-43.97h-53.938v43.97H151.75v-43.97H97.812zm73.75 152.875h18.688v50.22h-18.688v-50.22zm73.594 0h18.688v50.22h-18.688v-50.22zm74.156 0H338v50.22h-18.688v-50.22z" fill="#fff" fill-opacity="1"></path></g></svg>',
  'stakes-fence':   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="height: 512px; width: 512px;"><g class="" transform="translate(-1,0)" style=""><path d="M334.7 21.05 300.2 154.7l30.5 12.5L363 155zM220.2 72.41 180.1 179.1l34.3 33.3 33.5-31zM55.57 101.6 47.9 224.4l36.52 23.7 25.38-38.7zm413.63 10.5-41.8 65.8 19.8 34.5 27.3-7zm-171.4 61-6.3 145 66.3-1.5 6.4-142.8-33.7 12.8zM177 201.2l-5 119.6 73.8-1.7 3.3-114.3-35.1 32.4zm244.3 2.2-19.9 112.2 53.8-1.3 17.8-89.9-34.6 8.8zm-305.8 30.1-25.87 39.4-41.04-26.7 10.08 77.2 71.93-1.6zm362.9 98.3L33.8 342l-3.78 44.2L482 384.1l-1.1-15.9-32.5-10.4s18.7-3.4 31.4-5.6zm-40.7 70.6-51.7.2-3.2 18.1 51.6-1.6zm-83.7.3-66.1.3-.9 20.9 66.2-2.2zm-110.5.5-75 .3-1 24.3 75.4-2.5zm-98.9.4-75.43.3 3.51 27 76.12-2.5zm345.3 31.6L22.07 450.5l.24 25.9 29 14.6 432.49-1.4z" fill="#fff" fill-opacity="1"></path></g></svg>',
  'castle':         '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="height: 512px; width: 512px;"><g class="" transform="translate(0,0)" style=""><path d="m255.95 27.11-75.35 80.504 150.7 1.168-75.35-81.674h-.003zM25 109.895v68.01l19.412 25.99h71.06l19.528-26v-68h-14v15.995h-18v-15.994H89v15.995H71v-15.994H57v15.995H39v-15.994H25zm352 0v68l19.527 26h71.06L487 177.906v-68.01h-14v15.995h-18v-15.994h-14v15.995h-18v-15.994h-14v15.995h-18v-15.994h-14zm-176 15.877V260.89h110V126.63l-110-.857zm55 20.118c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zM41 221.897V484.89h78V221.897H41zm352 0V484.89h78V221.897h-78zM56 241.89c4 0 8 4 8 12v32H48v-32c0-8 4-12 8-12zm400 0c4 0 8 4 8 12v32h-16v-32c0-8 4-12 8-12zm-303 37v23h-16v183h87v-55c0-24 16-36 32-36s32 12 32 36v55h87v-183h-16v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14zm-49 43c4 0 8 4 8 12v32H96v-32c0-8 4-12 8-12zm72 0c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zm80 0c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zm80 0c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zm72 0c4 0 8 4 8 12v32h-16v-32c0-8 4-12 8-12zm-352 64c4 0 8 4 8 12v32H48v-32c0-8 4-12 8-12zm400 0c4 0 8 4 8 12v32h-16v-32c0-8 4-12 8-12z" fill="#fff" fill-opacity="1"></path></g></svg>',
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
const IMG_W = 1400, IMG_H = 720;
const LEGEND_Y = IMG_H - 80;

function structureVisualCenter(col, row, size) {
  const cc = col + (size - 1) / 2;
  const rc = row + (size - 1) / 2;
  const { x, y } = isoToScreen(cc, rc, CX, TOP);
  return { x, y: y + HH }; // +HH = half tile height to reach tile mid-point
}

function iconSvg(iconName, cx, cy, iconSize) {
  const svgStr = ICONS[iconName];
  if (!svgStr || svgStr.startsWith('REPLACE')) return '';
  const innerMatch = svgStr.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!innerMatch) return '';
  const x = cx - iconSize / 2;
  const y = cy - iconSize;
  return `<svg x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" viewBox="0 0 512 512">${innerMatch[1]}</svg>`;
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
  return `<polygon points="${top_.x},${top_.y} ${right.x + 32},${right.y + HH} ${bottom.x},${bottom.y + HH * 2} ${left.x - 32},${left.y + HH}" fill="rgba(0,210,210,0.18)" stroke="rgba(0,210,210,0.5)" stroke-width="1"/>`;
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
  const inactive = placement.inactive;
  const displayName = inactive ? `${name} (away)` : name;
  const labelY = cy;
  return `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="white" stroke="#000" stroke-width="2.5" paint-order="stroke">${displayName}</text>`;
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W * 2}" height="${IMG_H * 2}" viewBox="0 0 ${IMG_W} ${IMG_H}">
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
