CREATE TABLE IF NOT EXISTS derived_revision (id INTEGER PRIMARY KEY,version INTEGER NOT NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO derived_revision VALUES(1,0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_plays_insert AFTER INSERT ON plays BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_plays_update AFTER UPDATE ON plays BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_plays_delete AFTER DELETE ON plays BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_rounds_insert AFTER INSERT ON rounds BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_rounds_update AFTER UPDATE ON rounds BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_rounds_delete AFTER DELETE ON rounds BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_profiles_insert AFTER INSERT ON profiles BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_profiles_update AFTER UPDATE ON profiles BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_profiles_delete AFTER DELETE ON profiles BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_account_cosmetics_insert AFTER INSERT ON account_cosmetics BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_account_cosmetics_update AFTER UPDATE ON account_cosmetics BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_account_cosmetics_delete AFTER DELETE ON account_cosmetics BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_solo_progress_insert AFTER INSERT ON solo_progress BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_solo_progress_update AFTER UPDATE ON solo_progress BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_solo_progress_delete AFTER DELETE ON solo_progress BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_members_insert AFTER INSERT ON members BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_members_update AFTER UPDATE OF account_id,name,avatar,blocked ON members BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS derived_members_delete AFTER DELETE ON members BEGIN UPDATE derived_revision SET version=version+1 WHERE id=1; END;
