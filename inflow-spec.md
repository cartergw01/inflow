# InFlow — Spec

## The problem

Staying informed today means either doom-scrolling a dozen apps, missing things you actually care about, or getting fed content optimized for engagement instead of your actual understanding of the world. This app exists to fix that: open it, and it's the things you need to stay informed, nothing more, nothing hijacking your attention for someone else's ad revenue.

## What this is

A personalized news feed that aggregates from multiple kinds of sources into one place, learns what you actually care about, and gets more accurate and more relevant over time. Public app, available to anyone, starting with one real user whose interests define the first working version.

## Core principles (non-negotiable)

- **No perverse incentives.** No ads, no engagement-optimized ranking, no rage-bait surfacing because it drives clicks. The feed optimizes for "does this genuinely help this person stay informed," not time-on-app.
- **Accuracy first.** Reputable sourcing, no hallucinated summaries, no misrepresenting what a source actually said.
- **Real personalization.** Not a static topic checklist. The feed should learn from what I read, skip, and engage with, and get sharper over time.
- **The interface is the innovation.** The aggregation and personalization matter, but the actual product experience, how it feels to open this app every day, is where this needs to be genuinely excellent. Beautiful, sleek, fast, easy to use, and it just works.

## Sources to aggregate

Three categories, blended into one coherent feed rather than kept in separate silos:

1. **Independent/long-form writers** — Substack and similar platforms
2. **Social/real-time signal** — X/Twitter, for breaking news and discourse
3. **Mainstream media** — reputable outlets for verified, edited reporting

## Starting topics (v1 personalization seed)

- NBA
- Tech industry, VC, startups
- Taiwan
- US politics

This is the seed, not the ceiling. The personalization system should be built to expand and refine based on real usage, not stay locked to these four categories forever.

## Design bar

Previous attempts at this failed specifically on design — generic AI-generated UI that felt like a template, not a product. This time:

- Do not default to a generic dashboard/card-grid look
- Design should feel intentional: considered typography, real hierarchy, a point of view, not shadcn defaults with a color swap
- Use vision to critique UI output against "does this feel like a real, polished product" before calling it done, not just "does it render without errors"

## Intentionally left open (builder decides)

- The full tech stack, ingestion approach, data model, and personalization/ranking approach
- How to source from Substack, X, and mainstream media (X's API cost and Substack's lack of a public API are known constraints — pick the approach that gets closest to the spec without stalling; document tradeoffs in NOTES.md)
- Architecture for real-time-ish ingestion (the hardest technical part — solve it properly rather than faking it with a static dataset)

## Constraints

- Deploy the code to GitHub
- Deploy the live app to Vercel
- Public-facing app (not just a local dev environment)
