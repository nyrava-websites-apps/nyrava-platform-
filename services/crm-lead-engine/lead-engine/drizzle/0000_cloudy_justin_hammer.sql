CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`cursor` text,
	`lease` integer DEFAULT 0,
	`token` text,
	`checked` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`campaign` text NOT NULL,
	`url` text NOT NULL,
	`identity` text NOT NULL,
	`body` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observation_url` ON `observations` (`owner`,`campaign`,`url`);--> statement-breakpoint
CREATE INDEX `observation_campaign` ON `observations` (`owner`,`campaign`);--> statement-breakpoint
CREATE TABLE `quotas` (
	`id` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`last` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`campaign` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppressed` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`campaign` text NOT NULL,
	`url` text NOT NULL
);

