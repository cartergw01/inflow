CREATE TABLE "item_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "items_canonical_url_idx";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "content_fingerprint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "word_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "verification_status" text DEFAULT 'reported' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "correction_note" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_feed_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "credibility_tier" text DEFAULT 'independent' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "source_family" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "poll_interval_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "named_author_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_successful_fetch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "next_fetch_at" timestamp with time zone;--> statement-breakpoint
UPDATE "items"
SET "word_count" = GREATEST(1, length(regexp_replace("content_html", '<[^>]+>', ' ', 'g')) / 6)
WHERE "content_html" IS NOT NULL AND length("content_html") > 500;--> statement-breakpoint
UPDATE "sources"
SET "last_successful_fetch_at" = "last_fetched_at", "next_fetch_at" = now()
WHERE "last_fetched_at" IS NOT NULL;--> statement-breakpoint
WITH duplicate_items AS (
	SELECT "id", max("id") OVER (PARTITION BY "source_id", "guid") AS "keeper_id"
	FROM "items"
)
UPDATE "signals"
SET "item_id" = duplicate_items."keeper_id"
FROM duplicate_items
WHERE "signals"."item_id" = duplicate_items."id"
	AND duplicate_items."id" <> duplicate_items."keeper_id";--> statement-breakpoint
WITH duplicate_items AS (
	SELECT "id", max("id") OVER (PARTITION BY "source_id", "guid") AS "keeper_id"
	FROM "items"
)
INSERT INTO "saves" ("profile_id", "item_id", "created_at")
SELECT "saves"."profile_id", duplicate_items."keeper_id", min("saves"."created_at")
FROM "saves"
INNER JOIN duplicate_items ON "saves"."item_id" = duplicate_items."id"
WHERE duplicate_items."id" <> duplicate_items."keeper_id"
GROUP BY "saves"."profile_id", duplicate_items."keeper_id"
ON CONFLICT ("profile_id", "item_id") DO NOTHING;--> statement-breakpoint
WITH duplicate_items AS (
	SELECT "id", max("id") OVER (PARTITION BY "source_id", "guid") AS "keeper_id"
	FROM "items"
)
DELETE FROM "saves"
USING duplicate_items
WHERE "saves"."item_id" = duplicate_items."id"
	AND duplicate_items."id" <> duplicate_items."keeper_id";--> statement-breakpoint
WITH duplicate_items AS (
	SELECT "id", max("id") OVER (PARTITION BY "source_id", "guid") AS "keeper_id"
	FROM "items"
)
DELETE FROM "items"
USING duplicate_items
WHERE "items"."id" = duplicate_items."id"
	AND duplicate_items."id" <> duplicate_items."keeper_id";--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_versions_item_idx" ON "item_versions" USING btree ("item_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_guid_idx" ON "items" USING btree ("source_id","guid");--> statement-breakpoint
CREATE INDEX "items_cluster_id_idx" ON "items" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "items_canonical_url_idx" ON "items" USING btree ("canonical_url");
