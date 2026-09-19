-- The cleaned name goes in `prod_name` itself. A derived column was the safe move for
-- `colour_family` and `pattern` because H&M's own values there are the only independent check on
-- what the vision pass produced — a baseline worth keeping. A product name is not a baseline, the
-- raw string is still in `data/hm/articles.csv`, and one column beats two plus a rule about which
-- to read.
UPDATE `articles` SET `prod_name` = `display_name` WHERE `display_name` <> '';--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `display_name`;
