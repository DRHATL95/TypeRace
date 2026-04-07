# TypeRace Feature Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 features to TypeRace: fix multiplayer WPM bug, randomize MP categories, add rematch timeout with voter UI, build daily leaderboard (local + server), and add menu music.

**Architecture:** Each feature is independent and can be committed separately. Server changes use the existing Express + WebSocket + SQLite stack. Client changes use React hooks and components. No new dependencies are required except an audio file for menu music.

**Tech Stack:** React 18, TypeScript, Express, WebSocket (`ws`), better-sqlite3, Web Audio API

**Design Doc:** `docs/plans/2026-04-06-feature-batch-design.md`

---

## Task 1: Fix WPM Countdown Bug in Multiplayer

**Files:**
- Modify: `src/components/TypeRacer.tsx:68-73`

**Context:** After a player finishes a multiplayer race, the `currentWPM` calculation in TypeRacer keeps using `Date.now()` while `charactersTyped` is frozen. This causes the displayed WPM to decline even though the race is over. The component stays mounted because the player waits for others to finish.

**Step 1: Fix the WPM calculation to freeze on completion**

In `src/components/TypeRacer.tsx`, replace lines 68-73:

```typescript
const currentWPM = (() => {
    if (!isStarted || stats.startTime === 0) return 0;
    const timeElapsed = (Date.now() - stats.startTime) / 1000;
    if (timeElapsed === 0) return 0;
    return Math.round(((stats.charactersTyped / 5) / (timeElapsed / 60)) * 100) / 100;
})();
```

With:

```typescript
const currentWPM = (() => {
    if (!isStarted || stats.startTime === 0) return 0;
    const now = stats.isComplete ? (stats.endTime || Date.now()) : Date.now();
    const timeElapsed = (now - stats.startTime) / 1000;
    if (timeElapsed === 0) return 0;
    return Math.round(((stats.charactersTyped / 5) / (timeElapsed / 60)) * 100) / 100;
})();
```

**Why this works:** `stats.isComplete` is set to `true` when the race completes (in the existing completion handler around line 224). We also check `stats.endTime` which gets set in the same handler. If for some reason `endTime` isn't set yet, we fall back to `Date.now()`.

**Step 2: Verify `stats.endTime` is set on completion**

Check the race completion handler (around line 224-244). Look for where `stats` is updated with `isComplete: true` and `endTime`. The existing code in the completion handler already sets:
```typescript
const finalStats = { ...stats, isComplete: true, endTime: Date.now() };
```
If this sets a local variable but doesn't call `setStats()`, you need to also add:
```typescript
setStats(prev => ({ ...prev, isComplete: true, endTime: Date.now() }));
```
before the `onRaceComplete` call so that the `currentWPM` memo reads the frozen time.

**Step 3: Test manually**

1. Run `npm start` (web dev server)
2. Open two browser tabs, start a multiplayer race
3. Finish the race in one tab
4. Observe that the WPM in the top HUD stays frozen at the final value (no longer declines)
5. Verify the results screen still shows the correct WPM

**Step 4: Commit**

```bash
git add src/components/TypeRacer.tsx
git commit -m "fix: freeze WPM display after race completion in multiplayer"
```

---

## Task 2: Randomize Multiplayer Categories

**Files:**
- Modify: `server/src/room.ts:33-41` (constructor)
- Modify: `server/src/room.ts:184-203` (resetForRematch)
- Modify: `server/src/types.ts:61` (race-start message)
- Modify: `src/hooks/useMultiplayer.ts:79-82` (race-start handler)

**Context:** Currently the room creator's category is used for multiplayer. We want the server to randomly pick a category each race for variety. Solo mode is unaffected.

**Step 1: Add random category selection to Room constructor**

In `server/src/room.ts`, replace the constructor (lines 33-41):

```typescript
constructor(code: string, difficulty: Difficulty, category: PassageCategory = 'sentences') {
    this.code = code;
    this.difficulty = difficulty;
    this.category = category;
    this.passage = getRandomPassage(difficulty, category) || {
      id: 'fallback', title: 'Fallback', text: 'The quick brown fox jumps over the lazy dog.',
      difficulty: 'easy', category: 'sentences'
    };
  }
```

