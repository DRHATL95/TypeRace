import {
  Difficulty,
  PassageCategory,
  PersonalBests,
  RaceHistoryEntry,
  DailyStreak,
} from '../types/GameTypes';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore storage errors (e.g. private browsing quota exceeded)
  }
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const KEYS = {
  BESTS:         'typerace-bests',
  HISTORY:       'typerace-history',
  DAILY_STREAK:  'typerace-daily-streak',
  GHOSTS:        'typerace-ghosts',
  DIFFICULTY:    'typerace-difficulty',
  GHOST_ENABLED: 'typerace-ghost-enabled',
  MUTED:         'typerace-muted',
  PLAYER_NAME:   'typerace-player-name',
  CATEGORY:      'typerace-category',
} as const;

// ---------------------------------------------------------------------------
// Personal Bests
// ---------------------------------------------------------------------------

const DEFAULT_BESTS: PersonalBests = { easy: null, medium: null, hard: null };

export function getBests(): PersonalBests {
  return read<PersonalBests>(KEYS.BESTS, DEFAULT_BESTS);
}

/** Returns true when the new result is a personal best and was saved. */
export function updateBest(difficulty: Difficulty, wpm: number, accuracy: number): boolean {
  const bests = getBests();
  const current = bests[difficulty];
  if (current === null || wpm > current.wpm || (wpm === current.wpm && accuracy > current.accuracy)) {
    bests[difficulty] = { wpm, accuracy };
    write(KEYS.BESTS, bests);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Race History (capped at 30 entries FIFO)
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 30;

export function getHistory(): RaceHistoryEntry[] {
  return read<RaceHistoryEntry[]>(KEYS.HISTORY, []);
}

export function addHistoryEntry(entry: RaceHistoryEntry): void {
  const history = getHistory();
  history.push(entry);
  if (history.length > HISTORY_LIMIT) {
    history.splice(0, history.length - HISTORY_LIMIT);
  }
  write(KEYS.HISTORY, history);
}

// ---------------------------------------------------------------------------
// Daily Streak
// ---------------------------------------------------------------------------

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getDailyStreak(): DailyStreak {
  const stored = read<DailyStreak>(KEYS.DAILY_STREAK, { count: 0, lastDate: '' });
  const today = todayString();
  const yesterday = yesterdayString();
  if (stored.lastDate === today || stored.lastDate === yesterday) {
    return stored;
  }
  // Streak is stale — treat as reset (don't persist here, just return zeroed value)
  return { count: 0, lastDate: '' };
}

/** Increments the streak only when it hasn't already been incremented today. */
export function incrementDailyStreak(): DailyStreak {
  const streak = getDailyStreak();
  const today = todayString();
  if (streak.lastDate === today) {
    return streak;
  }
  const updated: DailyStreak = { count: streak.count + 1, lastDate: today };
  write(KEYS.DAILY_STREAK, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Ghost Data (per-passage timing arrays)
// ---------------------------------------------------------------------------

export function getGhostData(passageId: string): number[] | null {
  const ghosts = read<Record<string, number[]>>(KEYS.GHOSTS, {});
  return ghosts[passageId] ?? null;
}

export function saveGhostData(passageId: string, timestamps: number[]): void {
  const ghosts = read<Record<string, number[]>>(KEYS.GHOSTS, {});
  ghosts[passageId] = timestamps;
  write(KEYS.GHOSTS, ghosts);
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export function getDifficulty(): Difficulty {
  return read<Difficulty>(KEYS.DIFFICULTY, 'medium');
}

export function setDifficulty(d: Difficulty): void {
  write(KEYS.DIFFICULTY, d);
}

export function isGhostEnabled(): boolean {
  return read<boolean>(KEYS.GHOST_ENABLED, true);
}

export function setGhostEnabled(enabled: boolean): void {
  write(KEYS.GHOST_ENABLED, enabled);
}

export function isMuted(): boolean {
  return read<boolean>(KEYS.MUTED, false);
}

export function setMuted(muted: boolean): void {
  write(KEYS.MUTED, muted);
}

export function getPlayerName(): string {
  return read<string>(KEYS.PLAYER_NAME, '');
}

export function setPlayerName(name: string): void {
  write(KEYS.PLAYER_NAME, name);
}

export function getCategory(): PassageCategory {
  return read<PassageCategory>(KEYS.CATEGORY, 'sentences');
}

export function setCategory(c: PassageCategory): void {
  write(KEYS.CATEGORY, c);
}

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
