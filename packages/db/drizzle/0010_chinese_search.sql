-- Chinese was indexed but not findable. `unicode61` splits on anything that is not a letter or a
-- digit, and a run of Han characters contains no such thing, so a caption reading
-- `灰色麻花紋與柔粉色` went into the index as one token. 679 articles described as 麻花 matched
-- nothing; `俐落` matching 17 was luck, those captions happened to have it beside a comma.
--
-- The index holds a spaced copy — `灰 色 麻 花 紋` — so each character is its own token and a
-- query becomes a phrase over them. External content cannot transform what it reads, so the
-- spaced text is a column of its own and the index reads that. `trigram` was the alternative and
-- needs three characters in a query, where most Chinese words are two.
ALTER TABLE `articles` ADD COLUMN `search_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint

DROP TABLE IF EXISTS `articles_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `articles_fts` USING fts5(
	`prod_name`, `detail_desc`, `style_caption`, `search_zh`, `print_motif`, `print_text`,
	content='articles', tokenize='unicode61'
);--> statement-breakpoint
INSERT INTO articles_fts(articles_fts) VALUES('rebuild');
