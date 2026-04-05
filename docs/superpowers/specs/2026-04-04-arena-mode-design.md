# TypeRace "Arena Mode" — Design Spec

## Overview

Extend the TypeRace typing game with immersive audio/visual effects, a fire streak combo system, local competitive features (personal bests, streaks, ghost racing), and real-time WebSocket multiplayer. Solo mode remains the default; multiplayer is additive.

## 1. Immersive Effects

### 1.1 Typing Audio

Use the Web Audio API with pre-loaded `AudioBuffer` instances for zero-latency playback.

**Sound set:**

| Event | Sound | Notes |
|-------|-------|-------|
| Correct keystroke | Mechanical click | 3 variations, randomly cycled |
| Incorrect keystroke | Short glitch/buzz | Distinct from click |
| Race completion | Synth chord fanfare | ~1s duration |

- All audio assets are small `.mp3` files stored in `public/audio/`.
- A mute toggle button lives in the racing HUD bar. Mute state persists in localStorage.
- Audio is initialized on first user interaction (browser autoplay policy).

### 1.2 Speed-Reactive Visuals

The UI's neon intensity scales with the player's current WPM, controlled via CSS custom properties updated from React state:

| WPM Range | Visual State |
|-----------|-------------|
| < 30 | Normal — baseline neon |
| 30–60 | Cyan glow intensifies, subtle background pulse |
| 60–80 | Progress rail brightens, ambient particles start drifting |
| 80+ | "Overdrive" — grid animates faster, glow maxes, subtle vignette |

Implementation: a `useSpeedTier` hook computes the current tier from WPM and returns a tier string (`'normal' | 'warm' | 'hot' | 'overdrive'`). The tier is applied as a `data-speed-tier` attribute on the `.type-racer` container, and CSS handles the rest via attribute selectors.

### 1.3 Error Shake

A 150ms CSS `@keyframes shake` animation applied to `.text-container` on incorrect keystrokes. Triggered by toggling a CSS class, removed after the animation completes.

### 1.4 Completion Burst

On race finish, before transitioning to results, a brief (800ms) particle burst effect plays from the center of the screen. Implementation: a dedicated `<canvas>` overlay with a simple particle system (30-40 particles, randomized velocity/color from the neon palette, fade out over the duration). No library needed — vanilla canvas.

## 2. Fire Streak System

A combo system that rewards sustained accurate typing at pace.

### 2.1 Activation

The fire streak activates when the player hits **10 consecutive correct characters** while typing above their current rolling average WPM (calculated over the last 20 characters). Any error or significant speed drop (below 70% of rolling average) breaks the streak instantly.

### 2.2 Tiers

| Consecutive Chars | Label | Visual Effects |
|-------------------|-------|---------------|
| 10+ | FIRE | Floating banner appears between HUD and text. Flame-orange glow on cursor. |
| 25+ | BLAZING | Banner intensifies. Progress rail pulses with orange tint. |
| 50+ | UNSTOPPABLE | Maximum intensity. Warm glow border on text container. Typing sound pitch shifts up slightly. |

### 2.3 UI Placement

The fire indicator is a **floating centered banner** positioned between the HUD bar and the typing area. It animates in on activation and fizzles out (brief dissolve animation) when the streak breaks.

### 2.4 Results Integration

The results screen displays the longest fire streak achieved during the race (character count + tier label reached).

## 3. Competitive Systems (Local/localStorage)

### 3.1 Personal Bests

Stored in localStorage under the key `typerace-bests`:

```typescript
interface PersonalBests {
  easy:   { wpm: number; accuracy: number } | null;
  medium: { wpm: number; accuracy: number } | null;
  hard:   { wpm: number; accuracy: number } | null;
}
```

- Updated after each race if the new WPM exceeds the stored best for that difficulty.
- Results screen shows a "NEW BEST" neon flash animation when a record is broken.
- Welcome screen displays current bests in the stats strip.

### 3.2 Race History