With:

```typescript
private static readonly CATEGORIES: PassageCategory[] = ['sentences', 'pop-culture', 'random-words'];

  private static randomCategory(): PassageCategory {
    return Room.CATEGORIES[Math.floor(Math.random() * Room.CATEGORIES.length)];
  }

  constructor(code: string, difficulty: Difficulty, _category?: PassageCategory) {
    this.code = code;
    this.difficulty = difficulty;
    this.category = Room.randomCategory();
    this.passage = getRandomPassage(this.difficulty, this.category) || {
      id: 'fallback', title: 'Fallback', text: 'The quick brown fox jumps over the lazy dog.',
      difficulty: 'easy', category: 'sentences'
    };
  }
```

**Step 2: Randomize category on rematch too**

In `server/src/room.ts`, in `resetForRematch()` (line 184), change:

```typescript
private resetForRematch(): void {
    this.passage = getRandomPassage(this.difficulty, this.category) || this.passage;
```

To:

```typescript
private resetForRematch(): void {
    this.category = Room.randomCategory();
    this.passage = getRandomPassage(this.difficulty, this.category) || this.passage;
```

**Step 3: Add category to race-start message**

In `server/src/types.ts`, update the `race-start` entry in `ServerMessage` (line 61):

```typescript
| { type: 'race-start'; passage: TextPassage }
```

To:

```typescript
| { type: 'race-start'; passage: TextPassage; category: PassageCategory }
```

In `server/src/room.ts`, in `startCountdown()` (line 105), update the broadcast:

```typescript
this.broadcast({ type: 'race-start', passage: this.passage });
```

To:

```typescript
this.broadcast({ type: 'race-start', passage: this.passage, category: this.category });
```

**Step 4: Handle category on client**

In `src/hooks/useMultiplayer.ts`, the `race-start` handler (line 79-82) already sets the passage. No additional state needed since the passage object itself contains the category. The client can read `passage.category` wherever needed.

**Step 5: Test manually**

1. Run `npm run dev:all` (React + server)
2. Create a multiplayer room — note the passage category
3. Play through, rematch — verify the category changes (may take a few tries since random can repeat)
4. Verify solo mode still lets you pick your own category

**Step 6: Commit**

```bash
git add server/src/room.ts server/src/types.ts
git commit -m "feat: randomize passage category for multiplayer races"
```

---

## Task 3: Multiplayer Rematch with 30-Second Timeout

**Files:**
- Modify: `server/src/room.ts:164-204` (requestRematch, resetForRematch)
- Modify: `server/src/types.ts:55-66` (add rematch-countdown message)
- Modify: `src/hooks/useMultiplayer.ts:34-43,92-93,162-167` (add rematch state)
- Modify: `src/components/ResultsScreen.tsx:15-23,64-76,136-143` (add voter UI)
- Modify: `src/components/ResultsScreen.css` (add rematch countdown styles)

### Step 1: Add `rematch-countdown` to server message types

In `server/src/types.ts`, add to the `ServerMessage` union (after line 65):

```typescript
| { type: 'rematch-countdown'; secondsLeft: number; voters: string[] }
```

### Step 2: Implement rematch timeout in Room

In `server/src/room.ts`, add a new timer field after `finishTimer` (line 29):

```typescript
private rematchTimer: NodeJS.Timeout | null = null;
private rematchDeadline: NodeJS.Timeout | null = null;
```

Replace the `requestRematch` method (lines 164-182) with:

