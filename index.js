// index.js
require('dotenv').config();
const launcher   = require('./src/launcher');
const navigator  = require('./src/navigator');
const aggregator = require('./src/aggregator');
const state      = require('./src/state');
const csvWriter  = require('./src/writers/csv');
const pbWriter   = require('./src/writers/pocketbase');
const config     = require('./config');
const roster    = require('./src/roster');

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

    // PocketBase write is best-effort — captured_at is autodate in PocketBase schema
    try {
      const pbRecords = enriched.map(({ captured_at, ...rest }) => rest);
      await pbWriter.write(pbRecords, eventType);
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
