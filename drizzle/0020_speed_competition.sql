ALTER TABLE rooms ADD active_speed_id TEXT;
CREATE TRIGGER speed_round_record AFTER INSERT ON speed_rounds BEGIN
 INSERT INTO rounds(id,room_id,mode,answer,starts_at,ends_at,width,dictionary_version,variant,phase) VALUES(NEW.id,NEW.room_id,'speed','',NEW.starts_at,NEW.ends_at,5,1,'speed','running');
 UPDATE rooms SET active_speed_id=NEW.id WHERE id=NEW.room_id;
END;
CREATE TRIGGER speed_play_record_insert AFTER INSERT ON speed_plays
 WHEN EXISTS(SELECT 1 FROM json_each(NEW.state,'$.puzzles') q,json_each(q.value,'$.guesses'))
 BEGIN
 INSERT INTO plays(id,round_id,member_id,guesses,status,finished_at,updated_at)
 SELECT 'speed:'||NEW.round_id||':'||NEW.member_id,NEW.round_id,NEW.member_id,
 (SELECT json_group_array(json(g.value)) FROM json_each(NEW.state,'$.puzzles') q,json_each(q.value,'$.guesses') g),
 CASE WHEN (SELECT count(*) FROM json_each(NEW.state,'$.puzzles') WHERE json_extract(value,'$.status')='won')=5 THEN 'won'
 WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.state,'$.puzzles') WHERE json_extract(value,'$.status')='open') THEN 'lost' ELSE 'playing' END,
 CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.state,'$.puzzles') WHERE json_extract(value,'$.status')='open') THEN NEW.updated_at ELSE NULL END,NEW.updated_at
 ON CONFLICT(round_id,member_id) DO UPDATE SET guesses=excluded.guesses,status=excluded.status,finished_at=excluded.finished_at,updated_at=excluded.updated_at;
 END;
CREATE TRIGGER speed_play_record_update AFTER UPDATE OF state ON speed_plays
 WHEN EXISTS(SELECT 1 FROM json_each(NEW.state,'$.puzzles') q,json_each(q.value,'$.guesses'))
 BEGIN
 INSERT INTO plays(id,round_id,member_id,guesses,status,finished_at,updated_at)
 SELECT 'speed:'||NEW.round_id||':'||NEW.member_id,NEW.round_id,NEW.member_id,
 (SELECT json_group_array(json(g.value)) FROM json_each(NEW.state,'$.puzzles') q,json_each(q.value,'$.guesses') g),
 CASE WHEN (SELECT count(*) FROM json_each(NEW.state,'$.puzzles') WHERE json_extract(value,'$.status')='won')=5 THEN 'won'
 WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.state,'$.puzzles') WHERE json_extract(value,'$.status')='open') THEN 'lost' ELSE 'playing' END,
 CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(NEW.state,'$.puzzles') WHERE json_extract(value,'$.status')='open') THEN NEW.updated_at ELSE NULL END,NEW.updated_at
 ON CONFLICT(round_id,member_id) DO UPDATE SET guesses=excluded.guesses,status=excluded.status,finished_at=excluded.finished_at,updated_at=excluded.updated_at;
 END;
INSERT OR IGNORE INTO rounds(id,room_id,mode,answer,starts_at,ends_at,width,dictionary_version,variant,phase) SELECT id,room_id,'speed','',starts_at,ends_at,5,1,'speed','running' FROM speed_rounds;
UPDATE speed_plays SET state=state;
UPDATE plays SET status='lost',finished_at=(SELECT ends_at FROM rounds WHERE id=plays.round_id) WHERE status='playing' AND round_id IN(SELECT id FROM speed_rounds WHERE ends_at<=unixepoch()*1000);

UPDATE rooms SET active_speed_id=(SELECT id FROM speed_rounds WHERE room_id=rooms.id ORDER BY starts_at DESC,id DESC LIMIT 1) WHERE EXISTS(SELECT 1 FROM speed_rounds sr WHERE sr.id=(SELECT id FROM speed_rounds WHERE room_id=rooms.id ORDER BY starts_at DESC,id DESC LIMIT 1) AND sr.ends_at>unixepoch()*1000);
