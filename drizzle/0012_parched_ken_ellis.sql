ALTER TYPE "public"."meeting_type" ADD VALUE 'easter_program' BEFORE 'no_meeting';--> statement-breakpoint
ALTER TYPE "public"."meeting_type" ADD VALUE 'christmas_program' BEFORE 'no_meeting';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "musical_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "meetings" SET "musical_numbers" = jsonb_build_array("musical_number") WHERE "musical_number" IS NOT NULL AND btrim("musical_number") <> '' AND "musical_numbers" = '[]'::jsonb;