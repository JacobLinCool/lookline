-- article_vectors: unit-normalised copy of articles.style_vector spread over 32 REAL columns so
-- cosine similarity is a plain dot product SQLite can evaluate per row (see src/vectors.ts).
CREATE TABLE `article_vectors` (
	`article_id` text PRIMARY KEY NOT NULL,
	`v0` real NOT NULL DEFAULT 0, `v1` real NOT NULL DEFAULT 0, `v2` real NOT NULL DEFAULT 0, `v3` real NOT NULL DEFAULT 0,
	`v4` real NOT NULL DEFAULT 0, `v5` real NOT NULL DEFAULT 0, `v6` real NOT NULL DEFAULT 0, `v7` real NOT NULL DEFAULT 0,
	`v8` real NOT NULL DEFAULT 0, `v9` real NOT NULL DEFAULT 0, `v10` real NOT NULL DEFAULT 0, `v11` real NOT NULL DEFAULT 0,
	`v12` real NOT NULL DEFAULT 0, `v13` real NOT NULL DEFAULT 0, `v14` real NOT NULL DEFAULT 0, `v15` real NOT NULL DEFAULT 0,
	`v16` real NOT NULL DEFAULT 0, `v17` real NOT NULL DEFAULT 0, `v18` real NOT NULL DEFAULT 0, `v19` real NOT NULL DEFAULT 0,
	`v20` real NOT NULL DEFAULT 0, `v21` real NOT NULL DEFAULT 0, `v22` real NOT NULL DEFAULT 0, `v23` real NOT NULL DEFAULT 0,
	`v24` real NOT NULL DEFAULT 0, `v25` real NOT NULL DEFAULT 0, `v26` real NOT NULL DEFAULT 0, `v27` real NOT NULL DEFAULT 0,
	`v28` real NOT NULL DEFAULT 0, `v29` real NOT NULL DEFAULT 0, `v30` real NOT NULL DEFAULT 0, `v31` real NOT NULL DEFAULT 0,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- articles_fts: FTS5 index over prod_name + detail_desc, external content. article_id is text, so
-- the index keys on the implicit rowid of `articles` rather than on the primary key.
-- Rebuilt after every import with: INSERT INTO articles_fts(articles_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE `articles_fts` USING fts5(
	`prod_name`, `detail_desc`,
	content='articles', tokenize='unicode61'
);
