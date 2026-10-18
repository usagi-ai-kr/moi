UPDATE `sessions`
 SET `revoked_at` = CAST(strftime('%s','now') AS INTEGER)
 WHERE `revoked_at` IS NULL
   AND `jti_hash` NOT IN (
     SELECT `jti_hash` FROM (
       SELECT `jti_hash`, row_number() OVER (PARTITION BY `user_id` ORDER BY `issued_at` DESC, `jti_hash` DESC) AS rn
       FROM `sessions`
       WHERE `revoked_at` IS NULL
     ) WHERE rn = 1
   );--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_user_active_uq` ON `sessions` (`user_id`) WHERE revoked_at IS NULL;
