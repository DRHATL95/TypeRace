import { useState, useCallback, useRef, useEffect } from 'react';
import { RaceResult, TextPassage } from '../types/GameTypes';

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

export interface PlayerResult {
  name: string;
  color: string;
  rank: number;
  result: RaceResult;
}

export type MultiplayerState = 'disconnected' | 'lobby' | 'countdown' | 'racing' | 'finished';

// In production (Docker), WebSocket is on the same host/port.
// In dev, the server is on port 3001.
const WS_URL = process.env.NODE_ENV === 'production'
  ? `ws://${window.location.host}`
  : `ws://${window.location.hostname}:3001`;

export function useMultiplayer() {
  const [state, setState] = useState<MultiplayerState>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [playerProgress, setPlayerProgress] = useState<PlayerProgress[]>([]);
  const [raceResults, setRaceResults] = useState<PlayerResult[]>([]);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [passage, setPassage] = useState<TextPassage | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('Connection failed'));

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);

        switch (msg.type) {
          case 'room-created':
            setRoomCode(msg.roomCode);
            setPassage(msg.passage);
            setState('lobby');
            break;
          case 'player-joined':
            setPlayers(msg.players);
            break;
          case 'player-left':
            setPlayers(msg.players);
            break;
          case 'countdown':
            setState('countdown');
            setCountdownSeconds(msg.seconds);
            break;
          case 'race-start':
            setState('racing');
            setPassage(msg.passage);
            break;
          case 'progress-update':
            setPlayerProgress(msg.players);
            break;
          case 'player-finished':
            break;
          case 'race-end':
            setState('finished');
            setRaceResults(msg.results);
            break;
          case 'rematch-request':
            break;
          case 'error':
            setError(msg.message);
            break;
        }
      };

      ws.onclose = () => {
        setState('disconnected');
        setRoomCode(null);
        setPlayers([]);
      };
    });
  }, []);

  const createRoom = useCallback(async (playerName: string, difficulty: string) => {
    try {
      setError(null);
      await connect();
      setIsCreator(true);
      // Small delay for ws readiness
      setTimeout(() => {
        send({ type: 'create', playerName, difficulty });
      }, 100);
    } catch {
      setError('Could not connect to server');
    }
  }, [connect, send]);

  const joinRoom = useCallback(async (playerName: string, code: string) => {
    try {
      setError(null);
      await connect();
      setIsCreator(false);
      setTimeout(() => {
        send({ type: 'join', roomCode: code.toUpperCase(), playerName });
      }, 100);
    } catch {
      setError('Could not connect to server');
    }
  }, [connect, send]);

  const startRaceMP = useCallback(() => send({ type: 'start' }), [send]);
  const sendProgress = useCallback((currentIndex: number, errors: number, wpm: number) => {
    send({ type: 'progress', currentIndex, errors, wpm });
  }, [send]);
  const sendFinished = useCallback((result: RaceResult) => {
    send({ type: 'finished', result });
  }, [send]);
  const requestRematch = useCallback(() => send({ type: 'rematch' }), [send]);

  const leave = useCallback(() => {
    send({ type: 'leave' });
    wsRef.current?.close();
    setState('disconnected');
    setRoomCode(null);
    setPlayers([]);
    setPlayerProgress([]);
    setRaceResults([]);
    setPassage(null);
    setIsCreator(false);
  }, [send]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    state, roomCode, players, playerProgress, raceResults,
    countdownSeconds, passage, isCreator, error,
    createRoom, joinRoom, startRace: startRaceMP,
    sendProgress, sendFinished, requestRematch, leave,
  };
}
