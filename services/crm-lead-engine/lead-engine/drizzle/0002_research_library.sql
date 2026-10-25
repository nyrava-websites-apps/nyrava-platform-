CREATE TABLE `research_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`url` text NOT NULL,
	`identity` text NOT NULL,
	`body` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`retired` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_record_owner_url` ON `research_records` (`owner`,`url`);--> statement-breakpoint
CREATE INDEX `research_record_owner_seen` ON `research_records` (`owner`,`last_seen`);
