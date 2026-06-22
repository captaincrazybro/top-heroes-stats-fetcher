// config.js
require('dotenv').config();

module.exports = {
  guildTag: 'HGS',
  windowTitle: 'Top Heroes',
  gameExePath: 'C:\\Users\\myeye\\AppData\\Local\\TopHeroes\\Launch_ExecutionStub.exe', // UPDATE: set to actual executable path
  launchTimeoutMs: 120_000,
  loadTimeoutMs: 180_000,

  // Click target used to dismiss startup popups — should be a spot outside any popup dialog.
  // Set to null to disable. UPDATE to a safe empty area of the main map screen.
  popupDismissX: 0,
  popupDismissY: 863,

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
    GR: 594,
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
  fastScrollDragSpeedPps: 1250, // speed for pre-load scrolls (pps) — faster than capture scrolls
  fastScrollDragLingerMs: 50,   // ms to hold at end of each fast drag
  fastScrollReboundWaitMs: 200, // ms to wait between fast drags
  // number of fast drags down for each event (then same count back up)
  fastScrollCount: {
    GAR: 24,
    GR: 50,
    KvK: 50
  },
  kvkMaxRank: 300,              // entries above this rank are dropped for KvK

  // Guild roster navigation — click sequence from the main map to the members panel.
  // Replace placeholder {x, y} values with your actual screen coordinates (UPDATE).
  membersNavigationClicks: [
    { x: 38, y: 70 },
    { x: 852, y: 828 },
    { x: 886, y: 154 },
    { x: 654, y: 708 },
    { x: 700, y: 592 },
  ],

  guildCloseButtonX: 561,
  guildCloseButtonY: 828,

  // 5-click setup sequence run before membeWr capture to ensure all members are visible.
  // Clicks 1 and 5 share the same coords; clicks 2–4 are distinct. UPDATE each entry.
  membersSetupClicks: [
    { x: 968, y: 429 },
    { x: 969, y: 559 },
    { x: 969, y: 516 },
    { x: 970, y: 472 },
    { x: 968, y: 429 },
  ],

  // Members panel scroll gesture — separate from rankingsList scroll which is per-event-type
  membersScrollDragX: 764,      // horizontal center of the members list — UPDATE
  membersScrollDragFromY: 780,  // Y where drag starts (near list bottom) — UPDATE
  membersScrollDragToY: 420,    // Y where drag ends (near list top) — UPDATE

  // Crop covering only the R5 guild master banner at the top of the members screen.
  // Captured once before the scroll loop — UPDATE height to fit just the banner card.
  guildMasterCropBounds: { left: 738, top: 89, width: 443, height: 225 },

  // Crop for the scrollable member grid only — must start BELOW the guild roles row.
  // UPDATE top so it aligns with the first rank section header (R4, R3, etc.).
  membersCropBounds: { left: 673, top: 510, width: 570, height: 480 },

  // Fuzzy sync tuning
  rosterMatchThreshold: 0.85,

  anthropicModel: 'claude-sonnet-4-6',
  visionModel: 'gpt-5.1',

  // Pairs of guild roster IDs to place adjacent to each other in the castle layout.
  // The higher-ranked player is placed normally; their partner is placed at the
  // nearest available position immediately after. Example: [['id1', 'id2']].
  playerPairs: [
    ['gzkksqn48a588tc', 's5cltxqelzqk96v'],
    ['g8bjsfe0y6948ps', 's5cltxqelzqk96v'],
    ['3xa8atza2cr24gm', 'c9dhndvgrm8fx97'], 
    ['kh976snbpxedyou', 'tozle3idlem8ztq'], 
    ['ga4lr2bkh76j3ka', 'zhjqykzpgc5x2fn'],
    ['ga4lr2bkh76j3ka', '5ykh2ivyo41wm0j'],
    ['ga4lr2bkh76j3ka', 'ugu4fxsfgama5h5'],
    ['zhjqykzpgc5x2fn', 'zhs53o9qhom3crk'],
    ['ezoszrxb5qfiodt', 'eapx3h2tewwiq3n'],
    ['eapx3h2tewwiq3n', 'xz1k1py4o4v5gff'],
  ],

  pb: {
    url:                    process.env.POCKETBASE_URL,
    email:                  process.env.POCKETBASE_EMAIL,
    password:               process.env.POCKETBASE_PASSWORD,
    collection:             'topHeroesEventRecords',
    rosterCollection:       'topHeroesGuildRoster',
  },
};
