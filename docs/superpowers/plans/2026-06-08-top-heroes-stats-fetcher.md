# TopHeroes Stats Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scheduled Node.js bot that launches TopHeroes, screen-scrapes guild ranking stats via Claude Vision, and writes them to CSV and PocketBase.

**Architecture:** A pipeline of focused modules — `launcher` manages the game process lifecycle, `navigator` drives the UI via mouse automation, `extractor` reads structured data from screenshots via Claude Haiku Vision, and `aggregator` + `writers` handle filtering and persistence. Everything is wired by a single `run()` function called by both the scheduler and the manual CLI flag.

**Tech Stack:** Node.js, `@nut-tree/nut-js` (mouse/keyboard), `screenshot-desktop` (screen capture), `@anthropic-ai/sdk` (Claude Haiku Vision), `node-cron` (scheduling), `pocketbase` (DB client), `csv-writer` (CSV output), `jest` (testing)

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts, Jest config |
| `jest.config.js` | Jest setup with ESM-compatible mocks |
| `config.js` | All constants: coordinates, timeouts, guild tag, PocketBase collection names |
| `.env.example` | Template for required environment variables |
| `.gitignore` | Excludes `.env`, `state.json`, `output/`, `node_modules/` |
| `index.js` | Entry point: calls `run()`, handles `--run-now` flag |
| `src/scheduler.js` | `node-cron` job at 2:50 AM UTC |
| `src/launcher.js` | Spawn game, wait for window, wait for map load, ensure fullscreen, close process |
| `src/capturer.js` | Full-screen PNG capture via `screenshot-desktop` |
| `src/extractor.js` | Claude Vision API: `detectGameState()` and `extractRankings()` |
| `src/aggregator.js` | Deduplicate scroll pages, filter by guild tag |
| `src/state.js` | Read/write `state.json` for GR event start date |
| `src/writers/csv.js` | Write timestamped CSV to `output/` |
| `src/writers/pocketbase.js` | Authenticate + INSERT (GAR/KvK) or UPSERT (GR) |
| `tests/__mocks__/pocketbase.js` | Manual ESM-compatible mock for PocketBase SDK |
| `tests/__mocks__/@anthropic-ai/sdk.js` | Manual mock for Anthropic SDK |
| `tests/capturer.test.js` | Unit tests for capturer |
| `tests/extractor.test.js` | Unit tests for extractor |
| `tests/aggregator.test.js` | Unit tests for aggregator |
| `tests/state.test.js` | Unit tests for state |
| `tests/writers/csv.test.js` | Unit tests for CSV writer |
| `tests/writers/pocketbase.test.js` | Unit tests for PocketBase writer |
| `tests/launcher.test.js` | Unit tests for launcher |

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `jest.config.js`
- Create: `config.js`
- Create: `.env.example`
- Create: `.gitignore`
- Create directory structure

- [ ] **Step 1: Initialize project and install dependencies**

```bash
npm init -y
npm install @anthropic-ai/sdk csv-writer dotenv node-cron pocketbase screenshot-desktop @nut-tree/nut-js
npm install --save-dev jest
```

> Note: If `@nut-tree/nut-js` fails to install or has native build issues, use the community fork: `npm install @nut-tree-fork/nut-js` and update all `require('@nut-tree/nut-js')` references accordingly.

- [ ] **Step 2: Update `package.json` scripts**

Open `package.json` and replace the `"scripts"` section with:

```json
"scripts": {
  "start": "node index.js",
  "run-now": "node index.js --run-now",
  "test": "jest"
},
```

- [ ] **Step 3: Create `jest.config.js`**

```js
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^pocketbase$': '<rootDir>/tests/__mocks__/pocketbase.js',
  },
};
```

- [ ] **Step 4: Create `tests/__mocks__/pocketbase.js`**

```js
// tests/__mocks__/pocketbase.js
const mockCollection = {
  authWithPassword: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 'new-id' }),
  update: jest.fn().mockResolvedValue({ id: 'updated-id' }),
  getList: jest.fn().mockResolvedValue({ totalItems: 0, items: [] }),
};

const PocketBase = jest.fn().mockImplementation(() => ({
  admins: { authWithPassword: jest.fn().mockResolvedValue({}) },
  collection: jest.fn().mockReturnValue(mockCollection),
}));

PocketBase._mockCollection = mockCollection;
module.exports = PocketBase;
```

- [ ] **Step 5: Create `.env.example`**

```
ANTHROPIC_API_KEY=your_anthropic_key_here
POCKETBASE_URL=http://localhost:8090
POCKETBASE_EMAIL=admin@example.com
POCKETBASE_PASSWORD=your_password_here
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
.env
state.json
output/
```

- [ ] **Step 7: Create `config.js`**

