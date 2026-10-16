CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_owner_request` ON `inquiries` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `inquiries_owner_created` ON `inquiries` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `inquiries_updated` ON `inquiries` (`updated_at`);