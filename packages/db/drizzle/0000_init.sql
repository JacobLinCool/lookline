CREATE TABLE `articles` (
	`article_id` text PRIMARY KEY NOT NULL,
	`brand_id` integer NOT NULL,
	`product_code` text NOT NULL,
	`prod_name` text NOT NULL,
	`detail_desc` text DEFAULT '' NOT NULL,
	`product_type_name` text NOT NULL,
	`product_group_name` text NOT NULL,
	`garment_group_name` text DEFAULT '' NOT NULL,
	`section_name` text DEFAULT '' NOT NULL,
	`index_name` text NOT NULL,
	`index_group_name` text NOT NULL,
	`graphical_appearance_name` text DEFAULT '' NOT NULL,
	`colour_group_name` text DEFAULT '' NOT NULL,
	`perceived_colour_master_name` text DEFAULT '' NOT NULL,
	`perceived_colour_value_name` text DEFAULT '' NOT NULL,
	`category_group` text NOT NULL,
	`outfit_role` text NOT NULL,
	`department` text NOT NULL,
	`slug` text NOT NULL,
	`colour_hex` text DEFAULT '#9E9E9E' NOT NULL,
	`size_system` text NOT NULL,
	`sizes` text DEFAULT '[]' NOT NULL,
	`image_path` text,
	`price` integer DEFAULT 0 NOT NULL,
	`tier` text DEFAULT 'mid' NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL,
	`first_sold_at` integer,
	`last_sold_at` integer,
	`online_ratio` real DEFAULT 0 NOT NULL,
	`popularity` real DEFAULT 0 NOT NULL,
	`trend_score` real DEFAULT 0 NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`fit` text DEFAULT '' NOT NULL,
	`silhouette` text DEFAULT '' NOT NULL,
	`silhouette_id` text DEFAULT '' NOT NULL,
	`length` text DEFAULT '' NOT NULL,
	`neckline` text DEFAULT '' NOT NULL,
	`sleeve` text DEFAULT '' NOT NULL,
	`closure` text DEFAULT '' NOT NULL,
	`secondary_color_hex` text,
	`seasons` text DEFAULT '[]' NOT NULL,
	`occasions` text DEFAULT '[]' NOT NULL,
	`aesthetics` text DEFAULT '[]' NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`style_vector` text NOT NULL,
	`stock` integer DEFAULT 1 NOT NULL,
	`rating` real DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`image_seed` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_idx` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `articles_brand_idx` ON `articles` (`brand_id`);--> statement-breakpoint
CREATE INDEX `articles_product_code_idx` ON `articles` (`product_code`);--> statement-breakpoint
CREATE INDEX `articles_department_idx` ON `articles` (`department`);--> statement-breakpoint
CREATE INDEX `articles_category_group_idx` ON `articles` (`category_group`);--> statement-breakpoint
CREATE INDEX `articles_outfit_role_idx` ON `articles` (`outfit_role`);--> statement-breakpoint
CREATE INDEX `articles_product_type_idx` ON `articles` (`product_type_name`);--> statement-breakpoint
CREATE INDEX `articles_price_idx` ON `articles` (`price`);--> statement-breakpoint
CREATE INDEX `articles_dept_group_price_idx` ON `articles` (`department`,`category_group`,`price`);--> statement-breakpoint
CREATE INDEX `articles_popularity_idx` ON `articles` (`popularity`);--> statement-breakpoint
CREATE TABLE `ask_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`ask_id` text NOT NULL,
	`responder_user_id` text,
	`responder_name` text,
	`choice_article_id` text,
	`styled_look_id` text,
	`comment` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`ask_id`) REFERENCES `asks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responder_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`choice_article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`styled_look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ask_responses_ask_idx` ON `ask_responses` (`ask_id`);--> statement-breakpoint
