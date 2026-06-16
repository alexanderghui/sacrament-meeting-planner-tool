CREATE TYPE "public"."age_category" AS ENUM('adult', 'youth', 'child');--> statement-breakpoint
CREATE TYPE "public"."assignment_role" AS ENUM('speaker', 'opening_prayer', 'closing_prayer', 'musical_number');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('invited', 'confirmed', 'spoke', 'declined');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('sacrament', 'fast_and_testimony', 'ward_conference', 'stake_conference', 'general_conference', 'primary_program', 'no_meeting');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"member_id" uuid,
	"guest_name" text,
	"role" "assignment_role" DEFAULT 'speaker' NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"topic" text,
	"status" "assignment_status" DEFAULT 'invited' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_assignment_slot" UNIQUE("meeting_id","role","position")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hymns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"type" "meeting_type" DEFAULT 'sacrament' NOT NULL,
	"conducting" text,
	"presiding" text,
	"theme" text,
	"opening_hymn" integer,
	"sacrament_hymn" integer,
	"intermediate_hymn" integer,
	"closing_hymn" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"household" text,
	"phone" text,
	"email" text,
	"birthdate" date,
	"age_category_override" "age_category",
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;