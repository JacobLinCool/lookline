CREATE TABLE `card_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`image_path` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `card_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `generation_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_candidates_session_idx` ON `card_candidates` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_candidates_position_idx` ON `card_candidates` (`session_id`,`position`);--> statement-breakpoint
CREATE TABLE `card_copies` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`beneficiary_persona_id` text NOT NULL,
	`edition_number` integer NOT NULL,
	`verification_code` text NOT NULL,
	`issued_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `collection_editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`beneficiary_persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_copies_persona_idx` ON `card_copies` (`beneficiary_persona_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_copies_verification_idx` ON `card_copies` (`verification_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_copies_number_idx` ON `card_copies` (`edition_id`,`edition_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_copies_beneficiary_idx` ON `card_copies` (`edition_id`,`beneficiary_persona_id`);--> statement-breakpoint
CREATE TABLE `card_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`reserve_operation_key` text NOT NULL,
	`max_candidates` integer DEFAULT 4 NOT NULL,
	`article_snapshot` text DEFAULT '[]' NOT NULL,
	`expires_at` integer NOT NULL,
	`settled_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_sessions_owner_idx` ON `card_sessions` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `card_sessions_persona_idx` ON `card_sessions` (`persona_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_sessions_reserve_idx` ON `card_sessions` (`reserve_operation_key`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`image_path` text NOT NULL,
	`verification_code` text NOT NULL,
	`tier` text NOT NULL,
	`owned_ratio` real DEFAULT 0 NOT NULL,
	`article_snapshot` text DEFAULT '[]' NOT NULL,
	`issued_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `card_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `card_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cards_persona_idx` ON `cards` (`persona_id`);--> statement-breakpoint
CREATE INDEX `cards_author_idx` ON `cards` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_verification_idx` ON `cards` (`verification_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_session_idx` ON `cards` (`session_id`);--> statement-breakpoint
CREATE TABLE `collection_editions` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`session_id` text NOT NULL,
	`image_path` text NOT NULL,
	`edition_size` integer NOT NULL,
	`issued_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `card_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collection_editions_collection_idx` ON `collection_editions` (`collection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_editions_session_idx` ON `collection_editions` (`session_id`);--> statement-breakpoint
CREATE TABLE `collection_members` (
	`collection_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`card_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`collection_id`, `persona_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collection_members_persona_idx` ON `collection_members` (`persona_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collections_owner_idx` ON `collections` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`purchase_id` text,
	`session_id` text,
	`rule_version` text NOT NULL,
	`operation_key` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_owner_idx` ON `credit_ledger` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `credit_ledger_session_idx` ON `credit_ledger` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_operation_idx` ON `credit_ledger` (`operation_key`);--> statement-breakpoint
CREATE TABLE `generation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`provider` text,
	`error` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `card_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_attempts_session_idx` ON `generation_attempts` (`session_id`);--> statement-breakpoint
CREATE TABLE `persona_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`persona_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`persona_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`settled_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `persona_transfers_persona_idx` ON `persona_transfers` (`persona_id`);--> statement-breakpoint
CREATE INDEX `persona_transfers_to_idx` ON `persona_transfers` (`to_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `persona_transfers_pending_idx` ON `persona_transfers` (`persona_id`) WHERE state = 'pending';--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text DEFAULT 'person' NOT NULL,
	`reference_path` text,
	`avatar_seed` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `personas_owner_idx` ON `personas` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `wardrobe_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`article_id` text NOT NULL,
	`size` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wardrobe_entitlements_owner_idx` ON `wardrobe_entitlements` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `wardrobe_entitlements_article_idx` ON `wardrobe_entitlements` (`article_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wardrobe_entitlements_purchase_idx` ON `wardrobe_entitlements` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `wardrobe_loans` (
	`id` text PRIMARY KEY NOT NULL,
	`entitlement_id` text NOT NULL,
	`lender_user_id` text NOT NULL,
	`borrower_user_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`entitlement_id`) REFERENCES `wardrobe_entitlements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`borrower_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wardrobe_loans_borrower_idx` ON `wardrobe_loans` (`borrower_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wardrobe_loans_active_idx` ON `wardrobe_loans` (`entitlement_id`,`borrower_user_id`) WHERE state = 'active';
