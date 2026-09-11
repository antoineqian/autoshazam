CREATE TABLE "download_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"format_priority" jsonb DEFAULT '["flac","mp3"]'::jsonb NOT NULL,
	"min_mp3_bitrate" integer,
	"auto_download" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "download_preferences_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"source_id" integer,
	"title" varchar(255) NOT NULL,
	"subtitle" varchar(255) NOT NULL,
	"local_path" text NOT NULL,
	"remote_user" varchar(255),
	"format" varchar(10),
	"bitrate" integer,
	"match_score" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "download_preferences" ADD CONSTRAINT "download_preferences_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;