CREATE TABLE `fund_collections` (
 `id` text PRIMARY KEY NOT NULL,
 `class_id` text NOT NULL REFERENCES `classes`(`id`),
 `title` text NOT NULL,
 `description` text DEFAULT '' NOT NULL,
 `amount` integer NOT NULL,
 `due_date` text NOT NULL,
 `status` text DEFAULT 'open' NOT NULL,
 `created_by` text NOT NULL,
 `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fund_collections_class` ON `fund_collections` (`class_id`);
--> statement-breakpoint
ALTER TABLE `funds` ADD `collection_id` text;
