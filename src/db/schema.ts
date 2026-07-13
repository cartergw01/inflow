import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Where an item came from, mechanically. Drives which adapter fetches it. */
export type SourceKind = "substack" | "rss" | "hn" | "bluesky" | "x";

/** Editorial class of a source. Drives recency half-life and feed treatment. */
export type SourceClass = "longform" | "news" | "social";

/** Editorial trust tier. This is curated evidence, not an engagement score. */
export type CredibilityTier = "major" | "independent" | "social";

/** Source-visible lifecycle state for corrections and retractions. */
export type ItemStatus = "active" | "updated" | "corrected" | "retracted";

/** Whether a claim is source-reported, independently corroborated, or still unconfirmed. */
export type VerificationStatus = "reported" | "corroborated" | "unconfirmed";

export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<SourceKind>().notNull(),
    sourceClass: text("source_class").$type<SourceClass>().notNull(),
    name: text("name").notNull(),
    /** Feed URL for rss/substack, handle for bluesky, unused for hn. */
    feedUrl: text("feed_url").notNull(),
    homepageUrl: text("homepage_url"),
    /** Topics this source is curated for; a hint, not a constraint. */
    topicHints: jsonb("topic_hints").$type<string[]>().notNull().default([]),
    /** Reputation prior in [0,1]; reputable wire services near 1. */
    qualityPrior: real("quality_prior").notNull().default(0.7),
    credibilityTier: text("credibility_tier").$type<CredibilityTier>().notNull().default("independent"),
    /** Distinct editorial origin used to avoid counting syndication as corroboration. */
    sourceFamily: text("source_family").notNull().default("unknown"),
    pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(10),
    namedAuthorRequired: boolean("named_author_required").notNull().default(false),
    active: boolean("active").notNull().default(true),
    // Conditional-GET state
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastSuccessfulFetchAt: timestamp("last_successful_fetch_at", { withTimezone: true }),
    nextFetchAt: timestamp("next_fetch_at", { withTimezone: true }),
    lastStatus: text("last_status"),
  },
  (t) => [uniqueIndex("sources_feed_url_idx").on(t.feedUrl)],
);

export const clusters = pgTable("clusters", {
  id: serial("id").primaryKey(),
  /** Simhash-style key of the normalized lead title, for exact re-matching. */
  key: text("key").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    /** Feed-provided guid when present, else canonical URL. */
    guid: text("guid").notNull(),
    author: text("author"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    /** Publisher-provided description/dek. Never generated text. */
    excerpt: text("excerpt"),
    /** Sanitized full HTML when the feed provides it (Substack does). */
    contentHtml: text("content_html"),
    imageUrl: text("image_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    contentFingerprint: text("content_fingerprint").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    status: text("status").$type<ItemStatus>().notNull().default("active"),
    verificationStatus: text("verification_status").$type<VerificationStatus>().notNull().default("reported"),
    correctionNote: text("correction_note"),
    topics: jsonb("topics").$type<string[]>().notNull().default([]),
    clusterId: integer("cluster_id").references(() => clusters.id),
  },
  (t) => [
    uniqueIndex("items_source_guid_idx").on(t.sourceId, t.guid),
    index("items_canonical_url_idx").on(t.canonicalUrl),
    index("items_published_at_idx").on(t.publishedAt),
    index("items_source_id_idx").on(t.sourceId),
    index("items_cluster_id_idx").on(t.clusterId),
    index("items_topics_gin_idx").using("gin", t.topics),
  ],
);

/** Immutable snapshots created only when a source changes an existing item. */
export const itemVersions = pgTable(
  "item_versions",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentFingerprint: text("content_fingerprint").notNull(),
    status: text("status").$type<ItemStatus>().notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("item_versions_item_idx").on(t.itemId, t.capturedAt)],
);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Previous briefing-open boundary, used for honest "new since last visit" state. */
    lastFeedOpenedAt: timestamp("last_feed_opened_at", { withTimezone: true }),
  /** Seed interests chosen at onboarding; ranking input, not a filter. */
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
});

export type SignalType =
  | "impression" // item was on screen
  | "open" // item opened (reader or external)
  | "read_time" // seconds spent reading, in `value`
  | "save"
  | "unsave"
  | "more_like"
  | "less_like"
  | "hide_source";

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    type: text("type").$type<SignalType>().notNull(),
    value: real("value").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signals_profile_idx").on(t.profileId, t.createdAt)],
);

export type AffinityDimension = "topic" | "source" | "author";

/**
 * Materialized personalization weights, updated online from signals with
 * exponential time decay. One row per (profile, dimension, key).
 */
export const affinities = pgTable(
  "affinities",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    dimension: text("dimension").$type<AffinityDimension>().notNull(),
    key: text("key").notNull(),
    weight: real("weight").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.dimension, t.key] })],
);

export const saves = pgTable(
  "saves",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.itemId] })],
);

/** Hard filter: a muted source never appears for this profile. */
export const mutedSources = pgTable(
  "muted_sources",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.sourceId] })],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemVersion = typeof itemVersions.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Affinity = typeof affinities.$inferSelect;
export type Cluster = typeof clusters.$inferSelect;
