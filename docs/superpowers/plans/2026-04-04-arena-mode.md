# TypeRace "Arena Mode" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immersive audio/visual effects, a fire streak combo system, local competitive features, and real-time WebSocket multiplayer to the TypeRace typing game.

**Architecture:** The feature set decomposes into four independent layers built bottom-up: (1) shared types + localStorage utilities, (2) immersive effects (audio, visuals, particles), (3) competitive systems (bests, streaks, ghost, fire), (4) multiplayer (WebSocket server + client integration). Each layer produces working software that can be tested independently.

**Tech Stack:** React 18, TypeScript, Web Audio API (synthesized sounds), Canvas (particles), SVG (sparklines), Node/Express + `ws` (multiplayer server).

---

## File Map

### New Files — Client

| File | Responsibility |
|------|---------------|
| `src/utils/storage.ts` | All localStorage read/write: bests, history, streaks, ghosts, preferences |
| `src/utils/audioEngine.ts` | Web Audio API: synthesize click/buzz/fanfare, playback, mute control |
| `src/utils/particleBurst.ts` | Canvas particle system for race completion effect |
| `src/hooks/useSpeedTier.ts` | Compute speed tier from WPM, return `data-speed-tier` value |
| `src/hooks/useFireStreak.ts` | Track consecutive correct chars + pace, compute tier |
| `src/hooks/useGhost.ts` | Record ghost timing data, replay ghost cursor position |
| `src/hooks/useMultiplayer.ts` | WebSocket connection, room state, message handling |
| `src/components/FireBanner.tsx` | Fire streak floating banner component |
| `src/components/FireBanner.css` | Fire banner styles + animations |
| `src/components/Sparkline.tsx` | Inline SVG sparkline for WPM history |
| `src/components/RaceTrack.tsx` | Multiplayer progress bars |
| `src/components/RaceTrack.css` | Race track styles |
| `src/components/MultiplayerModal.tsx` | Create/join room modal |
| `src/components/MultiplayerModal.css` | Modal styles |
| `src/components/Lobby.tsx` | Pre-race multiplayer lobby |
| `src/components/Lobby.css` | Lobby styles |

### New Files — Server

| File | Responsibility |
|------|---------------|
| `server/package.json` | Server dependencies (express, ws, typescript) |
| `server/tsconfig.json` | Server TypeScript config |
| `server/src/types.ts` | Shared message types (client ↔ server) |
| `server/src/room.ts` | Room class: player management, state machine, passage selection |
| `server/src/passages.ts` | Text passages data (server-side copy) |
| `server/src/index.ts` | Express + WebSocket server entry point |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/GameTypes.ts` | Add `FireStreakTier`, `Difficulty`, `PersonalBests`, `RaceHistoryEntry`, `DailyStreak`, multiplayer types |
| `src/data/textPassages.ts` | Add `difficulty` parameter to `getRandomPassage` |
| `src/components/WelcomeScreen.tsx` | Difficulty picker, solo/multiplayer buttons, stats strip, daily streak, ghost toggle |
| `src/components/WelcomeScreen.css` | Styles for new welcome elements |
| `src/components/TypeRacer.tsx` | Speed tier, fire streak, audio, error shake, ghost cursor, race track, mute toggle |
| `src/components/TypeRacer.css` | Speed tier CSS, shake animation, fire cursor glow, ghost cursor styles |
| `src/components/ResultsScreen.tsx` | Sparkline, fire streak stat, NEW BEST indicator, multiplayer podium |
| `src/components/ResultsScreen.css` | NEW BEST animation, podium styles, sparkline container |
| `src/App.tsx` | Difficulty state, multiplayer state, session streak, ghost toggle, passage prop threading |
| `src/index.css` | Shake keyframes, fire-glow keyframes |
| `package.json` | Add `dev:server` and updated `dev` scripts |

---

## Task 1: Shared Types & localStorage Utilities

**Files:**
- Modify: `src/types/GameTypes.ts`
- Create: `src/utils/storage.ts`

- [ ] **Step 1: Extend GameTypes with new type definitions**

Add these types to `src/types/GameTypes.ts`:

```typescript
export type Difficulty = 'easy' | 'medium' | 'hard';

export type FireStreakTier = 'none' | 'fire' | 'blazing' | 'unstoppable';

export interface PersonalBests {
  easy:   { wpm: number; accuracy: number } | null;
  medium: { wpm: number; accuracy: number } | null;
  hard:   { wpm: number; accuracy: number } | null;
}

export interface RaceHistoryEntry {
  wpm: number;
  accuracy: number;
  difficulty: Difficulty;
  passageTitle: string;
  timestamp: number;
  fireStreak: number;
}

export interface DailyStreak {
  count: number;
  lastDate: string;
}
```

- [ ] **Step 2: Create the storage utility module**

Create `src/utils/storage.ts`:

```typescript
import { PersonalBests, RaceHistoryEntry, DailyStreak, Difficulty } from '../types/GameTypes';

const KEYS = {
  BESTS: 'typerace-bests',
  HISTORY: 'typerace-history',
  DAILY_STREAK: 'typerace-daily-streak',
  GHOSTS: 'typerace-ghosts',
  DIFFICULTY: 'typerace-difficulty',
  GHOST_ENABLED: 'typerace-ghost-enabled',
  MUTED: 'typerace-muted',
  PLAYER_NAME: 'typerace-player-name',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Personal Bests ──

const EMPTY_BESTS: PersonalBests = { easy: null, medium: null, hard: null };

export function getBests(): PersonalBests {
  return read(KEYS.BESTS, EMPTY_BESTS);
}

export function updateBest(difficulty: Difficulty, wpm: number, accuracy: number): boolean {
  const bests = getBests();
  const current = bests[difficulty];
  if (!current || wpm > current.wpm) {
    bests[difficulty] = { wpm, accuracy };
    write(KEYS.BESTS, bests);
    return true;
  }
  return false;
}

// ── Race History ──

const MAX_HISTORY = 30;

export function getHistory(): RaceHistoryEntry[] {
  return read<RaceHistoryEntry[]>(KEYS.HISTORY, []);
}

export function addHistoryEntry(entry: RaceHistoryEntry): void {
  const history = getHistory();
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  write(KEYS.HISTORY, history);
}

// ── Daily Streak ──

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function getDailyStreak(): DailyStreak {
  const streak = read<DailyStreak>(KEYS.DAILY_STREAK, { count: 0, lastDate: '' });
  // If lastDate is older than yesterday, streak is broken
  if (streak.lastDate !== todayISO() && streak.lastDate !== yesterdayISO()) {
    return { count: 0, lastDate: '' };
  }
  return streak;
}

export function incrementDailyStreak(): DailyStreak {
  const streak = getDailyStreak();
  const today = todayISO();
  if (streak.lastDate === today) return streak; // Already counted today
  const updated: DailyStreak = { count: streak.count + 1, lastDate: today };
  write(KEYS.DAILY_STREAK, updated);
  return updated;
}

// ── Ghost Data ──

export function getGhostData(passageId: string): number[] | null {
  const ghosts = read<Record<string, number[]>>(KEYS.GHOSTS, {});
  return ghosts[passageId] || null;
}

export function saveGhostData(passageId: string, timestamps: number[]): void {
  const ghosts = read<Record<string, number[]>>(KEYS.GHOSTS, {});
  ghosts[passageId] = timestamps;
  write(KEYS.GHOSTS, ghosts);
}

// ── Preferences ──

export function getDifficulty(): Difficulty {
  return read<Difficulty>(KEYS.DIFFICULTY, 'medium');
}

export function setDifficulty(d: Difficulty): void {
  write(KEYS.DIFFICULTY, d);
}

export function isGhostEnabled(): boolean {
  return read(KEYS.GHOST_ENABLED, true);
}

export function setGhostEnabled(enabled: boolean): void {
  write(KEYS.GHOST_ENABLED, enabled);
}

export function isMuted(): boolean {
  return read(KEYS.MUTED, false);
}

export function setMuted(muted: boolean): void {
  write(KEYS.MUTED, muted);
}

export function getPlayerName(): string {
  return read(KEYS.PLAYER_NAME, '');
}

export function setPlayerName(name: string): void {
  write(KEYS.PLAYER_NAME, name);
}
```

- [ ] **Step 3: Update passage selector to accept difficulty filter**

Modify `src/data/textPassages.ts` — update the `getRandomPassage` function:

```typescript
export const getRandomPassage = (difficulty?: 'easy' | 'medium' | 'hard'): TextPassage => {
  const pool = difficulty
    ? textPassages.filter(p => p.difficulty === difficulty)
    : textPassages;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
};
```

- [ ] **Step 4: Commit**

```bash
git add src/types/GameTypes.ts src/utils/storage.ts src/data/textPassages.ts
git commit -m "feat: add shared types and localStorage utilities for Arena Mode"
```

---

## Task 2: Audio Engine

**Files:**
- Create: `src/utils/audioEngine.ts`

Sounds are synthesized via Web Audio API oscillators — no .mp3 assets needed.

- [ ] **Step 1: Create the audio engine**

Create `src/utils/audioEngine.ts`:

```typescript
import { isMuted, setMuted as persistMute } from './storage';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

let muted = isMuted();

export function getMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  persistMute(muted);
  return muted;
}

// ── Synthesized sounds ──

export function playKeystroke(): void {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  // Vary pitch slightly for natural feel
  const freqs = [800, 900, 1000];
  osc.frequency.value = freqs[Math.floor(Math.random() * freqs.length)];
  osc.type = 'square';

  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}

export function playError(): void {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.value = 200;
  osc.type = 'sawtooth';

  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

export function playFanfare(): void {
  if (muted) return;
  const ctx = getCtx();
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 chord

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = freq;
    osc.type = 'sine';

    const startTime = ctx.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

    osc.start(startTime);
    osc.stop(startTime + 0.8);
  });
}

