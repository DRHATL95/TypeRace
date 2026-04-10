import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { clerkMiddleware, getAuth, verifyToken } from '@clerk/express';
import { Room } from './room';
import { ClientMessage, Difficulty, PassageCategory } from './types';
import { runMigrations } from './db/migrate';
import { seedIfEmpty, getPassages, getRandomPassage as getRandomFromDB, getPassageCount, insertRaceResult, getTodayLeaderboard, getMonthlyLeaderboard, createShare, getShare } from './db';
import { nanoid } from 'nanoid';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ROOM_TTL_MS = 10 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGIN = process.env.PUBLIC_URL || 'https://typerace.howlab.co';

// Minimal HTML escape for interpolating user-supplied strings into the share page.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const app = express();
// We sit behind Traefik — trust one proxy hop so rate-limit sees real client IPs.
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use(helmet({
  contentSecurityPolicy: false, // client sets its own CSP; avoid conflicts with Clerk
  crossOriginEmbedderPolicy: false,
}));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── Rate limiters ─────────────────────────────────────────
// Global read/write cap — catches scrapers and runaway clients.
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});
// Strict cap for write endpoints that create DB rows.
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many writes, slow down.' },
});
app.use(globalLimiter);

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();

// ── WebSocket rate limits ─────────────────────────────────
const MAX_WS_CONNECTIONS = 500;
const MAX_WS_PER_IP = 8;
const WS_MSG_PER_SECOND = 60; // humanly impossible keystroke rate + margin
const wsIpCounts = new Map<string, number>();
interface WsLimitState { tokens: number; lastRefill: number; ip: string; }
const wsLimits = new WeakMap<WebSocket, WsLimitState>();

function allowWsMessage(ws: WebSocket): boolean {
  const state = wsLimits.get(ws);
  if (!state) return false;
  const now = Date.now();
  const elapsed = (now - state.lastRefill) / 1000;
  state.tokens = Math.min(WS_MSG_PER_SECOND, state.tokens + elapsed * WS_MSG_PER_SECOND);
  state.lastRefill = now;
  if (state.tokens < 1) return false;
  state.tokens -= 1;
  return true;
}

// ── REST API ──────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const count = await getPassageCount();
  res.json({ status: 'ok', rooms: rooms.size, passages: count });
});

