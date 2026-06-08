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
