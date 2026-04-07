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
