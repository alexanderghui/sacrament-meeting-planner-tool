CREATE TABLE IF NOT EXISTS "sync_claims" (
	"key" text PRIMARY KEY NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
