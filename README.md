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
GitHub Actions cron (~5 min) ───▶ POST /api/ingest
                                     │
       RSS/Substack · Hacker News · Bluesky · official X adapters
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

- **Ingestion** ([src/lib/ingest](src/lib/ingest)) — named sources across NBA, tech/VC, Taiwan, US politics, markets, and world news. Major wires and social signals poll every 5 minutes, general news every 10, and longform every 30. Conditional GET, publisher-only excerpts, sanitized reader HTML, same-story clustering, correction history, and source-family-aware corroboration are built in. Official X recent search stays off until `X_BEARER_TOKEN` is set (pay per use; see [NOTES.md](NOTES.md)).
- **Ranking** ([src/lib/ranking](src/lib/ranking)) — pure functions: signal→affinity updates with exponential decay, per-source-class recency half-lives (3h social / 24h news / 96h longform), cluster collapse, interleaving penalties, deterministic exploration slots.
- **Interface** ([src/app](src/app), [src/components](src/components)) — an explorable 3D briefing with conventional tap/select, drag/pan, wheel/pinch zoom, persistent search and full-galaxy controls, a catch-up view for stories new since the last open, and a calm in-app reader. Anonymous cookie profiles need no login or onboarding gate.

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

Open http://localhost:3000 and read. No Postgres install, account, onboarding gate, or API keys are needed — local dev runs on PGlite and free feeds.

```bash
npm test                 # parsing, source policy, credibility, clustering, ranking, and galaxy behavior
npm run lint && npx tsc --noEmit
```

## Deploying

Vercel project + Neon via `vercel install neon`. Set `INGEST_SECRET` in Vercel env, then give the repo's GitHub Actions the same secret plus an `APP_URL` variable — the [ingest workflow](.github/workflows/ingest.yml) drives real-time-ish ingestion (Vercel Hobby crons are capped at once/day). Decision log and tradeoffs live in [NOTES.md](NOTES.md).
