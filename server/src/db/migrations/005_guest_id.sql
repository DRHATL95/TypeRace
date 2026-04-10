-- Guest identity: stable pseudonymous ID for anonymous users across races.
-- Stored alongside (not instead of) Clerk user_id so authed users keep full
-- cross-device sync while guests get device-local continuity they can opt
-- into sharing across devices via a copy/paste code in Settings.

ALTER TABLE race_results        ADD COLUMN IF NOT EXISTS guest_id VARCHAR(64);
ALTER TABLE multiplayer_results ADD COLUMN IF NOT EXISTS guest_id VARCHAR(64);
ALTER TABLE shares              ADD COLUMN IF NOT EXISTS guest_id VARCHAR(64);

-- Partial indexes: only authed or guest-tagged rows get indexed, so the
-- index stays small and legacy anonymous rows (no user_id, no guest_id)
-- don't cost anything.
CREATE INDEX IF NOT EXISTS idx_results_guest    ON race_results(guest_id)        WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mp_results_guest ON multiplayer_results(guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shares_guest     ON shares(guest_id)              WHERE guest_id IS NOT NULL;
