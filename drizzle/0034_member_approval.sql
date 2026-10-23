-- Existing Google members retain access; subsequent inserts default to pending.
ALTER TABLE google_accounts ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','rejected'));
ALTER TABLE google_accounts ADD COLUMN approval_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE google_accounts ADD COLUMN reviewed_at INTEGER;
ALTER TABLE google_accounts ADD COLUMN reviewed_by TEXT;
UPDATE google_accounts SET approval_status='approved';
CREATE INDEX google_accounts_approval ON google_accounts(approval_status,created_at);
