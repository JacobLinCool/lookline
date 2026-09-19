-- Asks are retired (#32). Their rows go with them: the ASK / ADVISE edges, the `ask_choice`
-- feedback and the `asks` / `trusts` relationships had no other source. `interactions.ask_id`
-- is cleared before `asks` is dropped, because D1 enforces foreign keys whatever PRAGMA says.
DELETE FROM `interactions` WHERE `type` IN ('ASK', 'ADVISE');--> statement-breakpoint
UPDATE `interactions` SET `ask_id` = NULL WHERE `ask_id` IS NOT NULL;--> statement-breakpoint
DELETE FROM `feedback_events` WHERE `kind` = 'ask_choice';--> statement-breakpoint
DELETE FROM `relationships` WHERE `kind` IN ('asks', 'trusts');--> statement-breakpoint
DROP TABLE `ask_responses`;--> statement-breakpoint
DROP TABLE `asks`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_user_id` text,
	`look_id` text,
	`article_id` text,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`source_interaction_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_interactions`("id", "actor_user_id", "target_user_id", "look_id", "article_id", "type", "payload", "source_interaction_id", "created_at") SELECT "id", "actor_user_id", "target_user_id", "look_id", "article_id", "type", "payload", "source_interaction_id", "created_at" FROM `interactions`;--> statement-breakpoint
DROP TABLE `interactions`;--> statement-breakpoint
ALTER TABLE `__new_interactions` RENAME TO `interactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `interactions_actor_idx` ON `interactions` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `interactions_target_idx` ON `interactions` (`target_user_id`);--> statement-breakpoint
CREATE INDEX `interactions_look_idx` ON `interactions` (`look_id`);--> statement-breakpoint
CREATE INDEX `interactions_article_idx` ON `interactions` (`article_id`);--> statement-breakpoint
CREATE INDEX `interactions_type_idx` ON `interactions` (`type`);--> statement-breakpoint
CREATE INDEX `interactions_created_idx` ON `interactions` (`created_at`);--> statement-breakpoint
ALTER TABLE `lineage_stats` DROP COLUMN `asks`;--> statement-breakpoint
ALTER TABLE `purchases` DROP COLUMN `source_ask_id`;