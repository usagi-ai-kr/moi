CREATE TABLE `study_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_version_id` text NOT NULL,
	`outcome` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`excluded_at` integer,
	`first_attempt` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_attempts_source_source_question_uq` ON `study_attempts` (`source`,`source_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `study_attempts_user_exam_occurred_idx` ON `study_attempts` (`user_id`,`exam_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `study_attempts_user_exam_question_idx` ON `study_attempts` (`user_id`,`exam_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `study_attempts_question_version_idx` ON `study_attempts` (`question_version_id`);