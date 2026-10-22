CREATE TABLE `review_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`cursor` integer NOT NULL,
	`items` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_sessions_active_uq` ON `review_sessions` (`user_id`,`exam_id`,`mode`) WHERE "review_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX `review_sessions_user_created_idx` ON `review_sessions` (`user_id`,`created_at`);