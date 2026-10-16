CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`member_id` text NOT NULL,
	`request_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_room_id` ON `chat_messages` (`room_id`,`id`);--> statement-breakpoint
CREATE INDEX `chat_member_time` ON `chat_messages` (`member_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_member_request` ON `chat_messages` (`member_id`,`request_id`);