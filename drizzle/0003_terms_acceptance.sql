ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_ip" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_user_agent" text;