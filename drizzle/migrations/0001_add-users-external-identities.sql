CREATE TABLE `external_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_identities_provider_subject_uq` ON `external_identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE INDEX `external_identities_user_id_idx` ON `external_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
