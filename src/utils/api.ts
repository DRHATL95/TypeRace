import { TextPassage, Difficulty, PassageCategory } from '../types/GameTypes';

// In production (Docker), client is served from the same origin as the API.
// In dev, the API is on port 3001.
const API_BASE = process.env.NODE_ENV === 'production'
  ? ''
  : `http://${window.location.hostname}:3001`;

export async function fetchRandomPassage(
  difficulty?: Difficulty,
  category?: PassageCategory
): Promise<TextPassage | null> {
  try {
    const params = new URLSearchParams();
    if (difficulty) params.set('difficulty', difficulty);
    if (category) params.set('category', category);

    const res = await fetch(`${API_BASE}/passages/random?${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPassages(
  difficulty?: Difficulty,
  category?: PassageCategory
): Promise<TextPassage[]> {
  try {
    const params = new URLSearchParams();
    if (difficulty) params.set('difficulty', difficulty);
    if (category) params.set('category', category);

    const res = await fetch(`${API_BASE}/passages?${params}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface LeaderboardEntry {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  difficulty: Difficulty;
  category: PassageCategory;
  /** True when this row was submitted by a signed-in user. Derived server-side
   *  from `user_id IS NOT NULL` so the raw Clerk ID never leaves the backend. */
  is_authed: boolean;
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
  guestId?: string;
}, authToken?: string | null): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    await fetch(`${API_BASE}/results`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  } catch {
    // Fire-and-forget — don't block UI
  }
}

export async function fetchTodayLeaderboard(
  category?: PassageCategory,
): Promise<TodayLeaderboard | null> {
  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${API_BASE}/leaderboard/today${qs}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface TodayRank {
  rank: number;
  wpm: number;
  total: number;
}

/** Fetch the calling player's rank on today's WPM leaderboard. Returns null
 *  when the player hasn't raced today, isn't identified, or the request
 *  fails — callers treat all three the same way (hide the callout). */
export async function fetchTodayRank(
  guestId: string | null,
  category?: PassageCategory,
  authToken?: string | null,
): Promise<TodayRank | null> {
  try {
    const params = new URLSearchParams();
    if (guestId) params.set('guestId', guestId);
    if (category) params.set('category', category);
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE}/leaderboard/today/me?${params}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface MonthlyLeaderboardEntry {
  player_name: string;
  wpm: number;
  accuracy: number;
  fire_streak: number;
  race_count: number;
  difficulty: Difficulty;
  category: PassageCategory;
  is_authed: boolean;
}

export async function fetchMonthlyLeaderboard(
  category?: PassageCategory,
): Promise<MonthlyLeaderboardEntry[]> {
  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${API_BASE}/leaderboard/monthly${qs}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
