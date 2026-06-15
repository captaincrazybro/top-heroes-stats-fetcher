# Guild Roster Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guild roster capture routine that runs before daily event stats, syncing member records to a `guildRoster` PocketBase collection and a daily CSV snapshot using fuzzy name matching to detect departures and handle OCR drift.

**Architecture:** A self-contained `src/roster.js` module exports a single `capture()` function that opens the guild panel, scrolls/OCRs the members list, fuzzy-matches against existing PocketBase records, and writes updates. `index.js` calls it before `navigator.navigate()`. No existing modules change except `config.js`, `src/writers/csv.js`, `src/scheduler.js`, and `index.js`.

**Tech Stack:** `@nut-tree-fork/nut-js` (mouse clicks/scroll), `@anthropic-ai/sdk` (Claude Vision), `sharp` (screenshot cropping), `pocketbase` (upsert), `csv-writer` (CSV snapshot), Jest (unit tests for pure functions).

**Spec:** `docs/superpowers/specs/2026-06-14-guild-roster-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/roster.js` | Entire roster pipeline: pure utils, navigation, vision, scroll, PocketBase sync |
| Create | `tests/roster.test.js` | Unit tests for pure functions: `levenshteinDistance`, `similarity`, `parseInfluence`, `greedyMatch` |
| Modify | `config.js` | Add guild nav coords, members crop bounds, fuzzy-match tuning, `pb.rosterCollection` |
| Modify | `src/writers/csv.js` | Add `writeRoster(records, capturedAt)` export |
| Modify | `tests/writers/csv.test.js` | Add `writeRoster` tests |
| Modify | `src/scheduler.js` | Change cron from `50 2` to `45 2` |
| Modify | `index.js` | Import roster, call `roster.capture()` before `navigator.navigate()` in `run()` |

---

## Task 1: Pure utility functions (TDD)

`levenshteinDistance`, `similarity`, `parseInfluence`, `greedyMatch` in `src/roster.js` plus full unit test coverage.

**Files:**
- Create: `src/roster.js`
- Create: `tests/roster.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/roster.test.js`:

