import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { Room } from './room';
import { ClientMessage, Difficulty, PassageCategory } from './types';
import { seedIfEmpty, getPassages, getRandomPassage as getRandomFromDB, insertPassage, getPassageCount } from './db';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ROOM_TTL_MS = 10 * 60 * 1000;

// Seed database on startup
seedIfEmpty();

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();

// ── REST API ──────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, passages: getPassageCount() });
});

// CORS for client dev server
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  next();
});

// List passages with optional filters
app.get('/passages', (req, res) => {
  const difficulty = req.query.difficulty as Difficulty | undefined;
  const category = req.query.category as PassageCategory | undefined;
  const passages = getPassages(difficulty, category);
  res.json(passages);
});

// Get a random passage with optional filters
app.get('/passages/random', (req, res) => {
  const difficulty = req.query.difficulty as Difficulty | undefined;
  const category = req.query.category as PassageCategory | undefined;
  const passage = getRandomFromDB(difficulty, category);
  if (!passage) {
    res.status(404).json({ error: 'No passages found for the given filters' });
    return;
  }
  res.json(passage);
});

// Add a new passage
app.post('/passages', (req, res) => {
  const { id, title, text, difficulty, category } = req.body;
  if (!id || !title || !text || !difficulty || !category) {
    res.status(400).json({ error: 'Missing required fields: id, title, text, difficulty, category' });
    return;
  }
  const validDifficulties = ['easy', 'medium', 'hard'];
  const validCategories = ['sentences', 'pop-culture', 'random-words'];
  if (!validDifficulties.includes(difficulty)) {
    res.status(400).json({ error: `difficulty must be one of: ${validDifficulties.join(', ')}` });
    return;
  }
  if (!validCategories.includes(category)) {
    res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` });
    return;
  }
  try {
    insertPassage({ id, title, text, difficulty, category });
    res.status(201).json({ id, title, text, difficulty, category });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'A passage with that id already exists' });
    } else {
      res.status(500).json({ error: 'Failed to insert passage' });
    }
  }
});

// ── Serve React client in production ──────────────────────
const clientDir = path.join(__dirname, '..', '..', 'client');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDir));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/passages') || _req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

function generateRoomCode(): string {
  const words = ['NEON', 'VOLT', 'RUSH', 'FLUX', 'BYTE', 'GLOW', 'TURBO', 'BLAZE'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `${word}-${num}`;
}

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid message format' });
      return;
    }

    switch (msg.type) {
      case 'create': {
        const code = generateRoomCode();
        const room = new Room(code, msg.difficulty, msg.category);
        rooms.set(code, room);

        if (!room.addPlayer(ws, msg.playerName)) {
          send(ws, { type: 'error', message: 'Failed to create room' });
          return;
        }

        playerRooms.set(ws, code);
        send(ws, { type: 'room-created', roomCode: code, passage: room.passage });
        room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
        break;
      }

      case 'join': {
        const room = rooms.get(msg.roomCode.toUpperCase());
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }

        if (!room.addPlayer(ws, msg.playerName)) {
          send(ws, { type: 'error', message: 'Room is full or race already started' });
          return;
        }

        playerRooms.set(ws, msg.roomCode.toUpperCase());
        room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
        send(ws, { type: 'room-created', roomCode: room.code, passage: room.passage });
        break;
      }

      case 'start': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (!room || !room.isCreator(ws)) {
          send(ws, { type: 'error', message: 'Only the room creator can start' });
          return;
        }
        room.startCountdown();
        break;
      }

      case 'progress': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (room) {
          room.updateProgress(ws, msg.currentIndex, msg.errors, msg.wpm);
        }
        break;
      }

      case 'finished': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (room) {
          room.playerFinished(ws, msg.result);
        }
        break;
      }

      case 'rematch': {
        const roomCode = playerRooms.get(ws);
        const room = roomCode ? rooms.get(roomCode) : null;
        if (room) {
          room.requestRematch(ws);
        }
        break;
      }

      case 'leave': {
        handleLeave(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    handleLeave(ws);
  });
});

function handleLeave(ws: WebSocket): void {
  const roomCode = playerRooms.get(ws);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (room) {
    room.removePlayer(ws);
    if (room.isEmpty) {
      rooms.delete(roomCode);
    } else {
      room.broadcast({ type: 'player-left', players: room.getPlayerInfoList() });
    }
  }

  playerRooms.delete(ws);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      room.broadcast({ type: 'error', message: 'Room closed due to inactivity' });
      rooms.delete(code);
    }
  }
}, 60_000);

server.listen(PORT, () => {
  console.log(`TypeRace server running on port ${PORT}`);
});
