CREATE TABLE `drawing_hints` (
	`round_id` text NOT NULL,
	`member_id` text NOT NULL,
	`strokes` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hint_round_member` ON `drawing_hints` (`round_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `earned_titles` (
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`earned_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `earned_title_owner` ON `earned_titles` (`owner`,`title`);--> statement-breakpoint
CREATE TABLE `equipped_titles` (
	`owner` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_events` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`actor` text NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`effect` text NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_events_round` ON `item_events` (`round_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `item_loadouts` (
	`round_id` text NOT NULL,
	`member_id` text NOT NULL,
	`ends_at` integer NOT NULL,
	`attack_used` integer DEFAULT 0 NOT NULL,
	`support` text NOT NULL,
	`support_used` integer DEFAULT 0 NOT NULL,
	`defense` text DEFAULT '' NOT NULL,
	`damage` integer DEFAULT 0 NOT NULL,
	`protected_until` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loadout_round_member` ON `item_loadouts` (`round_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `spectators` (
	`round_id` text NOT NULL,
	`member_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spectator_round_member` ON `spectators` (`round_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `channel` text DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `spectator` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `variant` text DEFAULT 'normal' NOT NULL;