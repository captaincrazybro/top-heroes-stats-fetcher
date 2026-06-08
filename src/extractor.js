// src/extractor.js
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: toBase64(buffer) },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return response.content[0]?.text ?? '';
}

function tryParseJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function detectGameState(imageBuffer) {
  const prompt = `Look at this TopHeroes game screenshot.
Return ONLY valid JSON: {"isMainMap": true/false, "eventTitle": "string or null"}
- isMainMap: true if the main city/town map with buildings is the main view
- eventTitle: if a Routines/event panel is open, extract its title exactly as shown (e.g. "Guild Arms Race", "Guild Race", "Kingdom Duel"); otherwise null`;

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

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.found === true && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: Math.round(parsed.x), y: Math.round(parsed.y) };
    }
    console.log(`[extractor] locateButton "${description}" failed (attempt ${attempt + 1}):`, text);
  }
  throw new Error(`Could not locate: "${description}"`);
}

async function extractRankings(imageBuffer) {
  const prompt = `Look at this TopHeroes Rankings list screenshot.
Extract ALL visible player rows. Return ONLY valid JSON:
{"entries":[{"rank":number,"server":"#XXXXX","guild_tag":"XXX","player_name":"name","score":number}]}
- rank: the position number (use 2000 for entries showing "2000+")
- server: the #NNNNN server code
- guild_tag: text inside [brackets] before the player name
- player_name: text after the guild tag, no brackets
- score: the numeric points value`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(imageBuffer, prompt);
    const parsed = tryParseJSON(text);
    if (parsed?.entries && Array.isArray(parsed.entries)) return parsed.entries;
    console.log(`[extractor] extractRankings parse failed (attempt ${attempt + 1}):`, text);
  }
  return [];
}

module.exports = { detectGameState, locateButton, extractRankings };
