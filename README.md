# Top Heroes Stats Fetcher

Automated daily capture of guild event rankings from the Top Heroes mobile game. The bot launches the game, navigates to the rankings panel, captures screenshots, extracts player data via Claude Vision, and writes results to PocketBase and a local CSV.

## How It Works

1. **Launch** — spawns the Top Heroes process and waits for the main map to load
2. **Navigate** — opens the Routines panel, detects the active event (GAR / GR / KvK), scrolls through the rankings list
3. **Extract** — sends each screenshot to the Claude Vision API and parses the ranked entries
4. **Aggregate** — deduplicates entries across scroll pages and filters to guild members only
5. **Write** — appends to a CSV file and upserts into PocketBase

The scheduler fires at **02:50 UTC daily** via `node-cron`. When run as a Windows service it starts automatically with the OS.

## Prerequisites

- Windows 10/11
- Node.js 18+ (installed system-wide so the Windows service can find it)
- Top Heroes installed and previously launched so the game files are in place
- A PocketBase instance with a `topHeroesEventRecords` collection (public read, authenticated write)
- An Anthropic API key

## Setup

### 1. Install dependencies

```powershell
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```powershell
copy .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
POCKETBASE_URL=https://your-pocketbase-instance.example.com
POCKETBASE_EMAIL=admin@example.com
POCKETBASE_PASSWORD=your-password
```

### 3. Configure `config.js`

Open `config.js` and update the values marked `// UPDATE`:

| Field | Description |
|---|---|
| `guildTag` | Your guild's three-letter tag (e.g. `'WAR'`) |
| `gameExePath` | Full path to the Top Heroes executable |
| `eventsIconX/Y` | Pixel coordinates of the Events icon on screen |
| `rankingsCropBounds` | Crop region for the rankings panel screenshot |
| `routinesTabX/Y` | Coordinates of the Routines tab in the bottom bar |
| `rankingButton` | Coordinates of the Ranking button per event type |
| `rankingTab` | Coordinates of the individual/daily ranking tab per event type |

All coordinates are for the game running at your native resolution. Use a screenshot tool to find them.

## Running

### One-off capture (now)

Launches the game, captures rankings, writes results, then closes the game:

```powershell
npm run run-now
```

### Scheduled mode (foreground)

Stays running and fires automatically at 02:50 UTC each day:

```powershell
npm start
```

### Windows Service (background, auto-start)

Installs as a Windows service that survives reboots. Must be run from an **elevated (Administrator) PowerShell**:

```powershell
npm run install-service
```

To verify: open `services.msc` and look for **TopHeroesStatsFetcher**.

Service logs are written to the `daemon/` folder created next to `index.js`.

To remove the service (also requires admin):

```powershell
npm run uninstall-service
```

## Output

### PocketBase

Records are written to the `topHeroesEventRecords` collection with these fields:

| Field | Type | Example |
|---|---|---|
| `event_type` | string | `GAR` |
| `event_start_date` | string | `2026-06-07` |
| `rank` | number | `1` |
| `player_name` | string | `DragonSlayer` |
| `guild_tag` | string | `WAR` |
| `server` | string | `#10001` |
| `score` | number | `4200000` |
| `captured_at` | datetime | auto-set by PocketBase |

GR records are upserted (one record per player per event week, updated daily). GAR and KvK records are inserted fresh each capture.

### CSV

A daily CSV is written to `output/` with the same fields plus `captured_at`. Filenames follow the pattern `<eventType>-<date>-<timestamp>.csv`.

## Event Schedule

| Event | Capture days | Skip day |
|---|---|---|
| GAR | Mon – Sat | Sun (event resets) |
| GR | Every day the event is active | — |
| KvK | Mon – Sat | Sun (event resets) |

The bot auto-detects which event is active at capture time.

## Tests

```powershell
npm test
```

Integration tests (require real external services):

```powershell
npm run test:integration
```

## Project Structure

```
index.js                  — orchestrator: launch → navigate → aggregate → write
config.js                 — all tuneable settings
install-service.js        — register as Windows service (run as admin)
uninstall-service.js      — remove Windows service (run as admin)
src/
  launcher.js             — start/stop the game process
  navigator.js            — UI automation: click, scroll, capture loop
  extractor.js            — Claude Vision calls: detect state, extract rankings
  aggregator.js           — deduplicate pages, filter to guild members
  capturer.js             — take a screenshot of the primary display
  scheduler.js            — node-cron schedule (02:50 UTC daily)
  state.js                — persist GR event start date across runs
  writers/
    pocketbase.js         — PocketBase insert / GR upsert
    csv.js                — append CSV output
```
