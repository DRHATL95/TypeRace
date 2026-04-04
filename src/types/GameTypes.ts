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
  category: string;
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