```typescript
requestRematch(ws: WebSocket): void {
    const player = this.players.get(ws);
    if (!player || this.state !== 'finished') return;

    player.wantsRematch = true;
    const accepted = Array.from(this.players.values())
      .filter(p => p.wantsRematch)
      .map(p => p.name);

    // Start 30-second countdown on first vote
    if (accepted.length === 1 && !this.rematchDeadline) {
      let secondsLeft = 30;
      this.broadcast({ type: 'rematch-countdown', secondsLeft, voters: accepted });

      this.rematchTimer = setInterval(() => {
        secondsLeft--;
        const currentVoters = Array.from(this.players.values())
          .filter(p => p.wantsRematch)
          .map(p => p.name);
        this.broadcast({ type: 'rematch-countdown', secondsLeft, voters: currentVoters });

        if (secondsLeft <= 0) {
          this.resolveRematch();
        }
      }, 1000);

      this.rematchDeadline = this.rematchTimer; // alias for clarity
    } else {
      // Broadcast updated voter list
      this.broadcast({
        type: 'rematch-request',
        from: player.name,
        accepted,
      });
    }

    // If all players voted, start immediately
    if (accepted.length === this.players.size) {
      this.clearRematchTimers();
      this.resetForRematch();
    }
  }

  private resolveRematch(): void {
    this.clearRematchTimers();

    // Remove players who didn't vote
    const toRemove: WebSocket[] = [];
    for (const [ws, player] of this.players) {
      if (!player.wantsRematch) {
        toRemove.push(ws);
      }
    }
    for (const ws of toRemove) {
      this.players.delete(ws);
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Removed from room (did not vote for rematch)' }));
      } catch {}
    }

    if (this.players.size > 0) {
      this.resetForRematch();
    }
  }

  private clearRematchTimers(): void {
    if (this.rematchTimer) {
      clearInterval(this.rematchTimer);
      this.rematchTimer = null;
    }
    this.rematchDeadline = null;
  }
```

Also update `resetForRematch()` to clear rematch timers at the top:

```typescript
private resetForRematch(): void {
    this.clearRematchTimers();
    this.category = Room.randomCategory();
    this.passage = getRandomPassage(this.difficulty, this.category) || this.passage;
    // ... rest stays the same
```

### Step 3: Handle rematch state on client

In `src/hooks/useMultiplayer.ts`, add new state (after line 42):

```typescript
const [rematchVoters, setRematchVoters] = useState<string[]>([]);
const [rematchSecondsLeft, setRematchSecondsLeft] = useState<number | null>(null);
```

Add a handler in the `switch` block (after the `rematch-request` case at line 92):

```typescript
case 'rematch-request':
    setRematchVoters(msg.accepted);
    break;
case 'rematch-countdown':
    setRematchVoters(msg.voters);
    setRematchSecondsLeft(msg.secondsLeft);
    break;
```

Reset rematch state when race starts. In the `race-start` handler (line 79):

```typescript
case 'race-start':
    setState('racing');
    setPassage(msg.passage);
    setRematchVoters([]);
    setRematchSecondsLeft(null);
    break;
```

Add to the return object (line 162):

```typescript
return {
    state, roomCode, players, playerProgress, raceResults,
    countdownSeconds, passage, isCreator, error,
    rematchVoters, rematchSecondsLeft,
    createRoom, joinRoom, startRace: startRaceMP,
    sendProgress, sendFinished, requestRematch, leave,
};
```

### Step 4: Update ResultsScreen to show rematch voter UI

In `src/components/ResultsScreen.tsx`, update the props interface (line 15):

```typescript
interface ResultsScreenProps {
    result: RaceResult;
    isNewBest: boolean;
    fireStreak: number;
    onRestart: () => void;
    onNewRace: () => void;
    podium?: PlayerResult[];
    onLeaveRoom?: () => void;
    rematchVoters?: string[];
    rematchSecondsLeft?: number | null;
}
```

Update the component destructuring (line 40):

```typescript
const ResultsScreen: React.FC<ResultsScreenProps> = ({ result, isNewBest, fireStreak, onRestart, onNewRace, podium, onLeaveRoom, rematchVoters, rematchSecondsLeft }) => {
```

After the podium section (after line 76), add a rematch status section:

