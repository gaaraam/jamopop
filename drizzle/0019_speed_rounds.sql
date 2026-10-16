CREATE TABLE speed_rounds(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,theme TEXT NOT NULL,answers TEXT NOT NULL,starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL);
CREATE INDEX speed_room_time ON speed_rounds(room_id,starts_at DESC);
CREATE TABLE speed_plays(round_id TEXT NOT NULL,member_id TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(round_id,member_id));
