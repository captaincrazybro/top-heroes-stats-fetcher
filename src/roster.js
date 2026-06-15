'use strict';
const { mouse, Button, straightTo } = require('@nut-tree-fork/nut-js');
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const PocketBase = require('pocketbase').default;
const config = require('../config');
const capturer = require('./capturer');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Pure utilities ───────────────────────────────────────────────────────────

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (al.length === 0 && bl.length === 0) return 1;
  if (al.length === 0 || bl.length === 0) return 0;
  const dist = levenshteinDistance(al, bl);
  return 1 - dist / Math.max(al.length, bl.length);
}

function parseInfluence(str) {
  if (typeof str === 'number') return Math.round(str);
  const s = String(str).trim().replace(/,/g, '');
  const match = s.match(/^([\d.]+)\s*([MKB]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'K') return Math.round(num * 1_000);
  return Math.round(num);
}

function greedyMatch(capturedNames, existingNames, threshold) {
  const triples = [];
  for (let ci = 0; ci < capturedNames.length; ci++) {
    for (let ei = 0; ei < existingNames.length; ei++) {
      const score = similarity(capturedNames[ci], existingNames[ei]);
      if (score >= threshold) triples.push({ ci, ei, score });
    }
  }
  triples.sort((a, b) => b.score - a.score);

  const assignedCaptured = new Set();
  const assignedExisting = new Set();
  const matched = [];

  for (const { ci, ei, score } of triples) {
    if (assignedCaptured.has(ci) || assignedExisting.has(ei)) continue;
    matched.push({ capturedIndex: ci, existingIndex: ei, score });
    assignedCaptured.add(ci);
    assignedExisting.add(ei);
  }

  return {
    matched,
    newPlayers: capturedNames.map((_, i) => i).filter(i => !assignedCaptured.has(i)),
    departed:   existingNames.map((_, i) => i).filter(i => !assignedExisting.has(i)),
  };
}

// ── Vision helpers ────────────────────────────────────────────────────────────

function toBase64(buffer) {
  return buffer.toString('base64');
}

async function callVision(buffer, prompt) {
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: toBase64(buffer) } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return response.content[0]?.text ?? '';
}

function tryParseJSON(text) {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
  } catch { return null; }
}

async function extractMembers(imageBuffer) {
  const bounds = config.membersCropBounds;
  if (bounds) {
    try {
      imageBuffer = await sharp(imageBuffer).extract(bounds).png().toBuffer();
    } catch (err) {
      console.warn('[roster] Crop failed, using full screenshot:', err.message);
    }
  }

  const prompt = `Look at this Top Heroes guild Members screen.
Extract ALL visible member entries. Return ONLY valid JSON:
{"members":[{"player_name":"string","rank":"R1","influence":341000000,"castle_level":62,"last_online":"22 min ago"}]}

Rules:
- rank: the rank badge shown on the member card — one of R1, R2, R3, R4, R5
- influence: the power/strength value converted to a full integer (341M → 341000000, 83.5M → 83500000)
- castle_level: the numeric level shown next to the castle icon
- last_online: the exact text shown — "Online", "22 min ago", "5 days ago", etc.
- The R5 player appears prominently at the top of the screen — include them
- Do NOT include yourself or any entry without a visible player name`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.members && Array.isArray(parsed.members)) {
      return parsed.members.map(m => ({
        ...m,
        influence: parseInfluence(m.influence),
      }));
    }
    console.log(`[roster] extractMembers parse failed (attempt ${attempt + 1}):`, text);
  }
  return [];
}

// ── Navigation helpers ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickAt({ x, y }, delayMs = 800) {
  await mouse.setPosition({ x, y });
  await mouse.leftClick();
  await sleep(delayMs);
}

async function performMembersScroll() {
  mouse.config.mouseSpeed = config.scrollDragSpeedPps ?? 500;
  await mouse.setPosition({ x: config.membersScrollDragX, y: config.membersScrollDragFromY });
  await mouse.pressButton(Button.LEFT);
  await sleep(200);
  await mouse.move(straightTo({ x: config.membersScrollDragX, y: config.membersScrollDragToY }));
  await sleep(config.scrollDragLingerMs ?? 300);
  await mouse.releaseButton(Button.LEFT);
}

async function scrollAndCapture() {
  const seen = new Map(); // player_name → entry
  const maxPasses = config.membersScrollMaxPasses ?? 50;

  for (let pass = 0; pass < maxPasses; pass++) {
    const prevSize = seen.size;
    const img = await capturer.capture();
    const entries = await extractMembers(img);

    for (const entry of entries) {
      if (!seen.has(entry.player_name)) {
        seen.set(entry.player_name, entry);
      }
    }

    if (seen.size === prevSize) break; // no new names this pass → list exhausted

    await performMembersScroll();
  }

  return [...seen.values()];
}

// ── Navigation ────────────────────────────────────────────────────────────────

async function navigate() {
  await clickAt({ x: config.guildButtonX,       y: config.guildButtonY });
  await clickAt({ x: config.membersPanelButtonX, y: config.membersPanelButtonY });
}

// ── PocketBase client ─────────────────────────────────────────────────────────

let _rosterPb = null;

async function getRosterClient() {
  if (_rosterPb) return _rosterPb;
  const pb = new PocketBase(config.pb.url);
  try {
    await pb.collection('_superusers').authWithPassword(config.pb.email, config.pb.password);
  } catch (err) {
    throw new Error(`[roster] PocketBase auth failed: ${err.message}`);
  }
  _rosterPb = pb;
  return _rosterPb;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function syncToPocketBase(capturedRecords, capturedAt) {
  const pb = await getRosterClient();
  const col = config.pb.rosterCollection;

  const existing = await pb.collection(col).getFullList({ sort: 'player_name' });

  const joinedCount = existing.filter(r => r.joined).length;
  if (joinedCount > 0 && capturedRecords.length < joinedCount * 0.5) {
    console.warn(`[roster] Only ${capturedRecords.length} captured vs ${joinedCount} active members — data may be incomplete`);
  }

  const capturedNames = capturedRecords.map(r => r.player_name);
  const existingNames = existing.map(r => r.player_name);

  const { matched, newPlayers, departed } = greedyMatch(
    capturedNames,
    existingNames,
    config.rosterMatchThreshold
  );

  let rejoined = 0;

  for (const { capturedIndex, existingIndex } of matched) {
    const rec = capturedRecords[capturedIndex];
    const ex  = existing[existingIndex];
    await pb.collection(col).update(ex.id, {
      player_name:  rec.player_name,
      rank:         rec.rank,
      influence:    rec.influence,
      castle_level: rec.castle_level,
      last_online:  rec.last_online,
      joined:       true,
    });
    if (!ex.joined) rejoined++;
  }

  for (const ci of newPlayers) {
    const rec = capturedRecords[ci];
    await pb.collection(col).create({
      player_name:          rec.player_name,
      rank:                 rec.rank,
      influence:            rec.influence,
      castle_level:         rec.castle_level,
      last_online:          rec.last_online,
      joined:               true,
      main_queue_influence: null,
      main_queue_faction:   null,
    });
  }

  for (const ei of departed) {
    const ex = existing[ei];
    if (!ex.joined) continue;
    await pb.collection(col).update(ex.id, { joined: false });
  }

  console.log(`[roster] ${matched.length} matched (${rejoined} rejoined), ${newPlayers.length} new, ${departed.length} departed`);
}

// ── Placeholders (filled in later tasks) ────────────────────────────────────

async function capture() {
  throw new Error('Not yet implemented');
}

module.exports = { capture, greedyMatch, levenshteinDistance, similarity, parseInfluence };
