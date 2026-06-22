'use strict';
require('dotenv').config();
const { fetchRoster } = require('./src/layout/fetcher');

function fmt(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

async function run() {
  console.log('[stats] Fetching guild roster...');
  const records = await fetchRoster();
  console.log(`[stats] ${records.length} active members.\n`);

  const avgInfluence = records.reduce((sum, r) => sum + (r.influence || 0), 0) / records.length;

  const withMQ = records.filter(r => r.main_queue_influence > 0);
  const avgMQ = withMQ.length > 0
    ? withMQ.reduce((sum, r) => sum + r.main_queue_influence, 0) / withMQ.length
    : null;

  console.log(`Average influence:            ${fmt(avgInfluence)}`);
  if (avgMQ !== null) {
    console.log(`Average main queue influence: ${fmt(avgMQ)} (${withMQ.length}/${records.length} players)`);
  } else {
    console.log(`Average main queue influence: N/A (no players have main queue influence set)`);
  }
}

run().catch(err => {
  console.error('[stats] Fatal error:', err);
  process.exit(1);
});
