-- Multiplayer match results — one row per player per match
CREATE TABLE IF NOT EXISTS multiplayer_results (
  id SERIAL PRIMARY KEY,
  match_id VARCHAR(32) NOT NULL,
  room_code VARCHAR(32) NOT NULL,
  mode VARCHAR(10) NOT NULL DEFAULT 'casual',
  user_id VARCHAR(64),
  player_name VARCHAR(32) NOT NULL,
  wpm REAL NOT NULL,
  accuracy REAL NOT NULL,
  fire_streak INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  difficulty VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_results_user ON multiplayer_results(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mp_results_match ON multiplayer_results(match_id);
CREATE INDEX IF NOT EXISTS idx_mp_results_mode ON multiplayer_results(mode, created_at DESC);
