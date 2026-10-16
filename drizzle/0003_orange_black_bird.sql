CREATE TABLE `live_participants` (
	`round_id` text NOT NULL,
	`member_id` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_participants_round_member` ON `live_participants` (`round_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `blocked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `invite_code` text;--> statement-breakpoint
ALTER TABLE `rounds` ADD `width` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `phase` text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `restricted` integer DEFAULT 0 NOT NULL;