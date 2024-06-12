CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`url` text,
	`excerpt` text,
	`raw_data` blob,
	`time_added` integer
);
