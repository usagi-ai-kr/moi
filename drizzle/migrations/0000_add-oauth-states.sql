CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_binding_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`pkce_verifier` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer
);
