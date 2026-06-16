ALTER TABLE "members" ALTER COLUMN "age_category_override" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."age_category";--> statement-breakpoint
CREATE TYPE "public"."age_category" AS ENUM('adult', 'youth', 'primary');--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "age_category_override" SET DATA TYPE "public"."age_category" USING "age_category_override"::"public"."age_category";