CREATE TABLE `account_cosmetics` (
	`account_id` text PRIMARY KEY NOT NULL,
	`name_color` text DEFAULT 'default' NOT NULL,
	`avatar_frame` text DEFAULT 'none' NOT NULL
);
