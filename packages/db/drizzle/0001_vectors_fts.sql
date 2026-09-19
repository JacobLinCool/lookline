-- product_vectors: unit-normalised copy of products.style_vector spread over 64 REAL columns so
-- cosine similarity is a plain dot product SQLite can evaluate per row (see src/vectors.ts).
CREATE TABLE `product_vectors` (
	`product_id` integer PRIMARY KEY NOT NULL,
	`v0` real NOT NULL DEFAULT 0, `v1` real NOT NULL DEFAULT 0, `v2` real NOT NULL DEFAULT 0, `v3` real NOT NULL DEFAULT 0,
	`v4` real NOT NULL DEFAULT 0, `v5` real NOT NULL DEFAULT 0, `v6` real NOT NULL DEFAULT 0, `v7` real NOT NULL DEFAULT 0,
	`v8` real NOT NULL DEFAULT 0, `v9` real NOT NULL DEFAULT 0, `v10` real NOT NULL DEFAULT 0, `v11` real NOT NULL DEFAULT 0,
	`v12` real NOT NULL DEFAULT 0, `v13` real NOT NULL DEFAULT 0, `v14` real NOT NULL DEFAULT 0, `v15` real NOT NULL DEFAULT 0,
	`v16` real NOT NULL DEFAULT 0, `v17` real NOT NULL DEFAULT 0, `v18` real NOT NULL DEFAULT 0, `v19` real NOT NULL DEFAULT 0,
	`v20` real NOT NULL DEFAULT 0, `v21` real NOT NULL DEFAULT 0, `v22` real NOT NULL DEFAULT 0, `v23` real NOT NULL DEFAULT 0,
	`v24` real NOT NULL DEFAULT 0, `v25` real NOT NULL DEFAULT 0, `v26` real NOT NULL DEFAULT 0, `v27` real NOT NULL DEFAULT 0,
	`v28` real NOT NULL DEFAULT 0, `v29` real NOT NULL DEFAULT 0, `v30` real NOT NULL DEFAULT 0, `v31` real NOT NULL DEFAULT 0,
	`v32` real NOT NULL DEFAULT 0, `v33` real NOT NULL DEFAULT 0, `v34` real NOT NULL DEFAULT 0, `v35` real NOT NULL DEFAULT 0,
	`v36` real NOT NULL DEFAULT 0, `v37` real NOT NULL DEFAULT 0, `v38` real NOT NULL DEFAULT 0, `v39` real NOT NULL DEFAULT 0,
	`v40` real NOT NULL DEFAULT 0, `v41` real NOT NULL DEFAULT 0, `v42` real NOT NULL DEFAULT 0, `v43` real NOT NULL DEFAULT 0,
	`v44` real NOT NULL DEFAULT 0, `v45` real NOT NULL DEFAULT 0, `v46` real NOT NULL DEFAULT 0, `v47` real NOT NULL DEFAULT 0,
	`v48` real NOT NULL DEFAULT 0, `v49` real NOT NULL DEFAULT 0, `v50` real NOT NULL DEFAULT 0, `v51` real NOT NULL DEFAULT 0,
	`v52` real NOT NULL DEFAULT 0, `v53` real NOT NULL DEFAULT 0, `v54` real NOT NULL DEFAULT 0, `v55` real NOT NULL DEFAULT 0,
	`v56` real NOT NULL DEFAULT 0, `v57` real NOT NULL DEFAULT 0, `v58` real NOT NULL DEFAULT 0, `v59` real NOT NULL DEFAULT 0,
	`v60` real NOT NULL DEFAULT 0, `v61` real NOT NULL DEFAULT 0, `v62` real NOT NULL DEFAULT 0, `v63` real NOT NULL DEFAULT 0,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- products_fts: FTS5 index over name + description, external content (rowid = products.id).
-- Rebuilt after every catalog seed with: INSERT INTO products_fts(products_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE `products_fts` USING fts5(
	`name`, `description`,
	content='products', content_rowid='id', tokenize='unicode61'
);
