CREATE TABLE `activity_sharing` (
	`user_id` text PRIMARY KEY NOT NULL,
	`purchases` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`low_user_id` text NOT NULL,
	`high_user_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`low_user_id`, `high_user_id`),
	FOREIGN KEY (`low_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`high_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "friendships_ordered" CHECK("friendships"."low_user_id" < "friendships"."high_user_id"),
	CONSTRAINT "friendships_requester" CHECK("friendships"."requested_by" in ("friendships"."low_user_id", "friendships"."high_user_id"))
);
--> statement-breakpoint
CREATE INDEX `friendships_low_state_idx` ON `friendships` (`low_user_id`,`state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `friendships_high_state_idx` ON `friendships` (`high_user_id`,`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `recent_article_views` (
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`viewed_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `article_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recent_article_views_user_time_idx` ON `recent_article_views` (`user_id`,`viewed_at`,`article_id`);--> statement-breakpoint
ALTER TABLE `cards` ADD `visibility` text DEFAULT 'link' NOT NULL;--> statement-breakpoint
CREATE INDEX `cards_author_visibility_time_idx` ON `cards` (`author_user_id`,`visibility`,`issued_at`);--> statement-breakpoint
CREATE INDEX `articles_home_trending_idx` ON `articles` (`trend_score`,`popularity`,`article_id`);--> statement-breakpoint
CREATE INDEX `feedback_events_user_time_idx` ON `feedback_events` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `purchases_user_time_idx` ON `purchases` (`user_id`,`created_at`);
--> statement-breakpoint
INSERT INTO recent_article_views (user_id, article_id, viewed_at)
SELECT actor_user_id, article_id, max(created_at) FROM interactions
WHERE type = 'VIEW' AND article_id IS NOT NULL AND actor_user_id IS NOT NULL
GROUP BY actor_user_id, article_id;
