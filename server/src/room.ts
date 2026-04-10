import WebSocket from 'ws';
import { TextPassage, PlayerInfo, PlayerProgress, PlayerResult, RaceResult, Difficulty, PassageCategory, RoomMode } from './types';
import { getRandomPassage, insertMultiplayerResult } from './db';
import { nanoid } from 'nanoid';

const PLAYER_COLORS = ['#00f0ff', '#ff0080', '#00ff88', '#ffaa00'];
const MAX_PLAYERS = 4;
const FINISH_TIMEOUT_MS = 60_000;
const RECENT_PASSAGE_MEMORY = 3; // don't repeat any of the last N passages on rematch

const FALLBACK_PASSAGE: TextPassage = {
  id: 'fallback', title: 'Fallback', text: 'The quick brown fox jumps over the lazy dog.',
  difficulty: 'easy', category: 'sentences'
};

interface Player {
  ws: WebSocket;
  name: string;
  color: string;
  isCreator: boolean;
  userId: string | null;
  guestId: string | null;
  isGuest: boolean;
  progress: PlayerProgress;
  result: RaceResult | null;
  wantsRematch: boolean;
}

// Mirrors server/src/index.ts GUEST_ID_RE. Kept local here so room.ts doesn't
// need to reach into index.ts for a single regex.
const GUEST_ID_RE = /^[a-z0-9-]{1,64}$/;

export type RoomState = 'lobby' | 'countdown' | 'racing' | 'finished';

export class Room {
  static readonly CATEGORIES: PassageCategory[] = ['sentences', 'pop-culture', 'random-words'];

  static randomCategory(): PassageCategory {
    return Room.CATEGORIES[Math.floor(Math.random() * Room.CATEGORIES.length)];
  }

  /** Create a room with an async passage fetch */
  static async create(code: string, difficulty: Difficulty, mode: RoomMode = 'casual'): Promise<Room> {
    const category = Room.randomCategory();
    const passage = await getRandomPassage(difficulty, category) || FALLBACK_PASSAGE;
    return new Room(code, difficulty, category, passage, mode);
  }

  code: string;
  difficulty: Difficulty;
  passage: TextPassage;
  mode: RoomMode;
  players: Map<WebSocket, Player> = new Map();
  state: RoomState = 'lobby';
  lastActivity: number = Date.now();
  private countdownTimer: NodeJS.Timeout | null = null;
  private finishTimer: NodeJS.Timeout | null = null;
  private rematchTimer: NodeJS.Timeout | null = null;
  private rematchDeadline: NodeJS.Timeout | null = null;
  /** Ring buffer of the most recent passage ids shown in this room, newest last. */
  private recentPassageIds: string[] = [];

  category: PassageCategory;

  constructor(code: string, difficulty: Difficulty, category: PassageCategory, passage: TextPassage, mode: RoomMode = 'casual') {
    this.code = code;
    this.difficulty = difficulty;
    this.category = category;
    this.passage = passage;
    this.mode = mode;
    this.recentPassageIds.push(passage.id);
  }

  addPlayer(ws: WebSocket, name: string, userId: string | null = null, guestId: string | null = null): boolean {
    if (this.players.size >= MAX_PLAYERS) return false;
    if (this.state !== 'lobby') return false;

    // Ranked rooms require authenticated players
    if (this.mode === 'ranked' && !userId) return false;

    const isCreator = this.players.size === 0;
    const color = PLAYER_COLORS[this.players.size];

    // Authed users already have cross-device identity via userId — don't
    // double-tag rows. Validate shape so we don't persist arbitrary junk.
    const safeGuestId = !userId && guestId && GUEST_ID_RE.test(guestId) ? guestId : null;

    this.players.set(ws, {
      ws,
      name,
      color,
      isCreator,
      userId,
      guestId: safeGuestId,
      isGuest: !userId,
      progress: {
        name,
        color,
        currentIndex: 0,
        totalLength: this.passage.text.length,
        wpm: 0,
        finished: false,
      },
      result: null,
      wantsRematch: false,
    });

    this.touch();
    return true;
  }

  removePlayer(ws: WebSocket): void {
    this.players.delete(ws);
    this.touch();
  }

  getPlayerInfoList(): PlayerInfo[] {
    return Array.from(this.players.values()).map(p => ({
      name: p.name,
      color: p.color,
      isCreator: p.isCreator,
      userId: p.userId,
      isGuest: p.isGuest,
    }));
  }

  getProgressList(): PlayerProgress[] {
    return Array.from(this.players.values()).map(p => p.progress);
  }

  isCreator(ws: WebSocket): boolean {
    return this.players.get(ws)?.isCreator ?? false;
  }

