-- The catalog's twelve colour families, derived from H&M's nineteen perceived masters.
--
-- `articles.colour_family` used to be `perceived_colour_master_name` under a TS name promising the
-- catalog vocabulary, so every filter compared `black` against a column holding `Black`: the shop's
-- colour swatches all returned nothing, the colour facet counted under keys no swatch knew, and an
-- intent constraint like "不要白" excluded a set that was always empty. The style vector was right
-- all along, because the import mapped the value there and only there.
--
-- The raw master keeps its own column; this one is derived beside it, the way `category_group` sits
-- beside `product_group_name` for the same reason.
ALTER TABLE `articles` ADD COLUMN `colour_family` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `articles` SET `colour_family` = CASE `perceived_colour_master_name`
	WHEN 'Black' THEN 'black'
	WHEN 'White' THEN 'white'
	WHEN 'Grey' THEN 'grey'
	WHEN 'Beige' THEN 'neutral'
	WHEN 'Mole' THEN 'neutral'
	WHEN 'Brown' THEN 'brown'
	WHEN 'Red' THEN 'red'
	WHEN 'Pink' THEN 'pink'
	WHEN 'Yellow' THEN 'yellow-orange'
	WHEN 'Orange' THEN 'yellow-orange'
	WHEN 'Green' THEN 'green'
	WHEN 'Khaki green' THEN 'green'
	WHEN 'Yellowish Green' THEN 'green'
	WHEN 'Bluish Green' THEN 'green'
	WHEN 'Blue' THEN 'blue'
	WHEN 'Turquoise' THEN 'blue'
	WHEN 'Lilac Purple' THEN 'purple'
	WHEN 'Metal' THEN 'multi-metallic'
	ELSE ''
END;--> statement-breakpoint
CREATE INDEX `articles_colour_family_idx` ON `articles` (`colour_family`);
