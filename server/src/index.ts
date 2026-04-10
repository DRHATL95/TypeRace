import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { clerkMiddleware, getAuth, verifyToken } from '@clerk/express';
import { Room } from './room';
import { ClientMessage, Difficulty, PassageCategory } from './types';
import { runMigrations } from './db/migrate';
import { seedIfEmpty, getPassages, getRandomPassage as getRandomFromDB, insertPassage, getPassageCount, insertRaceResult, getTodayLeaderboard, createShare, getShare } from './db';
import { nanoid } from 'nanoid';

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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  next();
});

// Clerk auth middleware — attaches req.auth to every request (does not block unauthenticated)
if (process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY) {
  app.use(clerkMiddleware());
}

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
  // Extract Clerk user ID if authenticated
  let userId: string | null = null;
  try {
    const auth = getAuth(req);
    userId = auth.userId;
  } catch {}
  try {
    const id = await insertRaceResult({
      player_name: playerName,
      wpm,
      accuracy,
      fire_streak: fireStreak || 0,
      difficulty,
      category,
      user_id: userId,
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

// Create a share link
app.post('/api/share', async (req, res) => {
  const { wpm, accuracy, fireStreak, difficulty, category, rankLabel, playerName } = req.body;
  if (wpm == null || accuracy == null || !difficulty || !category) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  let userId: string | null = null;
  try {
    const auth = getAuth(req);
    userId = auth.userId;
  } catch {}
  try {
    const id = nanoid(10);
    await createShare({
      id,
      user_id: userId,
      wpm,
      accuracy,
      fire_streak: fireStreak || 0,
      difficulty,
      category,
      rank_label: rankLabel || '',
      player_name: playerName || null,
    });
    res.status(201).json({ id, url: `/share/${id}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// Get share data (JSON)
app.get('/api/share/:id', async (req, res) => {
  try {
    const share = await getShare(req.params.id);
    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }
    res.json(share);
  } catch {
    res.status(500).json({ error: 'Failed to fetch share' });
  }
});

// Server-rendered OG page for rich embeds (Discord, iMessage, etc.)
app.get('/share/:id', async (req, res) => {
  try {
    const share = await getShare(req.params.id);
    if (!share) {
      res.status(404).send('Share not found');
      return;
    }
    const title = `${share.player_name || 'A racer'} scored ${share.wpm} WPM on TypeRace`;
    const description = `${share.accuracy}% accuracy | ${share.difficulty.toUpperCase()} | Rank ${share.rank_label || '?'}${share.fire_streak > 0 ? ` | ${share.fire_streak} streak` : ''}`;
    const siteUrl = process.env.PUBLIC_URL || `https://${req.get('host')}`;
    const ogImage = `${siteUrl}/api/share/${share.id}/og.svg`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${siteUrl}/share/${share.id}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="theme-color" content="#00f0ff">
  <meta http-equiv="refresh" content="0;url=${siteUrl}">
</head>
<body style="background:#060a14;color:#e0e6f0;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center">
    <h1 style="color:#00f0ff;font-size:3rem;margin:0">${share.wpm} WPM</h1>
    <p style="color:#a0a8b8;font-size:1.2rem">${share.accuracy}% accuracy</p>
    <p style="color:#a0a8b8">Redirecting to TypeRace...</p>
  </div>
</body>
</html>`);
  } catch {
    res.status(500).send('Server error');
  }
});

// Dynamic OG image (SVG)
app.get('/api/share/:id/og.svg', async (req, res) => {
  try {
    const share = await getShare(req.params.id);
    if (!share) {
      res.status(404).send('Not found');
      return;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#060a14"/>
  <rect x="40" y="40" width="1120" height="550" rx="16" fill="#0d1321" stroke="#00f0ff" stroke-opacity="0.15" stroke-width="2"/>
  <text x="600" y="120" text-anchor="middle" fill="#00f0ff" font-family="monospace" font-size="24" letter-spacing="8" opacity="0.6">TYPERACE</text>
  <text x="600" y="260" text-anchor="middle" fill="#e0e6f0" font-family="sans-serif" font-weight="bold" font-size="120">${share.wpm}</text>
  <text x="600" y="310" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="28">WORDS PER MINUTE</text>
  <text x="380" y="420" text-anchor="middle" fill="#00ff88" font-family="monospace" font-size="36">${share.accuracy}%</text>
  <text x="380" y="460" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="18">ACCURACY</text>
  <text x="600" y="420" text-anchor="middle" fill="#ffaa00" font-family="sans-serif" font-weight="bold" font-size="48">${share.rank_label || '?'}</text>
  <text x="600" y="460" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="18">RANK</text>
  <text x="820" y="420" text-anchor="middle" fill="#ff0080" font-family="monospace" font-size="36">${share.fire_streak}</text>
  <text x="820" y="460" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="18">STREAK</text>
  ${share.player_name ? `<text x="600" y="550" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="22">${share.player_name} | ${share.difficulty.toUpperCase()}</text>` : ''}
</svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(svg);
  } catch {
    res.status(500).send('Server error');
  }
});

// ── Serve React client in production ──────────────────────
const clientDir = path.join(__dirname, '..', '..', 'client');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDir));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res, next) => {
    const p = _req.path;
    if (p.startsWith('/passages') || p.startsWith('/health') || p.startsWith('/results') || p.startsWith('/leaderboard') || p.startsWith('/api/') || p.startsWith('/share/')) {
      return next();
    }
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

function generateRoomCode(): string {
  const adjectives = [
    'swift', 'bold', 'keen', 'wild', 'fast', 'cool', 'rad', 'hot',
    'slick', 'prime', 'epic', 'mega', 'ultra', 'hyper', 'turbo', 'neon',
    'vivid', 'brisk', 'crisp', 'sleek', 'fierce', 'blazing', 'rapid', 'zippy',
    'sharp', 'witty', 'grand', 'lucky', 'noble', 'brave', 'deft', 'agile',
    'calm', 'sly', 'chill', 'snappy', 'stellar', 'cosmic', 'golden', 'iron',
  ];
  const nouns = [
    'falcon', 'tiger', 'comet', 'spark', 'blaze', 'storm', 'wolf', 'hawk',
    'viper', 'raven', 'phoenix', 'cobra', 'lynx', 'panther', 'shark', 'orca',
    'bolt', 'flame', 'pulse', 'nova', 'orbit', 'prism', 'surge', 'flash',
    'rider', 'pilot', 'racer', 'knight', 'scout', 'titan', 'forge', 'nexus',
    'echo', 'cipher', 'pixel', 'matrix', 'byte', 'vapor', 'drift', 'quest',
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${adj}-${noun}-${num}`;
}

/** Verify a Clerk JWT and return the userId, or null if invalid/missing */
async function resolveUserId(authToken?: string): Promise<string | null> {
  if (!authToken || !process.env.CLERK_SECRET_KEY) return null;
  try {
    const payload = await verifyToken(authToken, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return payload.sub || null;
  } catch {
    return null;
  }
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
        const mode = msg.mode || 'casual';
        resolveUserId(msg.authToken).then(async userId => {
          if (mode === 'ranked' && !userId) {
            send(ws, { type: 'error', message: 'Sign in required for ranked play' });
            return;
          }
          const room = await Room.create(code, msg.difficulty, mode);
          rooms.set(code, room);

          if (!room.addPlayer(ws, msg.playerName, userId)) {
            send(ws, { type: 'error', message: 'Failed to create room' });
            return;
          }

          playerRooms.set(ws, code);
          send(ws, { type: 'room-created', roomCode: code, passage: room.passage, mode: room.mode });
          room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
        }).catch(() => {
          send(ws, { type: 'error', message: 'Failed to create room' });
        });
        break;
      }

      case 'join': {
        const room = rooms.get(msg.roomCode) || rooms.get(msg.roomCode.toLowerCase()) || rooms.get(msg.roomCode.toUpperCase());
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }

        resolveUserId(msg.authToken).then(userId => {
          if (room.mode === 'ranked' && !userId) {
            send(ws, { type: 'error', message: 'Sign in required to join ranked rooms' });
            return;
          }

          if (!room.addPlayer(ws, msg.playerName, userId)) {
            send(ws, { type: 'error', message: 'Room is full or race already started' });
            return;
          }

          playerRooms.set(ws, room.code);
          room.broadcast({ type: 'player-joined', players: room.getPlayerInfoList() });
          send(ws, { type: 'room-created', roomCode: room.code, passage: room.passage, mode: room.mode });
        }).catch(() => {
          send(ws, { type: 'error', message: 'Failed to join room' });
        });
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