```typescript
{podium && rematchVoters !== undefined && (
    <div className="rematch-status">
        {rematchSecondsLeft !== null && rematchSecondsLeft !== undefined && (
            <div className="rematch-timer">
                Next race in <span className="rematch-seconds">{rematchSecondsLeft}s</span>
            </div>
        )}
        <div className="rematch-voters">
            {podium.map(p => (
                <div key={p.name} className="rematch-voter" style={{ borderColor: p.color }}>
                    <span className="voter-icon">
                        {rematchVoters.includes(p.name) ? '\u2713' : '\u2026'}
                    </span>
                    <span className="voter-name" style={{ color: p.color }}>{p.name}</span>
                </div>
            ))}
        </div>
    </div>
)}
```

### Step 5: Add CSS for rematch UI

In `src/components/ResultsScreen.css`, add at the end:

```css
/* Rematch voting UI */
.rematch-status {
    margin: 1rem 0;
    text-align: center;
}

.rematch-timer {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.rematch-seconds {
    color: var(--cyan);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.rematch-voters {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.rematch-voter {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid;
    border-radius: 4px;
    font-size: 0.8rem;
    background: rgba(255, 255, 255, 0.03);
}

.voter-icon {
    font-size: 0.9rem;
}
```

### Step 6: Pass rematch props from App.tsx

In `src/App.tsx`, update the ResultsScreen render (around line 254-263):

```typescript
{gameState === 'results' && raceResult && (
    <ResultsScreen
        result={raceResult}
        isNewBest={isNewBest}
        fireStreak={lastFireStreak}
        onRestart={restartRace}
        onNewRace={returnToWelcome}
        podium={mp.state === 'finished' ? mp.raceResults : undefined}
        onLeaveRoom={mp.state === 'finished' ? () => { mp.leave(); returnToWelcome(); } : undefined}
        rematchVoters={mp.state === 'finished' ? mp.rematchVoters : undefined}
        rematchSecondsLeft={mp.state === 'finished' ? mp.rematchSecondsLeft : undefined}
    />
)}
```

### Step 7: Test manually

1. Run `npm run dev:all`
2. Open 2 browser tabs, create and join a room, complete a race
3. In the results screen, click RACE AGAIN in one tab — see the voter check mark appear
4. Wait 30 seconds — verify the non-voting player is removed and the race starts for the voter
5. Test with both players clicking rematch before timeout — race should start immediately

### Step 8: Commit

```bash
git add server/src/room.ts server/src/types.ts src/hooks/useMultiplayer.ts src/components/ResultsScreen.tsx src/components/ResultsScreen.css src/App.tsx
git commit -m "feat: add 30-second rematch timeout with voter UI for multiplayer"
```

---

## Task 4: Daily Leaderboard (Local + Server)

### Part A: Server-side leaderboard

**Files:**
- Modify: `server/src/db.ts` (add race_results table + queries)
- Modify: `server/src/index.ts` (add POST /results and GET /leaderboard/today endpoints)

#### Step 1: Add race_results table and queries to db.ts

