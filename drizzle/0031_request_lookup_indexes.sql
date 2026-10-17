-- Additive lookup indexes only: preserve every existing row and identifier.
CREATE INDEX IF NOT EXISTS members_account_seen ON members(account_id,last_seen DESC);
CREATE INDEX IF NOT EXISTS members_unlinked_token ON members(token_hash) WHERE account_id IS NULL;
CREATE INDEX IF NOT EXISTS plays_member_status ON plays(member_id,status,round_id);
