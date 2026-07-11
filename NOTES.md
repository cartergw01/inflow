# NOTES

Decision log for InFlow. One entry per lesson/decision, one-line summary at the top of each.

## Credible source tiers, source families, and per-source cadence (2026-07-11)

The source registry now records a credibility tier, editorial family, polling interval, and whether a named author is required. Official Bloomberg, WSJ, and CNBC feeds are first-class major sources; Reuters remains represented through its official social account and original Reuters links because reusable full-text Reuters feeds require licensing. Major and curated social sources are eligible every 5 minutes, standard news every 10, and longform every 30. The five-minute GitHub Action is only a scheduler: each source enforces its own next-fetch time and conditional requests, so faster freshness does not mean refetching every feed every run. The UI exposes both publication time and last successful source check, and explicitly calls out delayed sources.

## Official X recent search is bounded, allowlisted, and optional (updated 2026-07-11)

Only X's official recent-search endpoint is used; scraping and algorithmic virality feeds remain rejected. Reads are constrained to a code/config allowlist, exclude replies and reposts, use a cursor, and cap returned posts per run with `X_MAX_POSTS_PER_RUN` (25 by default). The integration stays off without `X_BEARER_TOKEN`. X pricing is pay per use and can change, so operational policy is a hard $25 billing-cycle spending limit in the Developer Console rather than a cost estimate embedded in code. Until credentials are supplied, Hacker News and Bluesky continue to provide free, terms-compliant social signal.

## Corroboration and corrections are source-family aware (2026-07-11)

Significant social claims never become “corroborated” because two accounts repeated them. Corroboration counts independent editorial families, and a social-origin claim needs non-social outlet coverage; otherwise it is visibly labeled unconfirmed. Multiple channels from one newsroom count once. Exact canonical links cluster even when social and publisher headlines differ. Changed source content creates an item-version record; explicit corrections and retractions propagate status and notes into the focus card and reader rather than silently overwriting history.

## Feed delivery is metadata-first and normalized (2026-07-11)

The galaxy query no longer loads article HTML for hundreds of candidates. It fetches compact item metadata, signals, affinity, saves, mutes, and source health in one parallel wave; full sanitized content is fetched only when a reader opens or prefetches a story. Repeated stories across worlds travel once in a normalized `stories` dictionary. Word count is stored at ingestion for reading-time estimates. This removes the main warm-load and reader latency bottlenecks without weakening attribution or the reader experience.

## Galaxy controls favor learned conventions over hidden novelty (2026-07-11)

The spatial metaphor stays, but interaction is now tap/click to select, drag to pan in the camera plane, and wheel/pinch to zoom. Hover affordances, persistent labeled Search and Full galaxy controls, a source-freshness HUD, and a sub-10-second first-use hint make the controls discoverable. The hint never blocks the app and does not create an onboarding gate. Rejected: custom orbit/swipe navigation, hiding labels for visual minimalism, and forcing interest setup before the first useful screen. New-since-last-open is based on the profile's prior feed-open timestamp and appears as both world counts and a catch-up action.

## Topic worlds become recognizable objects, not colored spheres (2026-07-12)

The Observatory's restraint had crossed into sterility: layouts differed by topic, but the world cores still read mostly as tinted geometry. An ImageGen visual-development pass established a clearer silhouette grammar, then the production scene translated it into lightweight procedural Three.js: NBA is a seamed basketball inside a court orbit; Tech / VC is a pinned silicon die; Taiwan is an extruded island silhouette with a central ridge and lantern satellites; US Politics is a columned civic dome; World is a mapped orbital globe. The overview remains still and instrument-like—no texture-heavy photoreal planets, party branding, flags, ambient rotation, or added postprocessing. Mobile uses a tighter map radius and wider camera framing so the thematic cores remain visible in portrait.

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

## Redesign (2026-07-05): "Signal" direction — Swiss graphic app shell

