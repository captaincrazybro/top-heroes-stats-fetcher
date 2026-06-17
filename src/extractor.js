// src/extractor.js
const { OpenAI } = require('openai');
const sharp = require('sharp');
const config = require('../config');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callVision(buffer, prompt) {
  const response = await client.chat.completions.create({
    model: config.visionModel,
    max_completion_tokens: 1024,
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
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/,  '')); } catch { return null; }
}

function stripEmojis(str) {
  return str.replace(/\p{Extended_Pictographic}/gu, '').trim();
}

async function detectGameState(imageBuffer) {
  const prompt = `Look at this image and return ONLY valid JSON: {"isMainMap": true/false, "eventTitle": "string or null"}

- isMainMap: true if the dominant view is a map with buildings and no overlay panel covering it
- eventTitle: if a panel titled "Routines" is open, look at the row of icon tabs along the very bottom edge of the image. Each tab has a small icon and a text label beneath it. Return the exact label text if it matches one of: "Guild Arms Race", "Guild Race", "Kingdom Duel". If no such panel is open, or none of those labels are visible, return null. NEVER return an empty string — use null if uncertain.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed && typeof parsed.isMainMap === 'boolean') return parsed;
    console.log(`[extractor] detectGameState parse failed (attempt ${attempt + 1}):`, text);
  }
  return { isMainMap: false, eventTitle: null };
}

async function locateButton(imageBuffer, description) {
  const prompt = `Look at this TopHeroes game screenshot.
Find: ${description}
Return ONLY valid JSON: {"found": true/false, "x": number, "y": number}
- found: true if the element is clearly visible, false if not present or uncertain
- x, y: pixel coordinates of the center of the element in the image
If found is false, omit x and y.`;

  const scaleX = config.visionCoordScaleX ?? 1;
  const scaleY = config.visionCoordScaleY ?? 1;
  for (let attempt = 0; attempt < 1; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.found === true && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return {
        x: Math.round(parsed.x * scaleX),
        y: Math.round(parsed.y * scaleY),
      };
    }
    console.log(`[extractor] locateButton "${description}" failed (attempt ${attempt + 1}):`, text);
  }
  throw new Error(`Could not locate: "${description}"`);
}

async function cropForRankings(buffer) {
  const bounds = config.rankingsCropBounds;
  if (!bounds) return buffer;
  try {
    return await sharp(buffer).extract(bounds).png().toBuffer();
  } catch (err) {
    console.warn('[extractor] Crop failed, using full screenshot:', err.message);
    return buffer;
  }
}

async function extractRankings(imageBuffer) {
  imageBuffer = await cropForRankings(imageBuffer);
  const prompt = `Look at this TopHeroes Rankings list screenshot.
Extract ALL visible player rows. Return ONLY valid JSON:
{"entries":[{"rank":number,"server":"#XXXXX","guild_tag":"XXX","player_name":"name","score":number}]}
- rank: the position number (use 2000 for entries showing "2000+")
- server: the #NNNNN server code
- guild_tag: text inside [brackets] before the player name
- player_name: text after the guild tag, no brackets — include special characters but skip emojis
- score: the numeric points value
IMPORTANT: There is always a pinned entry showing the current player's own position where the rank displays as "2000+" rather than a normal number. Do NOT include this entry in the results.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.entries && Array.isArray(parsed.entries)) {
      return parsed.entries.map(e => ({ ...e, player_name: stripEmojis(e.player_name ?? '') }));
    }
    console.log(`[extractor] extractRankings parse failed (attempt ${attempt + 1}):`, text);
  }
  return [];
}

module.exports = { detectGameState, locateButton, extractRankings };
