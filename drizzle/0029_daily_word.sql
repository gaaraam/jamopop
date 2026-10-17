-- Independent from host-controlled room rounds; preserve all existing game records.
CREATE TABLE daily_puzzles (
 day TEXT PRIMARY KEY,
 answer TEXT NOT NULL,
 resets_at INTEGER NOT NULL,
 dictionary_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE daily_plays (
 owner TEXT NOT NULL,
 day TEXT NOT NULL REFERENCES daily_puzzles(day),
 guesses TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','won','lost')),
 revision INTEGER NOT NULL DEFAULT 0,
 finished_at INTEGER,
 PRIMARY KEY(owner,day)
);
