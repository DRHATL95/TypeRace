import { TextPassage, Difficulty, PassageCategory } from '../types/GameTypes';

const API_BASE = `http://${window.location.hostname}:3001`;

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
