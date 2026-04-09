-- Add Clerk user_id to race_results for authenticated users
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_results_user ON race_results(user_id) WHERE user_id IS NOT NULL;