The v1 interface read as a newsletter: one centered scrolling column, no navigation, no sense of place. Three directions were mocked as real HTML and screenshotted before any code: **The Desk** (amber-on-black wire terminal with sidebar channels and a live wire column), **Signal** (Swiss international style: black/white + Klein blue #0018a8, Archivo Black headlines, full-width tab navigation, numbered story hierarchy, hard rules, no rounded corners), and **Ledger** (three-pane Reeder-style reading instrument keeping the warm paper/serif identity). Owner picked **Signal**.

Why the others were rejected: The Desk was the most memorable but committed the whole product to a dark terminal personality — longform essays (a core use, Substack full-text) read like log output without a separate "calm mode" that would have split the identity in two. Ledger had the best reading comfort but was distinctive by craft, not concept — a genre (three-pane RSS reader) rather than a point of view, and closest to "template" of the three.

Signal design rules now in force: category tabs are the primary navigation and the active tab is a solid blue block (always-visible "where am I"); unread items get filled blue squares and black index numbers, read items get hollow squares and grey numbers; micro-labels are mono uppercase with wide tracking; rules are 1–3px solid, corners square, shadows none; one accent color total (Klein blue light mode, brightened #4d6bff on near-black dark mode).

## The Observatory (2026-07-07): the interface is a 3D galaxy

Third interface generation, replacing the Signal tab UI. One persistent Three.js scene hosts the entire product: the galaxy overview and every world interior are camera positions, never page loads. Today is the sun (your briefing orbits it); each followed topic is a world with its own construction — NBA is an amber arena with stories racing the ring plane, Tech/VC a teal circuit lattice, Taiwan a jade island with rising lanterns, US Politics a marble rotunda with two chamber arcs, World an ice-blue globe with satellites. **Orbital distance encodes learned affinity** — worlds you read drift toward the sun, so personalization is literally visible in the map.

**Story-object grammar:** size = ranked relevance; halo brightness + pulse = freshness (decays over 24h; under an hour breathes); read stories collapse to dark embers with minimal halo; saved stories wear a gold ring; positions are seeded by item id so the map is stable across visits. Chosen over "planets with texture maps" because meaning had to be readable pre-attentively at 40 stories/world — luminance and scale scan faster than surface detail.

**Reading transition:** the camera dives into the story's glow (620ms), a radial color wash covers the frame, and the 2D reader slides over the still-mounted, blurred scene. Closing pulls the camera back out to where you were. Article text never renders in-scene.

**Signals carried over spatially:** focus held ≥1s = impression (same skip-penalty semantics), dive/link-out = open, overlay dwell = read_time, card actions = save/more/less/mute source. Verified end-to-end locally (open signal → DB → read state → ember on next load).

## Galaxy performance model (why it stays smooth)

- Story nodes: one InstancedMesh per world with **unlit** materials (lighting faked via color + additive halos) — no per-light cost, ~8 geometry draw calls total.
- Halos: **billboarded instanced quads with procedural radial falloff in-shader** — one draw call per world. First attempt used gl_PointSize sprites, which cap or silently break on several ANGLE/headless stacks; instanced quads are the portable path.
- Glow LOD: a global uniform eases 1.0 → 0.42 when inside a world — soft nebulae from orbit, tight halos up close; without it 40 fresh stories fuse into an illegible fireball (found via screenshot QA).
- Labels are DOM nodes fed by projected positions every 3rd frame, with greedy screen-space decluttering and edge culling; no text rendered in-scene.
- three.js is dynamically imported behind a splash so the base bundle stays lean; the render loop pauses when the tab is hidden; DPR clamped (2 desktop / 1.5 mobile) with a one-time automatic drop to 1 if sustained FPS < ~42; mobile skips antialiasing and halves the starfield. No postprocessing anywhere — additive halos read as bloom at zero pass cost.

## Observatory v2 (2026-07-09): a two-tier visual grammar — the map is the message

Refined the galaxy interface into an explicit grammar, approved from a rendered mockup. Aesthetic moved from nebula-glow to astronomical instrument (Stellarium/NASA Eyes): fine dim starfield, faint ecliptic reference rings, small defined cores, thin orbital lanes, restrained desaturated palettes.

**Always-visible tier (2-second readability):** galaxy size = recency-weighted activity (24h half-life mass, `activityScale` 0.65–1.5×) so galaxies genuinely grow and shrink between sessions; pulse = breaking. Story size = rank, brightness = recency (unchanged). Ambient "N NEW" counts deleted — the pulse channel replaces badges.

**Breaking must be rare to mean anything.** First implementation fired on any <45min story; with 37 sources syncing hourly, every galaxy pulsed — the unread-badge bug reborn as light. Redefined: breaking = a 2+ outlet corroborated cluster under 2h, OR a burst of 3+ fresh news/social stories inside 45min. Routine wire trickle stays dark. Found via screenshot QA; regression-tested.

**Hover tier (on engagement only):** focusing a story spawns its satellite system — orbit speed = discussion velocity (multi-outlet pickup + real HN comment counts); controversy = orbital instability (ring wobble/flicker + satellite jitter), never color, and only claimed where evidence exists: the HN comments-to-points ratio. Non-HN stories report 0 rather than faking a stance model. The focus card mirrors both (velocity bars, ◈ CONTESTED).

**Bridges — the functional novelty:** stories whose topics span two galaxies render as light trails physically connecting them (quadratic arcs, additive tubes, top-5 by rank, the most prominent gets an ambient tag). Tapping a bridge or its tag focuses the story. A tabbed UI structurally cannot surface these.

**Motion discipline:** deleted all ambient orbital rotation from v1. The scene is still except: breaking pulse rings, the focused story's satellites, camera flight, and fresh-story halo breathing. Calmer, and kinder to motion-sensitive users.

**Warp bar:** "/" or the ⌕ button opens type-to-jump over galaxies + all loaded story titles (client-side, no server round-trip); Enter flies you there fast. Exploration is for discovery; search is for intent.

**Mobile:** DPR up to 2 for crisp rendering (FPS watchdog degrades to 1.2 if needed), wider default framing for portrait (radius 80 vs 58), edge-clamped labels, bottom-sheet cards, full-screen warp.

## Galaxy state & navigation

Camera pose + current world persist to localStorage (every 4s and on pagehide); returning sessions wake up inside the last world with no re-flight. Worlds deep-link (`/g/taiwan`) via an optional catch-all route, with pushState/popstate keeping browser back/forward spatial. Keyboard: 1–6 jump worlds, Esc backs out (focus → world → galaxy). The Signal 2D feed was deleted; Saved/Sources remain flat dark pages; `/item/[id]` still serves deep-linked reads outside the scene.

## Open questions

- **X integration**: the official recent-search adapter is built and gated on `X_BEARER_TOKEN`. Enabling it needs the owner's X developer account, credits, and a hard Developer Console spending limit; tune the allowlist and per-run cap only after observing real usage.
- **Cluster threshold (0.5)** was tuned on one day of data; watch for false merges (two different stories collapsed) and revisit — a title-token approach may eventually want entity-aware matching.
- **Exploration rate** is fixed at every 10th slot. If the feed still narrows over weeks of real use, make it adaptive (increase when click diversity drops).
- **Multi-user**: anonymous cookie profiles work for a public app, but losing the cookie loses the profile. If anyone beyond the first user sticks, attach optional email/OAuth to the same profile row.
- **Feed pagination**: the galaxy ships a compact ranked working set in one response. Add cursor pagination if the candidate window or normalized payload grows beyond the documented performance budget.
