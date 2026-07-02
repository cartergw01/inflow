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

## Ranking is transparent scoring + diversity, not engagement optimization

Score = topic/source/author affinity (learned from signals with 14-day half-life decay) + recency (half-life varies by source class: hours for social, ~1 day for news, ~4 days for longform) + source quality prior. Then cluster-collapse (one entry per story) and same-topic/source interleaving penalties. ~10% of slots are epsilon-greedy exploration so the feed widens beyond the seed interests instead of narrowing. No dwell-maximizing objective anywhere — signals feed *relevance*, and "less like this"/hide are first-class negative signals.
