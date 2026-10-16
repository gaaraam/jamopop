CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