```js
const { levenshteinDistance, similarity, parseInfluence, greedyMatch } = require('../src/roster');

describe('levenshteinDistance', () => {
  test('identical strings → 0', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });
  test('empty vs non-empty → length of non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
  test('single substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });
  test('single insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });
  test('single deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });
  test('completely different strings same length', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('similarity', () => {
  test('identical strings → 1.0', () => {
    expect(similarity('Nyra', 'Nyra')).toBe(1.0);
  });
  test('case insensitive', () => {
    expect(similarity('Nyra', 'nyra')).toBe(1.0);
  });
  test('completely different strings same length → 0.0', () => {
    expect(similarity('abc', 'xyz')).toBe(0.0);
  });
  test('one char off on a 4-char string → 0.75', () => {
    expect(similarity('Nyra', 'Nyda')).toBeCloseTo(0.75);
  });
});

describe('parseInfluence', () => {
  test('M suffix', () => {
    expect(parseInfluence('341M')).toBe(341_000_000);
  });
  test('decimal M suffix', () => {
    expect(parseInfluence('83.5M')).toBe(83_500_000);
  });
  test('K suffix', () => {
    expect(parseInfluence('500K')).toBe(500_000);
  });
  test('B suffix', () => {
    expect(parseInfluence('1.5B')).toBe(1_500_000_000);
  });
  test('plain number string', () => {
    expect(parseInfluence('341000000')).toBe(341_000_000);
  });
  test('number type passthrough', () => {
    expect(parseInfluence(341_000_000)).toBe(341_000_000);
  });
  test('unrecognized format → 0', () => {
    expect(parseInfluence('???')).toBe(0);
  });
});

describe('greedyMatch', () => {
  test('exact match → matched', () => {
    const r = greedyMatch(['Nyra'], ['Nyra'], 0.85, 0.05);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0]).toMatchObject({ capturedIndex: 0, existingIndex: 0 });
    expect(r.newPlayers).toHaveLength(0);
    expect(r.departed).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(0);
  });

  test('below-threshold captured → newPlayer', () => {
    const r = greedyMatch(['Zyxqwv'], ['Nyra'], 0.85, 0.05);
    expect(r.matched).toHaveLength(0);
    expect(r.newPlayers).toEqual([0]);
    expect(r.departed).toEqual([0]);
  });

  test('unmatched existing → departed', () => {
    const r = greedyMatch(['Alice'], ['Alice', 'Bob'], 0.85, 0.05);
    expect(r.matched).toHaveLength(1);
    expect(r.departed).toEqual([1]);
  });

  test('one-to-one: two captures cannot both claim same existing', () => {
    // 'Alexandrow' (ci=1) scores 1.0; 'Alexandros' (ci=0) scores 0.9 — existing is taken first
    const r = greedyMatch(['Alexandros', 'Alexandrow'], ['Alexandrow'], 0.85, 0.05);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].capturedIndex).toBe(1);
    expect(r.newPlayers).toContain(0);
    expect(r.departed).toHaveLength(0);
  });

  test('ambiguous match → not merged, not inserted, not departed', () => {
    // sim('alexandrx', 'alexandra') = 8/9 ≈ 0.889; same for 'alexandrb' — gap = 0 < 0.05
    const r = greedyMatch(['Alexandrx'], ['Alexandra', 'Alexandrb'], 0.85, 0.05);
    expect(r.ambiguous).toContain(0);
    expect(r.matched).toHaveLength(0);
    expect(r.newPlayers).toHaveLength(0);  // not inserted
    expect(r.departed).toHaveLength(0);    // not marked departed
  });

  test('empty captured → all existing departed', () => {
    const r = greedyMatch([], ['Alice', 'Bob'], 0.85, 0.05);
    expect(r.matched).toHaveLength(0);
    expect(r.departed).toEqual([0, 1]);
  });

  test('empty existing → all captured new', () => {
    const r = greedyMatch(['Alice', 'Bob'], [], 0.85, 0.05);
    expect(r.matched).toHaveLength(0);
    expect(r.newPlayers).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx jest tests/roster.test.js --no-coverage
```

Expected: fail with "Cannot find module '../src/roster'"

- [ ] **Step 3: Create `src/roster.js` with pure functions only**

```js
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
  const dist = levenshteinDistance(al, bl);
  return 1 - dist / Math.max(al.length, bl.length);
}

function parseInfluence(str) {
  if (typeof str === 'number') return str;
  const s = String(str).trim().replace(/,/g, '');
  const match = s.match(/^([\d.]+)([MKB]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  if (suffix === 'B') return Math.round(num * 1_000_000_000);
  if (suffix === 'M') return Math.round(num * 1_000_000);
  if (suffix === 'K') return Math.round(num * 1_000);
  return Math.round(num);
}

function greedyMatch(capturedNames, existingNames, threshold, ambiguityGap) {
  const ambiguousCaptured = new Set();
  const protectedExisting = new Set();

  for (let ci = 0; ci < capturedNames.length; ci++) {
    if (existingNames.length === 0) break;
    const scores = existingNames
      .map((name, ei) => ({ ei, score: similarity(capturedNames[ci], name) }))
      .sort((a, b) => b.score - a.score);
    const best = scores[0].score;
    const second = scores.length > 1 ? scores[1].score : 0;
    if (best >= threshold && best - second < ambiguityGap) {
      ambiguousCaptured.add(ci);
      protectedExisting.add(scores[0].ei);
      if (scores.length > 1 && scores[1].score >= threshold) {
        protectedExisting.add(scores[1].ei);
      }
    }
  }

  const triples = [];
  for (let ci = 0; ci < capturedNames.length; ci++) {
    if (ambiguousCaptured.has(ci)) continue;
    for (let ei = 0; ei < existingNames.length; ei++) {
      const score = similarity(capturedNames[ci], existingNames[ei]);
      if (score >= threshold) triples.push({ ci, ei, score });
    }
  }
  triples.sort((a, b) => b.score - a.score);

  const assignedCaptured = new Set([...ambiguousCaptured]);
  const assignedExisting = new Set([...protectedExisting]);
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
    ambiguous:  [...ambiguousCaptured],
  };
}

// ── Placeholders (filled in later tasks) ────────────────────────────────────

async function capture() {
  throw new Error('Not yet implemented');
}

module.exports = { capture, greedyMatch, levenshteinDistance, similarity, parseInfluence };
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx jest tests/roster.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Verify the full test suite still passes**

```
npx jest --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```
git add src/roster.js tests/roster.test.js
git commit -m "feat: add pure utility functions for roster fuzzy matching (TDD)"
```

