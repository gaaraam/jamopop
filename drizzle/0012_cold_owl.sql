CREATE TABLE `lobby_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lobby_message_request` ON `lobby_messages` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `lobby_message_time` ON `lobby_messages` (`owner`,`created_at`);