-- Additive only: existing rooms stay public and records remain untouched.
ALTER TABLE rooms ADD COLUMN password_hash TEXT;
CREATE TABLE room_join_attempts (
 room_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 window INTEGER NOT NULL,
 attempts INTEGER NOT NULL,
 PRIMARY KEY(room_id,fingerprint)
);