export function playKeystrokeAtPitch(pitchMultiplier: number): void {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const freqs = [800, 900, 1000];
  osc.frequency.value = freqs[Math.floor(Math.random() * freqs.length)] * pitchMultiplier;
  osc.type = 'square';

  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/audioEngine.ts
git commit -m "feat: add synthesized audio engine with keystroke, error, and fanfare sounds"
```

---

## Task 3: Speed Tier Hook & CSS

**Files:**
- Create: `src/hooks/useSpeedTier.ts`
- Modify: `src/components/TypeRacer.css`

- [ ] **Step 1: Create the speed tier hook**

Create `src/hooks/useSpeedTier.ts`:

```typescript
import { useMemo } from 'react';

export type SpeedTier = 'normal' | 'warm' | 'hot' | 'overdrive';

export function useSpeedTier(wpm: number): SpeedTier {
  return useMemo(() => {
    if (wpm >= 80) return 'overdrive';
    if (wpm >= 60) return 'hot';
    if (wpm >= 30) return 'warm';
    return 'normal';
  }, [wpm]);
}
```

- [ ] **Step 2: Add speed-tier CSS to TypeRacer.css**

Append to `src/components/TypeRacer.css`:

```css
/* ── Speed-reactive tiers ──────────────────────────────── */

.type-racer[data-speed-tier="warm"] {
    --glow-intensity: 1.5;
}

.type-racer[data-speed-tier="warm"] .progress-fill {
    box-shadow: 0 0 16px var(--cyan-dim);
}

.type-racer[data-speed-tier="hot"] {
    --glow-intensity: 2;
}

.type-racer[data-speed-tier="hot"] .progress-fill {
    box-shadow: 0 0 24px var(--cyan-dim), 0 0 48px rgba(0, 240, 255, 0.1);
}

.type-racer[data-speed-tier="hot"] .hud-stat-value.wpm {
    text-shadow: 0 0 20px var(--cyan);
}

.type-racer[data-speed-tier="overdrive"] {
    --glow-intensity: 3;
}

.type-racer[data-speed-tier="overdrive"] .welcome-grid-bg,
.type-racer[data-speed-tier="overdrive"]::before {
    animation-duration: 1.5s;
}

.type-racer[data-speed-tier="overdrive"] .progress-fill {
    box-shadow: 0 0 30px var(--cyan), 0 0 60px rgba(0, 240, 255, 0.2);
}

.type-racer[data-speed-tier="overdrive"] .hud-stat-value.wpm {
    text-shadow: 0 0 30px var(--cyan), 0 0 60px var(--cyan-dim);
}

/* Vignette for overdrive */
.type-racer[data-speed-tier="overdrive"]::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
    pointer-events: none;
    z-index: 50;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSpeedTier.ts src/components/TypeRacer.css
git commit -m "feat: add speed tier hook and reactive CSS visual tiers"
```

---

## Task 4: Error Shake & Completion Burst

**Files:**
- Modify: `src/index.css`
- Create: `src/utils/particleBurst.ts`

- [ ] **Step 1: Add shake keyframes to index.css**

Append to `src/index.css`:

```css
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%      { transform: translateX(-4px); }
    40%      { transform: translateX(4px); }
    60%      { transform: translateX(-3px); }
    80%      { transform: translateX(3px); }
}

.text-container.shake {
    animation: shake 0.15s ease-in-out;
}
```

- [ ] **Step 2: Create the particle burst utility**

Create `src/utils/particleBurst.ts`:

```typescript
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}

const COLORS = ['#00f0ff', '#ff0080', '#00ff88', '#ffaa00'];
const PARTICLE_COUNT = 35;
const DURATION = 800;

export function createBurstOverlay(): { start: () => void; cleanup: () => void } {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ctx = canvas.getContext('2d')!;
  let animId: number;
  let startTime: number;

  const particles: Particle[] = [];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
    });
  }

  function frame(now: number) {
    const elapsed = now - startTime;
    const progress = elapsed / DURATION;

    if (progress >= 1) {
      cleanup();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.alpha = 1 - progress;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    animId = requestAnimationFrame(frame);
  }

  function start() {
    document.body.appendChild(canvas);
    startTime = performance.now();
    animId = requestAnimationFrame(frame);
  }

  function cleanup() {
    cancelAnimationFrame(animId);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { start, cleanup };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/index.css src/utils/particleBurst.ts
git commit -m "feat: add error shake animation and completion particle burst"
```

---

## Task 5: Fire Streak Hook & Banner Component

**Files:**
- Create: `src/hooks/useFireStreak.ts`
- Create: `src/components/FireBanner.tsx`
- Create: `src/components/FireBanner.css`

- [ ] **Step 1: Create the fire streak hook**

Create `src/hooks/useFireStreak.ts`:

```typescript
import { useCallback, useRef } from 'react';
import { FireStreakTier } from '../types/GameTypes';

interface FireStreakState {
  consecutiveCorrect: number;
  longestStreak: number;
  tier: FireStreakTier;
  active: boolean;
}

function getTier(count: number): FireStreakTier {
  if (count >= 50) return 'unstoppable';
  if (count >= 25) return 'blazing';
  if (count >= 10) return 'fire';
  return 'none';
}

export function useFireStreak() {
  const stateRef = useRef<FireStreakState>({
    consecutiveCorrect: 0,
    longestStreak: 0,
    tier: 'none',
    active: false,
  });

  const recentTimestamps = useRef<number[]>([]);

  const recordKeystroke = useCallback((correct: boolean): FireStreakState => {
    const state = stateRef.current;
    const now = Date.now();

    if (!correct) {
      // Break the streak
      state.consecutiveCorrect = 0;
      state.tier = 'none';
      state.active = false;
      recentTimestamps.current = [];
      return { ...state };
    }

    state.consecutiveCorrect++;
    recentTimestamps.current.push(now);

    // Keep only the last 20 timestamps for rolling average
    if (recentTimestamps.current.length > 20) {
      recentTimestamps.current.shift();
    }

    // Check speed — need at least 5 recent timestamps to evaluate pace
    let paceOk = true;
    const stamps = recentTimestamps.current;
    if (stamps.length >= 5) {
      const recentInterval = (stamps[stamps.length - 1] - stamps[stamps.length - 5]) / 4;
      const avgInterval = (stamps[stamps.length - 1] - stamps[0]) / (stamps.length - 1);
      // Break if recent pace dropped below 70% of average
      if (recentInterval > avgInterval * 1.43) { // 1/0.7 ≈ 1.43
        state.consecutiveCorrect = 0;
        state.tier = 'none';
        state.active = false;
        return { ...state };
      }
    }

    state.tier = getTier(state.consecutiveCorrect);
    state.active = state.tier !== 'none';

    if (state.consecutiveCorrect > state.longestStreak) {
      state.longestStreak = state.consecutiveCorrect;
    }

    return { ...state };
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      consecutiveCorrect: 0,
      longestStreak: 0,
      tier: 'none',
      active: false,
    };
    recentTimestamps.current = [];
  }, []);

  const getLongestStreak = useCallback(() => stateRef.current.longestStreak, []);

  return { recordKeystroke, reset, getLongestStreak };
}
```

- [ ] **Step 2: Create FireBanner component**

Create `src/components/FireBanner.tsx`:

```typescript
import React from 'react';
import { FireStreakTier } from '../types/GameTypes';
import './FireBanner.css';

interface FireBannerProps {
  tier: FireStreakTier;
  streak: number;
  visible: boolean;
}

const TIER_LABELS: Record<FireStreakTier, string> = {
  none: '',
  fire: 'FIRE',
  blazing: 'BLAZING',
  unstoppable: 'UNSTOPPABLE',
};

const FireBanner: React.FC<FireBannerProps> = ({ tier, streak, visible }) => {
  if (!visible || tier === 'none') return null;

  return (
    <div className={`fire-banner fire-${tier}`}>
      <span className="fire-label">{TIER_LABELS[tier]}</span>
      <span className="fire-count">{streak}x</span>
    </div>
  );
};

export default FireBanner;
```

- [ ] **Step 3: Create FireBanner styles**

Create `src/components/FireBanner.css`:

```css
/* ── Fire Streak Banner ────────────────────────────────── */

.fire-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    text-align: center;
    animation: fireAppear 0.3s ease-out;
}

.fire-label {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
}

.fire-count {
    font-family: var(--font-mono);
    font-size: 0.75em;
    opacity: 0.6;
}

/* ── Tier variants ─────────────────────────────────────── */

.fire-fire .fire-label {
    font-size: 1rem;
    color: #ff6b00;
    text-shadow: 0 0 10px rgba(255, 107, 0, 0.5);
}

.fire-blazing .fire-label {
    font-size: 1.15rem;
    color: #ff4400;
    text-shadow: 0 0 16px rgba(255, 68, 0, 0.6), 0 0 32px rgba(255, 68, 0, 0.3);
}

.fire-unstoppable .fire-label {
    font-size: 1.3rem;
    color: #ff2200;
    text-shadow: 0 0 20px rgba(255, 34, 0, 0.7), 0 0 40px rgba(255, 34, 0, 0.4), 0 0 60px rgba(255, 34, 0, 0.2);
    animation: firePulse 0.5s ease-in-out infinite;
}

.fire-count {
    color: inherit;
    opacity: 0.5;
}

@keyframes fireAppear {
    from {
        opacity: 0;
        transform: scale(0.8) translateY(8px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

@keyframes firePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.85; transform: scale(1.05); }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFireStreak.ts src/components/FireBanner.tsx src/components/FireBanner.css
git commit -m "feat: add fire streak hook and floating banner component"
```

---

## Task 6: Ghost Racing Hook

**Files:**
- Create: `src/hooks/useGhost.ts`

- [ ] **Step 1: Create the ghost racing hook**

Create `src/hooks/useGhost.ts`:

```typescript
import { useCallback, useRef, useEffect, useState } from 'react';
import { getGhostData, saveGhostData } from '../utils/storage';

interface UseGhostOptions {
  passageId: string;
  passageLength: number;
  enabled: boolean;
  isStarted: boolean;
  startTime: number;
}

export function useGhost({ passageId, passageLength, enabled, isStarted, startTime }: UseGhostOptions) {
  const [ghostIndex, setGhostIndex] = useState(-1);
  const ghostData = useRef<number[] | null>(null);
  const recordedTimestamps = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  // Load ghost data for this passage
  useEffect(() => {
    if (enabled) {
      ghostData.current = getGhostData(passageId);
    } else {
      ghostData.current = null;
    }
    setGhostIndex(-1);
    recordedTimestamps.current = [];
  }, [passageId, enabled]);

  // Animate the ghost cursor
  useEffect(() => {
    if (!isStarted || !ghostData.current || !enabled || startTime === 0) {
      return;
    }

    const data = ghostData.current;

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Find where the ghost would be at this elapsed time
      let idx = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i] <= elapsed) {
          idx = i;
        } else {
          break;
        }
      }
      setGhostIndex(idx);
    }, 50);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isStarted, enabled, startTime]);

  // Record a character timestamp (called on each correct keystroke)
  const recordTimestamp = useCallback(() => {
    if (startTime > 0) {
      recordedTimestamps.current.push(Date.now() - startTime);
    }
  }, [startTime]);

  // Save ghost data when race completes
  const saveGhost = useCallback(() => {
    if (recordedTimestamps.current.length > 0) {
      const existing = getGhostData(passageId);
      // Only save if no existing ghost or we were faster
      if (!existing || recordedTimestamps.current.length >= existing.length) {
        saveGhostData(passageId, recordedTimestamps.current);
      }
    }
  }, [passageId]);

  return { ghostIndex, recordTimestamp, saveGhost };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useGhost.ts
