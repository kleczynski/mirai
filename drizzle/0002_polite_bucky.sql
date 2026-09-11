CREATE TABLE `discovery_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`reserved_microusd` integer NOT NULL,
	`charged_microusd` integer,
	`created_at` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `discovery_requests_session_idx` ON `discovery_requests` (`session_id`,`created_at`);