In `server/src/db.ts`, after the passages table creation (line 22), add:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    wpm REAL NOT NULL,
    accuracy REAL NOT NULL,
    fire_streak INTEGER NOT NULL DEFAULT 0,
    difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
    category TEXT NOT NULL CHECK(category IN ('sentences', 'pop-culture', 'random-words')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_results_date ON race_results(created_at)
`);
```

After the existing prepared statements (after line 46), add:

```typescript
const stmtInsertResult = db.prepare(`
  INSERT INTO race_results (player_name, wpm, accuracy, fire_streak, difficulty, category)
  VALUES (@player_name, @wpm, @accuracy, @fire_streak, @difficulty, @category)
`);

const stmtTopWpmToday = db.prepare(`
  SELECT player_name, wpm, accuracy, fire_streak
  FROM race_results
  WHERE date(created_at) = date('now')
  ORDER BY wpm DESC
  LIMIT 5
`);

const stmtTopStreakToday = db.prepare(`
  SELECT player_name, wpm, accuracy, fire_streak
  FROM race_results
  WHERE date(created_at) = date('now')
  ORDER BY fire_streak DESC
  LIMIT 5
`);
```

Add public functions (before the seed section):

```typescript
export interface LeaderboardEntry {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
}

export function insertRaceResult(result: {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  difficulty: Difficulty;
  category: PassageCategory;
}): number {
  const info = stmtInsertResult.run(result);
  return info.lastInsertRowid as number;
}

export function getTodayLeaderboard(): { topWpm: LeaderboardEntry[]; topStreak: LeaderboardEntry[] } {
  const topWpm = stmtTopWpmToday.all() as LeaderboardEntry[];
  const topStreak = stmtTopStreakToday.all() as LeaderboardEntry[];
  return { topWpm, topStreak };
}
```

#### Step 2: Add REST endpoints to index.ts

In `server/src/index.ts`, add the import for the new functions (line 7):

```typescript
import { seedIfEmpty, getPassages, getRandomPassage as getRandomFromDB, insertPassage, getPassageCount, insertRaceResult, getTodayLeaderboard } from './db';
```

After the `POST /passages` route (after line 84), add:

```typescript
// Submit a race result
app.post('/results', (req, res) => {
  const { playerName, wpm, accuracy, fireStreak, difficulty, category } = req.body;
  if (!playerName || wpm == null || accuracy == null || !difficulty || !category) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const id = insertRaceResult({
      player_name: playerName,
      wpm,
      accuracy,
      fire_streak: fireStreak || 0,
      difficulty,
      category,
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// Get today's leaderboard
app.get('/leaderboard/today', (_req, res) => {
  try {
    const leaderboard = getTodayLeaderboard();
    res.json(leaderboard);
  } catch {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});
```

Also update the SPA fallback route (line 92) to exclude the new paths:

```typescript
if (_req.path.startsWith('/passages') || _req.path.startsWith('/health') || _req.path.startsWith('/results') || _req.path.startsWith('/leaderboard')) {
```

#### Step 3: Commit server changes

```bash
git add server/src/db.ts server/src/index.ts
git commit -m "feat: add race results storage and daily leaderboard API"
```

### Part B: Client-side leaderboard

**Files:**
- Modify: `src/utils/api.ts` (add submitResult + fetchLeaderboard)
- Modify: `src/utils/storage.ts` (add getTodaysBest)
- Modify: `src/components/WelcomeScreen.tsx` (add leaderboard section)
- Modify: `src/components/WelcomeScreen.css` (add leaderboard styles)
- Modify: `src/App.tsx` (submit results + pass leaderboard data)

#### Step 4: Add API functions

In `src/utils/api.ts`, add at the end:

```typescript
export interface LeaderboardEntry {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
}

export interface TodayLeaderboard {
  topWpm: LeaderboardEntry[];
  topStreak: LeaderboardEntry[];
}

export async function submitRaceResult(data: {
  playerName: string;
  wpm: number;
  accuracy: number;
  fireStreak: number;
  difficulty: Difficulty;
  category: PassageCategory;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // Fire-and-forget — don't block UI
  }
}

export async function fetchTodayLeaderboard(): Promise<TodayLeaderboard | null> {
  try {
    const res = await fetch(`${API_BASE}/leaderboard/today`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

#### Step 5: Add getTodaysBest to storage.ts

In `src/utils/storage.ts`, add at the end (after `setCategory`):

```typescript
// ---------------------------------------------------------------------------
// Today's Best (derived from race history)
// ---------------------------------------------------------------------------

export function getTodaysBest(): RaceHistoryEntry | null {
  const history = getHistory();
  const today = todayString();
  const todaysRaces = history.filter(h => {
    const d = new Date(h.timestamp).toISOString().slice(0, 10);
    return d === today;
  });
  if (todaysRaces.length === 0) return null;
  return todaysRaces.reduce((best, race) => race.wpm > best.wpm ? race : best);
}
```

#### Step 6: Update WelcomeScreen props and UI

In `src/components/WelcomeScreen.tsx`, update the imports (line 1):

```typescript
import React, { useEffect, useState } from 'react';
```

Update the props interface (after line 16):

```typescript
interface WelcomeScreenProps {
    onStartSolo: () => void;
    onStartMultiplayer: () => void;
    difficulty: Difficulty;
    onDifficultyChange: (d: Difficulty) => void;
    bests: PersonalBests;
    dailyStreak: DailyStreak;
    totalRaces: number;
    ghostEnabled: boolean;
    onGhostToggle: () => void;
    category: PassageCategory;
    onCategoryChange: (c: PassageCategory) => void;
    todaysBest: { wpm: number; accuracy: number; fireStreak: number } | null;
    leaderboard: { topWpm: { player_name: string; wpm: number; fire_streak: number }[]; topStreak: { player_name: string; wpm: number; fire_streak: number }[] } | null;
}
```

Add `todaysBest` and `leaderboard` to the destructuring:

```typescript
const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    onStartSolo,
    onStartMultiplayer,
    difficulty,
    onDifficultyChange,
    bests,
    dailyStreak,
    totalRaces,
    ghostEnabled,
    onGhostToggle,
    category,
    onCategoryChange,
    todaysBest,
    leaderboard,
}) => {
```

After the stats strip section (after the closing `</div>` on line 108), add:

```typescript
<div className="today-champions">
    <div className="champions-label">TODAY'S CHAMPIONS</div>
    <div className="champions-columns">
        <div className="champions-col">
            <div className="col-header">YOUR BEST</div>
            {todaysBest ? (
                <div className="personal-today">
                    <span className="pt-wpm">{todaysBest.wpm} WPM</span>
                    <span className="pt-acc">{todaysBest.accuracy}%</span>
                    {todaysBest.fireStreak > 0 && (
                        <span className="pt-streak">{todaysBest.fireStreak} streak</span>
                    )}
                </div>
            ) : (
                <div className="no-races-today">No races today</div>
            )}
        </div>
        <div className="champions-divider" />
        <div className="champions-col">
            <div className="col-header">GLOBAL TOP 5</div>
            {leaderboard && leaderboard.topWpm.length > 0 ? (
                <div className="global-top">
                    {leaderboard.topWpm.map((entry, i) => (
                        <div key={i} className="lb-entry">
                            <span className="lb-rank">#{i + 1}</span>
                            <span className="lb-name">{entry.player_name}</span>
                            <span className="lb-wpm">{entry.wpm}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="no-races-today">
                    {leaderboard === null ? 'Leaderboard unavailable' : 'No races today'}
                </div>
            )}
        </div>
    </div>
</div>
```

#### Step 7: Add CSS for leaderboard

In `src/components/WelcomeScreen.css`, add at the end:

```css
/* Today's Champions */
.today-champions {
    margin: 1.5rem 0 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
}

.champions-label {
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    color: var(--text-secondary);
    text-align: center;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
}

.champions-columns {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

.champions-col {
    flex: 1;
    min-width: 0;
}

.champions-divider {
    width: 1px;
    align-self: stretch;
    background: rgba(255, 255, 255, 0.08);
}

.col-header {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: var(--cyan);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
}

.personal-today {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.pt-wpm {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
}

.pt-acc {
    font-size: 0.8rem;
    color: var(--text-secondary);
}

.pt-streak {
    font-size: 0.75rem;
    color: var(--amber);
}

.no-races-today {
    font-size: 0.8rem;
    color: var(--text-secondary);
    opacity: 0.6;
}

.global-top {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.lb-entry {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
}

.lb-rank {
    color: var(--text-secondary);
    width: 1.5em;
}

.lb-name {
    flex: 1;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.lb-wpm {
    color: var(--cyan);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
```

#### Step 8: Wire up in App.tsx

In `src/App.tsx`, add imports:

```typescript
import { fetchRandomPassage, submitRaceResult, fetchTodayLeaderboard, TodayLeaderboard } from './utils/api';
import { getTodaysBest } from './utils/storage'; // add getTodaysBest to the existing import
```

Wait, `getTodaysBest` returns a `RaceHistoryEntry`. We need the shape `{ wpm, accuracy, fireStreak }`. So map it in App.

Add state (after line 43):

```typescript
const [todaysBest, setTodaysBest] = useState(getTodaysBest());
const [leaderboard, setLeaderboard] = useState<TodayLeaderboard | null>(null);
```

Add a `useEffect` to fetch the leaderboard on mount and when returning to welcome:

```typescript
useEffect(() => {
    if (gameState === 'welcome') {
        setTodaysBest(getTodaysBest());
        fetchTodayLeaderboard().then(lb => setLeaderboard(lb));
    }
}, [gameState]);
```

In `handleRaceComplete` (after the `addHistoryEntry` call around line 147), add result submission:

```typescript
// Submit to server leaderboard (fire-and-forget)
const playerName = getPlayerName();
if (playerName) {
    submitRaceResult({
        playerName,
        wpm: result.wpm,
        accuracy: result.accuracy,
        fireStreak: fireStreak,
        difficulty,
        category,
    });
}
```

Add `getPlayerName` to the storage import:

```typescript
import {
    getBests, updateBest, getHistory, addHistoryEntry,
    getDailyStreak, incrementDailyStreak,
    getDifficulty, setDifficulty,
    getCategory, setCategory,
    isGhostEnabled, setGhostEnabled,
    getPlayerName, getTodaysBest,
} from './utils/storage';
```

Pass new props to WelcomeScreen:

```typescript
<WelcomeScreen
    onStartSolo={startRace}
    onStartMultiplayer={handleStartMultiplayer}
    difficulty={difficulty}
    onDifficultyChange={handleDifficultyChange}
    bests={bests}
    dailyStreak={dailyStreak}
    totalRaces={totalRaces}
    ghostEnabled={ghostEnabled}
    onGhostToggle={handleGhostToggle}
    category={category}
    onCategoryChange={handleCategoryChange}
    todaysBest={todaysBest ? { wpm: todaysBest.wpm, accuracy: todaysBest.accuracy, fireStreak: todaysBest.fireStreak } : null}
    leaderboard={leaderboard}
/>
```

#### Step 9: Test manually

1. Run `npm run dev:all`
2. Set a player name (via multiplayer modal or however it's stored)
3. Complete a solo race
4. Return to welcome screen — "YOUR BEST" should show today's stats
5. "GLOBAL TOP 5" should show your race (or "No races today" if server was restarted)
6. Complete another race with higher WPM — verify YOUR BEST updates
7. Check server directly: `curl http://localhost:3001/leaderboard/today`

#### Step 10: Commit

```bash
git add src/utils/api.ts src/utils/storage.ts src/components/WelcomeScreen.tsx src/components/WelcomeScreen.css src/App.tsx server/src/db.ts server/src/index.ts
git commit -m "feat: add daily leaderboard with local best and global top 5"
```

---

## Task 5: Menu Music

**Files:**
- Create: `public/audio/menu-theme.mp3` (user must provide this file)
- Create: `src/utils/menuMusic.ts`
- Modify: `src/utils/audioEngine.ts:18-22` (sync mute with menu music)
- Modify: `src/components/WelcomeScreen.tsx` (start/stop music)
- Modify: `src/App.tsx` (stop music on race start)

### Step 1: Create menuMusic.ts utility

Create `src/utils/menuMusic.ts`:

```typescript
import { isMuted } from './storage';

let audio: HTMLAudioElement | null = null;
let fadeInterval: ReturnType<typeof setInterval> | null = null;

const TARGET_VOLUME = 0.3;
const FADE_STEP = 0.02;
const FADE_INTERVAL_MS = 30;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(`${process.env.PUBLIC_URL}/audio/menu-theme.mp3`);
    audio.loop = true;
    audio.volume = 0;
  }
  return audio;
}

function clearFade(): void {
  if (fadeInterval) {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }
}

export function startMenuMusic(): void {
  if (isMuted()) return;
  const el = ensureAudio();
  if (!el.paused) return; // already playing

  el.volume = 0;
  el.play().catch(() => {
    // Browser blocked autoplay — will start on next user interaction
  });

  clearFade();
  fadeInterval = setInterval(() => {
    if (el.volume < TARGET_VOLUME - FADE_STEP) {
      el.volume = Math.min(el.volume + FADE_STEP, TARGET_VOLUME);
    } else {
      el.volume = TARGET_VOLUME;
      clearFade();
    }
  }, FADE_INTERVAL_MS);
}

export function stopMenuMusic(): void {
  if (!audio || audio.paused) return;

  clearFade();
  const el = audio;
  fadeInterval = setInterval(() => {
    if (el.volume > FADE_STEP) {
      el.volume = Math.max(el.volume - FADE_STEP, 0);
    } else {
      el.volume = 0;
      el.pause();
      clearFade();
    }
  }, FADE_INTERVAL_MS);
}

export function setMenuMusicMuted(muted: boolean): void {
  if (!audio) return;
  if (muted) {
    audio.volume = 0;
    audio.pause();
    clearFade();
  } else {
    startMenuMusic();
  }
}
```

### Step 2: Wire mute toggle to menu music

In `src/utils/audioEngine.ts`, update `toggleMute` (line 18) to also control menu music:

```typescript
import { setMenuMusicMuted } from './menuMusic';

export function toggleMute(): boolean {
  muted = !muted;
  persistMute(muted);
  setMenuMusicMuted(muted);
  return muted;
}
```

Note: The import must be added at the top of the file (or after existing imports).

### Step 3: Start music on WelcomeScreen

In `src/components/WelcomeScreen.tsx`, add a `useEffect` for the music. Update imports:

```typescript
import React, { useEffect } from 'react';
```

Inside the component, before the `return`:

```typescript
useEffect(() => {
    startMenuMusic();
    return () => { stopMenuMusic(); };
}, []);
```

And add the import:

```typescript
import { startMenuMusic, stopMenuMusic } from '../utils/menuMusic';
```

### Step 4: Belt-and-suspenders stop in App.tsx

In `src/App.tsx`, import and call `stopMenuMusic` when transitioning to racing. Add to the `startRace` callback:

```typescript
import { stopMenuMusic } from './utils/menuMusic';
```

In `startRace` (around line 120):

```typescript
const startRace = useCallback(async () => {
    stopMenuMusic();
    const newPassage = await getPassage(difficulty, category);
    setPassage(newPassage);
    // ...
```

Also in the multiplayer race-start effect (around line 80):

```typescript
useEffect(() => {
    if (mp.state === 'racing' && mp.passage) {
        stopMenuMusic();
        setPassage(mp.passage);
        // ...
```

### Step 5: Add placeholder audio file

Create an empty placeholder (the user needs to provide the real file):

```bash
mkdir -p public/audio
# User must place their menu-theme.mp3 here
```

**Important:** The user needs to provide a royalty-free lofi/retro/arcadey music file at `public/audio/menu-theme.mp3`. The code will gracefully handle the file being missing (the `play().catch()` will silently fail).

### Step 6: Test manually

1. Place an `.mp3` file at `public/audio/menu-theme.mp3`
2. Run `npm start`
3. Welcome screen should start playing music with a fade-in
4. Click SOLO — music should fade out
5. Return to welcome (Cmd+N) — music should resume
6. Toggle mute — music should stop
7. Unmute — music should resume
8. Verify typing sounds still work during a race

### Step 7: Commit

```bash
git add src/utils/menuMusic.ts src/utils/audioEngine.ts src/components/WelcomeScreen.tsx src/App.tsx
git commit -m "feat: add looping menu music on welcome screen with fade transitions"
```

---

## Summary of All Commits

1. `fix: freeze WPM display after race completion in multiplayer`
2. `feat: randomize passage category for multiplayer races`
3. `feat: add 30-second rematch timeout with voter UI for multiplayer`
4. `feat: add race results storage and daily leaderboard API` (server)
5. `feat: add daily leaderboard with local best and global top 5` (client)
6. `feat: add looping menu music on welcome screen with fade transitions`
