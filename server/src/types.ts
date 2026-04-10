export type Difficulty = 'easy' | 'medium' | 'hard';

export type PassageCategory = 'sentences' | 'pop-culture' | 'random-words';

export interface TextPassage {
  id: string;
  title: string;
  text: string;
  difficulty: Difficulty;
  category: PassageCategory;
}

export type RoomMode = 'casual' | 'ranked';

export interface PlayerInfo {
  name: string;
  color: string;
  isCreator: boolean;
  userId: string | null;
  isGuest: boolean;
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
  | { type: 'create'; playerName: string; difficulty: Difficulty; category?: PassageCategory; authToken?: string; mode?: RoomMode }
  | { type: 'join'; roomCode: string; playerName: string; authToken?: string }
  | { type: 'start' }
  | { type: 'progress'; currentIndex: number; errors: number; wpm: number }
  | { type: 'finished'; result: RaceResult }
  | { type: 'rematch' }
  | { type: 'leave' };

// Server → Client
export type ServerMessage =
  | { type: 'room-created'; roomCode: string; passage: TextPassage; mode: RoomMode }
  | { type: 'player-joined'; players: PlayerInfo[] }
  | { type: 'player-left'; players: PlayerInfo[] }
  | { type: 'countdown'; seconds: number }
  | { type: 'race-start'; passage: TextPassage; category: PassageCategory }
  | { type: 'progress-update'; players: PlayerProgress[] }
  | { type: 'player-finished'; playerName: string; result: RaceResult }
  | { type: 'race-end'; results: PlayerResult[] }
  | { type: 'rematch-request'; from: string; accepted: string[] }
  | { type: 'rematch-countdown'; secondsLeft: number; voters: string[] }
  | { type: 'error'; message: string };
