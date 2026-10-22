CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exam_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`weight` integer NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_domains_exam_code_uq` ON `exam_domains` (`exam_id`,`code`);--> statement-breakpoint
CREATE INDEX `exam_domains_exam_id_idx` ON `exam_domains` (`exam_id`);--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exams_code_unique` ON `exams` (`code`);--> statement-breakpoint
CREATE TABLE `question_options` (
	`id` text PRIMARY KEY NOT NULL,
	`question_version_id` text NOT NULL,
	`option_key` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`question_version_id`) REFERENCES `question_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_options_version_key_uq` ON `question_options` (`question_version_id`,`option_key`);--> statement-breakpoint
CREATE INDEX `question_options_version_id_idx` ON `question_options` (`question_version_id`);--> statement-breakpoint
CREATE TABLE `question_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`stem` text NOT NULL,
	`explanation` text NOT NULL,
	`source_urls` text NOT NULL,
	`answer_option_ids` text NOT NULL,
	`option_set_hash` text NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`superseded_at` integer,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_versions_question_version_uq` ON `question_versions` (`question_id`,`version_no`);--> statement-breakpoint
CREATE INDEX `question_versions_question_id_idx` ON `question_versions` (`question_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`domain_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version_no` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`domain_id`) REFERENCES `exam_domains`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_exam_status_idx` ON `questions` (`exam_id`,`status`);