  startCountdown(): void {
    this.state = 'countdown';
    let seconds = 3;

    this.broadcast({ type: 'countdown', seconds });

    this.countdownTimer = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        this.broadcast({ type: 'countdown', seconds });
      } else {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.state = 'racing';
        this.broadcast({ type: 'race-start', passage: this.passage, category: this.category });
      }
    }, 1000);
  }

  updateProgress(ws: WebSocket, currentIndex: number, errors: number, wpm: number): void {
    const player = this.players.get(ws);
    if (!player) return;

    player.progress = {
      ...player.progress,
      currentIndex,
      wpm,
    };

    this.broadcast({ type: 'progress-update', players: this.getProgressList() });
    this.touch();
  }

  playerFinished(ws: WebSocket, result: RaceResult): void {
    const player = this.players.get(ws);
    if (!player) return;

    player.result = result;
    player.progress.finished = true;
    player.progress.wpm = result.wpm;

    this.broadcast({
      type: 'player-finished',
      playerName: player.name,
      result,
    });

    if (!this.finishTimer) {
      this.finishTimer = setTimeout(() => this.endRace(), FINISH_TIMEOUT_MS);
    }

    const allFinished = Array.from(this.players.values()).every(p => p.result !== null);
    if (allFinished) {
      if (this.finishTimer) clearTimeout(this.finishTimer);
      this.endRace();
    }
  }

  private endRace(): void {
    this.state = 'finished';
    const results: PlayerResult[] = Array.from(this.players.values())
      .filter(p => p.result)
      .sort((a, b) => b.result!.wpm - a.result!.wpm)
      .map((p, i) => ({
        name: p.name,
        color: p.color,
        rank: i + 1,
        result: p.result!,
      }));

    this.broadcast({ type: 'race-end', results });

    // Persist multiplayer results (fire-and-forget)
    const matchId = nanoid(12);
    for (const r of results) {
      const player = Array.from(this.players.values()).find(p => p.name === r.name);
      insertMultiplayerResult({
        match_id: matchId,
        room_code: this.code,
        mode: this.mode,
        user_id: player?.userId || null,
        guest_id: player?.guestId || null,
        player_name: r.name,
        wpm: r.result.wpm,
        accuracy: r.result.accuracy,
        fire_streak: 0,
        rank: r.rank,
        difficulty: this.difficulty,
        category: this.category,
      }).catch(() => {}); // fire-and-forget
    }
  }

  requestRematch(ws: WebSocket): void {
    const player = this.players.get(ws);
    if (!player || this.state !== 'finished') return;

    player.wantsRematch = true;
    const accepted = Array.from(this.players.values())
      .filter(p => p.wantsRematch)
      .map(p => p.name);

    // Start 30-second countdown on first vote
    if (accepted.length === 1 && !this.rematchDeadline) {
      let secondsLeft = 30;
      this.broadcast({ type: 'rematch-countdown', secondsLeft, voters: accepted });

      this.rematchTimer = setInterval(() => {
        secondsLeft--;
        const currentVoters = Array.from(this.players.values())
          .filter(p => p.wantsRematch)
          .map(p => p.name);
        this.broadcast({ type: 'rematch-countdown', secondsLeft, voters: currentVoters });

        if (secondsLeft <= 0) {
          this.resolveRematch();
        }
      }, 1000);

      this.rematchDeadline = this.rematchTimer;
    } else {
      // Broadcast updated voter list with countdown
      const currentVoters = Array.from(this.players.values())
        .filter(p => p.wantsRematch)
        .map(p => p.name);
      this.broadcast({
        type: 'rematch-request',
        from: player.name,
        accepted: currentVoters,
      });
    }

    // If all players voted, start immediately
    if (accepted.length === this.players.size) {
      this.clearRematchTimers();
      this.resetForRematch();
    }
  }

  private resolveRematch(): void {
    this.clearRematchTimers();

    // Remove players who didn't vote
    const toRemove: WebSocket[] = [];
    for (const [ws, player] of this.players) {
      if (!player.wantsRematch) {
        toRemove.push(ws);
      }
    }
    for (const ws of toRemove) {
      this.players.delete(ws);
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Removed from room (did not vote for rematch)' }));
      } catch {}
    }

    if (this.players.size > 0) {
      this.resetForRematch();
    }
  }

  private clearRematchTimers(): void {
    if (this.rematchTimer) {
      clearInterval(this.rematchTimer);
      this.rematchTimer = null;
    }
    this.rematchDeadline = null;
  }

  private async resetForRematch(): Promise<void> {
    this.clearRematchTimers();
    this.category = Room.randomCategory();
    const next = await getRandomPassage(this.difficulty, this.category, this.recentPassageIds);
    if (next) {
      this.passage = next;
      this.recentPassageIds.push(next.id);
      if (this.recentPassageIds.length > RECENT_PASSAGE_MEMORY) {
        this.recentPassageIds.shift();
      }
    }
    this.state = 'lobby';
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;

    for (const player of this.players.values()) {
      player.result = null;
      player.wantsRematch = false;
      player.progress = {
        name: player.name,
        color: player.color,
        currentIndex: 0,
        totalLength: this.passage.text.length,
        wpm: 0,
        finished: false,
      };
    }

    this.startCountdown();
  }

  broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }
}
