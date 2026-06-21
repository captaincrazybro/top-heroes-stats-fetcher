'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { fetchRoster }  = require('./src/layout/fetcher');
const { scorePlayers } = require('./src/layout/scorer');
const { placeLayout, placeLayoutRing } = require('./src/layout/placer');
const { renderSVG }    = require('./src/layout/renderer');

async function run() {
  const useRing = process.argv.includes('--ring');
  console.log(`[layout] Fetching guild roster... (profile: ${useRing ? 'ring' : 'standard'})`);
  const records = await fetchRoster();

  if (records.length === 0) {
    console.error('[layout] No joined members found in PocketBase. Aborting.');
    process.exit(1);
  }

  console.log(`[layout] ${records.length} members loaded.`);

  const scored = scorePlayers(records);
  const { placements, skipped, skippedInactive } = useRing
    ? placeLayoutRing(scored)
    : placeLayout(scored);

  const castlePlaced = placements.filter(p => p.type === 'castle').length;
  console.log(`[layout] Placed ${castlePlaced} / ${records.length} members.`);
  if (skipped.length > 0) {
    console.warn(`[layout] ${skipped.length} active player(s) skipped — grid full:`);
    for (const sp of skipped) console.warn(`  - ${sp.player.player_name}`);
  }
  if (skippedInactive.length > 0) {
    console.warn(`[layout] ${skippedInactive.length} inactive player(s) skipped — grid full:`);
    for (const sp of skippedInactive) console.warn(`  - ${sp.player.player_name}`);
  }

  const svg = renderSVG(placements);

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const profileSuffix = useRing ? '-ring' : '';
  const pngPath = path.join(outputDir, `guild-layout${profileSuffix}-${date}.png`);
  const svgPath = path.join(outputDir, `guild-layout${profileSuffix}-${date}.svg`);

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
