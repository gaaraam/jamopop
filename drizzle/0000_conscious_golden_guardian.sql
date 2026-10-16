CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`last_seen` integer NOT NULL,
	`practice_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_room_token` ON `members` (`room_id`,`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_room_name` ON `members` (`room_id`,`name`);--> statement-breakpoint
CREATE TABLE `plays` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`member_id` text NOT NULL,
	`guesses` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'playing' NOT NULL,
	`finished_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plays_round_member` ON `plays` (`round_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`member_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reactions_room_time` ON `reactions` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host_id` text NOT NULL,
	`live_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`mode` text NOT NULL,
	`answer` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`owner_id` text
);
--> statement-breakpoint
CREATE INDEX `rounds_room` ON `rounds` (`room_id`);