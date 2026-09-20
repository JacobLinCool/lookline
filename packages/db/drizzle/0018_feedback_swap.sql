PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `feedback_events`;--> statement-breakpoint
ALTER TABLE `__new_feedback_events` RENAME TO `feedback_events`;--> statement-breakpoint
CREATE INDEX `feedback_events_user_idx` ON `feedback_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `feedback_events_user_time_idx` ON `feedback_events` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `feedback_events_article_idx` ON `feedback_events` (`article_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
