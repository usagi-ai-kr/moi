CREATE TABLE `study_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_version_id` text NOT NULL,
	`reason` text NOT NULL,
	`source` text NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `study_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_corrections_set_version_uq` ON `study_corrections` (`set_id`,`question_version_id`);--> statement-breakpoint
CREATE INDEX `study_corrections_set_id_idx` ON `study_corrections` (`set_id`);--> statement-breakpoint
CREATE INDEX `study_corrections_question_version_idx` ON `study_corrections` (`question_version_id`);