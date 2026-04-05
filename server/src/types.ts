export type Difficulty = 'easy' | 'medium' | 'hard';

export type PassageCategory = 'sentences' | 'pop-culture' | 'random-words';

export interface TextPassage {
  id: string;
  title: string;
  text: string;
  difficulty: Difficulty;
  category: PassageCategory;
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
  | { type: 'create'; playerName: string; difficulty: Difficulty; category?: PassageCategory }
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
