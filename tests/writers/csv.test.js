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

const rosterRecord = {
  player_name: 'Nyra', rank: 'R5', influence: 341000000,
  castle_level: 62, last_online: '22 min ago', joined: true,
  captured_at: '2026-06-08T02:50:00.000Z',
};

describe('csvWriter.writeRoster', () => {
  test('creates a file with correct headers and roster data', async () => {
    const filePath = await csvWriter.writeRoster([rosterRecord], '2026-06-08T02:50:00.000Z');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('player_name');
    expect(content).toContain('rank');
    expect(content).toContain('influence');
    expect(content).toContain('castle_level');
    expect(content).toContain('last_online');
    expect(content).toContain('joined');
    expect(content).toContain('captured_at');
    expect(content).toContain('Nyra');
    expect(content).toContain('R5');
    expect(content).toContain('341000000');
  });

  test('filename matches roster-<date>.csv pattern', async () => {
    const filePath = await csvWriter.writeRoster([rosterRecord], '2026-06-08T02:50:00.000Z');
    expect(path.basename(filePath)).toMatch(/roster-2026-06-08.*\.csv/);
  });

  test('writes empty file with only headers when records is empty', async () => {
    const filePath = await csvWriter.writeRoster([], '2026-06-08T02:50:00.000Z');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('player_name');
    expect(content.split('\n').filter(Boolean)).toHaveLength(1); // header only
  });

  test('does not include main_queue_influence or main_queue_faction in output', async () => {
    const filePath = await csvWriter.writeRoster([rosterRecord], '2026-06-08T02:50:00.000Z');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('main_queue_influence');
    expect(content).not.toContain('main_queue_faction');
  });
});
