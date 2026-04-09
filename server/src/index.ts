import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { Room } from './room';
import { ClientMessage, Difficulty, PassageCategory } from './types';
import { runMigrations } from './db/migrate';
import { seedIfEmpty, getPassages, getRandomPassage as getRandomFromDB, insertPassage, getPassageCount, insertRaceResult, getTodayLeaderboard } from './db';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ROOM_TTL_MS = 10 * 60 * 1000;

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();

// ── REST API ──────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const count = await getPassageCount();
  res.json({ status: 'ok', rooms: rooms.size, passages: count });
});

// CORS for client dev server
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  next();
});

// List passages with optional filters
app.get('/passages', async (req, res) => {
  const difficulty = req.query.difficulty as Difficulty | undefined;
  const category = req.query.category as PassageCategory | undefined;
  const passages = await getPassages(difficulty, category);
  res.json(passages);
});

// Get a random passage with optional filters
app.get('/passages/random', async (req, res) => {
  const difficulty = req.query.difficulty as Difficulty | undefined;
  const category = req.query.category as PassageCategory | undefined;
  const passage = await getRandomFromDB(difficulty, category);
  if (!passage) {
    res.status(404).json({ error: 'No passages found for the given filters' });
    return;
  }
  res.json(passage);
});

// Add a new passage
app.post('/passages', async (req, res) => {
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
    await insertPassage({ id, title, text, difficulty, category });
    res.status(201).json({ id, title, text, difficulty, category });
  } catch (err: any) {
    if (err.code === '23505') { // PostgreSQL unique violation
      res.status(409).json({ error: 'A passage with that id already exists' });
    } else {
      res.status(500).json({ error: 'Failed to insert passage' });
    }
  }
});

// Submit a race result
app.post('/results', async (req, res) => {
  const { playerName, wpm, accuracy, fireStreak, difficulty, category } = req.body;
  if (!playerName || wpm == null || accuracy == null || !difficulty || !category) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const id = await insertRaceResult({
      player_name: playerName,
      wpm,
      accuracy,
      fire_streak: fireStreak || 0,
      difficulty,
      category,
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save result' });
  }
});

// Get today's leaderboard
app.get('/leaderboard/today', async (_req, res) => {
  try {
    const leaderboard = await getTodayLeaderboard();
    res.json(leaderboard);
  } catch {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ── Serve React client in production ──────────────────────
const clientDir = path.join(__dirname, '..', '..', 'client');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDir));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/passages') || _req.path.startsWith('/health') || _req.path.startsWith('/results') || _req.path.startsWith('/leaderboard')) {
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
        Room.create(code, msg.difficulty).then(room => {
          rooms.set(code, room);

          if (!room.addPlayer(ws, msg.playerName)) {
            send(ws, { type: 'error', message: 'Failed to create room' });
            return;
          }

          playerRooms.set(ws, code);
          send(ws, { type: 'room-created', roomCode: code, passage: room.passage });
          room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
        }).catch(() => {
          send(ws, { type: 'error', message: 'Failed to create room' });
        });
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

// ── Async startup ─────────────────────────────────────────
async function main() {
  await runMigrations();
  await seedIfEmpty();

  server.listen(PORT, () => {
    console.log(`TypeRace server running on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
