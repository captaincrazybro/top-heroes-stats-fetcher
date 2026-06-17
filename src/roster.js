'use strict';
const { mouse, Button, straightTo } = require('@nut-tree-fork/nut-js');
const { OpenAI } = require('openai');
const sharp = require('sharp');
const PocketBase = require('pocketbase').default;
const config = require('../config');
const capturer = require('./capturer');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function stripEmojis(str) {
  return str.replace(/\p{Extended_Pictographic}/gu, '').trim();
}

function meaningful(v) {
  return v !== null && v !== undefined && v !== 0 && v !== '';
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

async function callVision(buffer, prompt) {
  const response = await client.chat.completions.create({
    model: config.visionModel,
    max_completion_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${buffer.toString('base64')}` },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return response.choices[0]?.message?.content ?? '';
}

function tryParseJSON(text) {
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(stripped); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return null;
}

async function extractGuildMaster(imageBuffer) {
  const bounds = config.guildMasterCropBounds;
  if (!bounds) return null;
  try {
    imageBuffer = await sharp(imageBuffer).extract(bounds).png().toBuffer();
  } catch (err) {
    console.warn('[roster] Guild master crop failed:', err.message);
    return null;
  }

  const prompt = `Look at this Top Heroes guild master banner.
Extract the guild master's details. Return ONLY valid JSON:
{"player_name":"string","level":"123","influence":341000000,"castle_level":62,"last_online":"Online"}

Rules:
- player_name: copy the text exactly, including special characters, but SKIP any emojis
- level: small number shown on the profile picture
- influence: converted to a full integer (341M → 341000000, 83.5M → 83500000)
- castle_level: numeric level next to the castle icon
- last_online: exact text shown — "Online", "22 min ago", "5 days ago", etc.`;

  const text = await callVision(imageBuffer, prompt);
  const parsed = tryParseJSON(text);
  if (parsed?.player_name) {
    return { ...parsed, rank: 'R5', player_name: stripEmojis(parsed.player_name), influence: parseInfluence(parsed.influence) };
  }
  console.log('[roster] extractGuildMaster parse failed:', text);
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

  const inheritedNote = inheritedRank
    ? `Members at the top of the screen above any visible header belong to the inherited rank "${inheritedRank}" from the previous screen — put them in a section with rank "inherited".`
    : 'If no section headers are visible, put all members in a section with rank "inherited".';

  const prompt = `Look at this Top Heroes guild member grid.
Group all visible members by their rank section. Return ONLY valid JSON:
{"sections":[{"rank":"inherited","members":[...]},{"rank":"R2","members":[...]}]}

Instructions:
1. Find rank section headers on screen — divider rows that start with R4, R3, R2, or R1 followed by a count (e.g. "R4 2/3", "R3 19/58", "R2 0/10", "R1 5/20"). These are the ONLY possible rank values.
2. Members appearing BEFORE the first visible header → section rank "inherited".
3. Members appearing AFTER a visible header → section with that header's rank (e.g. "R2").
4. If NO headers are visible → one section with rank "inherited" containing all members.
5. Only list a header if you can clearly read it. If unsure, use "inherited".
${inheritedNote}

Each member object:
- player_name: exact text, skip emojis, include special characters
- level: small number on the profile picture
- influence: full integer (341M → 341000000, 83.5M → 83500000)
- castle_level: number next to the castle icon
- last_online: exact text ("Online", "22 min ago", "5 days ago", etc.)
Include members from BOTH the left and right columns. Skip any entry without a visible player name.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.sections && Array.isArray(parsed.sections)) {
      let lowestExplicitRank = null;
      const members = [];
      for (const section of parsed.sections) {
        const rank = (section.rank === 'inherited') ? inheritedRank : (section.rank ?? inheritedRank);
        for (const m of section.members ?? []) {
          members.push({
            ...m,
            rank,
            player_name: stripEmojis(m.player_name ?? ''),
            influence: parseInfluence(m.influence),
          });
        }
        if (section.rank && section.rank !== 'inherited') {
          const n = parseInt(String(section.rank).replace(/\D/g, ''), 10);
          const best = lowestExplicitRank ? parseInt(lowestExplicitRank.replace(/\D/g, ''), 10) : Infinity;
          if (n < best) lowestExplicitRank = String(section.rank);
        }
      }
      return { members, currentRank: lowestExplicitRank };
    }
    console.log(`[roster] extractMembers parse failed (attempt ${attempt + 1}):`, text);
  }
  return { members: [], currentRank: null };
}

// ── Navigation helpers ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickAt({ x, y }, delayMs = 800, isDuplicate = false) {
  if (isDuplicate) {
    await mouse.setPosition({ x: 0, y: 0});
    await sleep(100);
  }
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
    const inheritedAtCallTime = currentRank;
    const inheritedNum = inheritedAtCallTime ? parseInt(inheritedAtCallTime.replace(/\D/g, ''), 10) : Infinity;
    const img = await capturer.capture();
    const { members: entries, currentRank: nextRank } = await extractMembers(img, currentRank);
    console.log(`[roster] pass ${pass + 1}: inheritedRank=${currentRank} visibleRank=${nextRank} entries=${entries.length}`);
    console.log(entries)

    // Only accept a rank update if it moves lower — ranks only decrease as we scroll.
    if (nextRank) {
      const nextNum = parseInt(nextRank.replace(/\D/g, ''), 10);
      const currentNum = currentRank ? parseInt(currentRank.replace(/\D/g, ''), 10) : Infinity;
      if (nextNum <= currentNum) currentRank = nextRank;
    }

    // Fallback: infer from members whose rank is lower than what we've tracked.
    for (const entry of entries) {
      if (entry.rank) {
        const entryNum = parseInt(entry.rank.replace(/\D/g, ''), 10);
        const currentNum = currentRank ? parseInt(currentRank.replace(/\D/g, ''), 10) : Infinity;
        if (entryNum < currentNum) currentRank = entry.rank;
      }
    }

    for (const entry of entries) {
      if (!seen.has(entry.player_name)) {
        // Hallucination guard: if a member's rank is higher than what we inherited
        // going into this pass, we've already scrolled past that section — correct it.
        if (entry.rank && inheritedAtCallTime) {
          const entryNum = parseInt(entry.rank.replace(/\D/g, ''), 10);
          if (entryNum > inheritedNum) entry.rank = inheritedAtCallTime;
        }
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
  for (const coords of config.membersNavigationClicks) {
    await clickAt(coords);
  }
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
    const update = { joined: true };
    if (meaningful(rec.player_name))  update.player_name  = rec.player_name;
    if (meaningful(rec.rank))         update.rank         = rec.rank;
    if (meaningful(rec.level))        update.level        = rec.level;
    if (meaningful(rec.influence))    update.influence    = rec.influence;
    if (meaningful(rec.castle_level)) update.castle_level = rec.castle_level;
    if (meaningful(rec.last_online))  update.last_online  = rec.last_online;
    await pb.collection(col).update(ex.id, update);
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

  const firstImg = await capturer.capture();
  const guildMaster = await extractGuildMaster(firstImg);
  if (guildMaster) console.log(`[roster] Guild master: ${guildMaster.player_name}`);

  const scrolled = await scrollAndCapture();
  const records = guildMaster ? [guildMaster, ...scrolled] : scrolled;

  await syncToPocketBase(records, capturedAt);
  // Four back presses: members screen → main map (matches 5-click nav depth)
  for (let i = 0; i < 4; i++) {
    await clickAt({ x: config.guildCloseButtonX, y: config.guildCloseButtonY }, 800, true);
  }

  const enriched = records.map(r => ({ ...r, joined: true, captured_at: capturedAt }));
  console.log(`[roster] Captured ${enriched.length} members`);
  return { records: enriched, capturedAt };
}

module.exports = { capture, greedyMatch, levenshteinDistance, similarity, parseInfluence };
