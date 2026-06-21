'use strict';
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

function getEventSundayStart() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek;
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() - daysBack);
  return sunday.toISOString().slice(0, 10);
}

function resolveEventStartDate(eventType) {
  if (eventType !== 'GR') {
    return getEventSundayStart();
  }
  const weekStart = getEventSundayStart();
  const stored = state.getGrEventStartDate();
  // Reuse stored date only if it falls within the current week.
  if (stored && stored >= weekStart) return stored;
  const today = todayUTC();
  state.setGrEventStartDate(today);
  return today;
}

async function run() {
  const capturedAt = new Date().toISOString();
  console.log(`[events-only] Starting at ${capturedAt}`);

  await launcher.launch();
  try {
    const { eventType, pages } = await navigator.navigate();
    const records = aggregator.process(pages, config.guildTag);
    const eventStartDate = resolveEventStartDate(eventType);

    const enriched = records.map(r => ({
      ...r,
      event_type:       eventType,
      event_start_date: eventStartDate,
      captured_at:      capturedAt,
    }));

    console.log(`[events-only] ${enriched.length} guild members found for ${eventType}`);

    await csvWriter.write(enriched, eventType, capturedAt);

    try {
      const pbRecords = enriched.map(({ captured_at, ...rest }) => rest);
      await pbWriter.write(pbRecords, eventType);
    } catch (err) {
      console.error('[events-only] PocketBase write failed:', err.message);
    }
  } finally {
    launcher.close();
  }

  console.log('[events-only] Done.');
}

run().catch(err => {
  console.error('[events-only] Fatal error:', err);
  process.exit(1);
});