git commit -m "feat: add ghost racing hook with record and replay"
```

---

## Task 7: Sparkline Component

**Files:**
- Create: `src/components/Sparkline.tsx`

- [ ] **Step 1: Create the Sparkline SVG component**

Create `src/components/Sparkline.tsx`:

```typescript
import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 32,
  color = 'var(--cyan)',
}) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* Dot on the last point */}
      {data.length > 0 && (() => {
        const lastX = padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2);
        const lastY = height - padding - ((data[data.length - 1] - min) / range) * (height - padding * 2);
        return <circle cx={lastX} cy={lastY} r="2.5" fill={color} />;
      })()}
    </svg>
  );
};

export default Sparkline;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Sparkline.tsx
git commit -m "feat: add inline SVG sparkline component"
```

---

## Task 8: Integrate Effects into TypeRacer

Wire audio, speed tier, error shake, fire streak, ghost cursor, and completion burst into the main typing component.

**Files:**
- Modify: `src/components/TypeRacer.tsx`
- Modify: `src/components/TypeRacer.css`

- [ ] **Step 1: Update TypeRacer.tsx with all new hooks and effects**

Replace `src/components/TypeRacer.tsx` with the full updated version. Key changes from the current file:
- Import and use `useSpeedTier`, `useFireStreak`, `useGhost`
- Import and call `playKeystroke`, `playError`, `playKeystrokeAtPitch`, `playFanfare` from audioEngine
- Import and use `createBurstOverlay` from particleBurst
- Import and render `FireBanner`
- Add `data-speed-tier` attribute to root container
- Add shake class toggle on errors
- Add ghost cursor rendering
- Add mute toggle button in HUD
- Accept `difficulty`, `ghostEnabled`, `onRaceComplete` props (difficulty used for display, passage is now passed as prop from App)

```typescript
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TextPassage, TypingStats, CharacterStatus, RaceResult, Difficulty, FireStreakTier } from '../types/GameTypes';
import { parseTextToCharacters, calculateRaceResult } from '../utils/typingUtils';
import { playKeystroke, playError, playFanfare, playKeystrokeAtPitch, getMuted, toggleMute } from '../utils/audioEngine';
import { createBurstOverlay } from '../utils/particleBurst';
import { useSpeedTier } from '../hooks/useSpeedTier';
import { useFireStreak } from '../hooks/useFireStreak';
import { useGhost } from '../hooks/useGhost';
import FireBanner from './FireBanner';
import './TypeRacer.css';

interface TypeRacerProps {
    passage: TextPassage;
    ghostEnabled: boolean;
    sessionStreak: number;
    onRaceComplete: (result: RaceResult, fireStreak: number, ghostTimestamps: number[]) => void;
    onNewText: () => void;
    multiplayerPlayers?: null; // placeholder for Task 12
}

const TypeRacer: React.FC<TypeRacerProps> = ({
    passage,
    ghostEnabled,
    sessionStreak,
    onRaceComplete,
    onNewText,
    multiplayerPlayers,
}) => {
    const [characters, setCharacters] = useState<CharacterStatus[]>([]);
    const [stats, setStats] = useState<TypingStats>({
        startTime: 0,
        charactersTyped: 0,
        errors: 0,
        currentIndex: 0,
        isComplete: false
    });
    const [inputValue, setInputValue] = useState('');
    const [isStarted, setIsStarted] = useState(false);
    const [showCountdown, setShowCountdown] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const [muted, setMutedState] = useState(getMuted());
    const [shaking, setShaking] = useState(false);
    const [fireTier, setFireTier] = useState<FireStreakTier>('none');
    const [fireCount, setFireCount] = useState(0);
    const [fireActive, setFireActive] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const ghostTimestampsRef = useRef<number[]>([]);

    const { recordKeystroke, reset: resetFire, getLongestStreak } = useFireStreak();

    const currentWPM = (() => {
        if (!isStarted || stats.startTime === 0) return 0;
        const timeElapsed = (Date.now() - stats.startTime) / 1000;
        return Math.round(((stats.charactersTyped / 5) / (timeElapsed / 60)) * 100) / 100;
    })();

    const speedTier = useSpeedTier(currentWPM);

    const { ghostIndex, recordTimestamp, saveGhost } = useGhost({
        passageId: passage.id,
        passageLength: passage.text.length,
        enabled: ghostEnabled,
        isStarted,
        startTime: stats.startTime,
    });

    // Initialize characters when passage changes
    useEffect(() => {
        const parsedCharacters = parseTextToCharacters(passage.text);
        setCharacters(parsedCharacters);
        setStats({
            startTime: 0,
            charactersTyped: 0,
            errors: 0,
            currentIndex: 0,
            isComplete: false
        });
        setInputValue('');
        setIsStarted(false);
        setFireTier('none');
        setFireCount(0);
        setFireActive(false);
        resetFire();
        ghostTimestampsRef.current = [];
    }, [passage, resetFire]);

    // Handle countdown
    useEffect(() => {
        if (showCountdown && countdown > 0) {
            countdownIntervalRef.current = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
        } else if (showCountdown && countdown === 0) {
            setShowCountdown(false);
            startRace();
        }

        return () => {
            if (countdownIntervalRef.current) {
                clearTimeout(countdownIntervalRef.current);
            }
        };
    }, [showCountdown, countdown]);

    const startCountdown = () => {
        setShowCountdown(true);
        setCountdown(3);
    };

    const startRace = useCallback(() => {
        setIsStarted(true);
        setStats(prev => ({
            ...prev,
            startTime: Date.now()
        }));
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const triggerShake = useCallback(() => {
        setShaking(true);
        setTimeout(() => setShaking(false), 150);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isStarted) {
            startCountdown();
            return;
        }

        const value = e.target.value;
        const currentCharIndex = value.length - 1;

        if (currentCharIndex < 0) {
            setInputValue('');
            setStats(prev => ({ ...prev, currentIndex: 0 }));
            return;
        }

        setInputValue(value);

        const typedChar = value[currentCharIndex];
        const expectedChar = passage.text[currentCharIndex];
        const isCorrect = typedChar === expectedChar;

        // Audio feedback
        if (isCorrect) {
            if (fireTier === 'unstoppable') {
                playKeystrokeAtPitch(1.2);
            } else {
                playKeystroke();
            }
        } else {
            playError();
            triggerShake();
        }

        // Fire streak
        const fireState = recordKeystroke(isCorrect);
        setFireTier(fireState.tier);
        setFireCount(fireState.consecutiveCorrect);
        setFireActive(fireState.active);

        // Ghost recording
        if (isCorrect) {
            recordTimestamp();
        }

        // Update character status
        setCharacters(prev => {
            const newCharacters = [...prev];
            newCharacters[currentCharIndex] = {
                ...newCharacters[currentCharIndex],
                status: isCorrect ? 'correct' : 'incorrect',
                typed: typedChar
            };
            return newCharacters;
        });

        // Update stats
        setStats(prev => ({
            ...prev,
            currentIndex: currentCharIndex + 1,
            charactersTyped: currentCharIndex + 1,
            errors: isCorrect ? prev.errors : prev.errors + 1
        }));

        // Check if race is complete
        if (value.length === passage.text.length) {
            playFanfare();
            saveGhost();

            const finalStats: TypingStats = {
                ...stats,
                endTime: Date.now(),
                charactersTyped: value.length,
                errors: isCorrect ? stats.errors : stats.errors + 1,
                isComplete: true
            };

            const result = calculateRaceResult(finalStats, passage.text.length);

            // Particle burst, then transition
            const burst = createBurstOverlay();
            burst.start();
            setTimeout(() => {
                burst.cleanup();
                onRaceComplete(result, getLongestStreak(), ghostTimestampsRef.current);
            }, 800);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && inputValue.length === 0) {
            e.preventDefault();
        }
    };

    const handleToggleMute = () => {
        const nowMuted = toggleMute();
        setMutedState(nowMuted);
    };

    const getCurrentAccuracy = () => {
        if (stats.charactersTyped === 0) return 100;
        const correct = stats.charactersTyped - stats.errors;
        return Math.round((correct / stats.charactersTyped) * 100 * 100) / 100;
    };

    const progressPercent = Math.round((stats.charactersTyped / passage.text.length) * 100);

    const renderText = () => {
        return characters.map((char, index) => {
            let className = 'character';

            if (char.status === 'correct') {
                className += ' correct';
            } else if (char.status === 'incorrect') {
                className += ' incorrect';
            }

            if (index === stats.currentIndex && isStarted) {
                className += ' current';
            }

            if (index === ghostIndex && ghostEnabled) {
                className += ' ghost';
            }

            return (
                <span key={index} className={className}>
                    {char.char}
                </span>
            );
        });
    };

    return (
        <div className="type-racer" data-speed-tier={speedTier}>
            {/* HUD bar */}
            <div className="race-hud">
                <div className="hud-left">
                    <span className="hud-title">TypeRace</span>
                    <span className="hud-tag difficulty">{passage.difficulty}</span>
                    <span className="hud-tag category">{passage.category}</span>
                    {sessionStreak > 1 && (
                        <span className="hud-tag session-streak">{sessionStreak}x streak</span>
                    )}
                </div>
                <div className="hud-right">
                    <button className="mute-btn" onClick={handleToggleMute} title={muted ? 'Unmute' : 'Mute'}>
                        {muted ? 'MUTED' : 'SFX'}
                    </button>
                    <div className="hud-stat">
                        <span className="hud-stat-value wpm">{currentWPM}</span>
                        <span className="hud-stat-label">WPM</span>
                    </div>
                    <div className="hud-stat">
                        <span className="hud-stat-value accuracy">{getCurrentAccuracy()}%</span>
                        <span className="hud-stat-label">Accuracy</span>
                    </div>
                    <div className="hud-stat">
                        <span className="hud-stat-value">{progressPercent}%</span>
                        <span className="hud-stat-label">Progress</span>
                    </div>
                </div>
            </div>

            {/* Progress rail */}
            <div className="progress-rail">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>

            {/* Fire banner */}
            <FireBanner tier={fireTier} streak={fireCount} visible={fireActive} />

            {/* Main typing stage */}
            <div className="race-stage">
                <div className={`text-container${shaking ? ' shake' : ''}`}>
                    <div className="passage-title">// {passage.title}</div>
                    <div className="text-display">
                        {renderText()}
                    </div>
                </div>

                <div className="input-container">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={isStarted ? "..." : "> start typing to begin"}
                        className="typing-input"
                        maxLength={passage.text.length}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                </div>

                <div className="race-controls">
                    <button onClick={onNewText} className="restart-btn">
                        [ new text ]
                    </button>
                </div>
            </div>

            {/* Countdown */}
            {showCountdown && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                    <div className="countdown-text">Initializing...</div>
                </div>
            )}
        </div>
    );
};

export default TypeRacer;
```

- [ ] **Step 2: Add ghost cursor and mute button CSS to TypeRacer.css**

Append to `src/components/TypeRacer.css`:

```css
/* ── Ghost cursor ──────────────────────────────────────── */
.character.ghost::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--magenta);
    opacity: 0.12;
    border-radius: 2px;
}

