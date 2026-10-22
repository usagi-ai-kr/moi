CREATE TABLE `admin_idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`status_code` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`actor` text NOT NULL,
	`scope` text NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_tokens_token_hash_unique` ON `admin_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admin_tokens_actor_idx` ON `admin_tokens` (`actor`);