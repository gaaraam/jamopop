CREATE TABLE kongal_homes (
 account_id TEXT PRIMARY KEY,
 layout TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
