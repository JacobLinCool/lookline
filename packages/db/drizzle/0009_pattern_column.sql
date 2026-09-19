-- `materialize` was writing the model's pattern into `graphical_appearance_name`, a column whose
-- own comment says "articles.csv, verbatim". H&M's label is gone from the database as a result,
-- and it was the baseline every pattern agreement figure was measured against.
--
-- The same mistake `0004` fixed for colour: a derived value written into the column holding the
-- raw one. The raw keeps its column and the derived gets its own, beside it, the way
-- `category_group` sits beside `product_group_name`.
ALTER TABLE `articles` ADD COLUMN `pattern` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `articles_pattern_idx` ON `articles` (`pattern`);
