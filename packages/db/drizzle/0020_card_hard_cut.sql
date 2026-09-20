PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `interactions`;--> statement-breakpoint
DROP TABLE `lineage_stats`;--> statement-breakpoint
DROP TABLE `look_articles`;--> statement-breakpoint
DROP TABLE `look_participants`;--> statement-breakpoint
DROP TABLE `looks`;--> statement-breakpoint
DROP TABLE `relationships`;--> statement-breakpoint
DROP INDEX `purchases_source_look_idx`;--> statement-breakpoint
ALTER TABLE `purchases` ADD `source_card_id` text REFERENCES cards(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `purchases_source_card_idx` ON `purchases` (`source_card_id`);--> statement-breakpoint
ALTER TABLE `purchases` DROP COLUMN `source_look_id`;--> statement-breakpoint
ALTER TABLE `purchases` DROP COLUMN `source_interaction_id`;--> statement-breakpoint
DROP INDEX `users_social_cluster_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `social_cluster`;--> statement-breakpoint
ALTER TABLE `card_sessions` ADD `art_direction` text DEFAULT '{"focus":"auto","pose":"auto","scene":"auto","note":null}' NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_attempts` ADD `art_direction` text DEFAULT '{"focus":"auto","pose":"auto","scene":"auto","note":null}' NOT NULL;--> statement-breakpoint
ALTER TABLE `trend_signals` ADD `breadth` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trend_signals` DROP COLUMN `cross_cluster`;--> statement-breakpoint
ALTER TABLE `sim_personas` DROP COLUMN `social_cluster`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
