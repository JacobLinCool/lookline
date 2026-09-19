-- The caption was one sentence doing two jobs: describing the garment and saying who it suits.
-- Split in `vision-3`, they are consumed differently — the description is indexed and matched
-- against, the styling note is read by the recommender's copy and never filtered on, so only the
-- description needs a column. It gets one per language, because the product is bilingual and the
-- full-text index was English-only: a query like "看起來很 chill" had nothing to match.
ALTER TABLE `articles` ADD COLUMN `style_caption_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint

DROP TABLE IF EXISTS `articles_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `articles_fts` USING fts5(
	`prod_name`, `detail_desc`, `style_caption`, `style_caption_zh`, `print_motif`, `print_text`,
	content='articles', tokenize='unicode61'
);--> statement-breakpoint
INSERT INTO articles_fts(articles_fts) VALUES('rebuild');