```js
// config.js
require('dotenv').config();

module.exports = {
  guildTag: 'WAR',
  windowTitle: 'Top Heroes',
  gameExePath: 'C:\\path\\to\\TopHeroes.exe', // UPDATE: set to actual executable path
  launchTimeoutMs: 120_000,
  loadTimeoutMs: 180_000,

  // Button positions are located dynamically at runtime by Claude Vision — no manual calibration needed.
  // Only the scroll drag region is hardcoded (it targets the list area generally, not a specific button).
  scrollDragX: 727,              // horizontal center of the rankings list
  scrollDragFromY: 650,          // placeholder — Y where drag starts (near list bottom)
  scrollDragToY: 250,            // placeholder — Y where drag ends (near list top)
  scrollReboundWaitMs: 1500,    // ms to wait after release for new items to load + rebound to settle
  scrollEntriesPerDrag: 5,      // entries scrolled per drag — used to calculate glitch recovery drags
  scrollGlitchThreshold: 15,    // if first-entry rank drops more than this below max-seen, it's a glitch
  kvkMaxRank: 200,              // stop scrolling KvK once rank exceeds this

  anthropicModel: 'claude-haiku-4-5-20251001',

  pb: {
    url:                    process.env.POCKETBASE_URL,
    email:                  process.env.POCKETBASE_EMAIL,
    password:               process.env.POCKETBASE_PASSWORD,
    eventRecordsCollection: 'event_records',
    grRecordsCollection:    'gr_records',
  },
};
```

- [ ] **Step 8: Create directory structure**

```bash
mkdir -p src/writers tests/__mocks__/@anthropic-ai tests/writers output
touch src/launcher.js src/capturer.js src/extractor.js src/aggregator.js src/state.js src/scheduler.js src/writers/csv.js src/writers/pocketbase.js index.js
```

- [ ] **Step 9: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold project structure and dependencies"
```

---

## Task 1: capturer module

**Files:**
- Create: `src/capturer.js`
- Create: `tests/capturer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/capturer.test.js
jest.mock('screenshot-desktop', () => jest.fn());

const screenshot = require('screenshot-desktop');
const capturer = require('../src/capturer');

describe('capturer', () => {
  test('capture() returns a Buffer', async () => {
    const fakeBuffer = Buffer.from('fake-png');
    screenshot.mockResolvedValue(fakeBuffer);

    const result = await capturer.capture();

    expect(screenshot).toHaveBeenCalledWith({ format: 'png' });
    expect(result).toBe(fakeBuffer);
  });

  test('capture() propagates errors from screenshot-desktop', async () => {
    screenshot.mockRejectedValue(new Error('no display'));

    await expect(capturer.capture()).rejects.toThrow('no display');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/capturer.test.js --no-coverage
```

Expected: FAIL — `capturer.capture is not a function`

- [ ] **Step 3: Implement `src/capturer.js`**

```js
// src/capturer.js
const screenshot = require('screenshot-desktop');

async function capture() {
  return screenshot({ format: 'png' });
}

module.exports = { capture };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/capturer.test.js --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/capturer.js tests/capturer.test.js
git commit -m "feat: add capturer module"
```

---

## Task 2: extractor module

**Files:**
- Create: `src/extractor.js`
- Create: `tests/__mocks__/@anthropic-ai/sdk.js`
- Create: `tests/extractor.test.js`

- [ ] **Step 1: Create Anthropic SDK mock**

```js
// tests/__mocks__/@anthropic-ai/sdk.js
const mockCreate = jest.fn();

const Anthropic = jest.fn().mockImplementation(() => ({
  messages: { create: mockCreate },
}));

Anthropic._mockCreate = mockCreate;
module.exports = Anthropic;
```

Add it to `jest.config.js` moduleNameMapper:

```js
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^pocketbase$': '<rootDir>/tests/__mocks__/pocketbase.js',
    '^@anthropic-ai/sdk$': '<rootDir>/tests/__mocks__/@anthropic-ai/sdk.js',
  },
};
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/extractor.test.js
const Anthropic = require('@anthropic-ai/sdk');
const extractor = require('../src/extractor');

const mockCreate = Anthropic._mockCreate;
const fakeBuffer = Buffer.from('fake-png');

function mockResponse(text) {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }] });
}

beforeEach(() => jest.clearAllMocks());

describe('extractor.detectGameState', () => {
  test('returns parsed state when Claude responds with valid JSON', async () => {
    mockResponse('{"isMainMap":true,"eventTitle":null}');
    const result = await extractor.detectGameState(fakeBuffer);
    expect(result).toEqual({ isMainMap: true, eventTitle: null });
  });

  test('parses eventTitle from event panel response', async () => {
    mockResponse('{"isMainMap":false,"eventTitle":"Guild Arms Race"}');
    const result = await extractor.detectGameState(fakeBuffer);
    expect(result).toEqual({ isMainMap: false, eventTitle: 'Guild Arms Race' });
  });

  test('retries once on bad JSON and returns null fallback on second failure', async () => {
    mockResponse('not valid json at all');
    const result = await extractor.detectGameState(fakeBuffer);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ isMainMap: false, eventTitle: null });
  });
});

