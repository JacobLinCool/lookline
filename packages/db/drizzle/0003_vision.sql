-- The vision pass: what a multimodal model read off each article's photograph, the columns it
-- fills, and the 32 style-vector dimensions that were dropped when nothing could fill them.
-- Design: docs/plans/2026-09-19-vision-attributes-design.md

-- 1. Columns on `articles` the pass materialises. `aesthetics` is the one the recommender misses
--    most: a style lives in the photograph, and H&M's copy never names one.
ALTER TABLE `articles` ADD COLUMN `aesthetics` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `silhouette` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `print_subject` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `style_caption` text DEFAULT '' NOT NULL;--> statement-breakpoint

-- 2. The audit record. `payload` is the validated model output, verbatim: the derived columns are
--    materialised from it, so a prompt fix re-runs the cheap half and an explanation can quote the
--    evidence a tag came from.
CREATE TABLE `article_vision` (
	`article_id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`version` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`caption_en` text DEFAULT '' NOT NULL,
	`caption_zh` text DEFAULT '' NOT NULL,
	`image_key` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `article_vision_version_idx` ON `article_vision` (`version`);--> statement-breakpoint
CREATE INDEX `article_vision_confidence_idx` ON `article_vision` (`confidence`);--> statement-breakpoint

-- 3. Dimensions 32-63 of the style vector. The layout returns to the one docs/ARCHITECTURE.md
--    always described: aesthetics [0,32), colours [32,44), axes [44,52), groups [52,64). Existing
--    rows hold a 32-dim vector under the old layout, so every vector is rewritten by
--    `pnpm --filter @lookline/hm materialize` — until then the new columns are zero and the old
--    ones mean the wrong thing.
ALTER TABLE `article_vectors` ADD COLUMN `v32` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v33` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v34` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v35` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v36` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v37` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v38` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v39` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v40` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v41` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v42` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v43` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v44` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v45` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v46` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v47` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v48` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v49` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v50` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v51` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v52` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v53` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v54` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v55` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v56` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v57` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v58` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v59` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v60` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v61` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v62` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `article_vectors` ADD COLUMN `v63` real NOT NULL DEFAULT 0;--> statement-breakpoint

-- 4. `style_caption` joins the full-text index, so "looks chill" has prose to match. An external
--    content table owns no data of its own; dropping and recreating it costs only the rebuild.
DROP TABLE IF EXISTS `articles_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `articles_fts` USING fts5(
	`prod_name`, `detail_desc`, `style_caption`,
	content='articles', tokenize='unicode61'
);--> statement-breakpoint
INSERT INTO articles_fts(articles_fts) VALUES('rebuild');
