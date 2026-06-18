'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { fetchRoster }  = require('./src/layout/fetcher');
const { scorePlayers } = require('./src/layout/scorer');
const { placeLayout }  = require('./src/layout/placer');
const { renderSVG }    = require('./src/layout/renderer');

async function run() {
  console.log('[layout] Fetching guild roster...');
  const records = await fetchRoster();

  if (records.length === 0) {
    console.error('[layout] No joined members found in PocketBase. Aborting.');
    process.exit(1);
  }

  console.log(`[layout] ${records.length} members loaded.`);

  const scored = scorePlayers(records);
  const { placements } = placeLayout(scored);
  const svg = renderSVG(placements);

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const pngPath = path.join(outputDir, `guild-layout-${date}.png`);
  const svgPath = path.join(outputDir, `guild-layout-${date}.svg`);

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(pngPath, png);
    console.log(`[layout] PNG written to ${pngPath}`);
  } catch (err) {
    console.error('[layout] sharp rasterization failed:', err.message);
    fs.writeFileSync(svgPath, svg);
    console.log(`[layout] Raw SVG written to ${svgPath}`);
  }
}

run().catch(err => {
  console.error('[layout] Fatal error:', err);
  process.exit(1);
});
