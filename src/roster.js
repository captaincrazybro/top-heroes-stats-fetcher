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
    max_tokens: 512,
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
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(stripped); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return null;
}

async function extractMembers(imageBuffer, inheritedRank = null) {
  const bounds = config.membersCropBounds;
  if (bounds) {
    try {
      imageBuffer = await sharp(imageBuffer).extract(bounds).png().toBuffer();
    } catch (err) {
      console.warn('[roster] Crop failed, using full screenshot:', err.message);
    }
  }

  const rankHint = inheritedRank
    ? `The most recently seen rank section (from a prior screen) is ${inheritedRank} — use it for any member whose section header has scrolled off the top and is not visible on this screen.`
    : 'If no rank section header is visible above a member, set rank to null.';

  const prompt = `Look at this Top Heroes guild Members screen.
Extract ALL visible member entries from the scrollable member grid. Return ONLY valid JSON:
{"currentRank":"R3","members":[{"player_name":"string","rank":"R4","level":"123","influence":341000000,"castle_level":62,"last_online":"22 min ago"}]}

Rules:
- There is a FIXED guild master banner pinned at the very top showing the R5 leader's name and stats. Always include this person as a member entry with rank "R5". They do NOT appear again in the scrollable grid.
- The scrollable grid below has rank section headers like "R4 2/3", "R3 19/58", "R2 0/10" etc. These are the ONLY valid section headers for rank assignment of grid members.
- rank: for the fixed R5 banner person set rank to "R5". For all other members, determine rank from the nearest section header within the scrollable grid above them. ${rankHint}
- currentRank: the last rank section header visible in the scrollable grid (scanning top to bottom). Ignore the fixed R5 banner entirely — only "R4 X/Y", "R3 X/Y" style headers count.
- level: small number shown on the player's profile picture near their name
- influence: converted to a full integer (341M → 341000000, 83.5M → 83500000)
- castle_level: numeric level next to the castle icon
- last_online: exact text shown — "Online", "22 min ago", "5 days ago", etc.
- The grid has TWO columns — capture entries from BOTH the left and right columns
- SKIP the guild role row (Warlord, Recruiter, Muse, Butler slots) — those players appear again in the main grid
- Do NOT include any entry without a visible player name`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.members && Array.isArray(parsed.members)) {
      return {
        members: parsed.members.map(m => ({ ...m, influence: parseInfluence(m.influence) })),
        currentRank: parsed.currentRank ?? null,
      };
    }
    console.log(`[roster] extractMembers parse failed (attempt ${attempt + 1}):`, text);
  }
  return { members: [], currentRank: null };
}

// ── Navigation helpers ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickAt({ x, y }, delayMs = 800) {
  await mouse.setPosition({ x: 0, y: 0});
  await sleep(100);
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

async function performMembersSetup() {
  for (const coords of config.membersSetupClicks) {
    await clickAt(coords);
  }
}

async function scrollAndCapture() {
  const seen = new Map(); // player_name → entry
  const maxPasses = config.membersScrollMaxPasses ?? 50;
  let currentRank = null;

  for (let pass = 0; pass < maxPasses; pass++) {
    const prevSize = seen.size;
    const img = await capturer.capture();
    const { members: entries, currentRank: nextRank } = await extractMembers(img, currentRank);
    console.log(entries);

    if (nextRank) currentRank = nextRank;

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
      level:        rec.level,
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
      level:                rec.level,
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

// ── Top-level export ──────────────────────────────────────────────────────────

async function capture() {
  const capturedAt = new Date().toISOString();

  await navigate();
  await performMembersSetup();
  const records = await scrollAndCapture();
  await syncToPocketBase(records, capturedAt);
  // Two back presses: members screen → guild panel → main map
  await clickAt({ x: config.guildCloseButtonX, y: config.guildCloseButtonY });
  await clickAt({ x: config.guildCloseButtonX, y: config.guildCloseButtonY });

  const enriched = records.map(r => ({ ...r, joined: true, captured_at: capturedAt }));
  console.log(`[roster] Captured ${enriched.length} members`);
  return { records: enriched, capturedAt };
}

module.exports = { capture, greedyMatch, levenshteinDistance, similarity, parseInfluence };
