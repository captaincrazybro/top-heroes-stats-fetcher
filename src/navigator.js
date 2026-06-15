// src/navigator.js
const { mouse, Button, straightTo } = require('@nut-tree-fork/nut-js');
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
  let lastTitle = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      console.warn(`[navigator] detectEventType attempt ${attempt + 1}...`);
      await sleep(500);
    }
    const state = await extractor.detectGameState(imageBuffer);
    lastTitle = state.eventTitle || '';

    if (lastTitle.includes('Guild Arms Race')) return 'GAR';
    if (lastTitle.includes('Guild Race')) return 'GR';
    if (lastTitle.includes('Kingdom Duel')) return 'KvK'; // KvK tab label is "Kingdom Duel"
  }
  throw new Error(`Unrecognized event title: "${lastTitle}"`);
}

async function performDragScroll(eventType) {
  mouse.config.mouseSpeed = config.scrollDragSpeedPps ?? 500;
  await mouse.setPosition({ x: config.scrollDragX[eventType], y: config.scrollDragFromY[eventType] });
  await mouse.pressButton(Button.LEFT);
  await sleep(200);
  await mouse.move(straightTo({ x: config.scrollDragX[eventType], y: config.scrollDragToY[eventType] }));
  await sleep(config.scrollDragLingerMs ?? 300);
  await mouse.releaseButton(Button.LEFT);
}

// direction 'down' scrolls the list toward lower ranks (fromY→toY); 'up' reverses to go back.
async function performFastDragScroll(eventType, direction = 'down') {
  mouse.config.mouseSpeed = config.fastScrollDragSpeedPps ?? 2000;
  const fromY = direction === 'down' ? config.scrollDragFromY[eventType] : config.scrollDragToY[eventType];
  const toY   = direction === 'down' ? config.scrollDragToY[eventType]   : config.scrollDragFromY[eventType];
  await mouse.setPosition({ x: config.scrollDragX[eventType], y: fromY });
  await mouse.pressButton(Button.LEFT);
  // await sleep(30);
  await mouse.move(straightTo({ x: config.scrollDragX[eventType], y: toY }));
  // await sleep(config.fastScrollDragLingerMs ?? 50);
  await mouse.releaseButton(Button.LEFT);
  await sleep(config.fastScrollReboundWaitMs ?? 100);
}

async function preloadRankingsList(eventType) {
  const count = config.fastScrollCount[eventType] ?? 24;
  console.log(`[navigator] Pre-loading rankings (${count}↓ + ${count}↑ fast scrolls)...`);
  for (let i = 0; i < count; i++) await performFastDragScroll(eventType, 'down');
  for (let i = 0; i < count; i++) await performFastDragScroll(eventType, 'up');
  console.log('[navigator] Pre-load complete.');
}

async function scrollAndCapture(eventType, maxRank = Infinity) {
  const seen = new Map();
  let highestRankSeen = 0;

  while (true) {
    const img = await capturer.capture();
    const entries = await extractor.extractRankings(img);

    if (entries.length === 0) break;

    // Compute max visible rank; 2000 is a sentinel for the pinned "2000+" self-entry.
    const currentHighestVisible = Math.max(
      ...entries.filter(e => e.rank < 2000).map(e => e.rank),
      0
    );

    // End-of-list: the pre-load phase causes the game to wrap the list. Once the
    // visible max rank drops below the highest we've ever seen, we've gone past the end.
    if (highestRankSeen > 0 && (currentHighestVisible <= highestRankSeen)) break;

    let hitCutoff = false;
    for (const entry of entries) {
      if (entry.rank >= 2000) continue;
      if (entry.rank > maxRank) { hitCutoff = true; break; }
      const key = `${entry.rank}|${entry.player_name}`;
      seen.set(key, entry);
      highestRankSeen = Math.max(highestRankSeen, entry.rank);
    }
    if (hitCutoff) break;

    await performDragScroll(eventType);
  }

  return [[...seen.values()]];
}

async function navigate() {
  // 1. Open event screen
  await clickAt({ x: config.eventsIconX, y: config.eventsIconY }, 1000);

  // 2. Detect event type from the Routines panel (Vision still needed to read the tab labels)
  const routinesImg = await capturer.capture();
  const eventType = await detectEventType(routinesImg);
  console.log(`[navigator] Detected event: ${eventType}`);

  // 3. Click the event tab (same position for all event types)
  await clickAt({ x: config.routinesTabX, y: config.routinesTabY }, 1000);

  // 4. Click the Ranking button (GAR position differs from GR/KvK)
  await clickAt(config.rankingButton[eventType], 1000);

  // 5. Click the correct ranking tab (Individual for GR, Daily Ranking for GAR/KvK)
  await clickAt(config.rankingTab[eventType], 800);

  // 6. Pre-load the full rankings list so it stays in the game's scroll buffer
  await preloadRankingsList(eventType);

  // 7. Scroll through and capture rankings — KvK: cap at rank 200
  const maxRank = eventType === 'KvK' ? config.kvkMaxRank : Infinity;
  const pages = await scrollAndCapture(eventType, maxRank);

  return { eventType, pages };
}

module.exports = { navigate, detectEventType, scrollAndCapture };
