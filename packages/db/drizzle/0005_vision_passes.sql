-- A second reading of the same article, for things one prompt covering everything answers badly.
--
-- The core pass asks 17 questions of every one of 105 220 articles. Adding a field to it costs
-- output tokens on all of them, spreads the model's attention thinner, and asks a handbag about
-- its rise. A narrow pass over the subset a field applies to is cheaper and answers better: the
-- print motif is only a question for the 28 900 articles the core pass found a print on.
--
-- `pass` names which reading this is; `version` stays the prompt revision within that pass.
-- SQLite cannot add a column to a primary key, so the table is rebuilt and the rows carried over
-- as the pass they came from.
ALTER TABLE `article_vision` RENAME TO `article_vision_old`;--> statement-breakpoint
CREATE TABLE `article_vision` (
	`article_id` text NOT NULL,
	`pass` text DEFAULT 'core' NOT NULL,
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
	PRIMARY KEY(`article_id`, `pass`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `article_vision` (`article_id`, `pass`, `model`, `version`, `payload`, `confidence`, `caption_en`, `caption_zh`, `image_key`, `input_tokens`, `output_tokens`, `latency_ms`, `created_at`)
	SELECT `article_id`, 'core', `model`, `version`, `payload`, `confidence`, `caption_en`, `caption_zh`, `image_key`, `input_tokens`, `output_tokens`, `latency_ms`, `created_at` FROM `article_vision_old`;--> statement-breakpoint
DROP TABLE `article_vision_old`;--> statement-breakpoint
CREATE INDEX `article_vision_pass_idx` ON `article_vision` (`pass`,`version`);--> statement-breakpoint
CREATE INDEX `article_vision_confidence_idx` ON `article_vision` (`confidence`);--> statement-breakpoint

-- What the print actually depicts, which no closed list can enumerate in advance. `print_motif`
-- is two to four words ("tyrannosaurus rex", "palm fronds"); `print_text` is the words printed on
-- the garment, verbatim. Both are clustered after the fact rather than filtered directly, and
-- that clustering is the trend signal: a motif moves in weeks, where a neckline moves in years.
ALTER TABLE `articles` ADD COLUMN `print_motif` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `print_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `articles_print_motif_idx` ON `articles` (`print_motif`);
