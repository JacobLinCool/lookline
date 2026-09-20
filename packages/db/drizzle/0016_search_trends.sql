CREATE TABLE `home_trend` (
	`id` integer PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`style_query` text NOT NULL,
	`rationale` text NOT NULL,
	`matches` integer DEFAULT 0 NOT NULL,
	`computed_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_trends` (
	`id` text PRIMARY KEY NOT NULL,
	`rank` integer NOT NULL,
	`signal` text NOT NULL,
	`heat` text,
	`news_title` text,
	`source_url` text,
	`fetched_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `search_trends_rank_idx` ON `search_trends` (`rank`);