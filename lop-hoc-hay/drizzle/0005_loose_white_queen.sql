CREATE TABLE `badge_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`badge_id` text NOT NULL,
	`month` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `award_student_badge_month` ON `badge_awards` (`class_id`,`student_id`,`badge_id`,`month`);--> statement-breakpoint
CREATE TABLE `badge_types` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text DEFAULT 'star' NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `duty_swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`from_duty_id` text NOT NULL,
	`to_duty_id` text NOT NULL,
	`from_student_id` text NOT NULL,
	`to_student_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`reason` text NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `swap_class` ON `duty_swaps` (`class_id`);--> statement-breakpoint
CREATE TABLE `monthly_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`month` text NOT NULL,
	`snapshot` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_student_month` ON `monthly_profiles` (`class_id`,`student_id`,`month`);--> statement-breakpoint
DROP INDEX `report_group_week`;--> statement-breakpoint
ALTER TABLE `reports` ADD `report_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `report_group_period` ON `reports` (`class_id`,`week`,`group_id`,`report_date`);--> statement-breakpoint
ALTER TABLE `entries` ADD `report_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `kind` text DEFAULT 'feedback' NOT NULL;