# Daily Digest — Build Guide

> Self-contained recipe to build a personalized news/research dashboard like Abhi's Daily Digest for a new user. Aimed at a developer (or LLM with shell + browser access) who has never seen the source repo.

## What this builds

A web dashboard at `https://<your-app>.vercel.app` that:
1. Pulls RSS feeds (news, substacks, podcasts), Gmail newsletters, and optionally brokerage holdings — twice daily on a cron
2. Scores each item with Claude Haiku (importance, relevance, "today vs feature" split)
3. Routes items into tabs (Today / Features / Other / Substacks / Podcasts / RE / Fun / Wired) and a synthesized 1-2 min "Overview" briefing
4. Emails the briefing to the user at 8am + 6pm ET
5. Learns from a 3-star rating system — 3★ boosts similar items in future ingests, 1★ demotes
6. Ask-a-card chat with web_search; optional Robinhood/brokerage tab via SnapTrade

**Tech**: Next.js 16 App Router, TypeScript, Tailwind, Vercel KV (Upstash Redis), Claude API, GitHub Actions, cron-job.org. Total runtime cost: ~$10-15/mo (Anthropic API).

## Required accounts (all free tier-friendly)

| Service | What for | Cost |
|---|---|---|
| **GitHub** | Code host + Actions cron | Free (private repo) |
| **Vercel** | Hosting (Hobby plan) | Free |
| **Vercel KV / Upstash** | Persistent state | Free tier covers it |
| **Anthropic** | Claude API | ~$10-15/mo at 2 crons/day |
| **Gmail** (or any SMTP) | Email delivery | Free, needs App Password |
| **cron-job.org** | Reliable cron trigger | Free |
| SnapTrade (optional) | Brokerage portfolio tab | Free for personal use |

Total ongoing: **~$10-15/mo** (all Anthropic).

## Architecture

```
cron-job.org (timer, 7:45am + 5:45pm ET)
  POST /api/cron/trigger  ──────────────────────────────────────────┐
                                                                     │
Vercel-hosted Next.js app                                            ▼
  /api/cron/trigger  ───►  GitHub Actions workflow_dispatch
                              │
                              ▼
                           runs `npm run ingest`
                              │
                              ▼  fetches RSS / Gmail / podcast transcripts
                              ▼  enriches via Claude Haiku (cached prompt)
                              ▼  topic-dedup, rank, route into tabs
                              ▼  synthesizes Overview briefing
                              ▼  sends email via Gmail SMTP
                              ▼  writes everything to Vercel KV
                                       │
                                       ▼
Browser ──► https://<your-app>.vercel.app
              reads KV (server component), renders dashboard
```

## Step-by-step setup

### 1. Bootstrap the repo

Two paths:

**(A) Fork the reference repo** (fastest): Ask Abhi to make `https://github.com/ab4386-maker/morning-digest` public OR to create a separate `morning-digest-template` repo with personal data stripped. Fork that into your own GitHub account.

**(B) From scratch**: clone the file tree below into a fresh Next.js app. Skip if you're going with (A).

