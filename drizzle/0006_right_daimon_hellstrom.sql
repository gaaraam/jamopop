CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `members` ADD `last_active` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `members_room_account` ON `members` (`room_id`,`account_id`);