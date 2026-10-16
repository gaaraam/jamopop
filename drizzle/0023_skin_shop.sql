ALTER TABLE profiles ADD COLUMN skin_id TEXT;
ALTER TABLE members ADD COLUMN skin_id TEXT;
CREATE TABLE gold_rewards (play_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount IN(10,30)),won INTEGER NOT NULL,day TEXT NOT NULL);
CREATE INDEX gold_rewards_member ON gold_rewards(member_id);
CREATE TABLE skin_purchases (account_id TEXT NOT NULL,skin_id TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),purchased_at INTEGER NOT NULL,PRIMARY KEY(account_id,skin_id));
CREATE TRIGGER gold_on_play_update AFTER UPDATE OF status ON plays
WHEN OLD.status='playing' AND NEW.status IN('won','lost') AND json_array_length(NEW.guesses)>0
 AND EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND mode IN('daily','speed') AND retired_at IS NULL AND phase<>'interrupted')
BEGIN
 INSERT OR IGNORE INTO gold_rewards VALUES(NEW.id,NEW.member_id,CASE NEW.status WHEN 'won' THEN 30 ELSE 10 END,NEW.status='won',date(COALESCE(NEW.finished_at,NEW.updated_at)/1000,'unixepoch','+9 hours'));
END;
CREATE TRIGGER gold_on_play_insert AFTER INSERT ON plays
WHEN NEW.status IN('won','lost') AND json_array_length(NEW.guesses)>0
 AND EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND mode IN('daily','speed') AND retired_at IS NULL AND phase<>'interrupted')
BEGIN
 INSERT OR IGNORE INTO gold_rewards VALUES(NEW.id,NEW.member_id,CASE NEW.status WHEN 'won' THEN 30 ELSE 10 END,NEW.status='won',date(COALESCE(NEW.finished_at,NEW.updated_at)/1000,'unixepoch','+9 hours'));
END;
CREATE TRIGGER skin_on_member_insert AFTER INSERT ON members WHEN NEW.account_id IS NOT NULL
BEGIN
 UPDATE members SET skin_id=(SELECT skin_id FROM profiles WHERE id=NEW.account_id AND avatar=NEW.avatar) WHERE id=NEW.id;
END;
CREATE TRIGGER skin_on_member_avatar AFTER UPDATE OF avatar,account_id ON members
BEGIN
 UPDATE members SET skin_id=(SELECT skin_id FROM profiles WHERE id=NEW.account_id AND avatar=NEW.avatar) WHERE id=NEW.id;
END;