```
.
├── .github/workflows/ingest.yml      # cron compute (runs npm run ingest)
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/
│       ├── ask/route.ts              # Claude chat per article (with web_search)
│       ├── click/route.ts            # stub: future click-personalization
│       ├── cron/trigger/route.ts     # cron-job.org receiver → workflow_dispatch
│       ├── earnings/{upload,[id]}/route.ts
│       ├── portfolio/{connect,refresh,disconnect}/route.ts  # SnapTrade flow
│       ├── rate/route.ts             # 1-3 star rating endpoint
│       ├── refresh/route.ts          # "Refresh now" button (60s Vercel cap)
│       └── sources/route.ts          # stub: future runtime source-add
├── components/
│   ├── Dashboard.tsx                 # tab shell, filterItemsForTab, SortToggle
│   ├── DigestBlock.tsx               # card renderer
│   ├── OverviewView.tsx              # synthesized briefing
│   ├── GroupedView.tsx               # source-grouped renderer for Source sort
│   ├── PortfolioView.tsx             # SnapTrade KPI strip + positions table
│   ├── EarningsView.tsx              # AlphaSense xlsx upload + grid
│   ├── TrendsView.tsx, TrendCard.tsx
│   ├── WiredView.tsx                 # source list grouped by tab
│   ├── AskModal.tsx                  # chat overlay
│   ├── RatingStars.tsx               # 3-star rating
│   ├── RefreshButton.tsx, AddSourcePanel.tsx, TabButton.tsx, ThemeManager.tsx
├── lib/
│   ├── pipeline.ts                   # runIngest orchestrator
│   ├── sources.ts                    # ★ CUSTOMIZE: feeds + tab routing
│   ├── config.ts                     # CAPS, TTLs, batch sizes, DASHBOARD_URL
│   ├── profile.ts                    # ★ CUSTOMIZE: USER_PROFILE rubric
│   ├── preferences.ts                # ratings → prompt addendum
│   ├── rank.ts                       # Claude enrichment with prompt caching
│   ├── dedup.ts                      # topic dedup pass
│   ├── synthesize.ts, synthesize-overview.ts
│   ├── email-sender.ts               # ★ CUSTOMIZE: EMAIL_RECIPIENT
│   ├── scoring.ts                    # decayFactor + effectiveImportance
│   ├── store.ts                      # KV reads/writes
│   ├── parse-earnings-xlsx.ts
│   ├── snaptrade.ts                  # Portfolio tab integration
│   ├── ingest/{rss,email,transcript}.ts
│   └── json-utils.ts, mock-data.ts, types.ts
├── scripts/ingest.ts                 # CLI entrypoint used by GitHub Actions
├── package.json, tsconfig.json, next.config.mjs, postcss.config.mjs, tailwind.config.ts, vercel.json
└── HANDOFF.md                        # full architecture reference
```

### 2. Vercel setup

```bash
npm install
npm install -g vercel
vercel link          # connect this directory to a new/existing Vercel project
vercel env pull      # if existing
```

Add to Vercel env (`vercel env add <NAME> production`):
- `ANTHROPIC_API_KEY`
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_RECIPIENT`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` (these are auto-injected when you add the Vercel KV integration)
- `CRON_TRIGGER_SECRET` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `GH_WORKFLOW_DISPATCH_TOKEN` (fine-grained PAT, `actions:write` on the repo)
- Optional: `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `COLOSSUS_COOKIE`

### 3. Vercel KV

- Vercel dashboard → your project → Storage tab → Create → KV
- This auto-injects `KV_REST_API_*` env vars

### 4. Gmail App Password

- Enable 2FA on the Gmail account
- https://myaccount.google.com/apppasswords → generate a 16-char password
- Use for both IMAP (newsletter ingest) and SMTP (send briefings)
- `EMAIL_RECIPIENT` can be comma-separated for multiple recipients

### 5. Anthropic

- https://console.anthropic.com/settings/keys → create key
- Top up $5-10 credit at signup
- Tier 2 (50K out tok/min) gets auto-promoted after ~$40 spend; lets you raise concurrency from 2 to 3

### 6. GitHub Actions secrets

Repo Settings → Secrets and variables → Actions → New repository secret. Mirror the Vercel env vars **minus** the SnapTrade + CRON_TRIGGER vars (those are Vercel-only):
- `ANTHROPIC_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_RECIPIENT`, `COLOSSUS_COOKIE`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`

### 7. cron-job.org

- Sign up at https://cron-job.org/en/signup/ (free)
- Create 2 cron jobs:

**Morning** — URL: `https://<your-app>.vercel.app/api/cron/trigger`, method `POST`, body `{"mode":"full"}`, headers `X-Trigger-Secret: <CRON_TRIGGER_SECRET>` and `Content-Type: application/json`, schedule **7:45 AM** in `America/New_York` timezone.

**Evening** — same URL/headers, body `{"mode":"news-only"}`, schedule **5:45 PM** in `America/New_York`.

### 8. Customize for the new user (the 3 files that matter)

**`lib/profile.ts`** — the user's interests rubric. This is the most impactful file. Rewrite the 4-tier scoring guide to match what this user cares about. Example structure:

```ts
export const USER_PROFILE = `I'm a [their role / context].

WHAT I CARE ABOUT — score these tiers carefully:

** TIER 1 — score 90-100 **
- [their highest-priority topics — be specific with names + examples]

** TIER 2 — score 75-89 **
- [important but not headline]

** TIER 3 — score 60-74 **
- [routine relevant]

** TIER 4 — score 40-59 **
- [marginal]

** OFF-TOPIC — score below 40 **
- [things to filter out]

KEY RULE — TRENDS BEAT BREAKING NEWS...
KEY RULE — APPLY USER FEEDBACK MEMORY...
`;

export const FUN_PROFILE = `...`;  // their "fun tab" rubric
```

