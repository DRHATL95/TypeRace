# TypeRace v2 -- Implementation Design Document

## 1. Database Schema (PostgreSQL)

Replace `better-sqlite3` with `pg` (node-postgres).

### Table: `users`
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  VARCHAR(32) NOT NULL,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  avatar_url    TEXT,
  is_anonymous  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
```

### Table: `oauth_providers`
```sql
CREATE TABLE oauth_providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    VARCHAR(20) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  profile_json JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_id)
);
CREATE INDEX idx_oauth_user ON oauth_providers(user_id);
```

### Table: `sessions`
```sql
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### Table: `user_settings`
```sql
CREATE TABLE user_settings (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  difficulty        VARCHAR(10) NOT NULL DEFAULT 'medium',
  category          VARCHAR(20) NOT NULL DEFAULT 'sentences',
  ghost_enabled     BOOLEAN NOT NULL DEFAULT true,
  volume            INTEGER NOT NULL DEFAULT 50,
  muted             BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table: `race_results`
```sql
CREATE TABLE race_results (
  id            SERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  player_name   VARCHAR(32) NOT NULL,
  wpm           REAL NOT NULL,
  accuracy      REAL NOT NULL,
  fire_streak   INTEGER NOT NULL DEFAULT 0,
  time_elapsed  REAL,
  chars_typed   INTEGER,
  errors        INTEGER,
  difficulty    VARCHAR(10) NOT NULL,
  category      VARCHAR(20) NOT NULL,
  is_ranked     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_results_user ON race_results(user_id);
CREATE INDEX idx_results_date ON race_results(created_at);
CREATE INDEX idx_results_ranked ON race_results(is_ranked, created_at);
```

### Table: `ratings`
```sql
CREATE TABLE ratings (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating      REAL NOT NULL DEFAULT 1500.0,
  rd          REAL NOT NULL DEFAULT 350.0,
  volatility  REAL NOT NULL DEFAULT 0.06,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  season      INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table: `seasons`
```sql
CREATE TABLE seasons (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false
);
```

### Table: `rating_history`
```sql
CREATE TABLE rating_history (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      REAL NOT NULL,
  rd          REAL NOT NULL,
  race_id     INTEGER REFERENCES race_results(id),
  season      INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rating_hist_user ON rating_history(user_id, created_at);
```

### Table: `shares`
```sql
CREATE TABLE shares (
  id VARCHAR(12) PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  race_result_id INTEGER REFERENCES race_results(id),
  wpm REAL NOT NULL,
  accuracy REAL NOT NULL,
  fire_streak INTEGER NOT NULL DEFAULT 0,
  difficulty VARCHAR(10) NOT NULL,
  rank_label VARCHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. Auth Architecture

### JWT Flow
- **Access token**: 15 min, `{ sub: userId, name: displayName, anon: boolean }`, HS256
- **Refresh token**: 30 days, HttpOnly/Secure/SameSite=Strict cookie, SHA-256 hash stored in `sessions`
- **Client**: access token in memory (React context), refresh via cookie
- **Electron**: refresh token via `safeStorage` in main process, sent as header

### OAuth Flow
1. Client redirects to `GET /auth/oauth/:provider`
2. Server redirects to provider authorization URL (Passport.js)
3. Callback at `GET /auth/oauth/:provider/callback`
4. Server upserts oauth_providers, creates/links users row
5. Issues tokens, redirects to `/#/auth-callback?token=<access_token>`

### Anonymous-to-Full Upgrade
1. Anonymous users get a `users` row with `is_anonymous=true` on first visit
2. Sign up (OAuth or email) updates existing row, preserves all race data
3. `POST /auth/claim-local` migrates localStorage history to server on first login

---

## 3. API Endpoints

### Auth (`/api/auth/`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | Email/password registration |
| POST | `/api/auth/login` | None | Email/password login |
| POST | `/api/auth/refresh` | Cookie | Refresh access token |
| POST | `/api/auth/logout` | Token | Invalidate session |
| GET | `/api/auth/oauth/:provider` | None | Initiate OAuth |
| GET | `/api/auth/oauth/:provider/callback` | None | OAuth callback |
| POST | `/api/auth/anon` | None | Create anonymous session |
| POST | `/api/auth/claim-local` | Token | Migrate localStorage |
| POST | `/api/auth/upgrade` | Token | Anonymous -> full |
| GET | `/api/auth/me` | Token | Current user + settings |

### User (`/api/user/`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/api/user/settings` | Token | Update settings |
| GET | `/api/user/settings` | Token | Get settings |
| PUT | `/api/user/profile` | Token | Update name/avatar |
| DELETE | `/api/user/account` | Token | Delete account |
| GET | `/api/user/stats` | Token | Personal stats |
| GET | `/api/user/history` | Token | Race history (paginated) |

### Leaderboard (`/api/leaderboard/`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/leaderboard/today` | None | Today's top WPM + streak |
| GET | `/api/leaderboard/season` | None | Current season rankings |
| GET | `/api/leaderboard/monthly` | None | Monthly leaderboard |
| GET | `/api/leaderboard/all-time` | None | All-time top players |

### Race (`/api/`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/results` | Optional | Submit race result |
| GET | `/api/passages` | None | List passages |
| GET | `/api/passages/random` | None | Random passage |
| GET | `/api/room/:code` | None | Room status check |

### Share
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/share` | Optional | Create share token |
| GET | `/api/share/:id` | None | Share data (JSON) |
| GET | `/api/share/:id/image.png` | None | Dynamic OG image |
| GET | `/share/:id` | None | Server-rendered OG HTML |

---

## 4. Client Routing (react-router-dom v6)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `WelcomeScreen` | Home / main menu |
| `/race` | `RacePage` | Active race |
| `/results` | `ResultsPage` | Post-race results |
| `/results/:shareId` | `ResultsPage` | Shared results (read-only) |
| `/settings` | `SettingsPage` | Settings |
| `/settings/account` | `AccountSettings` | Account management |
| `/join/:code` | `JoinRedirect` | Auto-join room |
| `/login` | `LoginPage` | Auth page |
| `/leaderboard` | `LeaderboardPage` | Full leaderboard |

**Electron**: Use `HashRouter` (detected via `window.electronAPI`), `BrowserRouter` for web.

---

## 5. Implementation Phases

### Phase 0: Foundation
- Set up PostgreSQL pool, migration runner, initial schema
- Migrate SQLite data to PostgreSQL
- Rewrite `server/src/db.ts` to use `pg`
- No user-visible changes

### Phase 1: Auth System
- JWT middleware, Passport.js OAuth strategies
- Anonymous session creation
- Login page (email/password + OAuth buttons)
- AuthContext + AuthHeader components
- React Router integration (biggest client refactor)
- WebSocket auth via JWT query param

### Phase 2: Settings Page
- Dedicated `/settings` route
- SettingsContext syncs to server or localStorage
- Move preferences out of WelcomeScreen
- Account management (linked providers, delete account)

### Phase 3: Ranking System
- Glicko-2 ratings, seasons table
- Ranked flag on multiplayer rooms
- Rating changes shown on results screen
- Full leaderboard page (today/season/all-time)

### Phase 4: Invite Links
- Memorable room codes (`adjective-noun-NN`)
- `/join/:code` route + JoinRedirect component
- Copy Link button in lobby

### Phase 5: Share + Rich Embeds
- `shares` table + nanoid IDs
- Server-rendered OG HTML at `/share/:id`
- Dynamic OG image via sharp/SVG template
- Share button on results screen
- Static OG fallback tags in `public/index.html`

---

## 6. Risk Areas

1. **App.tsx refactor** -- monolithic state machine -> React Router is the riskiest change. Mitigate with GameContext.
2. **Electron + BrowserRouter** -- `file://` doesn't support pushState. Use HashRouter for Electron, custom protocol for invite links.
3. **OAuth callbacks in prod** -- Traefik terminates TLS; server needs `PUBLIC_URL` env var for correct redirect URIs.
4. **WebSocket auth race** -- replace `setTimeout` hack with proper `auth` -> `auth-ok` handshake.
5. **Glicko-2 for multiplayer** -- designed for 1v1; handle pairwise outcomes for 3-4 player races.
6. **localStorage migration** -- `claim-local` must be idempotent (dedup on timestamp).
7. **No test runner** -- consider adding vitest for server-side auth/ranking logic.
