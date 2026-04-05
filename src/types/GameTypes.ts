export type GameState = 'welcome' | 'racing' | 'results';

export interface RaceResult {
  wpm: number;
  accuracy: number;
  timeElapsed: number;
  charactersTyped: number;
  errors: number;
  textLength: number;
  completionPercentage: number;
}

export interface TextPassage {
  id: string;
  title: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: PassageCategory;
}

export interface TypingStats {
  startTime: number;
  endTime?: number;
  charactersTyped: number;
  errors: number;
  currentIndex: number;
  isComplete: boolean;
}

export interface CharacterStatus {
  char: string;
  status: 'pending' | 'correct' | 'incorrect';
  typed?: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type PassageCategory = 'sentences' | 'pop-culture' | 'random-words';

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
