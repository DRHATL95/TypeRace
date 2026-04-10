-- Share links for race results with OG embed support
CREATE TABLE IF NOT EXISTS shares (
  id          VARCHAR(12) PRIMARY KEY,
  user_id     VARCHAR(64),
  wpm         REAL NOT NULL,
  accuracy    REAL NOT NULL,
  fire_streak INTEGER NOT NULL DEFAULT 0,
  difficulty  VARCHAR(10) NOT NULL,
  category    VARCHAR(20) NOT NULL,
  rank_label  VARCHAR(2),
  player_name VARCHAR(32),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
