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

// GR resets Sunday 10 PM CDT = Monday 3 AM UTC. Returns the Monday (YYYY-MM-DD)
// that started the current GR week, accounting for the reset hour so that running
// before 3 AM UTC still returns the previous week's Monday.
function getGrWeekStartDate() {
  const RESET_HOUR_UTC = 3;
  const shifted = new Date(Date.now() - RESET_HOUR_UTC * 3600000);
  const shiftedDay = shifted.getUTCDay();
  const daysBackToMonday = shiftedDay === 0 ? 6 : shiftedDay - 1;
  const monday = new Date(shifted);
  monday.setUTCDate(shifted.getUTCDate() - daysBackToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function resolveEventStartDate(eventType) {
  if (eventType !== 'GR') {
    return getEventSundayStart();
  }
  const currentWeekStart = getGrWeekStartDate();
  const stored = state.getGrEventStartDate();
  // Reuse stored date only if it falls within the current game week.
  if (stored && stored >= currentWeekStart) {
    const nextWeekStart = new Date(currentWeekStart + 'T00:00:00Z');
    nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
    if (stored < nextWeekStart.toISOString().slice(0, 10)) return stored;
  }
  state.setGrEventStartDate(currentWeekStart);
  return currentWeekStart;
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
