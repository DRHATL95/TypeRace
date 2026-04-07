# TypeRace Feature Batch Design

**Date:** 2026-04-06
**Features:** 5 (rematch flow, random categories, WPM bug fix, menu music, daily leaderboard)

---

## Feature 1: Multiplayer Rematch with Timeout

### Problem
After a multiplayer race, rematch requires all players to vote. No timeout exists, so one AFK player blocks everyone. No UI shows who has voted.

### Design

**Server changes (`room.ts`):**
- When the first `rematch` message arrives, start a 30-second countdown (`rematchDeadline`)
- Broadcast `rematch-countdown` every second: `{ secondsLeft: number, voters: string[] }`
- On timeout: remove all non-voting players from the room. If >= 1 player remains, reset room and start countdown. If 0, destroy room.
- If all players vote before timeout, cancel timer and reset immediately (existing behavior)

**New server message:**
```typescript
// Server -> Client
{ type: 'rematch-countdown', secondsLeft: number, voters: string[] }
```

**Client changes:**
- `useMultiplayer.ts`: Handle `rematch-countdown`, expose `rematchVoters: string[]` and `rematchSecondsLeft: number`
- `ResultsScreen.tsx`: On the podium, show a check/waiting icon next to each player name. Display countdown timer ("Next race in Xs" or "Waiting for votes... Xs"). "REMATCH" button shows as checked once clicked.

### Edge cases
- Player disconnects during vote period: treated as non-voter, removed on timeout
- Only 1 player remains after timeout: they get a solo rematch (room stays alive)
- Room creator leaves: next player in join order becomes creator

---

## Feature 2: Randomized Multiplayer Categories

### Problem
Multiplayer category selection is currently passed by the room creator. User wants it randomized for variety.

### Design

**Server changes:**
- `room.ts` constructor: ignore `category` param, randomly pick from `['sentences', 'pop-culture', 'random-words']`
- `resetForRematch()`: re-randomize category for the new passage
- Include selected category in `race-start` message: `{ passage, category }`

**Client changes:**
- `useMultiplayer.ts`: Expose `currentCategory` from `race-start` message
- Lobby UI: Display the randomly selected category as a badge/tag
- `TypeRacer.tsx` multiplayer mode: Show category label in the HUD

**Solo mode:** Unchanged — player still picks their own category.

---

## Feature 3: Fix WPM Countdown Bug in Multiplayer

### Problem
After finishing a multiplayer race, the live WPM display in `TypeRacer.tsx` continues to recalculate using `Date.now()` while `charactersTyped` is frozen, causing WPM to visually decline.

### Root cause
```typescript
const timeElapsed = (Date.now() - stats.startTime) / 1000;
return Math.round(((stats.charactersTyped / 5) / (timeElapsed / 60)) * 100) / 100;
```
`Date.now()` keeps advancing after completion.

### Fix
When race is complete (`stats.isComplete === true` or `stats.endTime` is set), use `stats.endTime` instead of `Date.now()`:
```typescript
const now = stats.endTime || Date.now();
const timeElapsed = (now - stats.startTime) / 1000;
```

One-line change. No side effects — `stats.endTime` is already set on completion but wasn't being used here.

---

## Feature 4: Menu Music

### Problem
No ambient music on the welcome screen. User wants a lofi/retro/arcadey vibe.

### Design

**Audio asset:**
- `public/audio/menu-theme.mp3` — short (30-60s) looping lofi/retro track
- Royalty-free; user will provide or approve a generated track
- Target size: ~200-500KB (compressed)

**New module `src/utils/menuMusic.ts`:**
```typescript
// Manages a single <audio> element for menu music
let audio: HTMLAudioElement | null = null;

export function startMenuMusic(): void
  // Create audio element if not exists
  // Set src, loop=true, volume=0.3
  // Fade in over ~1s
  // Respect mute state from storage

export function stopMenuMusic(): void
  // Fade out over ~500ms, then pause

export function setMenuMusicMuted(muted: boolean): void
  // Sync with global mute toggle
```

**Integration:**
- `WelcomeScreen.tsx`: Call `startMenuMusic()` on mount, `stopMenuMusic()` on unmount
- `App.tsx`: Call `stopMenuMusic()` when transitioning to `'racing'` state (belt-and-suspenders)
- Mute toggle: Wire into existing `toggleMute()` in `audioEngine.ts` so one button mutes everything

**Behavior:**
- Music starts at low volume (0.3) with fade-in
- Fades out when leaving welcome screen
- Respects existing mute preference
- Does not auto-play on first page load (browsers block this) — starts on first user interaction via the existing click-to-start pattern

---

## Feature 5: "Top Typer Today" + Server Leaderboard

### Problem
No social/competitive element on the home screen. User wants both personal daily stats and a global leaderboard.

### Design

#### Part A: Local "Your Best Today"

**Storage changes (`storage.ts`):**
```typescript
export function getTodaysBest(): { wpm: number, accuracy: number, fireStreak: number } | null
  // Filter raceHistory entries where timestamp falls on today's date
  // Return the entry with highest WPM, or null if no races today
```

No new localStorage keys — reuses existing `typerace-history`.

#### Part B: Server Global Leaderboard

**New DB table (`db.ts`):**
```sql
CREATE TABLE IF NOT EXISTS race_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  wpm REAL NOT NULL,
  accuracy REAL NOT NULL,
  fire_streak INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
  category TEXT NOT NULL CHECK(category IN ('sentences','pop-culture','random-words')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_results_date ON race_results(created_at);
```

**New REST endpoints (`index.ts`):**
```
POST /results
  Body: { playerName, wpm, accuracy, fireStreak, difficulty, category }
  → Inserts race result, returns { id }

GET /leaderboard/today
  → Returns { topWpm: ResultEntry[], topStreak: ResultEntry[] }
  → Each list: top 5 entries from today, sorted descending
  → ResultEntry: { playerName, wpm, accuracy, fireStreak, rank }
```

**Client changes:**

Result submission:
- After any race (solo or multiplayer), if player has a name set, POST result to server
- Fire-and-forget — don't block on response, don't fail the UI if server is unreachable

Welcome screen:
- New "TODAY'S CHAMPIONS" section below the stats strip
- Left column: "YOUR BEST TODAY" — personal best WPM, accuracy, streak (from localStorage)
- Right column: "GLOBAL TOP 5" — fetched from `GET /leaderboard/today` on mount
- Shows player name, WPM, and fire streak for each entry
- Graceful fallback: if server unreachable, hide global section, show only local

### Edge cases
- Player name not set: prompt to set name before submitting (or skip submission silently)
- Server down: local stats still work; global section shows "Leaderboard unavailable"
- Clock skew: server uses its own clock for "today" (UTC), client uses local time for personal best

---

## Implementation Order

1. **WPM bug fix** — smallest change, immediate quality improvement
2. **Randomized categories** — small server change, no new UI components
3. **Multiplayer rematch timeout** — moderate server + client work
4. **Daily leaderboard** — new DB table, endpoints, and welcome screen section
5. **Menu music** — depends on audio asset availability, independent of other features
