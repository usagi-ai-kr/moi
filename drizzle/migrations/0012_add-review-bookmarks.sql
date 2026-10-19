CREATE TABLE `review_bookmarks` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_bookmarks_user_question_uq` ON `review_bookmarks` (`user_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `review_bookmarks_user_idx` ON `review_bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `review_bookmarks_question_idx` ON `review_bookmarks` (`question_id`);