CREATE TYPE "public"."routing_strategy" AS ENUM('round_robin', 'least_used');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."message_priority" AS ENUM('normal', 'otp');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('scheduled', 'pending', 'leased', 'queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('sms', 'data', 'mms');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'retrying', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"routing_strategy" "routing_strategy" DEFAULT 'round_robin' NOT NULL,
	"last_routed_device_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by_user_id" text,
	"last_used_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "device_sims" (
	"device_id" text NOT NULL,
	"slot" integer NOT NULL,
	"carrier" text,
	"phone_number" text,
	"iccid" text,
	"signal_level" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"present" boolean DEFAULT true NOT NULL,
	"daily_limit" integer,
	"reported_sent_today" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_sims_device_id_slot_pk" PRIMARY KEY("device_id","slot")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"model" text,
	"manufacturer" text,
	"os_version" text,
	"app_version" text,
	"fcm_token" text,
	"status" "device_status" DEFAULT 'online' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"daily_limit" integer,
	"settings_version" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp (3) with time zone,
	"battery_level" integer,
	"charging" boolean,
	"network_type" text,
	"local_queue_size" integer,
	"health_reported_at" timestamp (3) with time zone,
	"removed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"device_name" text,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "inbox_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"inbox_message_id" text NOT NULL,
	"position" integer NOT NULL,
	"content_type" text NOT NULL,
	"name" text,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"device_id" text,
	"local_id" text NOT NULL,
	"type" "message_type" NOT NULL,
	"from" text NOT NULL,
	"to" text,
	"sim_slot" integer,
	"text" text,
	"data" text,
	"port" integer,
	"subject" text,
	"received_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"position" integer NOT NULL,
	"content_type" text NOT NULL,
	"name" text,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"message_id" text NOT NULL,
	"state" "message_state" NOT NULL,
	"at" timestamp (3) with time zone NOT NULL,
	"device_id" text,
	"sim_slot" integer,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"api_key_id" text,
	"type" "message_type" NOT NULL,
	"to" text NOT NULL,
	"text" text,
	"data" text,
	"port" integer,
	"subject" text,
	"priority" "message_priority" DEFAULT 'normal' NOT NULL,
	"state" "message_state" NOT NULL,
	"idempotency_key" text,
	"request_hash" text NOT NULL,
	"requested_device_id" text,
	"requested_sim_slot" integer,
	"device_id" text,
	"sim_slot" integer,
	"last_device_id" text,
	"schedule_at" timestamp (3) with time zone,
	"valid_until" timestamp (3) with time zone,
	"delivery_report" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"parts_count" integer,
	"error_code" text,
	"error_message" text,
	"leased_at" timestamp (3) with time zone,
	"lease_expires_at" timestamp (3) with time zone,
	"sent_at" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"failed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_status_code" integer,
	"last_response_body" text,
	"last_error" text,
	"next_attempt_at" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"events" text[] NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sims" ADD CONSTRAINT "device_sims_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_attachments" ADD CONSTRAINT "inbox_attachments_inbox_message_id_inbox_messages_id_fk" FOREIGN KEY ("inbox_message_id") REFERENCES "public"."inbox_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_webhook_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."webhook_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_account_idx" ON "users" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "api_keys_account_idx" ON "api_keys" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "devices_account_idx" ON "devices" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "devices_presence_idx" ON "devices" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "pairing_codes_account_idx" ON "pairing_codes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "inbox_attachments_message_idx" ON "inbox_attachments" USING btree ("inbox_message_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_device_local_idx" ON "inbox_messages" USING btree ("device_id","local_id");--> statement-breakpoint
CREATE INDEX "inbox_account_received_idx" ON "inbox_messages" USING btree ("account_id","received_at","id");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX "message_events_message_idx" ON "message_events" USING btree ("message_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_idx" ON "messages" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_account_created_idx" ON "messages" USING btree ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_queue_idx" ON "messages" USING btree ("account_id","state","priority","created_at");--> statement-breakpoint
CREATE INDEX "messages_device_leased_idx" ON "messages" USING btree ("device_id","leased_at");--> statement-breakpoint
CREATE INDEX "messages_lease_expiry_idx" ON "messages" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "messages_schedule_idx" ON "messages" USING btree ("state","schedule_at");--> statement-breakpoint
CREATE INDEX "messages_sent_idx" ON "messages" USING btree ("account_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_delivered_idx" ON "messages" USING btree ("account_id","delivered_at");--> statement-breakpoint
CREATE INDEX "messages_failed_idx" ON "messages" USING btree ("account_id","failed_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at","id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_account_idx" ON "webhook_endpoints" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_events_account_idx" ON "webhook_events" USING btree ("account_id","created_at");