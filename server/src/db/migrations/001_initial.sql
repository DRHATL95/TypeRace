-- Initial schema: passages + race_results (migrated from SQLite)

CREATE TABLE IF NOT EXISTS passages (
  id          VARCHAR(32) PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  text        TEXT NOT NULL,
  difficulty  VARCHAR(10) NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  category    VARCHAR(20) NOT NULL CHECK(category IN ('sentences', 'pop-culture', 'random-words')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS race_results (
  id            SERIAL PRIMARY KEY,
  player_name   VARCHAR(32) NOT NULL,
  wpm           REAL NOT NULL,
  accuracy      REAL NOT NULL,
  fire_streak   INTEGER NOT NULL DEFAULT 0,
  difficulty    VARCHAR(10) NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  category      VARCHAR(20) NOT NULL CHECK(category IN ('sentences', 'pop-culture', 'random-words')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_results_date ON race_results(created_at);
