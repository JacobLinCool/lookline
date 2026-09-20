CREATE TABLE `__new_feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text,
	`card_id` text,
	`intent_session_id` text,
	`kind` text NOT NULL,
	`reward` real DEFAULT 0 NOT NULL,
	`position` integer,
	`for_others` integer DEFAULT false NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_feedback_events`("id", "user_id", "article_id", "card_id", "intent_session_id", "kind", "reward", "position", "for_others", "context", "created_at") SELECT "id", "user_id", "article_id", NULL, "intent_session_id", "kind", "reward", "position", "for_others", "context", "created_at" FROM `feedback_events` WHERE "kind" IN ('impression', 'click', 'save', 'dismiss', 'add_to_bag', 'purchase');
