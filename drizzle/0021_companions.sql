CREATE TABLE IF NOT EXISTS friendships (
 id TEXT PRIMARY KEY,
 requester TEXT NOT NULL,
 recipient TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 CHECK(requester<>recipient)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair ON friendships(min(requester,recipient),max(requester,recipient));
CREATE INDEX IF NOT EXISTS friendships_recipient ON friendships(recipient,status);
CREATE INDEX IF NOT EXISTS friendships_requester ON friendships(requester,status);
CREATE TABLE IF NOT EXISTS account_presence(account_id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL);
