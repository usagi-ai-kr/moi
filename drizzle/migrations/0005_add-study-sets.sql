CREATE TABLE `study_set_items` (
	`set_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_version_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`option_order` text NOT NULL,
	`answer_option_ids` text NOT NULL,
	`response_kind` text DEFAULT 'unanswered' NOT NULL,
	`selected_option_ids` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`set_id`, `question_id`),
	FOREIGN KEY (`set_id`) REFERENCES `study_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `study_set_items_set_idx` ON `study_set_items` (`set_id`);--> statement-breakpoint
CREATE TABLE `study_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`mode` text NOT NULL,
	`domain_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`submitted_at` integer,
	`result_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_sets_user_exam_active_uq` ON `study_sets` (`user_id`,`exam_id`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `study_sets_user_idx` ON `study_sets` (`user_id`);