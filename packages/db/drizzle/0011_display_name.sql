-- H&M's product names are merchandising strings, not shop copy: `Tilly (1)` is the second cut of
-- a style, `RICHIE HOOD` is shouted, `Henry polo.` has a stray full stop. 17 417 of them carry at
-- least one. `prod_name` keeps the string verbatim and `display_name` sits beside it, the way
-- `colour_family` sits beside `perceived_colour_master_name`.
ALTER TABLE `articles` ADD COLUMN `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint

-- An article H&M wrote no description for. 404 of them, and the copy is the only thing that
-- tells a shopper what a `Marshall Lace up Top` is — there is nothing to show on the page and
-- nothing for the full-text index to match beyond the name itself.
DELETE FROM `articles` WHERE trim(`detail_desc`) = '';
