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
