// src/navigator.js
const { mouse, Button } = require('@nut-tree-fork/nut-js');
const config = require('../config');
const capturer = require('./capturer');
const extractor = require('./extractor');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickAt({ x, y }, delayMs = 800) {
  await mouse.setPosition({ x, y });
  await mouse.leftClick();
  await sleep(delayMs);
}

async function detectEventType(imageBuffer) {
  const state = await extractor.detectGameState(imageBuffer);
  const title = state.eventTitle ?? '';

  if (title.includes('Guild Arms Race')) return 'GAR';
  if (title.includes('Guild Race')) return 'GR';
  if (title.includes('Kingdom Duel')) return 'KvK'; // KvK tab label is "Kingdom Duel"

  throw new Error(`Unrecognized event title: "${title}"`);
}

async function performDragScroll() {
  await mouse.setPosition({ x: config.scrollDragX, y: config.scrollDragFromY });
  await mouse.pressButton(Button.LEFT);
  await sleep(100);
  await mouse.setPosition({ x: config.scrollDragX, y: config.scrollDragToY });
  await sleep(100);
  await mouse.releaseButton(Button.LEFT);
  await sleep(config.scrollReboundWaitMs); // wait for items to load + rebound to settle
}

async function scrollAndCapture(maxRank = Infinity) {
  // seen: rank|player_name -> entry. Deduplicates overlapping pages and rebound re-shows.
  const seen = new Map();
  let highestRankSeen = 0;

  while (true) {
    const img = await capturer.capture();
    const entries = await extractor.extractRankings(img);

    if (entries.length === 0) break;

    // Glitch detection: first entry rank dropped well below the highest rank we've seen
    const firstRank = entries[0].rank;
    if (
      highestRankSeen > config.scrollGlitchThreshold &&
      firstRank < highestRankSeen - config.scrollGlitchThreshold
    ) {
      const lastVisibleRank = entries[entries.length - 1].rank;
      const rankDiff = highestRankSeen - lastVisibleRank;
      const recoveryDrags = Math.ceil(rankDiff / config.scrollEntriesPerDrag) + 1;
      console.warn(`[navigator] Glitch detected (first rank ${firstRank}, max seen ${highestRankSeen}) - performing ${recoveryDrags} recovery drags`);
      for (let i = 0; i < recoveryDrags; i++) {
        await performDragScroll();
      }
      continue; // re-capture after recovery
    }

    // End-of-list: last visible entry matches the highest rank we've recorded.
    const lastVisibleRank = entries[entries.length - 1].rank;
    if (seen.size > 0 && lastVisibleRank === highestRankSeen) break;

    // Apply maxRank cutoff (KvK): keep entries up to maxRank, then stop
    let hitCutoff = false;
    for (const entry of entries) {
      if (entry.rank > maxRank) { hitCutoff = true; break; }
      const key = `${entry.rank}|${entry.player_name}`;
      seen.set(key, entry);
      highestRankSeen = Math.max(highestRankSeen, entry.rank);
    }
    if (hitCutoff) break;

    await performDragScroll();
  }

  // Return as a single page; aggregator's player_name+server dedup acts as a second layer
  return [[...seen.values()]];
}

async function locate(description) {
  const img = await capturer.capture();
  return extractor.locateButton(img, description);
}

const EVENT_TAB_LABELS = { GR: 'Guild Race', GAR: 'Guild Arms Race', KvK: 'Kingdom Duel' };

async function navigate() {
  // 1. Open event screen - Vision locates the Events icon dynamically
  await clickAt(await locate('the Events icon in the top-right corner'), 1000);

  // 2. Detect event type from the Routines panel tab labels (visible before any tab is clicked)
  const routinesImg = await capturer.capture();
  const eventType = await detectEventType(routinesImg);
  console.log(`[navigator] Detected event: ${eventType}`);

  // 3. Click the specific named tab (more robust than always clicking position 2)
  const tabLabel = EVENT_TAB_LABELS[eventType];
  const tabCoords = await extractor.locateButton(routinesImg, `the tab labeled "${tabLabel}" in the Routines panel`);
  await clickAt(tabCoords, 1000);

  // 4. Navigate to Rankings - Vision locates the button (position differs between GAR and GR/KvK)
  await clickAt(await locate('the Ranking button'), 1000);

  // 5. Click correct ranking tab - Vision locates the right tab for this event type
  const tabDescription = eventType === 'GR'
    ? 'the Individual tab in the ranking view'
    : 'the Daily Ranking tab in the ranking view';
  await clickAt(await locate(tabDescription), 800);

  // 6. Scroll and capture all pages
  // KvK: cap at rank 200 (no guild filter in-game, list includes both kingdoms)
  const maxRank = eventType === 'KvK' ? config.kvkMaxRank : Infinity;
  const pages = await scrollAndCapture(maxRank);

  return { eventType, pages };
}

module.exports = { navigate, detectEventType, scrollAndCapture };
