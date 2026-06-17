'use strict';
require('dotenv').config();
const launcher  = require('./src/launcher');
const roster    = require('./src/roster');
const csvWriter = require('./src/writers/csv');

async function run() {
  console.log('[roster-only] Starting...');
  await launcher.launch();
  try {
    const { records, capturedAt } = await roster.capture();
    await csvWriter.writeRoster(records, capturedAt);
    console.log(`[roster-only] Done — ${records.length} members captured`);
  } finally {
    launcher.close();
  }
}

run().catch(err => {
  console.error('[roster-only] Fatal error:', err);
  process.exit(1);
});