Stored in localStorage under `typerace-history`. Capped at 30 entries (FIFO).

```typescript
interface RaceHistoryEntry {
  wpm: number;
  accuracy: number;
  difficulty: 'easy' | 'medium' | 'hard';
  passageTitle: string;
  timestamp: number; // Date.now()
  fireStreak: number; // longest streak in chars
}
```

The results screen renders a **WPM sparkline** (inline SVG, last 10 races) showing trend.

### 3.3 Streaks

**Session streak:** incremented on each race completion within the current browser session. Stored in React state (not persisted). Displayed in the HUD during racing.

**Daily streak:** stored in localStorage under `typerace-daily-streak`:

```typescript
interface DailyStreak {
  count: number;
  lastDate: string; // ISO date string, e.g., "2026-04-04"
}
```

On app load, if `lastDate` is yesterday, the streak continues. If it's today, no change. If older, reset to 0. Completing a race on a new day increments the streak. Displayed on the welcome screen with a star icon.

### 3.4 Ghost Racing

When starting a race on a passage the player has completed before, a **ghost cursor** (dim magenta marker) moves through the text display at the player's previous best pace for that passage.

- Ghost data stored in localStorage under `typerace-ghosts` as a map of passage ID → array of timestamp offsets (one per character, recording when each character was reached relative to start).
- Ghost is opt-in. Toggle lives on the welcome screen. Default: on. Preference stored in localStorage.
- The ghost marker is a subtle `::before` pseudo-element on the character at the ghost's current position.

### 3.5 Difficulty Selector

The welcome screen shows three buttons: EASY, MEDIUM, HARD. Selecting one filters to passages of that difficulty. Default: MEDIUM. Selected difficulty persists in localStorage.

The `getRandomPassage` function gains an optional `difficulty` parameter.

## 4. Multiplayer

### 4.1 Server Architecture

A standalone Node.js server in `server/`:

```
server/
├── index.ts          # Express + WebSocket server entry
├── room.ts           # Room state management
├── types.ts          # Shared types (messages, room state)
├── package.json
└── tsconfig.json
```

- **Express** serves a health check endpoint and could serve the built React app in production.
- **`ws` library** handles WebSocket connections.
- **In-memory state** — no database. Rooms are Maps. Players are identified by a self-chosen display name stored in localStorage.
- Rooms auto-cleanup after 10 minutes of inactivity.

### 4.2 Room Lifecycle

1. **Create**: client sends `{ type: 'create', playerName, difficulty }`. Server generates a 6-char room code (e.g., `NEON-4X`), selects a random passage for the chosen difficulty, returns `{ type: 'room-created', roomCode, passage }`.
2. **Join**: client sends `{ type: 'join', roomCode, playerName }`. Server adds player to room, broadcasts updated player list to all in room.
3. **Lobby**: players wait. Creator sees a "Start Race" button. 2-4 player limit.
4. **Start**: creator sends `{ type: 'start' }`. Server broadcasts `{ type: 'countdown' }` to all players. Synchronized 3-second countdown, then `{ type: 'race-start' }`.
5. **Racing**: clients send progress updates every ~200ms: `{ type: 'progress', currentIndex, errors, wpm }`. Server broadcasts all players' progress to all clients.
6. **Finish**: when a player completes, client sends `{ type: 'finished', result }`. Server broadcasts. When all players finish (or 60s timeout after first finisher), server sends `{ type: 'race-end', results }` with final standings.
7. **Rematch**: any player can send `{ type: 'rematch' }`. If all players accept, a new race starts with a new passage.

### 4.3 Client Integration

**Welcome screen** — the unified flow layout:
- SOLO button starts a local race (existing flow).
- MULTIPLAYER button opens a modal/panel with two options:
  - **Create Room**: enter display name, pick difficulty → shows room code to share
  - **Join Room**: enter display name + room code → joins lobby

