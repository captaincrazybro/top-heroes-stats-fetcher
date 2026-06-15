// config.js
require('dotenv').config();

module.exports = {
  guildTag: 'HGS',
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

  // Crop region for game-state detection (event title / routines panel area).
  // Set to null to send the full screenshot. Crop tightly around the bottom tab bar
  // where "Guild Arms Race", "Guild Race", "Kingdom Duel" labels appear (UPDATE).
  gameStateCropBounds: null,

  // Routines panel — bottom tab bar. Same position regardless of event type.
  routinesTabX: 762,
  routinesTabY: 823,

  // Ranking button. GR and KvK share the same position; GAR is different. UPDATE each value.
  rankingButton: {
    GR:  { x: 963, y: 245 },
    GAR: { x: 900, y: 261 },
    KvK: { x: 963, y: 245 },   // same as GR
  },

  // Tab inside the ranking view. UPDATE each value.
  rankingTab: {
    GR:  { x: 656, y: 144 },   // "Individual" tab
    GAR: { x: 656, y: 144 },   // "Daily Ranking" tab
    KvK: { x: 656, y: 144 },   // "Daily Ranking" tab
  },

  // Other button positions are located dynamically at runtime by Claude Vision.
  // Only the scroll drag region and Events icon are hardcoded.
  // horizontal center of the rankings list
  scrollDragX: {
    GR: 764,
    GAR: 764,
    KvK: 764
  },        
  // placeholder — Y where drag starts (near list bottom)      
  scrollDragFromY: {
    GR: 592,
    GAR: 582,
    KvK: 582
  },          
  // placeholder — Y where drag ends (near list top)
  scrollDragToY: {
    GR: 233,
    GAR: 225,
    KvK: 225
  },            
  scrollDragSpeedPps: 1000,       // drag speed in pixels/sec — too fast and the game won't register the scroll
  scrollDragLingerMs: 600,       // ms to hold at the end of the drag before releasing — prevents over-scroll
  fastScrollDragSpeedPps: 1500, // speed for pre-load scrolls (pps) — faster than capture scrolls
  fastScrollDragLingerMs: 50,   // ms to hold at end of each fast drag
  fastScrollReboundWaitMs: 200, // ms to wait between fast drags
  // number of fast drags down for each event (then same count back up)
  fastScrollCount: {
    GAR: 24,
    GR: 50,
    KvK: 50
  },
  kvkMaxRank: 200,              // entries above this rank are dropped for KvK

  // Guild roster navigation — pixel coords, UPDATE to match your screen
  guildButtonX: 0,
  guildButtonY: 0,
  membersPanelButtonX: 0,
  membersPanelButtonY: 0,
  guildCloseButtonX: 0,
  guildCloseButtonY: 0,

  // Members panel scroll gesture — separate from rankingsList scroll which is per-event-type
  membersScrollDragX: 764,      // horizontal center of the members list — UPDATE
  membersScrollDragFromY: 582,  // Y where drag starts (near list bottom) — UPDATE
  membersScrollDragToY: 225,    // Y where drag ends (near list top) — UPDATE

  // Crop region for the members panel screenshot — UPDATE to match your screen
  membersCropBounds: { left: 500, top: 60, width: 460, height: 720 },

  // Fuzzy sync tuning
  rosterMatchThreshold: 0.85,

  anthropicModel: 'claude-sonnet-4-6',

  pb: {
    url:                    process.env.POCKETBASE_URL,
    email:                  process.env.POCKETBASE_EMAIL,
    password:               process.env.POCKETBASE_PASSWORD,
    collection:             'topHeroesEventRecords',
    rosterCollection:       'guildRoster',
  },
};
