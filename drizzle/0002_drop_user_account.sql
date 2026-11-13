ALTER TABLE "users" DROP CONSTRAINT "users_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "account_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";