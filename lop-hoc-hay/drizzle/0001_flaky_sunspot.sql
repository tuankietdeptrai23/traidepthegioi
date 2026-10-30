CREATE INDEX `entries_class_week` ON `entries` (`class_id`,`week`);--> statement-breakpoint
CREATE INDEX `entries_student` ON `entries` (`student_id`);--> statement-breakpoint
CREATE INDEX `students_class` ON `students` (`class_id`);