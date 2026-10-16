ALTER TABLE `rooms` ADD `current_round_id` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `round_no` integer DEFAULT 0 NOT NULL;