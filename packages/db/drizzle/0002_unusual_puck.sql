CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cheatsheets" ADD COLUMN "public_slug" text;--> statement-breakpoint
CREATE INDEX "events_device_id_idx" ON "events" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "events" USING btree ("name");--> statement-breakpoint
ALTER TABLE "cheatsheets" ADD CONSTRAINT "cheatsheets_public_slug_unique" UNIQUE("public_slug");