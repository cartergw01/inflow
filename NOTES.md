# NOTES

Decision log for InFlow. One entry per lesson/decision, one-line summary at the top of each.

## X/Twitter deferred behind an env flag; HN + Bluesky carry real-time signal in v1

X API is now pay-per-usage (~$0.005/post read, verified 2026-07-02 at docs.x.com). A useful polling volume for one user's follows runs ~$30–75/mo and requires an X developer account + payment method only the owner can provide. Scraping violates X ToS — ruled out under "accuracy first / within terms." Decision: the X adapter ships in the codebase behind `X_API_KEY`; until it's set, real-time social signal comes from two free, ToS-clean sources: the Hacker News API (tech/VC discourse) and Bluesky's public AppView API (`public.api.bsky.app`, no auth) with a curated account list covering NBA, news, and tech figures. Cost of the tradeoff: no true X discourse in v1; benefit: $0, no ToS risk, live real-time signal from day one.

## Substack ingestion via per-publication RSS — full content, free, within terms

Substack has no public API, but every publication serves RSS at `<pub>.substack.com/feed` (or the custom domain + `/feed`) including `content:encoded` with complete article HTML (verified against live feeds 2026-07-02). Paywalled posts include only the free preview — which is what Substack chooses to publish in the feed, so it's within terms. This makes Substack a first-class v1 source with in-app full-text reading for free posts.

## Ingestion scheduling via GitHub Actions cron, not Vercel cron

Vercel Hobby limits cron jobs to once per day (verified in Vercel docs 2026-07-02), which can't support real-time-ish ingestion. A GitHub Actions scheduled workflow (free on public repos, ~5–10 min effective cadence) calls a secret-protected `POST /api/ingest`. Backup freshness path: the app triggers a refresh when opened if the newest fetch is stale (>15 min). Known caveat: GitHub delays scheduled workflows under load; combined with the on-open refresh this is acceptable. Upgrade path if this ever matters: Vercel Pro cron (per-minute).

## No LLM calls in v1 — excerpts come from the sources themselves

The spec's "no hallucinated summaries" is satisfied structurally: item excerpts are the publisher's own description/dek from the feed, never generated text. This also keeps running cost at $0 and removes an API-key dependency. If LLM summarization is added later, it must be clearly labeled and grounded in the fetched full text.

## Postgres via Neon in prod, PGlite locally — no local install, one schema

Dev machine has no Postgres and installing one system-wide is invasive. PGlite (in-process WASM Postgres) runs the identical schema locally and in tests; production uses Neon's serverless HTTP driver on Vercel. The db client picks the driver from `DATABASE_URL` presence. Tests of pure logic (parsing, ranking) don't touch a DB at all.

## Anonymous cookie profiles instead of auth in v1

Public app, one real user to start. A signed cookie identifies a profile row seeded with the four starting interests on first visit; no login friction, no auth complexity. Personalization state is per-cookie. Upgrade path: attach an email/OAuth identity to the same profile row later.

## One-word NBA team names mislabel real news — classifier uses city-qualified names

First live run labeled "As U.S. Faces Extreme Heat, Data Centers Are Ordered to Use Backup Power" as NBA (the Miami Heat). "heat", "magic", "jazz", "thunder", "bulls", "nets", "rockets", "suns", "spurs", "kings", "wizards", "hornets", "warriors", "bucks", "hawks" are all common nouns in weather/economics/world coverage, so bare team names are excluded from the taxonomy; those teams match only city-qualified ("miami heat", "utah jazz", …). Regression tests pin this. Lesson: validate a classifier against live data, not just constructed examples.

## Cluster threshold lowered 0.6 → 0.5 after live data showed 0.6 never fires

Different outlets word the same story differently enough that 0.6 Jaccard on distinctive title tokens almost never matched on real headlines. 0.5 produces real clusters (8 on the first production ingest) without visible false positives. Below ~0.45 false positives rise. Revisit with more data.

## Publishers ship broken feeds — defend against literal "null"

ESPN's live RSS serializes missing descriptions as the string "null" (`<description><![CDATA[null]]></description>`), which rendered verbatim in the feed. `makeExcerpt` now treats "null"/"undefined"/"n/a" as absent. Also: Taipei Times dates by local publication day (UTC+8), which parses up to a day in the future — near-future timestamps are clamped to now instead of dropped; only >26h-future items (genuinely broken) are rejected.

## PGlite + Next dev needs a globalThis singleton and serverExternalPackages

Two gotchas from using PGlite as the local dev DB: (1) Turbopack bundling breaks its WASM asset paths — fixed with `serverExternalPackages: ["@electric-sql/pglite"]` in next.config.ts; (2) Next dev builds separate module graphs for pages vs route handlers, so a module-scope db instance created two PGlite handles on one data dir that couldn't see each other's writes (profile created via API was invisible to the page). The db client is now cached on `globalThis`.

## Design QA runs on system Chrome via puppeteer-core, not the preview panel

The preview tool's screenshots degrade at non-default viewport sizes (tiny thumbnails, black captures after JS scrolling). scripts/screenshot.mjs drives the installed Chrome headless with a profile cookie injected, at any viewport/color-scheme, against dev or prod. This is what the spec's "use vision to critique your own UI" loop actually ran on.

## Deployment record (2026-07-03)

- Vercel project `inflow` (team cartergw01s-projects), aliased to https://inflow-tawny.vercel.app, GitHub repo cartergw01/inflow auto-connected for deploys on push.
- Neon Postgres `inflow-db` provisioned free-tier via `vercel install neon --plan free_v3` — fully automated, no dashboard interruption needed. `DATABASE_URL` present in all Vercel envs; schema pushed with drizzle-kit.
- `INGEST_SECRET` set in Vercel env (all three environments) and as a GitHub Actions secret; `APP_URL` is a repo variable. Ingest workflow verified end-to-end (manual dispatch + scheduled runs inserting items).
- Live verification: 648 items ingested on first prod run (0 errors, 8 clusters); signals→affinity loop confirmed against prod DB (save + 90s read on a Slow Boring piece → topic:us-politics +4.5, source/author +2.25, exactly per the engine's spec).

## Ranking is transparent scoring + diversity, not engagement optimization

Score = topic/source/author affinity (learned from signals with 14-day half-life decay) + recency (half-life varies by source class: hours for social, ~1 day for news, ~4 days for longform) + source quality prior. Then cluster-collapse (one entry per story) and same-topic/source interleaving penalties. ~10% of slots are epsilon-greedy exploration so the feed widens beyond the seed interests instead of narrowing. No dwell-maximizing objective anywhere — signals feed *relevance*, and "less like this"/hide are first-class negative signals.

## Open questions

- **X integration**: adapter is built and gated on `X_API_KEY`. Turning it on costs ~$30–75/mo at useful read volume and needs the owner's X developer account + payment method. Decide if true X discourse is worth it once the Bluesky/HN substitute has been lived with for a while.
- **Cluster threshold (0.5)** was tuned on one day of data; watch for false merges (two different stories collapsed) and revisit — a title-token approach may eventually want entity-aware matching.
- **Exploration rate** is fixed at every 10th slot. If the feed still narrows over weeks of real use, make it adaptive (increase when click diversity drops).
- **Multi-user**: anonymous cookie profiles work for a public app, but losing the cookie loses the profile. If anyone beyond the first user sticks, attach optional email/OAuth to the same profile row.
- **Feed pagination**: v1 renders the top 80 ranked entries in one page. Fine at current volume; add cursor pagination if the candidate window grows.