**`lib/sources.ts`** — every feed/sender they care about. Each entry:

```ts
{
  id: "wsj-markets",          // kebab-case, stable (used as KV cache key)
  name: "WSJ — Markets",      // display name
  kind: "rss",                // or "email"
  url: "https://...",         // RSS feed URL
  weight: 80,                 // 0-100 hint, mostly informational
  defaultCadence: "today",    // "today" | "weekly" | "fun"
  category: "markets",        // "markets" | "fun"
  tab: "today",               // routing target — must match a TabId
  itemsPerFeed: 15,           // optional per-source cap override
}
```

For email sources: `kind: "email", emailSender: "agm@apollo.com"` instead of `url`.

**`lib/config.ts`** — set `DASHBOARD_URL` to the production URL. Optionally tune `CAPS`, `TTL_HOURS`, scoring floors.

**`app/layout.tsx`** — replace the `<h1>` title and metadata with the new user's branding.

**`lib/email-sender.ts`** — change the `from:` name in `transporter.sendMail` if you want.

### 9. First run

```bash
# Sanity check locally (won't send email by default)
npm run ingest

# Or via GitHub Actions UI: Actions tab → "Morning Digest Ingest" → Run workflow
# Or via cron-job.org "Run now" button on either job
```

After the first successful run, the user can open `https://<your-app>.vercel.app` and see the dashboard populated.

## Operations cheatsheet

**Add a new RSS source:** edit `lib/sources.ts`, push to main, wait for Vercel rebuild. The next cron picks it up.

**Adjust scoring strictness:** `lib/config.ts → MIN_MARKETS_SCORE` (default 30) — raise to be pickier.

**Today tab feels sparse:** lower `BREAKING_TODAY_FLOOR` (default 40), or loosen the `kind: "breaking"` definition in `lib/rank.ts`.

**Email arrives late:** GitHub Actions delay; verify cron-job.org fired on time. If consistently late, check Vercel function logs for the `/api/cron/trigger` call.

**Costs creeping up:** lower `RSS_ITEMS_PER_FEED` (default 10), lower `ENRICH_BATCH_SIZE`. Anthropic dashboard shows per-day token spend.

**Anthropic credits hit zero:** dashboard renders a red banner via the `credits_status` KV flag. Refill at console.anthropic.com/settings/billing.

**Manual ingest from anywhere:** `npm run ingest -- --mode=full --send-email` locally, or GitHub Actions "Run workflow" with the mode + email inputs.

## Optional add-ons

**Portfolio tab (SnapTrade)** — already wired in `lib/snaptrade.ts` + `components/PortfolioView.tsx`. Sign up at snaptrade.com, add `SNAPTRADE_CLIENT_ID` + `SNAPTRADE_CONSUMER_KEY` to Vercel, user clicks "Connect Brokerage" on the Portfolio tab.

**Web search in card chat** — already enabled in `app/api/ask/route.ts` via the `web_search_20250305` tool (Anthropic SDK 0.96+). Max 3 searches per question → ~$0.03 cap per turn.

**Earnings xlsx upload** — `EarningsView.tsx` accepts AlphaSense Generative Grid exports. `lib/parse-earnings-xlsx.ts` parses them into a per-company expandable view.

**Podcast transcript hydration** — `lib/ingest/transcript.ts` scrapes acquired.fm + colossus.com (the latter needs `COLOSSUS_COOKIE` from devtools). Skip if you don't want podcast deep-summaries.

## Final checklist before handoff

- [ ] All env vars set in Vercel (production + dev)
- [ ] All env vars set in GitHub Actions secrets (subset)
- [ ] Vercel KV connected to the project
- [ ] Gmail App Password works (test with `npm run ingest -- --mode=full --send-email`)
- [ ] cron-job.org jobs created with correct secret
- [ ] `lib/profile.ts` rewritten for this user
- [ ] `lib/sources.ts` rewritten with their feeds
- [ ] `app/layout.tsx` title updated
- [ ] First scheduled cron fires successfully (check GitHub Actions tab)
- [ ] Briefing email lands in `EMAIL_RECIPIENT` inboxes
- [ ] Read `HANDOFF.md` end-to-end for ongoing operation details

If anything breaks: GitHub Actions logs are the best diagnostic. Each ingest run prints `[pipeline]`, `[rank]`, `[email]`, `[dedup]` tagged messages so you can trace failures.
