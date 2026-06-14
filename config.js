// config.js
require('dotenv').config();

module.exports = {
  guildTag: 'WAR',
  windowTitle: 'Top Heroes',
  gameExePath: 'C:\\Users\\myeye\\AppData\\Local\\TopHeroes\\Launch_ExecutionStub.exe', // UPDATE: set to actual executable path
  launchTimeoutMs: 120_000,
  loadTimeoutMs: 180_000,

  // Events icon — hardcoded pixel coords.
  eventsIconX: 1492,
  eventsIconY: 149,

  // Crop region sent to Claude for rankings extraction — removes background noise.
  // Set to null to disable cropping and send the full screenshot instead.
  // Tune these by checking where the rankings panel sits on screen (UPDATE).
  rankingsCropBounds: { left: 694, top: 273, width: 531, height: 461 },

  // Routines panel — bottom tab bar. Same position regardless of event type.
  routinesTabX: 762,
  routinesTabY: 823,

  // Ranking button. GR and KvK share the same position; GAR is different. UPDATE each value.
  rankingButton: {
    GR:  { x: 963, y: 257 },
    GAR: { x: 900, y: 261 },
    KvK: { x: 963, y: 257 },   // same as GR
  },

  // Tab inside the ranking view. UPDATE each value.
  rankingTab: {
    GR:  { x: 656, y: 144 },   // "Individual" tab
    GAR: { x: 656, y: 144 },   // "Daily Ranking" tab
    KvK: { x: 656, y: 144 },   // "Daily Ranking" tab
  },

  // Other button positions are located dynamically at runtime by Claude Vision.
  // Only the scroll drag region and Events icon are hardcoded.
  scrollDragX: 764,              // horizontal center of the rankings list
  scrollDragFromY: 582,          // placeholder — Y where drag starts (near list bottom)
  scrollDragToY: 225,            // placeholder — Y where drag ends (near list top)
  scrollDragSpeedPps: 1500,       // drag speed in pixels/sec — too fast and the game won't register the scroll
  scrollDragLingerMs: 400,       // ms to hold at the end of the drag before releasing — prevents over-scroll
  fastScrollDragSpeedPps: 2000, // speed for pre-load scrolls (pps) — faster than capture scrolls
  fastScrollDragLingerMs: 50,   // ms to hold at end of each fast drag
  fastScrollReboundWaitMs: 100, // ms to wait between fast drags
  fastScrollCount: 24,          // number of fast drags down (then same count back up)
  kvkMaxRank: 200,              // entries above this rank are dropped for KvK

  anthropicModel: 'claude-sonnet-4-6',

  pb: {
    url:                    process.env.POCKETBASE_URL,
    email:                  process.env.POCKETBASE_EMAIL,
    password:               process.env.POCKETBASE_PASSWORD,
    collection: 'topHeroesEventRecords',
  },
};
