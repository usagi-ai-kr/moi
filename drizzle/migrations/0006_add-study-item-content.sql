ALTER TABLE `study_set_items` ADD `stem` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_set_items` ADD `options_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_set_items` ADD `explanation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_set_items` ADD `source_urls` text DEFAULT '[]' NOT NULL;