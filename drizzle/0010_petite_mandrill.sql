CREATE TABLE `solo_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`stage` integer NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`stars` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `solo_runs_owner` ON `solo_runs` (`owner`);--> statement-breakpoint
CREATE INDEX `solo_runs_updated` ON `solo_runs` (`updated_at`);--> statement-breakpoint
INSERT INTO solo_runs SELECT json_extract(state,'$.active.id'),owner,json_extract(state,'$.active.stage'),json_extract(state,'$.active.status'),json_array_length(json_extract(state,'$.active.guesses')),json_extract(state,'$.active.stars'),json_extract(state,'$.active.startedAt'),json_extract(state,'$.active.endsAt'),json_extract(state,'$.active.startedAt') FROM solo_progress WHERE json_extract(state,'$.active.id') IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER solo_run_after_update AFTER UPDATE OF state ON solo_progress WHEN json_extract(NEW.state,'$.active.id') IS NOT NULL BEGIN
INSERT INTO solo_runs VALUES(json_extract(NEW.state,'$.active.id'),NEW.owner,json_extract(NEW.state,'$.active.stage'),json_extract(NEW.state,'$.active.status'),json_array_length(json_extract(NEW.state,'$.active.guesses')),json_extract(NEW.state,'$.active.stars'),json_extract(NEW.state,'$.active.startedAt'),json_extract(NEW.state,'$.active.endsAt'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) ON CONFLICT(id) DO UPDATE SET status=excluded.status,attempts=excluded.attempts,stars=excluded.stars,updated_at=excluded.updated_at;
END;