describe('extractor.locateButton', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns {x, y} when Claude responds with valid coordinates', async () => {
    mockResponse('{"x":1415,"y":100,"found":true}');
    const result = await extractor.locateButton(fakeBuffer, 'the Events icon');
    expect(result).toEqual({ x: 1415, y: 100 });
  });

  test('throws when Claude reports element not found', async () => {
    mockResponse('{"found":false}');
    await expect(extractor.locateButton(fakeBuffer, 'the Ranking button')).rejects.toThrow('Could not locate');
  });

  test('retries once on bad JSON then throws', async () => {
    mockResponse('not json');
    await expect(extractor.locateButton(fakeBuffer, 'the Ranking button')).rejects.toThrow('Could not locate');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe('extractor.extractRankings', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed player entries from valid Claude response', async () => {
    const entries = [
      { rank: 1, server: '#10607', guild_tag: 'WAR', player_name: 'CaptinLevi', score: 3876069 },
    ];
    mockResponse(JSON.stringify({ entries }));
    const result = await extractor.extractRankings(fakeBuffer);
    expect(result).toEqual(entries);
  });

  test('returns empty array after two failed parse attempts', async () => {
    mockResponse('garbage response');
    const result = await extractor.extractRankings(fakeBuffer);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
npx jest tests/extractor.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Implement `src/extractor.js`**

```js
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
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
npx jest tests/extractor.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/extractor.js tests/extractor.test.js jest.config.js "tests/__mocks__/@anthropic-ai/sdk.js"
git commit -m "feat: add extractor module with Claude Vision integration"
```

---

## Task 3: aggregator module

**Files:**
- Create: `src/aggregator.js`
- Create: `tests/aggregator.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/aggregator.test.js
const aggregator = require('../src/aggregator');

const e = (overrides) => ({
  rank: 1, server: '#10607', guild_tag: 'WAR', player_name: 'Alpha', score: 100,
  ...overrides,
});

describe('aggregator.process', () => {
  test('flattens and deduplicates entries across scroll pages by player_name+server', () => {
    const pages = [
      [e({ player_name: 'Alpha' }), e({ player_name: 'Beta' })],
      [e({ player_name: 'Beta' }), e({ player_name: 'Gamma' })],
    ];
    const result = aggregator.process(pages, 'WAR');
    expect(result.map(r => r.player_name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('filters out entries whose guild_tag does not match', () => {
    const pages = [[
      e({ guild_tag: 'WAR', player_name: 'Friend' }),
      e({ guild_tag: 'FOE', player_name: 'Enemy' }),
    ]];
    const result = aggregator.process(pages, 'WAR');
    expect(result).toHaveLength(1);
    expect(result[0].player_name).toBe('Friend');
  });

  test('treats same player_name on different servers as distinct entries', () => {
    const pages = [[
      e({ player_name: 'Alpha', server: '#10607' }),
      e({ player_name: 'Alpha', server: '#10608' }),
    ]];
    const result = aggregator.process(pages, 'WAR');
    expect(result).toHaveLength(2);
  });

  test('returns empty array for empty input', () => {
    expect(aggregator.process([], 'WAR')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/aggregator.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement `src/aggregator.js`**

```js
// src/aggregator.js
function process(pages, guildTag) {
  const seen = new Set();
  const results = [];

  for (const page of pages) {
    for (const entry of page) {
      if (entry.guild_tag !== guildTag) continue;
      const key = `${entry.player_name}|${entry.server}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(entry);
    }
  }

  return results;
}

module.exports = { process };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/aggregator.test.js --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/aggregator.js tests/aggregator.test.js
git commit -m "feat: add aggregator module for dedup and guild filtering"
```

---

## Task 4: state module

**Files:**
- Create: `src/state.js`
- Create: `tests/state.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/state.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

let state;
let tmpPath;

beforeEach(() => {
  tmpPath = path.join(os.tmpdir(), `state-test-${Date.now()}.json`);
  jest.resetModules();
  state = require('../src/state');
  state._setPath(tmpPath);
});

afterEach(() => {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
});

describe('state', () => {
  test('getGrEventStartDate returns null when file does not exist', () => {
    expect(state.getGrEventStartDate()).toBeNull();
  });

  test('setGrEventStartDate writes date; getGrEventStartDate reads it back', () => {
    state.setGrEventStartDate('2026-06-01');
    expect(state.getGrEventStartDate()).toBe('2026-06-01');
  });

  test('setGrEventStartDate overwrites existing value', () => {
    state.setGrEventStartDate('2026-06-01');
    state.setGrEventStartDate('2026-06-08');
    expect(state.getGrEventStartDate()).toBe('2026-06-08');
  });

  test('clearGrEventStartDate resets stored date to null', () => {
    state.setGrEventStartDate('2026-06-01');
    state.clearGrEventStartDate();
    expect(state.getGrEventStartDate()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/state.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement `src/state.js`**

```js
// src/state.js
const fs = require('fs');
const path = require('path');

let statePath = path.resolve(__dirname, '..', 'state.json');

function _setPath(p) { statePath = p; }

function _read() {
  if (!fs.existsSync(statePath)) return {};
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return {}; }
}

function _write(data) {
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf8');
}

function getGrEventStartDate() {
  return _read().gr_event_start_date ?? null;
}

function setGrEventStartDate(dateStr) {
  const data = _read();
  data.gr_event_start_date = dateStr;
  _write(data);
}

function clearGrEventStartDate() {
  const data = _read();
  delete data.gr_event_start_date;
  _write(data);
}

module.exports = { getGrEventStartDate, setGrEventStartDate, clearGrEventStartDate, _setPath };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/state.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "feat: add state module for GR event start date persistence"
```

---

## Task 5: CSV writer

**Files:**
- Create: `src/writers/csv.js`
- Create: `tests/writers/csv.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/writers/csv.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

let csvWriter;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
  jest.resetModules();
  csvWriter = require('../../src/writers/csv');
  csvWriter._setOutputDir(tmpDir);
});

afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

const record = {
  rank: 1, player_name: 'Alpha', guild_tag: 'WAR', server: '#10607',
  score: 5000, event_type: 'GAR', event_start_date: '2026-06-01',
  captured_at: '2026-06-08T02:50:00.000Z',
};

describe('csvWriter.write', () => {
  test('creates a file with headers and one row per record', async () => {
    const filePath = await csvWriter.write([record], 'GAR', '2026-06-08T02:50:00.000Z');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('player_name');
    expect(content).toContain('Alpha');
    expect(content).toContain('5000');
  });

  test('filename contains ISO date and event type', async () => {
    const filePath = await csvWriter.write([record], 'KvK', '2026-06-08T02:50:00.000Z');
    expect(path.basename(filePath)).toMatch(/2026-06-08.*KvK.*\.csv/);
  });

  test('writes empty file with only headers when records is empty', async () => {
    const filePath = await csvWriter.write([], 'GAR', '2026-06-08T02:50:00.000Z');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('player_name');
    expect(content.split('\n').filter(Boolean)).toHaveLength(1); // header only
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/writers/csv.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement `src/writers/csv.js`**

```js
// src/writers/csv.js
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');

let outputDir = path.resolve(__dirname, '..', '..', 'output');

function _setOutputDir(dir) { outputDir = dir; }

async function write(records, eventType, capturedAt) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const ts = capturedAt.replace('T', '_').replace(/:/g, '-').slice(0, 19);
  const filePath = path.join(outputDir, `${ts}_${eventType}.csv`);

  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'rank',             title: 'rank' },
      { id: 'player_name',      title: 'player_name' },
      { id: 'guild_tag',        title: 'guild_tag' },
      { id: 'server',           title: 'server' },
      { id: 'score',            title: 'score' },
      { id: 'event_type',       title: 'event_type' },
      { id: 'event_start_date', title: 'event_start_date' },
      { id: 'captured_at',      title: 'captured_at' },
    ],
  });

  await writer.writeRecords(records);
  console.log(`[csv] ${records.length} records → ${filePath}`);
  return filePath;
}

module.exports = { write, _setOutputDir };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/writers/csv.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/writers/csv.js tests/writers/csv.test.js
git commit -m "feat: add CSV writer module"
```

---

## Task 6: PocketBase writer

**Files:**
- Create: `src/writers/pocketbase.js`
- Create: `tests/writers/pocketbase.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/writers/pocketbase.test.js
const PocketBase = require('pocketbase');
const pbWriter = require('../../src/writers/pocketbase');

const mock = PocketBase._mockCollection;

const baseRecord = {
  rank: 1, player_name: 'Alpha', guild_tag: 'WAR', server: '#10607',
  score: 5000, event_type: 'GAR', event_start_date: '2026-06-01',
  captured_at: '2026-06-08T02:50:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mock.getList.mockResolvedValue({ totalItems: 0, items: [] });
  pbWriter._resetClient(); // ensure cached PocketBase client is reset between tests
});

describe('pbWriter.write for GAR', () => {
  test('INSERTs each record into event_records collection', async () => {
    await pbWriter.write([baseRecord], 'GAR');
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledWith(baseRecord);
  });

  test('INSERTs multiple records', async () => {
    const r2 = { ...baseRecord, player_name: 'Beta' };
    await pbWriter.write([baseRecord, r2], 'GAR');
    expect(mock.create).toHaveBeenCalledTimes(2);
  });
});

describe('pbWriter.write for KvK', () => {
  test('INSERTs each record into event_records collection', async () => {
    const kvkRecord = { ...baseRecord, event_type: 'KvK' };
    await pbWriter.write([kvkRecord], 'KvK');
    expect(mock.create).toHaveBeenCalledWith(kvkRecord);
  });
});

describe('pbWriter.write for GR', () => {
  test('UPSERTs: calls update() when existing record found', async () => {
    mock.getList.mockResolvedValue({ totalItems: 1, items: [{ id: 'existing-id' }] });
    const grRecord = { ...baseRecord, event_type: 'GR' };

    await pbWriter.write([grRecord], 'GR');

    expect(mock.update).toHaveBeenCalledWith('existing-id', grRecord);
    expect(mock.create).not.toHaveBeenCalled();
  });

  test('UPSERTs: calls create() when no existing record found', async () => {
    mock.getList.mockResolvedValue({ totalItems: 0, items: [] });
    const grRecord = { ...baseRecord, event_type: 'GR' };

    await pbWriter.write([grRecord], 'GR');

    expect(mock.create).toHaveBeenCalledWith(grRecord);
    expect(mock.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/writers/pocketbase.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement `src/writers/pocketbase.js`**

```js
// src/writers/pocketbase.js
const PocketBase = require('pocketbase');
const config = require('../../config');

let _pb = null;

async function getClient() {
  if (_pb) return _pb;
  const pb = new PocketBase(config.pb.url);
  await pb.admins.authWithPassword(config.pb.email, config.pb.password);
  _pb = pb;
  return _pb;
}

async function insertRecord(pb, record) {
  const collection = config.pb.eventRecordsCollection;
  await pb.collection(collection).create(record);
}

async function upsertGrRecord(pb, record) {
  const collection = config.pb.grRecordsCollection;
  const filter = `player_name = "${record.player_name}" && event_start_date = "${record.event_start_date}"`;
  const existing = await pb.collection(collection).getList(1, 1, { filter });

  if (existing.totalItems > 0) {
    await pb.collection(collection).update(existing.items[0].id, record);
  } else {
    await pb.collection(collection).create(record);
  }
}

async function write(records, eventType) {
  const pb = await getClient();

  for (const record of records) {
    if (eventType === 'GR') {
      await upsertGrRecord(pb, record);
    } else {
      await insertRecord(pb, record);
    }
  }

  console.log(`[pocketbase] ${records.length} records written (${eventType})`);
}

// Exposed for testing: reset the cached client between test runs
function _resetClient() { _pb = null; }

module.exports = { write, _resetClient };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/writers/pocketbase.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/writers/pocketbase.js tests/writers/pocketbase.test.js
git commit -m "feat: add PocketBase writer with INSERT and GR UPSERT"
```

---

## Task 7: launcher module

**Files:**
- Create: `src/launcher.js`
- Create: `tests/launcher.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/launcher.test.js
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({ pid: 12345, kill: jest.fn() }),
  execSync: jest.fn(),
}));
jest.mock('../src/capturer', () => ({ capture: jest.fn() }));
jest.mock('../src/extractor', () => ({ detectGameState: jest.fn() }));

const { spawn, execSync } = require('child_process');
const capturer = require('../src/capturer');
const extractor = require('../src/extractor');
const launcher = require('../src/launcher');

beforeEach(() => {
  jest.clearAllMocks();
  launcher._reset();
});

describe('launcher.launch', () => {
  test('spawns the game process using configured path', async () => {
    execSync.mockReturnValue('1'); // window visible immediately
    capturer.capture.mockResolvedValue(Buffer.from('img'));
    extractor.detectGameState.mockResolvedValue({ isMainMap: true, eventTitle: null });

    await launcher.launch();

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('TopHeroes'),
      [],
      expect.objectContaining({ detached: true })
    );
  });

  test('throws if window does not appear within timeout', async () => {
    execSync.mockReturnValue('0'); // window never appears
    launcher._setTimeouts(100, 100); // short timeouts for test

    await expect(launcher.launch()).rejects.toThrow('timed out waiting for window');
  });

  test('throws if main map not detected within load timeout', async () => {
    execSync.mockReturnValue('1'); // window visible
    capturer.capture.mockResolvedValue(Buffer.from('img'));
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: null });
    launcher._setTimeouts(5000, 100); // load timeout is short

    await expect(launcher.launch()).rejects.toThrow('timed out waiting for game to load');
  });
});

describe('launcher.close', () => {
  test('kills the spawned process', async () => {
    execSync.mockReturnValue('1');
    capturer.capture.mockResolvedValue(Buffer.from('img'));
    extractor.detectGameState.mockResolvedValue({ isMainMap: true, eventTitle: null });

    await launcher.launch();
    launcher.close();

    const proc = spawn.mock.results[0].value;
    expect(proc.kill).toHaveBeenCalled();
  });

  test('does not throw if no process was launched', () => {
    expect(() => launcher.close()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/launcher.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement `src/launcher.js`**

```js
// src/launcher.js
const { spawn, execSync } = require('child_process');
const { keyboard, Key } = require('@nut-tree/nut-js');
const config = require('../config');
const capturer = require('./capturer');
const extractor = require('./extractor');

let gameProcess = null;
let launchTimeoutMs = config.launchTimeoutMs;
let loadTimeoutMs = config.loadTimeoutMs;

function _reset() { gameProcess = null; }
function _setTimeouts(launch, load) { launchTimeoutMs = launch; loadTimeoutMs = load; }

function isWindowVisible(titleFragment) {
  try {
    const result = execSync(
      `powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -like '*${titleFragment}*'} | Measure-Object | Select-Object -ExpandProperty Count"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return parseInt(result.trim(), 10) > 0;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForWindow(intervalMs = 2000) {
  const deadline = Date.now() + launchTimeoutMs;
  while (Date.now() < deadline) {
    if (isWindowVisible(config.windowTitle)) return;
    await sleep(intervalMs);
  }
  throw new Error(`timed out waiting for window: ${config.windowTitle}`);
}

async function waitForReady(intervalMs = 5000) {
  const deadline = Date.now() + loadTimeoutMs;
  while (Date.now() < deadline) {
    const img = await capturer.capture();
    const state = await extractor.detectGameState(img);
    if (state.isMainMap) return;
    await sleep(intervalMs);
  }
  throw new Error('timed out waiting for game to load');
}

async function ensureFullscreen() {
  try {
    const result = execSync(
      `powershell -Command "$s = Add-Type -AssemblyName System.Windows.Forms -PassThru; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width.ToString() + 'x' + [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height.ToString()"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const [sw, sh] = result.trim().split('x').map(Number);

    const winResult = execSync(
      `powershell -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr h, out RECT r); } [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }' -Language CSharp; $p=(Get-Process | Where {$_.MainWindowTitle -like '*${config.windowTitle}*'} | Select -First 1); $r=New-Object RECT; [W]::GetWindowRect($p.MainWindowHandle,[ref]$r); ($r.R-$r.L).ToString()+'x'+($r.B-$r.T).ToString()"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const [ww, wh] = winResult.trim().split('x').map(Number);

    if (ww !== sw || wh !== sh) {
      console.log('[launcher] Game is not fullscreen — sending Alt+Enter');
      await keyboard.pressKey(Key.LeftAlt, Key.Return);
      await keyboard.releaseKey(Key.Return, Key.LeftAlt);
      await sleep(2000);
    }
  } catch (err) {
    console.warn('[launcher] Could not check fullscreen state:', err.message);
  }
}

async function launch() {
  console.log('[launcher] Spawning TopHeroes...');
  gameProcess = spawn(config.gameExePath, [], { detached: true, stdio: 'ignore' });
  gameProcess.unref();

  console.log('[launcher] Waiting for window...');
  await waitForWindow();

  console.log('[launcher] Waiting for game to load...');
  await waitForReady();

  console.log('[launcher] Ensuring fullscreen...');
  await ensureFullscreen();

  console.log('[launcher] Game ready.');
}

function close() {
  if (!gameProcess) return;
  try {
    gameProcess.kill();
    console.log('[launcher] TopHeroes closed.');
  } catch (err) {
    console.warn('[launcher] Failed to close process:', err.message);
  }
  gameProcess = null;
}

module.exports = { launch, close, _reset, _setTimeouts };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/launcher.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/launcher.js tests/launcher.test.js
git commit -m "feat: add launcher module for game process lifecycle"
```

---

## Task 8: navigator module

**Files:**
- Create: `src/navigator.js`
- Create: `tests/navigator.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/navigator.test.js
jest.mock('@nut-tree/nut-js', () => ({
  mouse: {
    setPosition: jest.fn().mockResolvedValue(undefined),
    leftClick: jest.fn().mockResolvedValue(undefined),
    pressButton: jest.fn().mockResolvedValue(undefined),
    releaseButton: jest.fn().mockResolvedValue(undefined),
  },
  keyboard: {
    pressKey: jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key: { LeftAlt: 'LeftAlt', Return: 'Return' },
  Button: { LEFT: 'LEFT' },
}));
jest.mock('../src/capturer', () => ({ capture: jest.fn() }));
jest.mock('../src/extractor', () => ({
  detectGameState: jest.fn(),
  locateButton: jest.fn().mockResolvedValue({ x: 100, y: 200 }),
  extractRankings: jest.fn(),
}));

const { mouse } = require('@nut-tree/nut-js');
const capturer = require('../src/capturer');
const extractor = require('../src/extractor');
const navigator = require('../src/navigator');

const img = Buffer.from('img');

beforeEach(() => {
  jest.clearAllMocks();
  capturer.capture.mockResolvedValue(img);
});

describe('navigator.detectEventType', () => {
  test('maps "Guild Arms Race" to GAR', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Guild Arms Race' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('GAR');
  });

  test('maps "Guild Race" to GR', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Guild Race' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('GR');
  });

  test('maps "Kingdom Duel" to KvK', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Kingdom Duel' });
    const result = await navigator.detectEventType(img);
    expect(result).toBe('KvK');
  });

  test('throws on unrecognized event title', async () => {
    extractor.detectGameState.mockResolvedValue({ isMainMap: false, eventTitle: 'Unknown Event' });
    await expect(navigator.detectEventType(img)).rejects.toThrow('Unrecognized event title');
  });
});

describe('navigator.scrollAndCapture', () => {
  test('stops when last visible rank matches highest rank seen (end of list)', async () => {
    const page1 = [{ rank: 1, player_name: 'A', score: 100 }, { rank: 2, player_name: 'B', score: 90 }];
    const page2 = [{ rank: 2, player_name: 'B', score: 90 }, { rank: 3, player_name: 'C', score: 80 }];
    const page3 = [{ rank: 3, player_name: 'C', score: 80 }]; // lastVisible.rank (3) === highestRankSeen (3) → stop

    extractor.extractRankings
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3);

    const [allEntries] = await navigator.scrollAndCapture();

    expect(allEntries).toHaveLength(3); // A, B, C deduplicated
    expect(mouse.pressButton).toHaveBeenCalledTimes(2); // dragged twice (page1→2, page2→3)
    expect(mouse.releaseButton).toHaveBeenCalledTimes(2);
  });

  test('stops and trims entries when a rank exceeds maxRank', async () => {
    const page1 = [{ rank: 198, player_name: 'A', score: 50 }, { rank: 199, player_name: 'B', score: 40 }];
    const page2 = [{ rank: 200, player_name: 'C', score: 30 }, { rank: 201, player_name: 'D', score: 20 }];

    extractor.extractRankings
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const [allEntries] = await navigator.scrollAndCapture(200);

    expect(allEntries.map(e => e.rank)).toEqual([198, 199, 200]); // 201 excluded
    expect(mouse.pressButton).toHaveBeenCalledTimes(1); // only one drag before cutoff
  });

  test('calculates recovery drags from rank gap: ceil((highestSeen - lastVisible) / 5) + 1', async () => {
    // highestRankSeen = 20; glitch page shows rank 1–5 (lastVisible = 5)
    // rankDiff = 20 - 5 = 15 → ceil(15/5) + 1 = 4 recovery drags
    const normalPage   = [{ rank: 20, player_name: 'X', score: 50 }];
    const glitchPage   = [
      { rank: 1, player_name: 'A', score: 999 },
      { rank: 5, player_name: 'B', score: 900 },
    ];
    const recoveryPage = [{ rank: 21, player_name: 'Y', score: 40 }];
    const endPage      = [{ rank: 21, player_name: 'Y', score: 40 }]; // lastVisible.rank (21) === highestRankSeen (21) → stop

    extractor.extractRankings
      .mockResolvedValueOnce(normalPage)
      .mockResolvedValueOnce(glitchPage)
      .mockResolvedValueOnce(recoveryPage)
      .mockResolvedValueOnce(endPage);

    const [allEntries] = await navigator.scrollAndCapture();

    // Glitch entries (ranks 1, 5) excluded from output
    expect(allEntries.map(e => e.rank).sort((a, b) => a - b)).toEqual([20, 21]);
    // 1 normal drag + 4 recovery drags + 1 post-recovery drag = 6 total pressButton calls
    expect(mouse.pressButton).toHaveBeenCalledTimes(6);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest tests/navigator.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement `src/navigator.js`**

```js
// src/navigator.js
const { mouse, Button } = require('@nut-tree/nut-js');
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

function lastEntryKey(entries) {
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  return `${last.player_name}|${last.score}`;
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
  // seen: rank|player_name → entry. Deduplicates overlapping pages and rebound re-shows.
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
      console.warn(`[navigator] Glitch detected (first rank ${firstRank}, max seen ${highestRankSeen}) — performing ${recoveryDrags} recovery drags`);
      for (let i = 0; i < recoveryDrags; i++) {
        await performDragScroll();
      }
      continue; // re-capture after recovery
    }

    // End-of-list: last visible entry matches the highest rank we've recorded.
    // A normal scroll+rebound moves the list UP so the highest-rank entry won't be visible;
    // only a scroll at the true end reproduces it as the last visible item.
    // Guard with seen.size > 0 to skip this check on the very first capture.
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
  // 1. Open event screen — Vision locates the Events icon dynamically
  await clickAt(await locate('the Events icon in the top-right corner'), 1000);

  // 2. Detect event type from the Routines panel tab labels (visible before any tab is clicked)
  const routinesImg = await capturer.capture();
  const eventType = await detectEventType(routinesImg);
  console.log(`[navigator] Detected event: ${eventType}`);

  // 3. Click the specific named tab (more robust than always clicking position 2)
  const tabLabel = EVENT_TAB_LABELS[eventType];
  const tabCoords = await extractor.locateButton(routinesImg, `the tab labeled "${tabLabel}" in the Routines panel`);
  await clickAt(tabCoords, 1000);

  // 4. Navigate to Rankings — Vision locates the button (position differs between GAR and GR/KvK)
  await clickAt(await locate('the Ranking button'), 1000);

  // 5. Click correct ranking tab — Vision locates the right tab for this event type
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest tests/navigator.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/navigator.js tests/navigator.test.js
git commit -m "feat: add navigator module for UI automation and scroll/capture loop"
```

---

## Task 9: Wire everything together — `index.js` + `src/scheduler.js`

**Files:**
- Create: `index.js`
- Create: `src/scheduler.js`

No unit tests for this task — the wiring is covered by the manual smoke test in step 5.

- [ ] **Step 1: Implement `index.js`**

```js
// index.js
require('dotenv').config();
const launcher   = require('./src/launcher');
const navigator  = require('./src/navigator');
const aggregator = require('./src/aggregator');
const state      = require('./src/state');
const csvWriter  = require('./src/writers/csv');
const pbWriter   = require('./src/writers/pocketbase');
const config     = require('./config');

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Returns true if the current UTC time falls within the final day of the event week
// (Sunday 00:00–02:59 UTC, i.e. after Saturday's reset but before Sunday's 3 AM reset).
// The bot runs at 2:50 AM UTC, so UTC day === Sunday means we're in the last 10 min of
// the Saturday→Sunday overnight period — event has ended for GAR/KvK.
function isFinalEventDay() {
  return new Date().getUTCDay() === 0; // 0 = Sunday
}

// Returns the Sunday start date (YYYY-MM-DD) of the current event week.
// At 2:50 AM UTC on Monday–Saturday the event started on the most recent past Sunday.
function getEventSundayStart() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek;
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() - daysBack);
  return sunday.toISOString().slice(0, 10);
}

function resolveEventStartDate(eventType) {
  if (eventType !== 'GR') {
    // Clear stored GR date when a non-GR event is active so the next GR cycle
    // gets a fresh start date rather than reusing the previous event's date.
    state.clearGrEventStartDate();
    return getEventSundayStart(); // GAR/KvK: use the week's Sunday start
  }

  const stored = state.getGrEventStartDate();
  if (stored) return stored;

  const today = todayUTC();
  state.setGrEventStartDate(today);
  return today;
}

async function run() {
  const capturedAt = new Date().toISOString();
  console.log(`[run] Starting at ${capturedAt}`);

  await launcher.launch();

  try {
    const { eventType, pages } = await navigator.navigate();

    // GAR and KvK: skip the final day of the event week (Sunday 2:50 AM UTC).
    // At this point the event has ended and no meaningful daily data is produced.
    if ((eventType === 'GAR' || eventType === 'KvK') && isFinalEventDay()) {
      console.log(`[run] Skipping ${eventType} capture — final day of event week (reset day).`);
      return;
    }
    const records = aggregator.process(pages, config.guildTag);
    const eventStartDate = resolveEventStartDate(eventType);

    const enriched = records.map(r => ({
      ...r,
      event_type:       eventType,
      event_start_date: eventStartDate,
      captured_at:      capturedAt,
    }));

    console.log(`[run] ${enriched.length} guild members found for ${eventType}`);

    // CSV always written first — safety net
    await csvWriter.write(enriched, eventType, capturedAt);

    // PocketBase write is best-effort
    try {
      await pbWriter.write(enriched, eventType);
    } catch (err) {
      console.error('[run] PocketBase write failed:', err.message);
    }
  } finally {
    launcher.close();
  }

  console.log('[run] Done.');
}

// Manual trigger
if (process.argv.includes('--run-now')) {
  run().catch(err => {
    console.error('[run] Fatal error:', err);
    process.exit(1);
  });
} else {
  require('./src/scheduler');
}

module.exports = { run };
```

- [ ] **Step 2: Implement `src/scheduler.js`**

```js
// src/scheduler.js
const cron = require('node-cron');
const { run } = require('../index');

// 2:50 AM UTC daily
cron.schedule('50 2 * * *', () => {
  console.log('[scheduler] Cron fired — starting run');
  run().catch(err => console.error('[scheduler] Run failed:', err));
}, { timezone: 'UTC' });

console.log('[scheduler] Scheduled for 02:50 UTC daily. Waiting...');
```

- [ ] **Step 3: Update `config.js` with the actual game executable path**

Open `config.js` and update the `gameExePath` value to the real path of the TopHeroes executable on your machine:

```js
gameExePath: 'C:\\Users\\myeye\\AppData\\...\\TopHeroes.exe', // set to actual path
```

Find the path by right-clicking the TopHeroes shortcut → Properties → Target.

- [ ] **Step 4: Calibrate scroll drag coordinates**

Button positions are located automatically by Claude Vision — no calibration needed for clicks. You only need to calibrate the two scroll drag Y values, which define the top and bottom of the rankings list area.

Launch TopHeroes manually, open any event's rankings list, and use a coordinate tool (hover over the target area, then in PowerShell run `[System.Windows.Forms.Cursor]::Position`) to find:

- `scrollDragFromY` — Y coordinate near the **bottom** of the visible rankings list
- `scrollDragToY` — Y coordinate near the **top** of the visible rankings list

Update these two values in `config.js`. `scrollDragX` (horizontal center) may also need adjustment.

- [ ] **Step 5: Manual smoke test**

With TopHeroes closed, run:

```bash
node index.js --run-now
```

Verify:
1. TopHeroes launches and loads to the main map
2. The bot navigates to the current event's rankings
3. The scroll/capture loop runs and terminates
4. A CSV file appears in `output/` with guild member records
5. TopHeroes closes automatically

If PocketBase is running locally, verify records appear in the correct collection.

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add index.js src/scheduler.js config.js
git commit -m "feat: wire run() orchestrator and daily cron scheduler"
```

---

## Task 10: Final validation

- [ ] **Step 1: Run all tests one final time**

```bash
npx jest
```

Expected: All tests pass with no warnings.

- [ ] **Step 2: Test the scheduler**

Temporarily change the cron schedule in `src/scheduler.js` to fire 1 minute from now (e.g., `'55 * * * *'` if it's currently XX:54), then run:

```bash
node index.js
```

Wait for the cron to fire. Verify a full successful run. Restore the schedule to `'50 2 * * *'` afterward.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete TopHeroes stats fetcher — all modules wired and tested"
```
