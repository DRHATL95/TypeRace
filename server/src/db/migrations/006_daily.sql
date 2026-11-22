-- Daily Challenge: rows submitted as today's daily run carry the date they
-- counted for. NULL for every ordinary race (and all legacy rows), so the
-- partial index only covers daily runs.
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS daily_date DATE;

CREATE INDEX IF NOT EXISTS idx_results_daily ON race_results(daily_date) WHERE daily_date IS NOT NULL;
