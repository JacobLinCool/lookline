-- Cross-account participation (#37): a collection's owner asks a persona's manager to take part,
-- and the manager decides whether to join and which of that persona's cards to bring. Nobody's
-- card is pulled into a group without its manager saying so.
CREATE TABLE `collection_invites` (
	`collection_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`responded_at` integer,
	PRIMARY KEY(`collection_id`, `persona_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collection_invites_persona_idx` ON `collection_invites` (`persona_id`,`state`);
