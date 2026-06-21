ALTER TABLE "meetings" ADD COLUMN "stake_visitors" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "stake_business" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "ward_business_note" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "opening_note" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "announcements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "move_ins" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "released" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "sustained" jsonb DEFAULT '[]'::jsonb NOT NULL;