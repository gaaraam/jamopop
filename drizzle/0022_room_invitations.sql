CREATE TABLE IF NOT EXISTS room_invitations (
 id TEXT PRIMARY KEY,
 sender TEXT NOT NULL,
 recipient TEXT NOT NULL,
 room_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','dismissed')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 UNIQUE(sender,recipient,room_id),
 CHECK(sender<>recipient)
);
CREATE INDEX IF NOT EXISTS room_invitations_inbox ON room_invitations(recipient,status,expires_at);
CREATE INDEX IF NOT EXISTS room_invitations_sender ON room_invitations(sender,created_at);