/* ── Session streak tag ────────────────────────────────── */
.hud-tag.session-streak {
    background: rgba(255, 170, 0, 0.15);
    color: var(--amber);
    border: 1px solid rgba(255, 170, 0, 0.2);
}

/* ── Mute button ───────────────────────────────────────── */
.mute-btn {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    padding: 0.2rem 0.5rem;
    background: transparent;
    border: 1px solid var(--text-ghost);
    border-radius: 2px;
    color: var(--text-ghost);
    cursor: pointer;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: all 0.2s ease;
}

.mute-btn:hover {
    border-color: var(--text-secondary);
    color: var(--text-secondary);
}

/* ── Fire tier effects on progress rail ────────────────── */
.type-racer:has(.fire-blazing) .progress-fill,
.type-racer:has(.fire-unstoppable) .progress-fill {
    background: linear-gradient(90deg, var(--cyan), #ff6b00);
    animation: firePulseRail 0.8s ease-in-out infinite;
}

@keyframes firePulseRail {
    0%, 100% { box-shadow: 0 0 12px rgba(255, 107, 0, 0.3); }
    50%      { box-shadow: 0 0 24px rgba(255, 107, 0, 0.6); }
}

/* Unstoppable warm glow on text container */
.type-racer:has(.fire-unstoppable) .text-container {
    box-shadow: inset 0 0 30px rgba(255, 107, 0, 0.05), 0 0 20px rgba(255, 107, 0, 0.08);
    border: 1px solid rgba(255, 107, 0, 0.15);
    border-radius: var(--radius-md);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TypeRacer.tsx src/components/TypeRacer.css
git commit -m "feat: integrate audio, speed tiers, fire streak, ghost, and particles into TypeRacer"
```

---

## Task 9: Update Welcome Screen

Add difficulty picker, solo/multiplayer buttons, personal bests strip, daily streak, and ghost toggle.

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/components/WelcomeScreen.css`

- [ ] **Step 1: Rewrite WelcomeScreen.tsx with new elements**

```typescript
import React from 'react';
import { Difficulty, PersonalBests, DailyStreak } from '../types/GameTypes';
import './WelcomeScreen.css';

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
}

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
}) => {
    const currentBest = bests[difficulty];
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

    return (
        <div className="welcome-screen">
            <div className="welcome-grid-bg" />

            <div className="welcome-content">
                <header className="welcome-hero">
                    <div className="hero-label">TYPING VELOCITY ENGINE</div>
                    <h1 className="hero-title">
                        <span className="hero-title-line">TYPE</span>
                        <span className="hero-title-line accent">RACE</span>
                    </h1>
                </header>

                {dailyStreak.count > 0 && (
                    <div className="daily-streak">
                        <span className="streak-star">&#9733;</span>
                        <span>{dailyStreak.count} DAY STREAK</span>
                    </div>
                )}

                <div className="difficulty-picker">
                    {difficulties.map(d => (
                        <button
                            key={d}
                            className={`diff-btn${d === difficulty ? ' active' : ''}`}
                            onClick={() => onDifficultyChange(d)}
                        >
                            {d.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="mode-buttons">
                    <button onClick={onStartSolo} className="mode-btn mode-solo">
                        SOLO
                    </button>
                    <button onClick={onStartMultiplayer} className="mode-btn mode-multi">
                        MULTIPLAYER
                    </button>
                </div>

                <div className="welcome-stats-strip">
                    <div className="strip-item">
                        <span className="strip-value">{currentBest ? currentBest.wpm : '--'}</span>
                        <span className="strip-label">Best WPM</span>
                    </div>
                    <div className="strip-divider" />
                    <div className="strip-item">
                        <span className="strip-value">{currentBest ? `${currentBest.accuracy}%` : '--'}</span>
                        <span className="strip-label">Best Acc</span>
                    </div>
                    <div className="strip-divider" />
                    <div className="strip-item">
                        <span className="strip-value">{totalRaces}</span>
                        <span className="strip-label">Races</span>
                    </div>
                </div>

                <div className="welcome-options">
                    <label className="ghost-toggle">
                        <input
                            type="checkbox"
                            checked={ghostEnabled}
                            onChange={onGhostToggle}
                        />
                        <span>Ghost Racing</span>
                    </label>
                </div>

                <footer className="welcome-keys">
                    <div className="key-group">
                        <kbd>Cmd+N</kbd>
                        <span>New Race</span>
                    </div>
                    <div className="key-group">
                        <kbd>Cmd+R</kbd>
                        <span>Restart</span>
                    </div>
                    <div className="key-group">
                        <kbd>F11</kbd>
                        <span>Fullscreen</span>
                    </div>
                </footer>
            </div>

            <div className="welcome-decoration">
                <div className="deco-line deco-line-1" />
                <div className="deco-line deco-line-2" />
                <div className="deco-corner deco-corner-tl" />
                <div className="deco-corner deco-corner-br" />
            </div>
        </div>
    );
};

export default WelcomeScreen;
```

- [ ] **Step 2: Add new styles to WelcomeScreen.css**

Append to the existing `src/components/WelcomeScreen.css` (after the `welcome-launch` section, replacing it):

```css
/* ── Daily streak ──────────────────────────────────────── */
.daily-streak {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--amber);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    animation: fadeUp 0.8s ease-out 0.15s both;
}

.streak-star {
    text-shadow: 0 0 8px rgba(255, 170, 0, 0.5);
}

/* ── Difficulty picker ─────────────────────────────────── */
.difficulty-picker {
    display: flex;
    gap: 0.5rem;
    animation: fadeUp 0.8s ease-out 0.2s both;
}

.diff-btn {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    padding: 0.5rem 1.25rem;
    background: transparent;
    border: 1px solid var(--text-ghost);
    border-radius: 2px;
    color: var(--text-secondary);
    cursor: pointer;
    letter-spacing: 0.1em;
    transition: all 0.2s ease;
}

.diff-btn.active {
    border-color: var(--cyan);
    color: var(--cyan);
    background: rgba(0, 240, 255, 0.08);
}

.diff-btn:hover:not(.active) {
    border-color: var(--text-secondary);
    color: var(--text-primary);
}

/* ── Mode buttons ──────────────────────────────────────── */
.mode-buttons {
    display: flex;
    gap: 0.75rem;
    animation: fadeUp 0.8s ease-out 0.3s both;
}

.mode-btn {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    padding: 0.9rem 2.5rem;
    background: transparent;
    border: 1px solid;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.mode-solo {
    border-color: var(--cyan);
    color: var(--cyan);
}

.mode-solo:hover {
    background: rgba(0, 240, 255, 0.1);
    box-shadow: var(--glow-cyan);
    transform: translateY(-2px);
}

.mode-multi {
    border-color: var(--magenta);
    color: var(--magenta);
}

.mode-multi:hover {
    background: rgba(255, 0, 128, 0.1);
    box-shadow: var(--glow-magenta);
    transform: translateY(-2px);
}

/* ── Ghost toggle ──────────────────────────────────────── */
.welcome-options {
    animation: fadeUp 0.8s ease-out 0.5s both;
}

.ghost-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-ghost);
    cursor: pointer;
    letter-spacing: 0.05em;
}

.ghost-toggle input[type="checkbox"] {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--text-ghost);
    border-radius: 2px;
    background: transparent;
    cursor: pointer;
    position: relative;
}

.ghost-toggle input[type="checkbox"]:checked {
    border-color: var(--magenta);
    background: rgba(255, 0, 128, 0.2);
}

.ghost-toggle input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    inset: 2px;
    background: var(--magenta);
    border-radius: 1px;
}
```

- [ ] **Step 3: Remove the old launch button and tagline sections from WelcomeScreen.css**

Remove the `.welcome-launch`, `.launch-btn`, `.launch-btn-bg`, `.launch-btn-text`, `.launch-btn-arrow`, `.launch-hint` CSS rules since they're replaced by the new mode buttons and difficulty picker.

- [ ] **Step 4: Commit**

```bash
git add src/components/WelcomeScreen.tsx src/components/WelcomeScreen.css
git commit -m "feat: redesign welcome screen with difficulty picker, solo/multiplayer, stats, streaks"
```

---

## Task 10: Update Results Screen

Add sparkline, fire streak stat, NEW BEST indicator.

**Files:**
- Modify: `src/components/ResultsScreen.tsx`
- Modify: `src/components/ResultsScreen.css`

- [ ] **Step 1: Update ResultsScreen.tsx**

```typescript
import React from 'react';
import { RaceResult, FireStreakTier } from '../types/GameTypes';
import { getPerformanceMessage, formatTime } from '../utils/typingUtils';
import { getHistory } from '../utils/storage';
import Sparkline from './Sparkline';
import './ResultsScreen.css';

interface ResultsScreenProps {
    result: RaceResult;
    isNewBest: boolean;
    fireStreak: number;
    onRestart: () => void;
    onNewRace: () => void;
}

const getRank = (wpm: number, accuracy: number) => {
    if (wpm >= 80 && accuracy >= 95) return { label: 'S', title: 'TYPING MASTER', color: 'var(--amber)' };
    if (wpm >= 60 && accuracy >= 90) return { label: 'A', title: 'SPEED DEMON', color: 'var(--cyan)' };
    if (wpm >= 40 && accuracy >= 85) return { label: 'B', title: 'RISING STAR', color: 'var(--green)' };
    if (wpm >= 30 && accuracy >= 80) return { label: 'C', title: 'APPRENTICE', color: 'var(--magenta)' };
    return { label: 'D', title: 'ROOKIE', color: 'var(--text-secondary)' };
};

function getFireTierLabel(streak: number): string {
    if (streak >= 50) return 'UNSTOPPABLE';
    if (streak >= 25) return 'BLAZING';
    if (streak >= 10) return 'FIRE';
    return '';
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ result, isNewBest, fireStreak, onRestart, onNewRace }) => {
    const performanceMessage = getPerformanceMessage(result.wpm, result.accuracy);
    const rank = getRank(result.wpm, result.accuracy);
    const history = getHistory();
    const recentWPMs = history.slice(-10).map(h => h.wpm);
    const fireTierLabel = getFireTierLabel(fireStreak);

    return (
        <div className="results-screen">
            <div className="results-grid-bg" />

            <div className="results-content">
                {/* NEW BEST flash */}
                {isNewBest && (
                    <div className="new-best-flash">NEW BEST</div>
                )}

                {/* Header */}
                <div className="results-header">
                    <div className="results-label">RACE COMPLETE</div>
                    <div className="results-rank" style={{ color: rank.color, borderColor: rank.color }}>
                        <span className="rank-letter">{rank.label}</span>
                    </div>
                    <div className="rank-title" style={{ color: rank.color }}>{rank.title}</div>
                </div>

                {/* Primary metrics */}
                <div className="results-primary">
                    <div className="metric-block">
                        <div className="metric-value metric-wpm">{result.wpm}</div>
                        <div className="metric-unit">WPM</div>
                        <div className="metric-bar">
                            <div
                                className="metric-bar-fill"
                                style={{
                                    width: `${Math.min((result.wpm / 120) * 100, 100)}%`,
                                    background: `linear-gradient(90deg, var(--cyan), var(--magenta))`
                                }}
                            />
                        </div>
                    </div>
                    <div className="metric-divider" />
                    <div className="metric-block">
                        <div className="metric-value metric-acc">{result.accuracy}%</div>
                        <div className="metric-unit">ACCURACY</div>
                        <div className="metric-bar">
                            <div
                                className="metric-bar-fill"
                                style={{
                                    width: `${result.accuracy}%`,
                                    background: `linear-gradient(90deg, var(--green), var(--cyan))`
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Detail grid */}
                <div className="results-details">
                    <div className="detail-cell">
                        <span className="detail-val">{formatTime(result.timeElapsed)}</span>
                        <span className="detail-key">TIME</span>
                    </div>
                    <div className="detail-cell">
                        <span className="detail-val">{result.charactersTyped}</span>
                        <span className="detail-key">CHARS</span>
                    </div>
                    <div className="detail-cell">
                        <span className="detail-val">{result.errors}</span>
                        <span className="detail-key">ERRORS</span>
                    </div>
                    <div className="detail-cell">
                        <span className="detail-val">{fireStreak > 0 ? `${fireStreak}` : '--'}</span>
                        <span className="detail-key">{fireTierLabel || 'STREAK'}</span>
                    </div>
                </div>

                {/* WPM Sparkline */}
                {recentWPMs.length >= 2 && (
                    <div className="results-sparkline">
                        <span className="sparkline-label">RECENT TREND</span>
                        <Sparkline data={recentWPMs} width={160} height={36} />
                    </div>
                )}

                {/* Performance message */}
                <div className="results-message">{performanceMessage}</div>

                {/* Actions */}
                <div className="results-actions">
                    <button onClick={onRestart} className="action-btn action-primary">
                        RACE AGAIN
                    </button>
                    <button onClick={onNewRace} className="action-btn action-ghost">
                        NEW TEXT
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResultsScreen;
```

- [ ] **Step 2: Add NEW BEST and sparkline styles to ResultsScreen.css**

Append to `src/components/ResultsScreen.css`:

```css
/* ── NEW BEST flash ────────────────────────────────────── */
.new-best-flash {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: var(--amber);
    text-shadow: 0 0 20px rgba(255, 170, 0, 0.6), 0 0 40px rgba(255, 170, 0, 0.3);
    animation: newBestPulse 1.5s ease-in-out infinite;
}

@keyframes newBestPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.7; transform: scale(1.05); }
}

/* ── Sparkline section ─────────────────────────────────── */
.results-sparkline {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: var(--bg-raised);
    border: 1px solid rgba(0, 240, 255, 0.06);
    border-radius: 2px;
    animation: fadeUp 0.6s ease-out 0.5s both;
}

.sparkline-label {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--text-ghost);
    letter-spacing: 0.15em;
    text-transform: uppercase;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ResultsScreen.tsx src/components/ResultsScreen.css
git commit -m "feat: add sparkline, fire streak stat, and NEW BEST indicator to results"
```

---

## Task 11: Update App.tsx — Wire Everything Together

Thread difficulty, personal bests, streaks, ghost toggle, and passage management through the app state machine.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx with full state management**

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import TypeRacer from './components/TypeRacer';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import { GameState, RaceResult, Difficulty, TextPassage } from './types/GameTypes';
import { getRandomPassage } from './data/textPassages';
import {
    getBests, updateBest, getHistory, addHistoryEntry,
    getDailyStreak, incrementDailyStreak,
    getDifficulty, setDifficulty,
    isGhostEnabled, setGhostEnabled,
} from './utils/storage';

declare global {
    interface Window {
        electronAPI?: {
            onNewRace: (callback: () => void) => void;
            onRestartRace: (callback: () => void) => void;
            removeAllListeners: (channel: string) => void;
        };
    }
}

function App() {
    const [gameState, setGameState] = useState<GameState>('welcome');
    const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
    const [difficulty, setDifficultyState] = useState<Difficulty>(getDifficulty());
    const [passage, setPassage] = useState<TextPassage>(getRandomPassage(getDifficulty()));
    const [ghostEnabled, setGhostEnabledState] = useState(isGhostEnabled());
    const [sessionStreak, setSessionStreak] = useState(0);
    const [isNewBest, setIsNewBest] = useState(false);
    const [lastFireStreak, setLastFireStreak] = useState(0);
    const [bests, setBests] = useState(getBests());
    const [dailyStreak, setDailyStreak] = useState(getDailyStreak());
    const [totalRaces, setTotalRaces] = useState(getHistory().length);

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onNewRace(() => {
                returnToWelcome();
            });
            window.electronAPI.onRestartRace(() => {
                startRace();
            });
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
                event.preventDefault();
                returnToWelcome();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
                event.preventDefault();
                startRace();
            }
            // Enter to start from welcome
            if (event.key === 'Enter' && gameState === 'welcome') {
                event.preventDefault();
                startRace();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            if (window.electronAPI) {
                window.electronAPI.removeAllListeners('new-race');
                window.electronAPI.removeAllListeners('restart-race');
            }
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [gameState, difficulty]);

    const handleDifficultyChange = useCallback((d: Difficulty) => {
        setDifficultyState(d);
        setDifficulty(d);
    }, []);

    const handleGhostToggle = useCallback(() => {
        setGhostEnabledState(prev => {
            const next = !prev;
            setGhostEnabled(next);
            return next;
        });
    }, []);

    const startRace = useCallback(() => {
        const newPassage = getRandomPassage(difficulty);
        setPassage(newPassage);
        setRaceResult(null);
        setIsNewBest(false);
        setGameState('racing');
    }, [difficulty]);

    const handleRaceComplete = useCallback((result: RaceResult, fireStreak: number) => {
        setRaceResult(result);
        setLastFireStreak(fireStreak);

        // Update personal best
        const newBest = updateBest(difficulty, result.wpm, result.accuracy);
        setIsNewBest(newBest);
        setBests(getBests());

        // Add to history
        addHistoryEntry({
            wpm: result.wpm,
            accuracy: result.accuracy,
            difficulty,
            passageTitle: passage.title,
            timestamp: Date.now(),
            fireStreak,
        });
        setTotalRaces(prev => prev + 1);

        // Update streaks
        setSessionStreak(prev => prev + 1);
        const updatedStreak = incrementDailyStreak();
        setDailyStreak(updatedStreak);

        setGameState('results');
    }, [difficulty, passage]);

    const restartRace = useCallback(() => {
        setRaceResult(null);
        setIsNewBest(false);
        const newPassage = getRandomPassage(difficulty);
        setPassage(newPassage);
        setGameState('racing');
    }, [difficulty]);

    const returnToWelcome = useCallback(() => {
        setGameState('welcome');
        setRaceResult(null);
        setIsNewBest(false);
    }, []);

    const handleNewText = useCallback(() => {
        const newPassage = getRandomPassage(difficulty);
        setPassage(newPassage);
    }, [difficulty]);

    const handleStartMultiplayer = useCallback(() => {
        // Placeholder — will be implemented in Task 12
        alert('Multiplayer coming soon!');
    }, []);

    return (
        <div className="app">
            {gameState === 'welcome' && (
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
                />
            )}
            {gameState === 'racing' && (
                <TypeRacer
                    passage={passage}
                    ghostEnabled={ghostEnabled}
                    sessionStreak={sessionStreak}
                    onRaceComplete={handleRaceComplete}
                    onNewText={handleNewText}
                />
            )}
            {gameState === 'results' && raceResult && (
                <ResultsScreen
                    result={raceResult}
                    isNewBest={isNewBest}
                    fireStreak={lastFireStreak}
                    onRestart={restartRace}
                    onNewRace={returnToWelcome}
                />
            )}
        </div>
    );
}

export default App;
```

- [ ] **Step 2: Verify the app compiles**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`

Expected: `200` (CRA dev server auto-recompiles)

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire difficulty, bests, streaks, ghost, and fire into App state machine"
```

---

## Task 12: Multiplayer Server

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/types.ts`
- Create: `server/src/room.ts`
- Create: `server/src/index.ts`
- Modify: `package.json` (root — add dev:server script)

- [ ] **Step 1: Create server/package.json**

```json
{
  "name": "typerace-server",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch & node --watch dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create server/src/types.ts**

```typescript
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface TextPassage {
  id: string;
  title: string;
  text: string;
  difficulty: Difficulty;
  category: string;
}

export interface PlayerInfo {
  name: string;
  color: string;
  isCreator: boolean;
}

export interface PlayerProgress {
  name: string;
  color: string;
  currentIndex: number;
  totalLength: number;
  wpm: number;
  finished: boolean;
}

export interface RaceResult {
  wpm: number;
  accuracy: number;
  timeElapsed: number;
  charactersTyped: number;
  errors: number;
  textLength: number;
  completionPercentage: number;
}

export interface PlayerResult {
  name: string;
  color: string;
  rank: number;
  result: RaceResult;
}

// Client → Server
export type ClientMessage =
  | { type: 'create'; playerName: string; difficulty: Difficulty }
  | { type: 'join'; roomCode: string; playerName: string }
  | { type: 'start' }
  | { type: 'progress'; currentIndex: number; errors: number; wpm: number }
  | { type: 'finished'; result: RaceResult }
  | { type: 'rematch' }
  | { type: 'leave' };

// Server → Client
export type ServerMessage =
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

- [ ] **Step 4: Create server/src/room.ts**

```typescript
import WebSocket from 'ws';
import { TextPassage, PlayerInfo, PlayerProgress, PlayerResult, RaceResult, Difficulty } from './types';
import { getRandomPassage } from './passages';

const PLAYER_COLORS = ['#00f0ff', '#ff0080', '#00ff88', '#ffaa00'];
const MAX_PLAYERS = 4;
const FINISH_TIMEOUT_MS = 60_000;

interface Player {
  ws: WebSocket;
  name: string;
  color: string;
  isCreator: boolean;
  progress: PlayerProgress;
  result: RaceResult | null;
  wantsRematch: boolean;
}

export type RoomState = 'lobby' | 'countdown' | 'racing' | 'finished';

export class Room {
  code: string;
  difficulty: Difficulty;
  passage: TextPassage;
  players: Map<WebSocket, Player> = new Map();
  state: RoomState = 'lobby';
  lastActivity: number = Date.now();
  private countdownTimer: NodeJS.Timeout | null = null;
  private finishTimer: NodeJS.Timeout | null = null;

  constructor(code: string, difficulty: Difficulty) {
    this.code = code;
    this.difficulty = difficulty;
    this.passage = getRandomPassage(difficulty);
  }

  addPlayer(ws: WebSocket, name: string): boolean {
    if (this.players.size >= MAX_PLAYERS) return false;
    if (this.state !== 'lobby') return false;

    const isCreator = this.players.size === 0;
    const color = PLAYER_COLORS[this.players.size];

    this.players.set(ws, {
      ws,
      name,
      color,
      isCreator,
      progress: {
        name,
        color,
        currentIndex: 0,
        totalLength: this.passage.text.length,
        wpm: 0,
        finished: false,
      },
      result: null,
      wantsRematch: false,
    });

    this.touch();
    return true;
  }

  removePlayer(ws: WebSocket): void {
    this.players.delete(ws);
    this.touch();
  }

  getPlayerInfoList(): PlayerInfo[] {
    return Array.from(this.players.values()).map(p => ({
      name: p.name,
      color: p.color,
      isCreator: p.isCreator,
    }));
  }

  getProgressList(): PlayerProgress[] {
    return Array.from(this.players.values()).map(p => p.progress);
  }

  isCreator(ws: WebSocket): boolean {
    return this.players.get(ws)?.isCreator ?? false;
  }

  startCountdown(): void {
    this.state = 'countdown';
    let seconds = 3;

    this.broadcast({ type: 'countdown', seconds });

    this.countdownTimer = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        this.broadcast({ type: 'countdown', seconds });
      } else {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.state = 'racing';
        this.broadcast({ type: 'race-start', passage: this.passage });
      }
    }, 1000);
  }

  updateProgress(ws: WebSocket, currentIndex: number, errors: number, wpm: number): void {
    const player = this.players.get(ws);
    if (!player) return;

    player.progress = {
      ...player.progress,
      currentIndex,
      wpm,
    };

    this.broadcast({ type: 'progress-update', players: this.getProgressList() });
    this.touch();
  }

  playerFinished(ws: WebSocket, result: RaceResult): void {
    const player = this.players.get(ws);
    if (!player) return;

    player.result = result;
    player.progress.finished = true;
    player.progress.wpm = result.wpm;

    this.broadcast({
      type: 'player-finished',
      playerName: player.name,
      result,
    });

    // Start finish timeout on first finisher
    if (!this.finishTimer) {
      this.finishTimer = setTimeout(() => this.endRace(), FINISH_TIMEOUT_MS);
    }

    // Check if all players finished
    const allFinished = Array.from(this.players.values()).every(p => p.result !== null);
    if (allFinished) {
      if (this.finishTimer) clearTimeout(this.finishTimer);
      this.endRace();
    }
  }

  private endRace(): void {
    this.state = 'finished';
    const results: PlayerResult[] = Array.from(this.players.values())
      .filter(p => p.result)
      .sort((a, b) => b.result!.wpm - a.result!.wpm)
      .map((p, i) => ({
        name: p.name,
        color: p.color,
        rank: i + 1,
        result: p.result!,
      }));

    this.broadcast({ type: 'race-end', results });
  }

  requestRematch(ws: WebSocket): void {
    const player = this.players.get(ws);
    if (!player) return;

    player.wantsRematch = true;
    const accepted = Array.from(this.players.values())
      .filter(p => p.wantsRematch)
      .map(p => p.name);

    this.broadcast({
      type: 'rematch-request',
      from: player.name,
      accepted,
    });

    // If all want rematch, start a new race
    if (accepted.length === this.players.size) {
      this.resetForRematch();
    }
  }

  private resetForRematch(): void {
    this.passage = getRandomPassage(this.difficulty);
    this.state = 'lobby';
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;

    for (const player of this.players.values()) {
      player.result = null;
      player.wantsRematch = false;
      player.progress = {
        name: player.name,
        color: player.color,
        currentIndex: 0,
        totalLength: this.passage.text.length,
        wpm: 0,
        finished: false,
      };
    }

    // Auto-start countdown for rematch
    this.startCountdown();
  }

  broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }
}
```

- [ ] **Step 5: Create a passages module for the server**

Create `server/src/passages.ts` — a copy of the passage data for server-side passage selection:

```typescript
import { TextPassage, Difficulty } from './types';

const textPassages: TextPassage[] = [
  { id: '1', title: 'The Quick Brown Fox', text: 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet and is perfect for testing typing speed.', difficulty: 'easy', category: 'Classic' },
  { id: '2', title: 'Programming Wisdom', text: "Code is like humor. When you have to explain it, it's bad. The best code is self-documenting and reads like a story.", difficulty: 'easy', category: 'Programming' },
  { id: '3', title: "Nature's Beauty", text: 'The morning sun painted the sky in brilliant shades of orange and pink, casting long shadows across the dew-covered meadow where wildflowers danced in the gentle breeze.', difficulty: 'medium', category: 'Nature' },
  { id: '4', title: 'Technology Revolution', text: 'Artificial intelligence and machine learning are transforming industries at an unprecedented pace, creating both opportunities and challenges for society as we navigate this digital transformation.', difficulty: 'medium', category: 'Technology' },
  { id: '5', title: 'Philosophical Musings', text: 'The unexamined life is not worth living, but the over-examined life is not worth living either. Balance is the key to wisdom and contentment in our complex modern world.', difficulty: 'hard', category: 'Philosophy' },
  { id: '6', title: 'Scientific Discovery', text: 'Quantum mechanics reveals the fundamental uncertainty principle that governs the behavior of particles at the subatomic level, challenging our classical understanding of reality.', difficulty: 'hard', category: 'Science' },
  { id: '7', title: 'Space Exploration', text: "Humanity's quest to explore the cosmos represents our most ambitious undertaking, pushing the boundaries of technology and human endurance in pursuit of knowledge.", difficulty: 'medium', category: 'Space' },
  { id: '8', title: 'Creative Expression', text: 'Art transcends language barriers and cultural differences, speaking directly to the human soul through colors, shapes, and emotions that words cannot capture.', difficulty: 'easy', category: 'Arts' },
  { id: '9', title: 'Economic Principles', text: 'Supply and demand dynamics govern market behavior, but human psychology and irrational exuberance often create bubbles and crashes that defy rational economic models.', difficulty: 'hard', category: 'Economics' },
  { id: '10', title: 'Environmental Stewardship', text: "Climate change represents humanity's greatest challenge, requiring unprecedented global cooperation and innovation to preserve our planet for future generations.", difficulty: 'medium', category: 'Environment' },
];

export function getRandomPassage(difficulty?: Difficulty): TextPassage {
  const pool = difficulty ? textPassages.filter(p => p.difficulty === difficulty) : textPassages;
  return pool[Math.floor(Math.random() * pool.length)];
}
```

- [ ] **Step 6: Create server/src/index.ts**

```typescript
import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Room } from './room';
import { ClientMessage } from './types';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

function generateRoomCode(): string {
  const words = ['NEON', 'VOLT', 'RUSH', 'FLUX', 'BYTE', 'GLOW', 'TURBO', 'BLAZE'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `${word}-${num}`;
}

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid message format' });
      return;
    }

    switch (msg.type) {
      case 'create': {
        const code = generateRoomCode();
        const room = new Room(code, msg.difficulty);
        rooms.set(code, room);

        if (!room.addPlayer(ws, msg.playerName)) {
          send(ws, { type: 'error', message: 'Failed to create room' });
          return;
        }

        playerRooms.set(ws, code);
        send(ws, { type: 'room-created', roomCode: code, passage: room.passage });
        room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
        break;
      }

      case 'join': {
        const room = rooms.get(msg.roomCode.toUpperCase());
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }

        if (!room.addPlayer(ws, msg.playerName)) {
          send(ws, { type: 'error', message: 'Room is full or race already started' });
          return;
        }

        playerRooms.set(ws, msg.roomCode.toUpperCase());
        room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
        // Send passage to the new player
        send(ws, { type: 'room-created', roomCode: room.code, passage: room.passage });
        break;
      }

      case 'start': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (!room || !room.isCreator(ws)) {
          send(ws, { type: 'error', message: 'Only the room creator can start' });
          return;
        }
        room.startCountdown();
        break;
      }

      case 'progress': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (room) {
          room.updateProgress(ws, msg.currentIndex, msg.errors, msg.wpm);
        }
        break;
      }

      case 'finished': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (room) {
          room.playerFinished(ws, msg.result);
        }
        break;
      }

      case 'rematch': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (room) {
          room.requestRematch(ws);
        }
        break;
      }

      case 'leave': {
        handleLeave(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    handleLeave(ws);
  });
});

function handleLeave(ws: WebSocket): void {
  const roomCode = playerRooms.get(ws);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (room) {
    room.removePlayer(ws);
    if (room.isEmpty) {
      rooms.delete(roomCode);
    } else {
      room.broadcast({ type: 'player-left', players: room.getPlayerInfoList() });
    }
  }

  playerRooms.delete(ws);
}

// Cleanup stale rooms every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      room.broadcast({ type: 'error', message: 'Room closed due to inactivity' });
      rooms.delete(code);
    }
  }
}, 60_000);

server.listen(PORT, () => {
  console.log(`TypeRace server running on port ${PORT}`);
});
```

- [ ] **Step 7: Add dev:server script to root package.json**

Add to the `"scripts"` section in the root `package.json`:

```json
"dev:server": "cd server && npm run build && npm start",
"dev:all": "concurrently \"npm run dev:renderer\" \"npm run dev:server\""
```

- [ ] **Step 8: Install server dependencies and build**

```bash
cd server && npm install && npm run build
```

- [ ] **Step 9: Verify server starts**

```bash
cd server && npm start &
sleep 2
curl http://localhost:3001/health
kill %1
```

Expected: `{"status":"ok","rooms":0}`

- [ ] **Step 10: Commit**

```bash
git add server/package.json server/tsconfig.json server/src/ package.json
git commit -m "feat: add multiplayer WebSocket server with room management"
```

---

## Task 13: Multiplayer Client — WebSocket Hook, Lobby, Race Track

**Files:**
- Create: `src/hooks/useMultiplayer.ts`
- Create: `src/components/RaceTrack.tsx`
- Create: `src/components/RaceTrack.css`
- Create: `src/components/MultiplayerModal.tsx`
- Create: `src/components/MultiplayerModal.css`
- Create: `src/components/Lobby.tsx`
- Create: `src/components/Lobby.css`

- [ ] **Step 1: Create the WebSocket multiplayer hook**

Create `src/hooks/useMultiplayer.ts`:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { RaceResult, TextPassage } from '../types/GameTypes';

interface PlayerInfo {
  name: string;
  color: string;
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

type MultiplayerState = 'disconnected' | 'lobby' | 'countdown' | 'racing' | 'finished';

interface UseMultiplayerReturn {
  state: MultiplayerState;
  roomCode: string | null;
  players: PlayerInfo[];
  playerProgress: PlayerProgress[];
  raceResults: PlayerResult[];
  countdownSeconds: number;
  passage: TextPassage | null;
  isCreator: boolean;
  error: string | null;
  createRoom: (playerName: string, difficulty: string) => void;
  joinRoom: (playerName: string, roomCode: string) => void;
  startRace: () => void;
  sendProgress: (currentIndex: number, errors: number, wpm: number) => void;
  sendFinished: (result: RaceResult) => void;
  requestRematch: () => void;
  leave: () => void;
}

const WS_URL = `ws://${window.location.hostname}:3001`;

export function useMultiplayer(): UseMultiplayerReturn {
  const [state, setState] = useState<MultiplayerState>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress[]>([]);
  const [raceResults, setRaceResults] = useState<PlayerResult[]>([]);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [passage, setPassage] = useState<TextPassage | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('Connection failed'));

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'room-created':
            setRoomCode(msg.roomCode);
            setPassage(msg.passage);
            setState('lobby');
            break;
          case 'player-joined':
            setPlayers(msg.players);
            break;
          case 'player-left':
            setPlayers(msg.players);
            break;
          case 'countdown':
            setState('countdown');
            setCountdownSeconds(msg.seconds);
            break;
          case 'race-start':
            setState('racing');
            setPassage(msg.passage);
            break;
          case 'progress-update':
            setPlayerProgress(msg.players);
            break;
          case 'player-finished':
            // handled by progress-update
            break;
          case 'race-end':
            setState('finished');
            setRaceResults(msg.results);
            break;
          case 'rematch-request':
            // could show UI for who accepted
            break;
          case 'error':
            setError(msg.message);
            break;
        }
      };

      ws.onclose = () => {
        setState('disconnected');
        setRoomCode(null);
        setPlayers([]);
      };
    });
  }, []);

  const createRoom = useCallback(async (playerName: string, difficulty: string) => {
    try {
      setError(null);
      const ws = await connect();
      setIsCreator(true);
      send({ type: 'create', playerName, difficulty });
    } catch {
      setError('Could not connect to server');
    }
  }, [connect, send]);

  const joinRoom = useCallback(async (playerName: string, code: string) => {
    try {
      setError(null);
      await connect();
      setIsCreator(false);
      // Need a small delay for ws to be ready
      setTimeout(() => {
        send({ type: 'join', roomCode: code.toUpperCase(), playerName });
      }, 100);
    } catch {
      setError('Could not connect to server');
    }
  }, [connect, send]);

  const startRaceMP = useCallback(() => send({ type: 'start' }), [send]);
  const sendProgress = useCallback((currentIndex: number, errors: number, wpm: number) => {
    send({ type: 'progress', currentIndex, errors, wpm });
  }, [send]);
  const sendFinished = useCallback((result: RaceResult) => {
    send({ type: 'finished', result });
  }, [send]);
  const requestRematch = useCallback(() => send({ type: 'rematch' }), [send]);

  const leave = useCallback(() => {
    send({ type: 'leave' });
    wsRef.current?.close();
    setState('disconnected');
    setRoomCode(null);
    setPlayers([]);
    setPlayerProgress([]);
    setRaceResults([]);
    setPassage(null);
    setIsCreator(false);
  }, [send]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    state, roomCode, players, playerProgress, raceResults,
    countdownSeconds, passage, isCreator, error,
    createRoom, joinRoom, startRace: startRaceMP,
    sendProgress, sendFinished, requestRematch, leave,
  };
}
```

- [ ] **Step 2: Create RaceTrack component**

Create `src/components/RaceTrack.tsx`:

```typescript
import React from 'react';
import './RaceTrack.css';