---

## Task 2: Config additions

**Files:**
- Modify: `config.js`

- [ ] **Step 1: Add roster config fields to `config.js`**

After the `kvkMaxRank` line, add:

```js
  // Guild roster navigation — pixel coords, UPDATE to match your screen
  guildButtonX: 0,
  guildButtonY: 0,
  membersPanelButtonX: 0,
  membersPanelButtonY: 0,
  guildCloseButtonX: 0,
  guildCloseButtonY: 0,

  // Crop region for the members panel screenshot — UPDATE to match your screen
  membersCropBounds: { left: 500, top: 60, width: 460, height: 720 },

  // Fuzzy sync tuning
  rosterMatchThreshold: 0.85,
  rosterAmbiguityGap: 0.05,
```

Then inside the `pb` object, add `rosterCollection`:

```js
  pb: {
    url:                process.env.POCKETBASE_URL,
    email:              process.env.POCKETBASE_EMAIL,
    password:           process.env.POCKETBASE_PASSWORD,
    collection:         'topHeroesEventRecords',
    rosterCollection:   'guildRoster',
  },
```

- [ ] **Step 2: Run the full test suite to confirm no breakage**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```
git add config.js
git commit -m "feat: add guild roster config fields"
```

---

## Task 3: writeRoster() in csv.js

**Files:**
- Modify: `src/writers/csv.js`
- Modify: `tests/writers/csv.test.js`

- [ ] **Step 1: Add failing tests to `tests/writers/csv.test.js`**

Append after the existing `describe('csvWriter.write', ...)` block:

```js
const rosterRecord = {
  player_name: 'Nyra', rank: 'R5', influence: 341_000_000,
  castle_level: 62, last_online: '22 min ago', joined: true,
  captured_at: '2026-06-14T02:45:00.000Z',
};

describe('csvWriter.writeRoster', () => {
  test('creates a roster file with headers and one row', async () => {
    const filePath = await csvWriter.writeRoster([rosterRecord], '2026-06-14T02:45:00.000Z');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('player_name');
    expect(content).toContain('Nyra');
    expect(content).toContain('341000000');
  });

  test('filename starts with roster-', async () => {
    const filePath = await csvWriter.writeRoster([rosterRecord], '2026-06-14T02:45:00.000Z');
    expect(path.basename(filePath)).toMatch(/^roster-/);
  });

  test('does not include main_queue fields', async () => {
    const filePath = await csvWriter.writeRoster([rosterRecord], '2026-06-14T02:45:00.000Z');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('main_queue');
  });

  test('writes empty file with only headers when records is empty', async () => {
    const filePath = await csvWriter.writeRoster([], '2026-06-14T02:45:00.000Z');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('player_name');
    expect(content.split('\n').filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx jest tests/writers/csv.test.js --no-coverage
```

Expected: fail with "csvWriter.writeRoster is not a function"

- [ ] **Step 3: Implement `writeRoster` in `src/writers/csv.js`**

Add after the existing `write` function, before `module.exports`:

```js
async function writeRoster(records, capturedAt) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const ts = capturedAt.replace('T', '_').replace(/:/g, '-').slice(0, 19);
  const filePath = path.join(outputDir, `roster-${ts}.csv`);

  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'player_name',  title: 'player_name' },
      { id: 'rank',         title: 'rank' },
      { id: 'influence',    title: 'influence' },
      { id: 'castle_level', title: 'castle_level' },
      { id: 'last_online',  title: 'last_online' },
      { id: 'joined',       title: 'joined' },
      { id: 'captured_at',  title: 'captured_at' },
    ],
  });

  await writer.writeRecords(records);
  console.log(`[csv] ${records.length} roster records → ${filePath}`);
  return filePath;
}
```

