CREATE TABLE `preview_products` (
	`preview_id` text NOT NULL,
	`product_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`preview_id`, `product_id`),
	FOREIGN KEY (`preview_id`) REFERENCES `previews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `preview_products_product_idx` ON `preview_products` (`product_id`);--> statement-breakpoint
CREATE TABLE `previews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_look_id` text,
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
	FOREIGN KEY (`source_look_id`) REFERENCES `looks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `previews_owner_idx` ON `previews` (`owner_id`);--> statement-breakpoint
CREATE INDEX `previews_source_look_idx` ON `previews` (`source_look_id`);--> statement-breakpoint
CREATE INDEX `previews_expires_idx` ON `previews` (`expires_at`);