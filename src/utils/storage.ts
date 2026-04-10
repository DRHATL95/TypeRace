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
  VOLUME:        'typerace-volume',
  GUEST_ID:      'typerace-guest-id',
} as const;

// ---------------------------------------------------------------------------
// Personal Bests
// ---------------------------------------------------------------------------

const DEFAULT_BESTS: PersonalBests = { easy: null, medium: null, hard: null };

export function getBests(): PersonalBests {
  return read<PersonalBests>(KEYS.BESTS, DEFAULT_BESTS);
}

/**
 * Plausibility floor for a personal best. Mirrors the server-side guardrails
 * in server/src/index.ts (POST /results): reject anything outside a legit
 * human-typing envelope so "mash one key" runs can never become a PB.
 */
function isPlausibleResult(wpm: number, accuracy: number): boolean {
  return Number.isFinite(wpm) && Number.isFinite(accuracy) &&
    wpm >= 0 && wpm <= 250 && accuracy >= 70 && accuracy <= 100;
}

/** Returns true when the new result is a personal best and was saved. */
export function updateBest(difficulty: Difficulty, wpm: number, accuracy: number): boolean {
  if (!isPlausibleResult(wpm, accuracy)) return false;
  const bests = getBests();
  const current = bests[difficulty];
  if (current === null || wpm > current.wpm || (wpm === current.wpm && accuracy > current.accuracy)) {
    bests[difficulty] = { wpm, accuracy };
    write(KEYS.BESTS, bests);
    return true;
  }
  return false;
}

/**
 * One-time cleanup: scrub any previously-saved PB that would fail the modern
 * plausibility floor (e.g. pre-guard garbage like 427 WPM @ 6% accuracy).
 * Safe to call on every boot — it only writes when something actually changes.
 */
export function pruneImplausibleBests(): void {
  const bests = getBests();
  let dirty = false;
  (Object.keys(bests) as Difficulty[]).forEach(d => {
    const b = bests[d];
    if (b && !isPlausibleResult(b.wpm, b.accuracy)) {
      bests[d] = null;
      dirty = true;
    }
  });
  if (dirty) write(KEYS.BESTS, bests);
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

/** Volume level 0–100, default 50 */
export function getVolume(): number {
  return read<number>(KEYS.VOLUME, 50);
}

export function setVolume(v: number): void {
  write(KEYS.VOLUME, Math.max(0, Math.min(100, Math.round(v))));
}

export function getCategory(): PassageCategory {
  return read<PassageCategory>(KEYS.CATEGORY, 'sentences');
}

export function setCategory(c: PassageCategory): void {
  write(KEYS.CATEGORY, c);
}

// ---------------------------------------------------------------------------
// Guest ID — stable pseudonymous identity for users who haven't signed up.
//
// Format: `adjective-noun-NNNN` (e.g. "amber-otter-4271"). The 4-digit suffix
// gives ~4B unique combos across the 40×40 word matrix — not globally unique,
// but collisions don't matter: the string is only used as an opaque dedup key
// on the server (paired with a partial index) and a friendly display handle.
//
// Lives in localStorage, so it's per-device by default. Cross-device sync
// happens by exporting/importing the string via the Settings modal (Phase 3).
// ---------------------------------------------------------------------------

const GUEST_ADJECTIVES = [
  'amber', 'azure', 'brisk', 'cedar', 'cosmic', 'crimson', 'dapper', 'dusky',
  'echo', 'ember', 'feral', 'frost', 'gentle', 'glacial', 'hazel', 'honey',
  'indigo', 'ionic', 'jade', 'jolly', 'keen', 'kinetic', 'lucid', 'lunar',
  'mellow', 'mystic', 'nimble', 'nova', 'opal', 'orbit', 'plucky', 'prism',
  'quartz', 'quiet', 'rapid', 'rustic', 'silver', 'solar', 'swift', 'scarlet',
];

const GUEST_NOUNS = [
  'otter', 'falcon', 'fox', 'heron', 'ibex', 'jackal', 'koi', 'lynx',
  'moth', 'newt', 'owl', 'puma', 'quail', 'raven', 'seal', 'tiger',
  'urchin', 'viper', 'wolf', 'yak', 'zebra', 'badger', 'coyote', 'dolphin',
  'eagle', 'finch', 'gecko', 'hare', 'iguana', 'jaguar', 'kestrel', 'lemur',
  'marten', 'narwhal', 'orca', 'panda', 'rabbit', 'stoat', 'tapir', 'wren',
];

export function generateGuestId(): string {
  const adj = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)];
  const noun = GUEST_NOUNS[Math.floor(Math.random() * GUEST_NOUNS.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit, 1000-9999
  return `${adj}-${noun}-${suffix}`;
}

// Mirrors the server-side validation in server/src/index.ts (GUEST_ID_RE).
// Keep the two in sync if either changes.
const GUEST_ID_RE = /^[a-z0-9-]{1,64}$/;

export function isValidGuestId(id: string): boolean {
  return GUEST_ID_RE.test(id);
}

/** Get the current guest ID, generating and persisting one on first call. */
export function getGuestId(): string {
  const existing = read<string>(KEYS.GUEST_ID, '');
  if (existing && isValidGuestId(existing)) return existing;
  const fresh = generateGuestId();
  write(KEYS.GUEST_ID, fresh);
  return fresh;
}

/** Overwrite the guest ID — used by cross-device import in Settings. */
export function setGuestId(id: string): boolean {
  if (!isValidGuestId(id)) return false;
  write(KEYS.GUEST_ID, id);
  return true;
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
