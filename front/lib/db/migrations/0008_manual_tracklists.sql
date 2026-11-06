ALTER TABLE "tracks" ALTER COLUMN "position" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "tracklist_order" integer;