Update the export line:

```js
module.exports = { write, writeRoster, _setOutputDir };
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx jest tests/writers/csv.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src/writers/csv.js tests/writers/csv.test.js
git commit -m "feat: add writeRoster to csv writer"
```

---

## Task 4: extractMembers() in roster.js

Crops the screenshot to the members panel and calls Claude Vision to extract member entries.

**Files:**
- Modify: `src/roster.js`

- [ ] **Step 1: Add `extractMembers` and its helpers to `src/roster.js`**

Add these functions after the pure utilities section, before the `capture` placeholder. Replace the `capture` placeholder and `module.exports` with the updated version at the end of this step.

Insert after the `greedyMatch` function:

```js
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
```

- [ ] **Step 2: Run the full test suite to confirm no breakage**

```
npx jest --no-coverage
```

Expected: all tests pass (extractMembers uses the `@anthropic-ai/sdk` and `sharp` mocks from jest.config.js).

- [ ] **Step 3: Commit**

```
git add src/roster.js
git commit -m "feat: add extractMembers vision function to roster"
```

---

## Task 5: scrollAndCapture() in roster.js

Scroll loop that drives the members list through all pages, deduplicating by `player_name`.

**Files:**
- Modify: `src/roster.js`

- [ ] **Step 1: Add scroll helpers and `scrollAndCapture` to `src/roster.js`**

Add after `extractMembers`:

```js
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
  await mouse.setPosition({ x: config.scrollDragX, y: config.scrollDragFromY });
  await mouse.pressButton(Button.LEFT);
  await sleep(200);
  await mouse.move(straightTo({ x: config.scrollDragX, y: config.scrollDragToY }));
  await sleep(config.scrollDragLingerMs ?? 300);
  await mouse.releaseButton(Button.LEFT);
}

async function scrollAndCapture() {
  const seen = new Map(); // player_name → entry

  while (true) {
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
```

- [ ] **Step 2: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```
git add src/roster.js
git commit -m "feat: add scrollAndCapture loop to roster"
```

---

## Task 6: navigate() in roster.js

Opens the guild panel and members screen before the scroll loop.

**Files:**
- Modify: `src/roster.js`

- [ ] **Step 1: Add `navigate` function to `src/roster.js`**

Add after `scrollAndCapture`:

```js
// ── Navigation ────────────────────────────────────────────────────────────────

async function navigate() {
  await clickAt({ x: config.guildButtonX,       y: config.guildButtonY });
  await clickAt({ x: config.membersPanelButtonX, y: config.membersPanelButtonY });
}
```

- [ ] **Step 2: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```
git add src/roster.js
git commit -m "feat: add navigate function to roster"
```

---

## Task 7: syncToPocketBase() in roster.js

Fetches all existing roster records, runs `greedyMatch`, and applies matched/new/departed/ambiguous changes. Never touches `main_queue_influence` or `main_queue_faction`.

**Files:**
- Modify: `src/roster.js`

- [ ] **Step 1: Add PocketBase client helper and `syncToPocketBase` to `src/roster.js`**

Add after `navigate`:

```js
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

  const { matched, newPlayers, departed, ambiguous } = greedyMatch(
    capturedNames,
    existingNames,
    config.rosterMatchThreshold,
    config.rosterAmbiguityGap
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

  for (const ci of ambiguous) {
    console.warn(`[roster] Ambiguous match for "${capturedRecords[ci].player_name}" — skipped`);
  }

  console.log(`[roster] ${matched.length} matched (${rejoined} rejoined), ${newPlayers.length} new, ${departed.length} departed, ${ambiguous.length} ambiguous (review log)`);
}
```

- [ ] **Step 2: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass. Note: `syncToPocketBase` uses `getFullList` which the PocketBase mock doesn't expose — that's fine because unit tests never call `syncToPocketBase`.

- [ ] **Step 3: Commit**

