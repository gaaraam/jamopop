-- First-party gameplay counts. No visitor/session/account identity or game-table references.
CREATE TABLE IF NOT EXISTS product_events (
  id TEXT PRIMARY KEY,
  run TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('home','lobby','hub','daily','word','exit','stack','toktok','room','practice','speed')),
  name TEXT NOT NULL CHECK(name IN ('view','start','first_action','complete','retry','next')),
  outcome TEXT CHECK(outcome IN ('won','lost','timeout','abandoned')),
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(run,mode,name)
);
CREATE INDEX IF NOT EXISTS product_events_expiry ON product_events(expires_at);
CREATE INDEX IF NOT EXISTS product_events_time ON product_events(created_at,mode);
