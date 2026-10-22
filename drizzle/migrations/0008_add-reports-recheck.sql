CREATE TABLE `question_recheck_queue` (
	`question_version_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`started_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`question_version_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_reports_version_user_uq` ON `question_reports` (`question_version_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `question_reports_version_id_idx` ON `question_reports` (`question_version_id`);--> statement-breakpoint
CREATE INDEX `question_reports_user_id_idx` ON `question_reports` (`user_id`);