```
git add src/roster.js
git commit -m "feat: add syncToPocketBase to roster with greedy fuzzy matching"
```

---

## Task 8: capture() top-level export

Wires everything together: navigate → scroll → sync → close guild panel → return records.

**Files:**
- Modify: `src/roster.js`

- [ ] **Step 1: Replace the `capture` placeholder in `src/roster.js`**

Find and replace:

```js
// ── Placeholders (filled in later tasks) ────────────────────────────────────

async function capture() {
  throw new Error('Not yet implemented');
}
```

With:

```js
// ── Top-level export ──────────────────────────────────────────────────────────

async function capture() {
  const capturedAt = new Date().toISOString();

  await navigate();
  const records = await scrollAndCapture();
  await syncToPocketBase(records, capturedAt);
  await clickAt({ x: config.guildCloseButtonX, y: config.guildCloseButtonY });

  console.log(`[roster] Captured ${records.length} members`);
  return { records, capturedAt };
}
```

- [ ] **Step 2: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```
git add src/roster.js
git commit -m "feat: implement capture() top-level function in roster"
```

---

## Task 9: Scheduler cron update + run() restructure

Shift the schedule 5 minutes earlier (02:45 UTC) and prepend the roster call to `run()`.

**Files:**
- Modify: `src/scheduler.js`
- Modify: `index.js`

- [ ] **Step 1: Update cron in `src/scheduler.js`**

Change line 5 from:

```js
cron.schedule('50 2 * * *', () => {
```

To:

```js
cron.schedule('45 2 * * *', () => {
```

Also update the console message on the last line:

```js
console.log('[scheduler] Scheduled for 02:45 UTC daily. Waiting...');
```

- [ ] **Step 2: Update `index.js`**

Add the roster import after the existing requires at the top (after the `config` require):

```js
const roster    = require('./src/roster');
```

Replace the `run` function body. The existing `run` starts with:

```js
async function run() {
  const capturedAt = new Date().toISOString();
  console.log(`[run] Starting at ${capturedAt}`);

  await launcher.launch();

  try {
    const { eventType, pages } = await navigator.navigate();
```

Replace it with:

```js
async function run() {
  const capturedAt = new Date().toISOString();
  console.log(`[run] Starting at ${capturedAt}`);

  await launcher.launch();

  try {
    // 1. Roster first — game on main map, guild panel not yet open
    try {
      const { records, capturedAt: rosterAt } = await roster.capture();
      await csvWriter.writeRoster(records, rosterAt);
      console.log(`[run] Roster: ${records.length} members captured`);
    } catch (err) {
      console.error('[run] Roster capture failed:', err.message);
      // non-fatal — continue to event stats; game should still be near main map
    }

    // 2. Event stats — roster.capture() left the game on the main map
    const { eventType, pages } = await navigator.navigate();
```

Leave the rest of `run()` unchanged from the `eventType` line onward.

- [ ] **Step 3: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add src/scheduler.js index.js
git commit -m "feat: add roster capture to daily run, shift schedule to 02:45 UTC"
```

---

## Self-Review Checklist

After completing all tasks, verify against the spec:

- [ ] `levenshteinDistance` and `similarity` are pure and case-insensitive ✓
- [ ] `parseInfluence` handles M/K/B suffix and plain numbers ✓
- [ ] `greedyMatch` returns `{ matched, newPlayers, departed, ambiguous }` ✓
- [ ] Ambiguous captures protect the top-2 existing candidates from `departed` ✓
- [ ] `main_queue_influence` / `main_queue_faction` never appear in update payloads ✓
- [ ] On insert, both manual fields are set to `null` ✓
- [ ] Departed records get `joined = false` (not deleted) ✓
- [ ] `capture()` closes the guild panel before returning ✓
- [ ] `writeRoster` omits main_queue fields from CSV headers ✓
- [ ] Roster failure in `run()` is non-fatal (event stats proceed) ✓
- [ ] Cron changed from `50 2` to `45 2` ✓
- [ ] `greedyMatch` is exported so `index.js` can reuse it in Phase 2 ✓
