# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev (web):** `npm start` or `npm run dev:renderer` — starts the Vite dev server on port 3000
- **Dev (Electron):** `npm run dev` — starts React dev server + Electron app (requires `electron` installed)
- **Build all:** `npm run build` — builds renderer then Electron main process
- **Build web only:** `npm run build:web` — passes `--base=/` (used by the Dockerfile). Electron builds keep `base: './'` for `file://`; relative assets break `/join/:code` deep links on the web, so don't unify them.
- **Build Electron main only:** `npm run build:main` — compiles `electron/` via `tsconfig.main.json` into `dist/`
- **Package desktop:** `npm run package` (or `package:mac`, `package:win`, `package:linux`)

- **Dev (all):** `npm run dev:all` — starts React dev server + multiplayer WebSocket server
- **Dev (server only):** `npm run dev:server` — starts the WebSocket server on port 3001

No test runner is configured. `npm run check` runs `scripts/check.mjs`, an assert-based self-check of the pure helpers (`raceInsights.ts`, `progression.ts`, `ghost.ts`) under Node 24's built-in type stripping; keep those files import-free so it can load them.

## Architecture

Electron + React 18 + TypeScript app (Vite). Two separate TypeScript compilation targets:

- **Renderer process** (`src/`, `tsconfig.json`) — React SPA, built by Vite into `build/`
- **Main process** (`electron/`, `tsconfig.main.json`) — Electron entry point, compiled to `dist/` as CommonJS

### State machine

App is driven by a simple `GameState` type (`'welcome' | 'racing' | 'results'`) managed in `App.tsx`. Transitions: WelcomeScreen → TypeRacer → ResultsScreen. Keyboard shortcuts (Cmd/Ctrl+N, Cmd/Ctrl+R) and Electron IPC both feed into the same state transitions.

### Key files

- `src/App.tsx` — top-level state machine, Electron IPC listener setup
- `src/components/TypeRacer.tsx` — core typing game logic (character tracking, timer, real-time stats)
- `src/components/ResultsScreen.tsx` — post-race stats display; hosts `RaceGraph` (per-second WPM + error ticks), `KeyHeatmap` (missed keys) and `LevelProgress`
- `src/components/WelcomeScreen.tsx` — landing page
- `src/types/GameTypes.ts` — shared types (`GameState`, `RaceResult`, `TextPassage`, `TypingStats`, `CharacterStatus`)
- `src/data/textPassages.ts` — passage definitions with difficulty and category
- `src/utils/typingUtils.ts` — WPM/accuracy calculation, text parsing, performance thresholds
- `src/utils/raceInsights.ts` — builds the post-race timeline/missed keys from TypeRacer's keystroke log. Passed to `onRaceComplete` as a separate argument, not on `RaceResult`, because the server rebroadcasts `RaceResult` verbatim to every multiplayer opponent
- `src/utils/progression.ts` — XP per race and the level curve
- `electron/main.ts` — window creation, app menu with IPC commands
- `electron/preload.ts` — contextBridge API for secure renderer↔main communication

### Styling

Pure CSS, dark neon theme: tokens (`--cyan`, `--magenta`, `--bg-*`, fonts, glows) and shared keyframes (`fadeUp`, `neonPulse`, …) live in `src/index.css`. Each component has a co-located `.css` file. No CSS framework or preprocessor.

### Multiplayer

Server in `server/` (Express + `ws`). Rooms are in memory; passages, race results, shares and leaderboards are in PostgreSQL (`DATABASE_URL`, migrations in `server/src/db/`). Auth is Clerk (optional — enabled when the Clerk env keys are set). Players join rooms via `adjective-noun-NN` codes or `/join/:code` links and race the same passage. Client hook in `src/hooks/useMultiplayer.ts` manages connection and state. Passages exist twice: seeded in `server/src/passages.ts` and as the offline fallback in `src/data/textPassages.ts`.

### Daily Challenge

`GET /daily` returns today's passage (picked in SQL from `CURRENT_DATE`, so it rolls over on the DB clock like the other boards), the top 10 and the caller's rank. Runs are tagged by `POST /results` with `{ daily: true, passageId }`; the server stamps `race_results.daily_date` only when `passageId` is today's daily passage (migration `006_daily.sql`). Client: `DailyCard` on the welcome screen (hidden when the server is unreachable) and `isDaily` mode in `App.tsx` — RETRY keeps it, anything that swaps the passage clears it.

### Effects & Competitive Systems

- `src/utils/audioEngine.ts` — synthesized typing sounds via Web Audio API
- `src/utils/particleBurst.ts` — canvas particle system for race completion
- `src/hooks/useSpeedTier.ts` — WPM-reactive visual tiers (normal → overdrive)
- `src/hooks/useFireStreak.ts` — combo system tracking consecutive correct chars
- `src/hooks/useGhost.ts` — ghost racing (replays your fastest finished run of the passage; replacement and position rules in `src/utils/ghost.ts`)
- `src/utils/storage.ts` — all localStorage persistence (bests, history, streaks, preferences, XP)

### Electron IPC

`window.electronAPI` is exposed via preload script. The renderer detects its presence to conditionally use Electron features, allowing the app to run as a standalone web app too.
