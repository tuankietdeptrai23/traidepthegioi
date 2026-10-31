ALTER TABLE `grades` ADD `kind` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `grades` ADD `term` text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE `grades` ADD `weight` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `grades` ADD `bonus` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `grades` ADD `in_average` integer DEFAULT 1 NOT NULL;