interface PlayerProgress {
  name: string;
  color: string;
  currentIndex: number;
  totalLength: number;
  wpm: number;
  finished: boolean;
}

interface RaceTrackProps {
  players: PlayerProgress[];
}

const RaceTrack: React.FC<RaceTrackProps> = ({ players }) => {
  if (players.length === 0) return null;

  return (
    <div className="race-track">
      {players.map(player => {
        const percent = Math.round((player.currentIndex / player.totalLength) * 100);
        return (
          <div key={player.name} className="track-row">
            <span className="track-name" style={{ color: player.color }}>
              {player.name}
            </span>
            <div className="track-bar">
              <div
                className="track-fill"
                style={{
                  width: `${percent}%`,
                  background: `linear-gradient(90deg, ${player.color}, ${player.color}88)`,
                  boxShadow: `0 0 8px ${player.color}44`,
                }}
              />
            </div>
            <span className="track-wpm" style={{ color: player.color }}>
              {player.finished ? `${player.wpm} wpm` : `${player.wpm}`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default RaceTrack;
```

- [ ] **Step 3: Create RaceTrack styles**

Create `src/components/RaceTrack.css`:

```css
.race-track {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: var(--bg-raised);
    border-bottom: 1px solid rgba(0, 240, 255, 0.06);
}

.track-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.track-name {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 600;
    width: 80px;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.track-bar {
    flex: 1;
    height: 6px;
    background: var(--bg-surface);
    border-radius: 1px;
    overflow: hidden;
}

.track-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.2s ease-out;
}

.track-wpm {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    width: 55px;
    text-align: left;
}
```

- [ ] **Step 4: Create MultiplayerModal component**

Create `src/components/MultiplayerModal.tsx`:

```typescript
import React, { useState } from 'react';
import { Difficulty } from '../types/GameTypes';
import { getPlayerName, setPlayerName } from '../utils/storage';
import './MultiplayerModal.css';

interface MultiplayerModalProps {
  difficulty: Difficulty;
  onClose: () => void;
  onCreateRoom: (playerName: string, difficulty: Difficulty) => void;
  onJoinRoom: (playerName: string, roomCode: string) => void;
}

const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  difficulty,
  onClose,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [name, setName] = useState(getPlayerName() || '');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'choose' | 'join'>('choose');

  const handleCreate = () => {
    if (!name.trim()) return;
    setPlayerName(name.trim());
    onCreateRoom(name.trim(), difficulty);
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    setPlayerName(name.trim());
    onJoinRoom(name.trim(), roomCode.trim());
  };

  return (
    <div className="mp-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>
        <div className="mp-header">
          <span className="mp-title">MULTIPLAYER</span>
          <button className="mp-close" onClick={onClose}>&times;</button>
        </div>

        <div className="mp-field">
          <label className="mp-label">DISPLAY NAME</label>
          <input
            className="mp-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            autoFocus
          />
        </div>

        {mode === 'choose' && (
          <div className="mp-actions">
            <button className="mp-btn mp-btn-create" onClick={handleCreate} disabled={!name.trim()}>
              CREATE ROOM
            </button>
            <button className="mp-btn mp-btn-join" onClick={() => setMode('join')} disabled={!name.trim()}>
              JOIN ROOM
            </button>
          </div>
        )}

        {mode === 'join' && (
          <>
            <div className="mp-field">
              <label className="mp-label">ROOM CODE</label>
              <input
                className="mp-input mp-input-code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. NEON-4X"
                maxLength={10}
              />
            </div>
            <div className="mp-actions">
              <button className="mp-btn mp-btn-create" onClick={handleJoin} disabled={!roomCode.trim()}>
                JOIN
              </button>
              <button className="mp-btn mp-btn-join" onClick={() => setMode('choose')}>
                BACK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MultiplayerModal;
```

- [ ] **Step 5: Create MultiplayerModal styles**

Create `src/components/MultiplayerModal.css`:

```css
.mp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 10, 20, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    backdrop-filter: blur(6px);
    animation: fadeIn 0.2s ease-out;
}

.mp-modal {
    background: var(--bg-raised);
    border: 1px solid rgba(0, 240, 255, 0.1);
    border-radius: 2px;
    padding: 2rem;
    width: 100%;
    max-width: 380px;
    animation: fadeUp 0.3s ease-out;
}

.mp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}

.mp-title {
    font-family: var(--font-display);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--magenta);
    letter-spacing: 0.2em;
}

.mp-close {
    background: transparent;
    border: none;
    color: var(--text-ghost);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.mp-close:hover {
    color: var(--text-secondary);
}

.mp-field {
    margin-bottom: 1.25rem;
}

.mp-label {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--text-ghost);
    letter-spacing: 0.15em;
    margin-bottom: 0.4rem;
}

.mp-input {
    width: 100%;
    padding: 0.7rem 0.9rem;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    background: var(--bg-deep);
    color: var(--text-primary);
    border: 1px solid var(--text-ghost);
    border-radius: 2px;
    outline: none;
    caret-color: var(--cyan);
    transition: border-color 0.2s ease;
}

.mp-input:focus {
    border-color: var(--cyan);
}

.mp-input-code {
    text-transform: uppercase;
    letter-spacing: 0.15em;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 600;
}

.mp-actions {
    display: flex;
    gap: 0.75rem;
}

.mp-btn {
    flex: 1;
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    padding: 0.75rem 1rem;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.mp-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.mp-btn-create {
    background: transparent;
    color: var(--cyan);
    border: 1px solid var(--cyan);
}

.mp-btn-create:hover:not(:disabled) {
    background: rgba(0, 240, 255, 0.1);
    box-shadow: var(--glow-cyan);
}

.mp-btn-join {
    background: transparent;
    color: var(--magenta);
    border: 1px solid var(--magenta);
}

.mp-btn-join:hover:not(:disabled) {
    background: rgba(255, 0, 128, 0.1);
    box-shadow: var(--glow-magenta);
}
```

- [ ] **Step 6: Create Lobby component**

Create `src/components/Lobby.tsx`:

```typescript
import React from 'react';
import './Lobby.css';

interface PlayerInfo {
  name: string;
  color: string;
  isCreator: boolean;
}

interface LobbyProps {
  roomCode: string;
  players: PlayerInfo[];
  isCreator: boolean;
  onStart: () => void;
  onLeave: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ roomCode, players, isCreator, onStart, onLeave }) => {
  return (
    <div className="lobby-screen">
      <div className="lobby-content">
        <div className="lobby-label">ROOM CODE</div>
        <div className="lobby-code">{roomCode}</div>
        <div className="lobby-hint">Share this code with friends</div>

        <div className="lobby-players">
          <div className="lobby-players-label">PLAYERS ({players.length}/4)</div>
          {players.map(p => (
            <div key={p.name} className="lobby-player" style={{ borderLeftColor: p.color }}>
              <span style={{ color: p.color }}>{p.name}</span>
              {p.isCreator && <span className="lobby-creator-tag">HOST</span>}
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          {isCreator && players.length >= 2 && (
            <button className="lobby-btn lobby-start" onClick={onStart}>
              START RACE
            </button>
          )}
          {isCreator && players.length < 2 && (
            <div className="lobby-waiting">Waiting for players...</div>
          )}
          <button className="lobby-btn lobby-leave" onClick={onLeave}>
            LEAVE
          </button>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
```

- [ ] **Step 7: Create Lobby styles**

Create `src/components/Lobby.css`:

```css
.lobby-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--bg-deep);
    padding: 2rem;
}

.lobby-content {
    text-align: center;
    max-width: 400px;
    width: 100%;
}

.lobby-label {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--text-ghost);
    letter-spacing: 0.3em;
    margin-bottom: 0.5rem;
}

.lobby-code {
    font-family: var(--font-display);
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--cyan);
    letter-spacing: 0.15em;
    text-shadow: var(--glow-cyan);
    margin-bottom: 0.5rem;
}

.lobby-hint {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-ghost);
    margin-bottom: 2rem;
}

.lobby-players {
    margin-bottom: 2rem;
}

.lobby-players-label {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--text-ghost);
    letter-spacing: 0.15em;
    margin-bottom: 0.75rem;
}

.lobby-player {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    background: var(--bg-raised);
    border-left: 3px solid;
    margin-bottom: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
}

.lobby-creator-tag {
    font-size: 0.55rem;
    color: var(--amber);
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border: 1px solid rgba(255, 170, 0, 0.3);
    border-radius: 2px;
}

.lobby-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
}

.lobby-btn {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    padding: 0.8rem 2rem;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    max-width: 250px;
}

.lobby-start {
    background: transparent;
    color: var(--cyan);
    border: 1px solid var(--cyan);
}

.lobby-start:hover {
    background: rgba(0, 240, 255, 0.1);
    box-shadow: var(--glow-cyan);
}

.lobby-leave {
    background: transparent;
    color: var(--text-ghost);
    border: 1px solid var(--text-ghost);
}

.lobby-leave:hover {
    color: var(--red);
    border-color: var(--red);
}

.lobby-waiting {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-ghost);
    animation: neonPulse 2s ease-in-out infinite;
}
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useMultiplayer.ts src/components/RaceTrack.tsx src/components/RaceTrack.css src/components/MultiplayerModal.tsx src/components/MultiplayerModal.css src/components/Lobby.tsx src/components/Lobby.css
git commit -m "feat: add multiplayer client hook, race track, lobby, and modal components"
```

---

## Task 14: Integrate Multiplayer into App

Wire the multiplayer hook, lobby, modal, and race track into App.tsx and the racing/results screens.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx with full multiplayer integration**

Add to the imports at the top of `src/App.tsx`:

```typescript
import { useMultiplayer } from './hooks/useMultiplayer';
import MultiplayerModal from './components/MultiplayerModal';
import Lobby from './components/Lobby';
```

Replace the `handleStartMultiplayer` placeholder with real logic, and add multiplayer state to the render. Key changes:

- Add `const mp = useMultiplayer();` at the top of the component
- Add `[showMPModal, setShowMPModal]` state
- `handleStartMultiplayer` opens the modal
- When `mp.state === 'lobby'`, render `<Lobby>` instead of welcome/racing
- When `mp.state === 'racing'`, pass `mp.playerProgress` to TypeRacer for the race track
- When `mp.state === 'finished'`, pass `mp.raceResults` to ResultsScreen for the podium
- Send progress updates during multiplayer racing via `mp.sendProgress` on each keystroke
- Send finished via `mp.sendFinished` when race completes

The full updated `App.tsx` should handle these game states:
- `welcome` + `mp.state === 'disconnected'` → show WelcomeScreen
- `showMPModal` → show MultiplayerModal overlay
- `mp.state === 'lobby'` → show Lobby
- `mp.state === 'countdown'` → show countdown (handled by TypeRacer)
- `mp.state === 'racing'` or `gameState === 'racing'` → show TypeRacer
- `mp.state === 'finished'` or `gameState === 'results'` → show ResultsScreen

- [ ] **Step 2: Add RaceTrack import and rendering in TypeRacer**

In `src/components/TypeRacer.tsx`, import `RaceTrack` and render it when `multiplayerPlayers` is provided:

```typescript
import RaceTrack from './RaceTrack';

// In the render, after the progress rail and before the fire banner:
{multiplayerPlayers && multiplayerPlayers.length > 0 && (
    <RaceTrack players={multiplayerPlayers} />
)}
```

Update the `TypeRacerProps` interface:

```typescript
interface TypeRacerProps {
    passage: TextPassage;
    ghostEnabled: boolean;
    sessionStreak: number;
    onRaceComplete: (result: RaceResult, fireStreak: number, ghostTimestamps: number[]) => void;
    onNewText: () => void;
    multiplayerPlayers?: PlayerProgress[];
    onProgress?: (currentIndex: number, errors: number, wpm: number) => void;
}
```

Call `onProgress` in `handleInputChange` after updating stats.

- [ ] **Step 3: Add podium rendering in ResultsScreen**

In `src/components/ResultsScreen.tsx`, accept an optional `podium` prop and render it:

```typescript
interface ResultsScreenProps {
    result: RaceResult;
    isNewBest: boolean;
    fireStreak: number;
    onRestart: () => void;
    onNewRace: () => void;
    podium?: PlayerResult[];
    onLeaveRoom?: () => void;
}
```

Render the podium above the personal stats when present:

```tsx
{podium && podium.length > 0 && (
    <div className="results-podium">
        <div className="podium-label">RACE STANDINGS</div>
        {podium.map(p => (
            <div key={p.name} className="podium-entry" style={{ borderLeftColor: p.color }}>
                <span className="podium-rank">#{p.rank}</span>
                <span className="podium-name" style={{ color: p.color }}>{p.name}</span>
                <span className="podium-wpm">{p.result.wpm} wpm</span>
                <span className="podium-acc">{p.result.accuracy}%</span>
            </div>
        ))}
    </div>
)}
```

- [ ] **Step 4: Add podium styles to ResultsScreen.css**

```css
/* ── Multiplayer podium ────────────────────────────────── */
.results-podium {
    width: 100%;
    margin-bottom: 1rem;
    animation: fadeUp 0.6s ease-out 0.1s both;
}

.podium-label {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--text-ghost);
    letter-spacing: 0.2em;
    text-align: center;
    margin-bottom: 0.75rem;
}

.podium-entry {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    background: var(--bg-raised);
    border-left: 3px solid;
    margin-bottom: 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
}

.podium-rank {
    color: var(--text-ghost);
    font-weight: 700;
    min-width: 24px;
}

.podium-name {
    flex: 1;
    font-weight: 600;
}

.podium-wpm {
    color: var(--text-primary);
}

.podium-acc {
    color: var(--text-secondary);
    font-size: 0.7rem;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/TypeRacer.tsx src/components/ResultsScreen.tsx src/components/ResultsScreen.css
git commit -m "feat: integrate multiplayer into App, TypeRacer, and ResultsScreen"
```

---

## Task 15: Add .gitignore entries and update CLAUDE.md

**Files:**
- Modify: `.gitignore`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new entries to .gitignore**

Append to `.gitignore`:

```
.superpowers/
server/dist/
server/node_modules/
```

- [ ] **Step 2: Update CLAUDE.md with new commands and architecture**

Add to the Commands section:

```markdown
- **Dev (all):** `npm run dev:all` — starts React dev server + multiplayer WebSocket server
- **Dev (server only):** `npm run dev:server` — starts the WebSocket server on port 3001
```

Add to the Architecture section:

```markdown
### Multiplayer

WebSocket server in `server/` (Express + `ws`). In-memory room state, no database. Players join rooms via short codes, race the same passage simultaneously. Client hook in `src/hooks/useMultiplayer.ts` manages connection and state.

### Effects & Competitive Systems

- `src/utils/audioEngine.ts` — synthesized typing sounds via Web Audio API
- `src/utils/particleBurst.ts` — canvas particle system for race completion
- `src/hooks/useSpeedTier.ts` — WPM-reactive visual tiers (normal → overdrive)
- `src/hooks/useFireStreak.ts` — combo system tracking consecutive correct chars
- `src/hooks/useGhost.ts` — ghost racing (replay personal best timing)
- `src/utils/storage.ts` — all localStorage persistence (bests, history, streaks, preferences)
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "chore: update gitignore and CLAUDE.md for Arena Mode features"
```
