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

// ── Placeholders (filled in later tasks) ────────────────────────────────────

async function capture() {
  throw new Error('Not yet implemented');
}

module.exports = { capture, greedyMatch, levenshteinDistance, similarity, parseInfluence };