// CORS — pinned to the configured origin in production, permissive in dev.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (IS_PROD) {
    if (origin === ALLOWED_ORIGIN) {
      res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
      res.header('Vary', 'Origin');
    }
  } else {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
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
// NOTE: POST /passages was removed. Passages are seeded via the startup seed
// (see server/src/db.ts — seedIfEmpty) and should not be client-mutable.

// Submit a race result
app.post('/results', writeLimiter, async (req, res) => {
  const { playerName, wpm, accuracy, fireStreak, difficulty, category } = req.body;
  if (!playerName || wpm == null || accuracy == null || !difficulty || !category) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  // Plausibility guardrails — reject obvious cheats / garbage submissions.
  // World record typing WPM is ~220; we allow a generous ceiling. Min accuracy
  // of 70% blocks the "mash one key" exploit (which yields ~0% accuracy with
  // net-WPM client, but this catches forked clients that still submit gross WPM).
  const wpmNum = Number(wpm);
  const accNum = Number(accuracy);
  if (!Number.isFinite(wpmNum) || !Number.isFinite(accNum) ||
      wpmNum < 0 || wpmNum > 250 || accNum < 70 || accNum > 100) {
    res.status(422).json({ error: 'Result rejected: implausible WPM or accuracy' });
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

// Get monthly leaderboard (best WPM per unique player, top 100)
app.get('/leaderboard/monthly', async (_req, res) => {
  try {
    const entries = await getMonthlyLeaderboard();
    res.json(entries);
  } catch {
    res.status(500).json({ error: 'Failed to fetch monthly leaderboard' });
  }
});

// Create a share link
app.post('/api/share', writeLimiter, async (req, res) => {
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
    // All user-supplied fields must be escaped before HTML interpolation.
    const playerName = escapeHtml(share.player_name || 'A racer');
    const difficulty = escapeHtml(share.difficulty.toUpperCase());
    const rankLabel = escapeHtml(share.rank_label || '?');
    const wpmStr = String(Number(share.wpm) || 0);
    const accStr = String(Number(share.accuracy) || 0);
    const streakNum = Number(share.fire_streak) || 0;

    const title = `${playerName} scored ${wpmStr} WPM on TypeRace`;
    const description = `${accStr}% accuracy | ${difficulty} | Rank ${rankLabel}${streakNum > 0 ? ` | ${streakNum} streak` : ''}`;
    // siteUrl must come from config, never a client-controlled Host header.
    const siteUrl = escapeHtml(process.env.PUBLIC_URL || ALLOWED_ORIGIN);
    const shareId = escapeHtml(share.id);
    const ogImage = `${siteUrl}/api/share/${shareId}/og.svg`;

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
  <meta property="og:url" content="${siteUrl}/share/${shareId}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="theme-color" content="#00f0ff">
  <meta http-equiv="refresh" content="0;url=${siteUrl}">
</head>
<body style="background:#060a14;color:#e0e6f0;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center">
    <h1 style="color:#00f0ff;font-size:3rem;margin:0">${wpmStr} WPM</h1>
    <p style="color:#a0a8b8;font-size:1.2rem">${accStr}% accuracy</p>
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
    // Escape all user-supplied fields for XML context (same rules work here).
    const wpmStr = String(Number(share.wpm) || 0);
    const accStr = String(Number(share.accuracy) || 0);
    const streakStr = String(Number(share.fire_streak) || 0);
    const rankLabel = escapeHtml(share.rank_label || '?');
    const playerName = share.player_name ? escapeHtml(share.player_name) : '';
    const difficulty = escapeHtml(share.difficulty.toUpperCase());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#060a14"/>
  <rect x="40" y="40" width="1120" height="550" rx="16" fill="#0d1321" stroke="#00f0ff" stroke-opacity="0.15" stroke-width="2"/>
  <text x="600" y="120" text-anchor="middle" fill="#00f0ff" font-family="monospace" font-size="24" letter-spacing="8" opacity="0.6">TYPERACE</text>
  <text x="600" y="260" text-anchor="middle" fill="#e0e6f0" font-family="sans-serif" font-weight="bold" font-size="120">${wpmStr}</text>
  <text x="600" y="310" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="28">WORDS PER MINUTE</text>
  <text x="380" y="420" text-anchor="middle" fill="#00ff88" font-family="monospace" font-size="36">${accStr}%</text>
  <text x="380" y="460" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="18">ACCURACY</text>
  <text x="600" y="420" text-anchor="middle" fill="#ffaa00" font-family="sans-serif" font-weight="bold" font-size="48">${rankLabel}</text>
  <text x="600" y="460" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="18">RANK</text>
  <text x="820" y="420" text-anchor="middle" fill="#ff0080" font-family="monospace" font-size="36">${streakStr}</text>
  <text x="820" y="460" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="18">STREAK</text>
  ${playerName ? `<text x="600" y="550" text-anchor="middle" fill="#a0a8b8" font-family="monospace" font-size="22">${playerName} | ${difficulty}</text>` : ''}
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

wss.on('connection', (ws: WebSocket, req) => {
  // Global connection cap — reject loudly so clients can surface a message.
  if (wss.clients.size > MAX_WS_CONNECTIONS) {
    send(ws, { type: 'error', message: 'Server at capacity, try again shortly.' });
    ws.close(1013, 'Overloaded');
    return;
  }

  // Per-IP connection cap (resolve real IP from trust-proxy X-Forwarded-For).
  const fwd = req.headers['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
  const ipCount = wsIpCounts.get(ip) || 0;
  if (ipCount >= MAX_WS_PER_IP) {
    send(ws, { type: 'error', message: 'Too many connections from this network.' });
    ws.close(1008, 'Per-IP limit');
    return;
  }
  wsIpCounts.set(ip, ipCount + 1);
  wsLimits.set(ws, { tokens: WS_MSG_PER_SECOND, lastRefill: Date.now(), ip });

  ws.on('message', (raw: Buffer) => {
    // Reject oversized payloads before parsing.
    if (raw.length > 4096) {
      send(ws, { type: 'error', message: 'Message too large' });
      return;
    }
    if (!allowWsMessage(ws)) {
      send(ws, { type: 'error', message: 'Message rate limit exceeded' });
      return;
    }

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
    const state = wsLimits.get(ws);
    if (state) {
      const current = wsIpCounts.get(state.ip) || 0;
      if (current <= 1) wsIpCounts.delete(state.ip);
      else wsIpCounts.set(state.ip, current - 1);
    }
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
