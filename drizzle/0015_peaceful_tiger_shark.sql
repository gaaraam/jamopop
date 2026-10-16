CREATE TABLE `hint_views` (
	`round_id` text NOT NULL,
	`member_id` text NOT NULL,
	`viewed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hint_view_round_member` ON `hint_views` (`round_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `rounds` ADD `hint_policy` integer DEFAULT 0 NOT NULL;