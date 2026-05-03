CREATE TABLE "block_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cheatsheet_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"x_mm" double precision NOT NULL,
	"y_mm" double precision NOT NULL,
	"width_mm" double precision NOT NULL,
	"height_mm" double precision NOT NULL,
	"rotation_deg" double precision DEFAULT 0 NOT NULL,
	"z_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheatsheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"title" text NOT NULL,
	"paper_size" text DEFAULT 'A4' NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_placements" ADD CONSTRAINT "block_placements_cheatsheet_id_cheatsheets_id_fk" FOREIGN KEY ("cheatsheet_id") REFERENCES "public"."cheatsheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_placements" ADD CONSTRAINT "block_placements_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placements_cheatsheet_id_idx" ON "block_placements" USING btree ("cheatsheet_id");--> statement-breakpoint
CREATE INDEX "placements_block_id_idx" ON "block_placements" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "blocks_device_id_idx" ON "blocks" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "cheatsheets_device_id_idx" ON "cheatsheets" USING btree ("device_id");