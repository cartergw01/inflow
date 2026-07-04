# InFlow.

**The things you need to stay informed. Nothing more.**

A personalized news feed that aggregates independent writers (Substack), real-time social signal (Hacker News, Bluesky), and mainstream media into one editorial reading surface — and learns what you actually care about from how you read, not from a static topic checklist.

**Live:** https://inflow-tawny.vercel.app

## Principles

- **No perverse incentives.** No ads, no engagement-optimized ranking. The feed optimizes for "does this genuinely help you stay informed," not time-on-app.
- **Accuracy first.** Every excerpt is the publisher's own words — no generated summaries, no LLM calls anywhere in the pipeline. Topic labels come from a deterministic, tested classifier.
- **Real personalization.** Reading, skipping, saving, and muting all feed a transparent affinity model with time decay. Roughly one feed slot in ten is reserved for exploration outside your known tastes so the feed widens instead of narrowing.

## How it works

```
GitHub Actions cron (~10 min) ──▶ POST /api/ingest
                                     │
               RSS/Substack · Hacker News · Bluesky adapters
                                     │
         normalize → dedupe (canonical URL) → classify → cluster
                                     │
                               Postgres (Neon)
                                     │
    feed request ──▶ rank: affinity + recency + quality → diversity pass
                                     │
      reading signals (impressions, opens, read-time, save, mute)
                                     └──▶ affinity updates (14-day half-life)
```

- **Ingestion** ([src/lib/ingest](src/lib/ingest)) — ~35 curated sources across NBA, tech/VC, Taiwan, and US politics. Conditional GET, publisher-only excerpts, sanitized reader HTML, same-story clustering. X/Twitter ships as an adapter but stays off until `X_API_KEY` is set (pay-per-usage API; see [NOTES.md](NOTES.md)).
- **Ranking** ([src/lib/ranking](src/lib/ranking)) — pure functions: signal→affinity updates with exponential decay, per-source-class recency half-lives (3h social / 24h news / 96h longform), cluster collapse, interleaving penalties, deterministic exploration slots.
- **Interface** ([src/app](src/app), [src/components](src/components)) — an editorial "calm briefing": lead story, real-time ticker, per-class entry treatments, in-app reader for full-content items, anonymous cookie profiles (no login).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 (custom tokens, no component library) · Drizzle ORM · Neon Postgres (prod) / PGlite (local, zero install) · Vitest · Vercel + GitHub Actions

## Running locally

```bash
npm install
npm run db:push          # creates .pglite/ local database
echo "INGEST_SECRET=dev-secret" > .env
npm run dev
curl -X POST -H "x-ingest-secret: dev-secret" localhost:3000/api/ingest
```

Open http://localhost:3000, pick interests, read. No Postgres install and no API keys needed — local dev runs on PGlite and free feeds.

```bash
npm test                 # 72 tests: parsing (live-captured fixtures), classifier, clustering, ranking behavior
npm run lint && npx tsc --noEmit
```

## Deploying

Vercel project + Neon via `vercel install neon`. Set `INGEST_SECRET` in Vercel env, then give the repo's GitHub Actions the same secret plus an `APP_URL` variable — the [ingest workflow](.github/workflows/ingest.yml) drives real-time-ish ingestion (Vercel Hobby crons are capped at once/day). Decision log and tradeoffs live in [NOTES.md](NOTES.md).
