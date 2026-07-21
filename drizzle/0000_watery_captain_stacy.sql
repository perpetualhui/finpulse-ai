CREATE TABLE `news_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`issue` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload` text NOT NULL
);
