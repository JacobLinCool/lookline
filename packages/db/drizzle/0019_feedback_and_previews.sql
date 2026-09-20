PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `feedback_events_card_idx` ON `feedback_events` (`card_id`);--> statement-breakpoint
CREATE INDEX `feedback_events_created_idx` ON `feedback_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_events_session_idx` ON `feedback_events` (`intent_session_id`);--> statement-breakpoint
CREATE TABLE `__new_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_card_id` text,
	`title` text NOT NULL,
	`style_preset` text NOT NULL,
	`occasion` text,
	`reference_path` text NOT NULL,
	`image_path` text,
	`image_status` text DEFAULT 'pending' NOT NULL,
	`image_provider` text,
	`image_generation_id` text,
	`image_started_at` integer,
	`image_error` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_previews`("id", "owner_id", "source_card_id", "title", "style_preset", "occasion", "reference_path", "image_path", "image_status", "image_provider", "image_generation_id", "image_started_at", "image_error", "expires_at", "created_at") SELECT "id", "owner_id", NULL, "title", "style_preset", "occasion", "reference_path", "image_path", "image_status", "image_provider", "image_generation_id", "image_started_at", "image_error", "expires_at", "created_at" FROM `previews`;--> statement-breakpoint
DROP TABLE `previews`;--> statement-breakpoint
ALTER TABLE `__new_previews` RENAME TO `previews`;--> statement-breakpoint
CREATE INDEX `previews_owner_idx` ON `previews` (`owner_id`);--> statement-breakpoint
CREATE INDEX `previews_source_card_idx` ON `previews` (`source_card_id`);--> statement-breakpoint
CREATE INDEX `previews_expires_idx` ON `previews` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
