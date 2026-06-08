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
