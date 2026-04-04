# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev (web):** `npm start` or `npm run dev:renderer` — starts React dev server on port 3000
- **Dev (Electron):** `npm run dev` — starts React dev server + Electron app (requires `electron` installed)
- **Build all:** `npm run build` — builds renderer then Electron main process
- **Build web only:** `npm run build:web`
- **Build Electron main only:** `npm run build:main` — compiles `electron/` via `tsconfig.main.json` into `dist/`
- **Package desktop:** `npm run package` (or `package:mac`, `package:win`, `package:linux`)

No test runner is configured.

## Architecture

Electron + React 18 + TypeScript app (Create React App). Two separate TypeScript compilation targets:

- **Renderer process** (`src/`, `tsconfig.json`) — React SPA, compiled by CRA/webpack, target ES5/ESNext modules
- **Main process** (`electron/`, `tsconfig.main.json`) — Electron entry point, compiled to `dist/` as CommonJS

### State machine

App is driven by a simple `GameState` type (`'welcome' | 'racing' | 'results'`) managed in `App.tsx`. Transitions: WelcomeScreen → TypeRacer → ResultsScreen. Keyboard shortcuts (Cmd/Ctrl+N, Cmd/Ctrl+R) and Electron IPC both feed into the same state transitions.

### Key files

- `src/App.tsx` — top-level state machine, Electron IPC listener setup
- `src/components/TypeRacer.tsx` — core typing game logic (character tracking, timer, real-time stats)
- `src/components/ResultsScreen.tsx` — post-race stats display
- `src/components/WelcomeScreen.tsx` — landing page
- `src/types/GameTypes.ts` — shared types (`GameState`, `RaceResult`, `TextPassage`, `TypingStats`, `CharacterStatus`)
- `src/data/textPassages.ts` — passage definitions with difficulty and category
- `src/utils/typingUtils.ts` — WPM/accuracy calculation, text parsing, performance thresholds
- `electron/main.ts` — window creation, app menu with IPC commands
- `electron/preload.ts` — contextBridge API for secure renderer↔main communication

### Styling

Pure CSS with glass-morphism design. Each component has a co-located `.css` file. No CSS framework or preprocessor.

### Electron IPC

`window.electronAPI` is exposed via preload script. The renderer detects its presence to conditionally use Electron features, allowing the app to run as a standalone web app too.
