// Player XP and levels. Import-free so scripts/check.mjs can run it under Node.

export type XpDifficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_MULT: Record<XpDifficulty, number> = { easy: 1, medium: 1.25, hard: 1.5 };

/** XP for one race: correct characters, scaled by accuracy and difficulty.
 *  Accuracy is squared-in via the correct-char count *and* the multiplier,
 *  so mashing through a passage earns far less than typing it cleanly. */
export function xpForRace(correctChars: number, accuracy: number, difficulty: XpDifficulty): number {
  if (correctChars <= 0) return 0;
  return Math.round(correctChars * (accuracy / 100) * DIFFICULTY_MULT[difficulty]);
}

/** XP needed to go from `level` to `level + 1`: 100, 150, 200, ... */
export const xpToNext = (level: number): number => 100 + 50 * (level - 1);

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level */
  into: number;
  /** XP the current level takes in total */
  needed: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level) };
}
