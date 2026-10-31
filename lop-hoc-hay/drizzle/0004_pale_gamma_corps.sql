CREATE TABLE `study_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation_id` text NOT NULL,
	`room_id` text NOT NULL,
	`user_key` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `study_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_events_operation_id_unique` ON `study_events` (`operation_id`);--> statement-breakpoint
CREATE INDEX `study_event_room` ON `study_events` (`room_id`,`id`);--> statement-breakpoint
CREATE TABLE `study_members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_key` text NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `study_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_key`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_member_unique` ON `study_members` (`room_id`,`user_key`);--> statement-breakpoint
CREATE TABLE `study_peers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_key` text NOT NULL,
	`seen_at` integer NOT NULL,
	`hand` integer DEFAULT 0 NOT NULL,
	`mic` integer DEFAULT 0 NOT NULL,
	`camera` integer DEFAULT 0 NOT NULL,
	`sharing` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `study_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_key`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `study_peer_room` ON `study_peers` (`room_id`,`seen_at`);--> statement-breakpoint
CREATE TABLE `study_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`owner_key` text NOT NULL,
	`invite_code` text NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_key`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_rooms_invite_code_unique` ON `study_rooms` (`invite_code`);--> statement-breakpoint
CREATE TABLE `study_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`room_id` text NOT NULL,
	`from_peer` text NOT NULL,
	`to_peer` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_signals_message_id_unique` ON `study_signals` (`message_id`);--> statement-breakpoint
CREATE INDEX `study_signal_target` ON `study_signals` (`room_id`,`to_peer`,`id`);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` text DEFAULT '' NOT NULL;