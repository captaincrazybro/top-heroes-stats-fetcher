'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const PocketBase = require('pocketbase').default;
const config = require('./config');
const { fetchRoster }  = require('./src/layout/fetcher');
const { scorePlayers } = require('./src/layout/scorer');
const { placeLayout, placeLayoutRing } = require('./src/layout/placer');
const { renderSVG }    = require('./src/layout/renderer');

async function askUpload() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('[layout] Upload to PocketBase? [y/N] ', answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function uploadLayout(pngPath) {
  const pb = new PocketBase(config.pb.url);
  await pb.collection('_superusers').authWithPassword(config.pb.email, config.pb.password);
  const pngBuffer = fs.readFileSync(pngPath);
  const file = new File([pngBuffer], path.basename(pngPath), { type: 'image/png' });
  await pb.collection('topHeroesCastleLayouts').create({ image: file });
  console.log('[layout] Uploaded to topHeroesCastleLayouts.');
}

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

  let pngWritten = false;
  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(pngPath, png);
    console.log(`[layout] PNG written to ${pngPath}`);
    pngWritten = true;
  } catch (err) {
    console.error('[layout] sharp rasterization failed:', err.message);
    fs.writeFileSync(svgPath, svg);
    console.log(`[layout] Raw SVG written to ${svgPath}`);
  }

  if (pngWritten) {
    const upload = await askUpload();
    if (upload) {
      try {
        await uploadLayout(pngPath);
      } catch (err) {
        console.error('[layout] Upload failed:', err.message);
      }
    }
  }
}

run().catch(err => {
  console.error('[layout] Fatal error:', err);
  process.exit(1);
});
