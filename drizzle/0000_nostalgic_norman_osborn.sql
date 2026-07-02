CREATE TABLE "affinities" (
	"profile_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"key" text NOT NULL,
	"weight" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affinities_profile_id_dimension_key_pk" PRIMARY KEY("profile_id","dimension","key")
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"guid" text NOT NULL,
	"author" text,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"excerpt" text,
	"content_html" text,
	"image_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_id" integer
);
--> statement-breakpoint
CREATE TABLE "muted_sources" (
	"profile_id" uuid NOT NULL,
	"source_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "muted_sources_profile_id_source_id_pk" PRIMARY KEY("profile_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saves" (
	"profile_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saves_profile_id_item_id_pk" PRIMARY KEY("profile_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"type" text NOT NULL,
	"value" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source_class" text NOT NULL,
	"name" text NOT NULL,
	"feed_url" text NOT NULL,
	"homepage_url" text,
	"topic_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality_prior" real DEFAULT 0.7 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"last_status" text
);
--> statement-breakpoint
ALTER TABLE "affinities" ADD CONSTRAINT "affinities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_sources" ADD CONSTRAINT "muted_sources_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muted_sources" ADD CONSTRAINT "muted_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_canonical_url_idx" ON "items" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "items_published_at_idx" ON "items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "items_source_id_idx" ON "items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "signals_profile_idx" ON "signals" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_feed_url_idx" ON "sources" USING btree ("feed_url");