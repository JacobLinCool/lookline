-- Everything single-valued the vision pass produces becomes a column.
--
-- These five were put in `attributes` on the argument that each applies to a slice of the
-- catalogue — a rise to bottoms, a gauge to knitwear — so four columns would be empty on most
-- rows. That argument does not hold: this table is denormalised on purpose, an empty text column
-- costs about a byte a row, and what it bought instead was a `json_extract` on every query and no
-- way to index a filter. `articles` is the table someone reads to understand the catalogue, and
-- it should be readable.
--
-- The sets stay JSON, as `aesthetics`, `occasions` and `seasons` already are: a variable-length
-- list is what `json_each` is for, and `attribute_match` reads the design details by key.
ALTER TABLE `articles` ADD COLUMN `rise` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `shoulder` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `pocket_style` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `knit_gauge` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `padding` text DEFAULT '' NOT NULL;--> statement-breakpoint

-- The other half of the split caption, and the model's own account of itself. Neither is filtered
-- on, but both are read: the note by the copy a recommendation shows, the evidence and confidence
-- by anyone asking why an article is tagged the way it is.
ALTER TABLE `articles` ADD COLUMN `styling_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `styling_note_zh` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `vision_evidence` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD COLUMN `vision_confidence` real DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE INDEX `articles_rise_idx` ON `articles` (`rise`);--> statement-breakpoint
CREATE INDEX `articles_knit_gauge_idx` ON `articles` (`knit_gauge`);