**Racing screen** — when in a multiplayer room:
- A **race track panel** appears above the text display showing horizontal progress bars for all players.
- Each player is color-coded: cyan (you), magenta, green, amber (others in join order).
- Bars show player name, progress percentage, and live WPM.
- When a player finishes, their bar fills completely and shows final WPM.
- All solo features (fire streak, audio, speed-reactive visuals) work identically.

**Results screen** — multiplayer additions:
- A **race podium** section appears above personal stats: players ranked 1st–4th by WPM, showing name, WPM, and accuracy.
- "Race Again" keeps the room. "Leave" returns to welcome.

### 4.4 WebSocket Message Types

```typescript
interface PlayerInfo {
  name: string;
  color: string; // assigned by server: cyan, magenta, green, amber
  isCreator: boolean;
}

interface PlayerProgress {
  name: string;
  color: string;
  currentIndex: number;
  totalLength: number;
  wpm: number;
  finished: boolean;
}

interface PlayerResult {
  name: string;
  color: string;
  rank: number;
  result: RaceResult;
}

// Client → Server
type ClientMessage =
  | { type: 'create'; playerName: string; difficulty: 'easy' | 'medium' | 'hard' }
  | { type: 'join'; roomCode: string; playerName: string }
  | { type: 'start' }
  | { type: 'progress'; currentIndex: number; errors: number; wpm: number }
  | { type: 'finished'; result: RaceResult }
  | { type: 'rematch' }
  | { type: 'leave' };

// Server → Client
type ServerMessage =
  | { type: 'room-created'; roomCode: string; passage: TextPassage }
  | { type: 'player-joined'; players: PlayerInfo[] }
  | { type: 'player-left'; players: PlayerInfo[] }
  | { type: 'countdown'; seconds: number }
  | { type: 'race-start'; passage: TextPassage }
  | { type: 'progress-update'; players: PlayerProgress[] }
  | { type: 'player-finished'; playerName: string; result: RaceResult }
  | { type: 'race-end'; results: PlayerResult[] }
  | { type: 'rematch-request'; from: string; accepted: string[] }
  | { type: 'error'; message: string };
```

## 5. Welcome Screen Layout

Unified vertical flow:
1. Title block (TYPE / RACE) with "TYPING VELOCITY ENGINE" label
2. Daily streak indicator (star icon + "X DAY STREAK")
3. Difficulty picker — three buttons: EASY, MEDIUM, HARD
4. Mode buttons — SOLO and MULTIPLAYER as equal CTAs
5. Personal bests strip — best WPM, best accuracy, total races completed
6. Keyboard shortcuts footer

When MULTIPLAYER is clicked, a panel/modal appears for create/join room flow.

## 6. Results Screen Additions

- **WPM sparkline**: inline SVG showing WPM trend over the last 10 races from history
- **Longest fire streak**: character count + tier label (e.g., "47 chars — BLAZING")
- **"NEW BEST"**: animated neon flash when a personal best is broken
- **Multiplayer podium**: players ranked by WPM (only shown in multiplayer mode)

## 7. New Dependencies

| Package | Purpose | Where |
|---------|---------|-------|
| `ws` | WebSocket server | `server/` |
| `express` | HTTP server + static serving | `server/` |
| `concurrently` | Run React dev + WS server together | root (already installed) |

No new client-side dependencies. Audio, particles, and sparklines are all vanilla Web Audio API / Canvas / SVG.

## 8. localStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `typerace-bests` | `PersonalBests` | Best WPM/accuracy per difficulty |
| `typerace-history` | `RaceHistoryEntry[]` | Last 30 race results |
| `typerace-daily-streak` | `DailyStreak` | Consecutive days played |
| `typerace-ghosts` | `Record<string, number[]>` | Per-passage ghost timing data |
| `typerace-difficulty` | `string` | Selected difficulty preference |
| `typerace-ghost-enabled` | `boolean` | Ghost racing toggle |
| `typerace-muted` | `boolean` | Audio mute state |
| `typerace-player-name` | `string` | Multiplayer display name |