CREATE INDEX `ask_responses_responder_idx` ON `ask_responses` (`responder_user_id`);--> statement-breakpoint
CREATE TABLE `asks` (
	`id` text PRIMARY KEY NOT NULL,
	`asker_id` text NOT NULL,
	`target_user_id` text,
	`kind` text NOT NULL,
	`question` text NOT NULL,
	`option_article_ids` text DEFAULT '[]' NOT NULL,
	`look_id` text,
	`budget` integer,
	`occasion` text,
	`share_token` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`asker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asks_asker_idx` ON `asks` (`asker_id`);--> statement-breakpoint
CREATE INDEX `asks_target_idx` ON `asks` (`target_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asks_share_token_idx` ON `asks` (`share_token`);--> statement-breakpoint
CREATE TABLE `bandit_state` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tier` text NOT NULL,
	`home_aesthetics` text DEFAULT '[]' NOT NULL,
	`home_departments` text DEFAULT '[]' NOT NULL,
	`price_multiplier` real DEFAULT 1 NOT NULL,
	`origin` text,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_slug_idx` ON `brands` (`slug`);--> statement-breakpoint
CREATE TABLE `evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`summary` text DEFAULT '{}' NOT NULL,
	`series` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evaluation_runs_created_idx` ON `evaluation_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `feedback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text,
	`look_id` text,
	`intent_session_id` text,
	`kind` text NOT NULL,
	`reward` real DEFAULT 0 NOT NULL,
	`position` integer,
	`for_others` integer DEFAULT false NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_events_user_idx` ON `feedback_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `feedback_events_article_idx` ON `feedback_events` (`article_id`);--> statement-breakpoint
CREATE INDEX `feedback_events_created_idx` ON `feedback_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_events_session_idx` ON `feedback_events` (`intent_session_id`);--> statement-breakpoint
CREATE TABLE `intent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`utterance` text NOT NULL,
	`locale` text,
	`intent` text NOT NULL,
	`intent_vector` text,
	`results` text DEFAULT '{}' NOT NULL,
	`provider` text DEFAULT 'offline' NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `intent_sessions_user_idx` ON `intent_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `intent_sessions_created_idx` ON `intent_sessions` (`created_at`);--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_user_id` text,
	`look_id` text,
	`article_id` text,
	`ask_id` text,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`source_interaction_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ask_id`) REFERENCES `asks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interactions_actor_idx` ON `interactions` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `interactions_target_idx` ON `interactions` (`target_user_id`);--> statement-breakpoint
CREATE INDEX `interactions_look_idx` ON `interactions` (`look_id`);--> statement-breakpoint
CREATE INDEX `interactions_article_idx` ON `interactions` (`article_id`);--> statement-breakpoint
CREATE INDEX `interactions_type_idx` ON `interactions` (`type`);--> statement-breakpoint
CREATE INDEX `interactions_created_idx` ON `interactions` (`created_at`);--> statement-breakpoint
CREATE TABLE `lineage_stats` (
	`root_look_id` text PRIMARY KEY NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`nodes` integer DEFAULT 1 NOT NULL,
	`unique_people` integer DEFAULT 1 NOT NULL,
	`clusters_reached` integer DEFAULT 1 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`asks` integer DEFAULT 0 NOT NULL,
	`remixes` integer DEFAULT 0 NOT NULL,
	`purchases` integer DEFAULT 0 NOT NULL,
	`gmv` integer DEFAULT 0 NOT NULL,
	`velocity` real DEFAULT 0 NOT NULL,
	`share_to_remix_rate` real DEFAULT 0 NOT NULL,
	`remix_to_purchase_rate` real DEFAULT 0 NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`computed_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`root_look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `look_articles` (
	`look_id` text NOT NULL,
	`article_id` text NOT NULL,
	`role` text,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`look_id`, `article_id`),
	FOREIGN KEY (`look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `look_articles_article_idx` ON `look_articles` (`article_id`);--> statement-breakpoint
CREATE TABLE `look_participants` (
	`look_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_look_id` text,
	PRIMARY KEY(`look_id`, `user_id`),
	FOREIGN KEY (`look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `look_participants_user_idx` ON `look_participants` (`user_id`);--> statement-breakpoint
CREATE TABLE `looks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text DEFAULT 'edition' NOT NULL,
	`title` text NOT NULL,
	`style_preset` text NOT NULL,
	`prompt` text,
	`image_path` text,
	`image_status` text DEFAULT 'pending' NOT NULL,
	`image_provider` text,
	`image_generation_id` text,
	`image_started_at` integer,
	`image_error` text,
	`aesthetics` text DEFAULT '[]' NOT NULL,
	`palette` text DEFAULT '[]' NOT NULL,
	`style_vector` text NOT NULL,
	`occasion` text,
	`parent_look_id` text,
	`root_look_id` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`share_token` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `looks_owner_idx` ON `looks` (`owner_id`);--> statement-breakpoint
CREATE INDEX `looks_parent_idx` ON `looks` (`parent_look_id`);--> statement-breakpoint
CREATE INDEX `looks_root_idx` ON `looks` (`root_look_id`);--> statement-breakpoint
CREATE INDEX `looks_created_idx` ON `looks` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `looks_share_token_idx` ON `looks` (`share_token`);--> statement-breakpoint
CREATE TABLE `manufacturing_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`rank` integer NOT NULL,
	`aesthetic` text NOT NULL,
	`category_group` text NOT NULL,
	`subcategory` text,
	`color_family` text,
	`momentum` real DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`projected_demand` integer DEFAULT 0 NOT NULL,
	`rationale` text NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`computed_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manufacturing_recommendations_rank_idx` ON `manufacturing_recommendations` (`rank`);--> statement-breakpoint
CREATE TABLE `preference_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`vector` text NOT NULL,
	`top_aesthetics` text DEFAULT '[]' NOT NULL,
	`metrics` text DEFAULT '{}' NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `preference_snapshots_user_idx` ON `preference_snapshots` (`user_id`,`version`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`price` integer NOT NULL,
	`size` text,
	`for_kind` text DEFAULT 'undisclosed' NOT NULL,
	`for_user_id` text,
	`for_label` text,
	`source_look_id` text,
	`source_ask_id` text,
	`source_interaction_id` text,
	`intent_session_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`for_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchases_user_idx` ON `purchases` (`user_id`);--> statement-breakpoint
CREATE INDEX `purchases_article_idx` ON `purchases` (`article_id`);--> statement-breakpoint
CREATE INDEX `purchases_source_look_idx` ON `purchases` (`source_look_id`);--> statement-breakpoint
CREATE INDEX `purchases_created_idx` ON `purchases` (`created_at`);--> statement-breakpoint
CREATE TABLE `relationships` (
	`a_user_id` text NOT NULL,
	`b_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_at` integer NOT NULL,
	`computed_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	PRIMARY KEY(`a_user_id`, `b_user_id`, `kind`),
	FOREIGN KEY (`a_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`b_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `relationships_b_idx` ON `relationships` (`b_user_id`);--> statement-breakpoint
CREATE INDEX `relationships_kind_idx` ON `relationships` (`kind`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sim_personas` (
	`user_id` text PRIMARY KEY NOT NULL,
	`hidden_vector` text NOT NULL,
	`gift_hidden_vector` text,
	`social_cluster` integer NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trend_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`dimension` text NOT NULL,
	`key` text NOT NULL,
	`volume` integer DEFAULT 0 NOT NULL,
	`velocity` real DEFAULT 0 NOT NULL,
	`cross_cluster` real DEFAULT 0 NOT NULL,
	`conversion` real DEFAULT 0 NOT NULL,
	`gmv` integer DEFAULT 0 NOT NULL,
	`momentum` real DEFAULT 0 NOT NULL,
	`emerging` integer DEFAULT false NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`computed_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trend_signals_day_dim_key_idx` ON `trend_signals` (`day`,`dimension`,`key`);--> statement-breakpoint
CREATE INDEX `trend_signals_dim_key_idx` ON `trend_signals` (`dimension`,`key`);--> statement-breakpoint
CREATE INDEX `trend_signals_momentum_idx` ON `trend_signals` (`momentum`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_seed` integer DEFAULT 0 NOT NULL,
	`is_guest` integer DEFAULT false NOT NULL,
	`is_persona` integer DEFAULT false NOT NULL,
	`bio` text,
	`department` text DEFAULT 'unisex' NOT NULL,
	`sizes` text DEFAULT '{}' NOT NULL,
	`budget_hint` integer,
	`preference_vector` text,
	`gift_preference_vector` text,
	`taste_cluster` integer,
	`social_cluster` integer,
	`photo_path` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`last_seen_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_idx` ON `users` (`handle`);--> statement-breakpoint
CREATE INDEX `users_taste_cluster_idx` ON `users` (`taste_cluster`);--> statement-breakpoint
CREATE INDEX `users_social_cluster_idx` ON `users` (`social_cluster`);