CREATE INDEX "idx_assignments_member_status" ON "assignments" USING btree ("member_id","status");--> statement-breakpoint
CREATE INDEX "idx_assignments_meeting" ON "assignments" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_members_active" ON "members" USING btree ("is_active");