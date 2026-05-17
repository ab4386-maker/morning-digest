# Abhi's Daily Digest — Handoff

> Paste this into a new Claude Code session, or just say "read HANDOFF.md" after `cd ~/Downloads/morning-digest`.

## 1. What this is

A personal news/research dashboard for a Princeton undergrad in a long/short equity investing club. Aggregates RSS feeds, Gmail newsletters, podcast transcripts, and AlphaSense earnings xlsx exports. Enriches each item with Claude Haiku 4.5 (TLDR, bullets, importance score, relevance, kind). Routes into tabs. Emails an Overview briefing twice a day.

- **Production**: https://morning-digest-plum.vercel.app
- **Repo**: https://github.com/ab4386-maker/morning-digest (private, push to `main` auto-deploys)
- **Local dir**: `~/Downloads/morning-digest`

## 2. Stack

- Next.js 16.2.6 App Router (async server components)
- React 18.3.1, TypeScript, Tailwind 3.4 (`darkMode: 'class'`)
- Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — $1/Mtok in, $5/Mtok out
- Vercel KV (Upstash Redis) for persistent state; falls back to `data/*.json` locally
- Vercel cron (Hobby plan: 2 entries, each ≤1×/day)
- `imapflow` + `mailparser` (Gmail IMAP read), `nodemailer` (Gmail SMTP send, port 465)
- `cheerio` for HTML scraping, `xlsx` (SheetJS) for AlphaSense grids, `rss-parser` for feeds

## 3. Deploy workflow

```
cd ~/Downloads/morning-digest
# edit files
git add -A && git commit -m "what changed"
git push           # Vercel auto-deploys in ~30s
```

`npx vercel deploy --prod` still works as a manual fallback but is no longer needed.

## 4. File map

```
app/
  layout.tsx          # serif title, ThemeManager (sunset dark mode), body styles
  page.tsx            # async server component — reads all KV state, passes to Dashboard
  globals.css         # light + dark CSS vars with transition
  api/
    refresh/          # POST → runIngest({sendEmail:false}) for the "Refresh now" button
    ask/              # POST → Claude chat per card ("Ask about this")
    rate/             # POST → upsert 1-5 rating
    sources/          # POST → add new source at runtime (writes to SOURCES list? actually KV-backed)
    click/            # POST → bump click count (kept for future personalization)
    cron/
      full/           # 8am ET — full ingest, sends email if user-agent is vercel-cron
      news-only/      # 6pm ET — RSS news only, skips podcasts, sends email if vercel-cron
    earnings/
      upload/         # POST multipart → parse xlsx → store grid
      [id]/           # DELETE grid
    portfolio/
      connect/        # POST → returns SnapTrade Connection Portal URL (auto-registers user on first call)
      refresh/        # POST → pulls latest holdings from all connected brokerages, writes snapshot
      disconnect/     # POST → deletes SnapTrade user (revokes all brokerage auths) + clears local state

components/
  Dashboard.tsx       # tab shell, filterItemsForTab, TabContent, UpdatedLine
  DigestBlock.tsx     # card with serif title, tldr, bullets, why-it-matters, rating, ask
  OverviewView.tsx    # synthesized briefing, red banner if credits exhausted
  TrendsView.tsx + TrendCard.tsx
  BreakdownsView.tsx  # podcast-specific rendering with sections
  EarningsView.tsx    # xlsx upload + GridView (per-company expandable)
  PortfolioView.tsx   # SnapTrade-backed brokerage view: KPI strip, accounts, positions table
  WiredView.tsx       # source list grouped by tab + freshness badges
  AddSourcePanel.tsx  # inline form for adding sources
  RefreshButton.tsx   # header button calling /api/refresh
  AskModal.tsx        # chat overlay
  RatingStars.tsx     # 5-star control
  TabButton.tsx       # nav pill
  ThemeManager.tsx    # client useEffect: toggles .dark on <html> when hour ≥ 19 or < 7

lib/
  pipeline.ts         # runIngest() orchestrator — see §6
  sources.ts          # the 21 source definitions (single source of truth)
  config.ts           # all tunable knobs (caps, scores, TTLs, batch sizes)
  types.ts            # DigestItem, Source, Overview, Trend, etc.
  profile.ts          # USER_PROFILE + FUN_PROFILE (scoring guides used in Claude prompts)
  rank.ts             # enrichMarketsItems / enrichFunItems (batches of 5, concurrency 3)
  dedup.ts            # post-merge topic dedup (single Claude call, news-only)
  synthesize.ts       # Trends Debunked generation (weekly)
  synthesize-overview.ts  # Overview briefing (every cron run)
  email-sender.ts     # nodemailer SMTP, comma-separated recipients
  scoring.ts          # decayFactor() + effectiveImportance()
  store.ts            # KV (prod) / fs (local) reads & writes — see §5 keys
  parse-earnings-xlsx.ts  # AlphaSense Generative Grid parser
  snaptrade.ts        # SnapTrade SDK wrapper: ensureUser / generateConnectUrl / refreshPortfolio / disconnect
  json-utils.ts       # parseJsonArray / parseJsonObject — robust Claude JSON parser
  mock-data.ts        # fallback items when KV empty
  ingest/
    rss.ts            # rss-parser fetch + import to DigestItem
    email.ts          # imapflow IMAP search/fetch + parse
    transcript.ts     # cheerio scrape (auth-gated via COLOSSUS_COOKIE)
```

## 5. KV keys (prod) / `data/*.json` (local)

| Key | Type | Notes |
|---|---|---|
| `digest` | `DigestItem[]` | The active item pool |
| `trends` | `TrendsBundle` | `{generatedAt, trends[]}` — weekly regen |
| `overview` | `OverviewBundle` | `{generatedAt, overview}` — every cron |
| `last_updated` | `Partial<Record<TabId|'trends', string>>` | Per-tab "last refreshed" stamps |
| `ratings` | `Record<itemId, Rating>` | User 1-5 stars + item snapshot |
| `credits_status` | `{exhausted, detectedAt, message}` or null | Red banner trigger |
| `earnings:index` | `string[]` | Grid IDs in upload order |
| `earnings:<id>` | `EarningsGrid` | One per uploaded xlsx |
| `snaptrade:user` | `SnapTradeUser` | `{userId, userSecret, createdAt}` — credential, do not log |
| `portfolio` | `PortfolioSnapshot` | Latest brokerage holdings rendered in Portfolio tab |

## 6. Pipeline flow (`lib/pipeline.ts` → `runIngest`)

1. `assertEnvReady` — ANTHROPIC_API_KEY check
2. `fetchAllSources(mode)` — loop SOURCES, call `ingestRss` or `ingestEmail`
   - **news-only mode skips any source in `PODCAST_SOURCE_IDS`** (incl. WSB)
3. Filter to URLs not already in KV → these are the "new" items
4. `hydrateTranscripts(newMarkets)` — for podcasts on acquired.fm or colossus.com, scrape transcript and attach as `fullContent`
5. `enrichWithCreditTracking(newMarkets, newFun)` — Claude Haiku enrichment in batches of 5 with concurrency 3. On 402/credit errors, writes `credits_status` flag for the banner.
6. `mergeFilterAndDedupe(existing, enrichedMarkets, enrichedFun)`:
   - URL-dedupe (higher score wins)
   - TTL + min-score filter
   - **Topic dedup ONLY on news items** (today tab, non-podcasts) via Claude
7. `routeAndCap(survivors)` → buckets by `source.tab` + `relevant` + `kind`, applies CAPS
8. Write final items to KV
9. `computeTabStamps(stamp, mode)` — `full` updates all stamps; `news-only` skips `breakdowns`
10. `maybeRegenerateTrends` — full-mode only, regenerates if missing or ≥7 days old
11. `synthesizeAndEmailOverview` — generates Overview briefing; emails only if cron sets `sendEmail=true`

## 7. Tab routing rules

| Tab | Filter |
|---|---|
| Overview | (static — uses synthesized Overview from KV) |
| Today | `source.tab === "today" && kind === "breaking" && (relevant !== false || importance >= BREAKING_TODAY_FLOOR)` |
| Features | `source.tab === "today" && relevant !== false && kind === "feature"` |
| Other News | `source.tab === "today"` not in Today or Features (i.e., low-importance breakings, relevant=false features, unclassified) |
| Substacks | `source.tab === "reads"` |
| Podcasts | `source.tab === "breakdowns"` |
| Trends Debunked | (separate KV bundle) |
| Fun | `source.tab === "fun" || cadence === "fun"` |
| RE | `source.tab === "re"` (real estate — Bisnow, The Real Deal) |
| Earnings | (separate `earnings:*` KV keys) |
| Portfolio | (separate `portfolio` + `snaptrade:user` KV keys — SnapTrade integration) |
| Wired | (all sources, grouped by tab) |

Sort: `effectiveImportance(item, now)` descending — see scoring below.

## 8. Sources (23 total — `lib/sources.ts`)

**Today tab (RSS news):** wsj-markets, wsj-world, wsj-us-business, wsj-tech, wsj-opinion, bloomberg-markets-rss, bloomberg-economics-rss, nyt-business-rss, ft-markets-rss, ft-companies-rss

**Today tab (podcast):** wsb (Wall Street Breakfast — Spreaker)

**Today tab (email):** apollo-slok (sender `agm@apollo.com`, only ingests if `GMAIL_APP_PASSWORD` set)

**Substacks (reads tab):** clouded-judgement, citrini, irrational-analysis

**Podcasts (breakdowns tab):** acquired, business-breakdowns, invest-like-the-best, all-in

**Real Estate (re tab):** bisnow, therealdeal (The Real Deal — uses `national/feed/` since the site-wide `/feed/` is disabled by Yoast SEO)

**Fun:** bbc-football, guardian-football

Each source has: `id, name, kind ("rss"|"email"), url|emailSender, weight, defaultCadence, category, tab, itemsPerFeed?`.

`itemsPerFeed?` overrides the global `RSS_ITEMS_PER_FEED` cap for that specific source. Current overrides:
- Bisnow: 20 (RE tab, ~15/day publish rate)
- The Real Deal: 15 (RE companion)
- Bloomberg — Markets: 15 (high-volume core L/S feed)
- NYT — Business: 15 (same)
- BBC Football / Guardian Football: 5 (Fun tab — 5 is plenty)
- Everything else: defaults to 10

## 9. Tunable knobs (`lib/config.ts`)

```ts
CAPS = { today: 25, other: 25, reads: 15, breakdowns: 15, fun: 12, re: 15 }
MIN_MARKETS_SCORE = 30
MIN_FUN_SCORE = 25
BREAKING_TODAY_FLOOR = 40   // breaking items with relevant=false still go to Today if importance ≥ this
TTL_HOURS = { today: 48, weekly: 60*24, fun: 30*24 }   // hours — today is a hard 2-day cap, forces rotation

RSS_LOOKBACK_DAYS = 45         // items older than this never enter
RSS_ITEMS_PER_FEED = 10        // per-source per-fetch cap; tuned to fit Vercel Hobby's 60s cron
TRANSCRIPT_MAX_CHARS = 60000
FULL_CONTENT_MAX_CHARS = 30000

ENRICH_BATCH_SIZE = 8          // items per Claude call (bumped from 5 for cost amortization)
ENRICH_CONCURRENCY = 2         // Tier 1 rate-limit safe (10K out tok/min)
ENRICH_MAX_TOKENS = 10000      // headroom for podcast batches with sections arrays
DEDUP_MAX_TOKENS = 4000

TRENDS_REFRESH_DAYS = 7

PODCAST_SOURCE_IDS = { wsb, acquired, business-breakdowns, invest-like-the-best, all-in }
DASHBOARD_URL = "https://morning-digest-plum.vercel.app"
```

## 10. Scoring formulas

**RSS importance** (set by Claude during enrichment, 0-100). Source `weight` is a hint, not a hard ceiling.

**Email importance** (`lib/ingest/email.ts`):
```
importance = round(source.weight * max(0.15, 1 - hoursOld/96))
cadence    = source.defaultCadence === "weekly" ? "weekly"
           : hoursOld < 24 ? "today" : "weekly"
lookback   = source.defaultCadence === "weekly" ? 14d : 24h
```

**Effective importance for sort** (`lib/scoring.ts`):
```
effectiveImportance(item, now) = round(item.importance * decayFactor(ageHours))

decayFactor (stepwise):
  ageH < 24        → 1.00   (first day — no penalty, signal quality wins)
  ageH < 36        → 0.85   (mild penalty 24-36h)
  ageH < 48        → 0.65   (36-48h — has to be high-quality to stay)
  ageH < 168       → 0.55   (2-7 days, weekly/fun only — today is TTL-filtered)
  ageH < 336       → 0.45   (1-2 weeks)
  ageH < 720       → 0.35   (2-4 weeks)
  else             → 0.25
```

Used BOTH for client-side sorting (Dashboard) AND in `mergeFilterAndDedupe` so the per-tab caps in `routeAndCap` keep items that are important AND fresh, not just the highest raw Claude score. The 24-48h taper combined with `TTL_HOURS.today = 48` forces daily-publishing sources to rotate while Tier 1 pieces can survive 36-48h.

## 11a. Personalization (user feedback memory)

`components/RatingStars.tsx` gives every card a 3-step rating:

| Rating | Meaning | Effect on future ingests |
|---|---|---|
| 3★ love | "more like this" | Up to **+10** boost on items resembling this in topic/framing/angle |
| 2★ meh | neutral | No effect |
| 1★ demote | "don't show me this" | Up to **−15** AND force `relevant=false` (routes to Other News) |

Ratings persist in KV (`ratings`) with a full item snapshot so the signal survives after the rated item rolls off the active digest.

**Flow** (`lib/preferences.ts`):
1. `runIngest` calls `readRatings` → `buildPreferenceMemory` keeps the most recent 12 of each (3★ / 1★) by `ratedAt`.
2. `renderPreferenceAddendum` produces a "USER FEEDBACK MEMORY" block listing title + tldr of each example.
3. The block is appended to `USER_PROFILE` inside `buildMarketsPrompt` — Claude does the similarity reasoning (pattern-match on substance, not literal phrasing).
4. `USER_PROFILE` has an explicit KEY RULE telling Claude to apply this as a ±15 nudge layered on top of the tier rubric, and to flip `relevant=false` for demoted look-alikes.

Cold start (no ratings) → addendum is empty string, prompt is unchanged.

**Legacy 1-5 ratings** (pre-overhaul) are coerced on read in `lib/store.ts:coerceRating`: 5,4 → 3; 3 → 2; 2,1 → 1.

**TTL drop** (`mergeFilterAndDedupe`): item dropped if `ageH > TTL_HOURS[cadence]`.

**Min-score floor**: dropped if `importance < (cadence === "fun" ? MIN_FUN_SCORE : MIN_MARKETS_SCORE)`.

## 11. Claude prompts (locations to edit)

- `lib/profile.ts` — `USER_PROFILE` (4-tier scoring guide) + `FUN_PROFILE`. Used as preamble in enrichment prompts.
- `lib/rank.ts` — `buildMarketsSystem` / `buildFunSystem` (cacheable prefix sent as `system`) + `renderItemsForMarkets` / `renderItemsForFun` (per-batch user message). Output schema: `{id, score, tldr, bullets, cadence?, whyItMatters?, relevant?, kind?, sections?}`. Each batch passes the system block with `cache_control: { type: "ephemeral" }` so the ~3K-token prefix rides Anthropic's prompt cache (first batch ~25% write premium, subsequent batches ~10% read cost — saves ~$3/mo).
- `lib/dedup.ts` — `buildDedupPrompt`. Output: `{drop: string[]}`. Heavily tuned with worked examples (BlackRock, Trump-Xi).
- `lib/synthesize.ts` — Trends Debunked. Output: `Trend[]`. 4-6 items, ~250-400 words across body fields each.
- `lib/synthesize-overview.ts` — Overview briefing. Output: `Overview { today, features, substacks, podcasts, trends, fun }` — each an array of short bullet strings. On news-only (6pm) runs, the pipeline passes the morning Overview as context so Claude focuses on net-new/developing stories rather than rehashing the morning briefing. Evening email also drops the Podcasts section (stale on news-only mode — podcasts aren't re-ingested at 6pm).

## 12. Crons

**Now runs on GitHub Actions** (`.github/workflows/ingest.yml`), not Vercel cron. The ingest exceeds Vercel Hobby's 60s function cap; GitHub Actions has 6h timeout, no cost concerns (private repo Hobby gets 2000 min/month, we use ~240).

```yaml
schedule:
  - cron: "0 12 * * *"   # 8am ET  — full mode (podcasts + weekly trends)
  - cron: "0 22 * * *"   # 6pm ET  — news-only mode (skips podcasts/trends)
workflow_dispatch:        # manual trigger from GitHub UI with mode + email options
```

UTC times = 8am + 6pm ET during EDT. Bump both by 1h during EST (winter).

Workflow runs `npm run ingest -- --mode=<full|news-only> [--send-email]` which invokes [scripts/ingest.ts](scripts/ingest.ts) → same `runIngest()` used by the Vercel routes, but executing on GitHub's runners. Writes to the same Vercel KV as production reads from — so a successful GitHub Actions run instantly updates morning-digest-plum.vercel.app.

**Vercel cron is disabled** (empty `crons: []` in `vercel.json`). The `/api/cron/full` and `/api/cron/news-only` routes still exist — they can be hit manually via curl for testing.

**Manual ingest options:**
- Dashboard "Refresh now" button → calls `/api/refresh` (Vercel, capped at 60s — works for small runs only)
- `npm run ingest` locally → full pipeline, no time limit
- GitHub Actions "Run workflow" button → same as cron, with optional email toggle

**Secrets** required in GitHub Actions (Repo Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_RECIPIENT`, `COLOSSUS_COOKIE`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`. Copy values from `.env.local`.

## 13. Environment variables (in `.env.local` and Vercel project settings)

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude calls |
| `CRON_SECRET` | Cron route auth |
| `GMAIL_USER` | `abhidailydigests@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-char Gmail app password — used for both IMAP read and SMTP send |
| `EMAIL_RECIPIENT` | Comma-separated: `ab4386@princeton.edu,lalitricha@gmail.com,aanabansal@gmail.com` |
| `COLOSSUS_COOKIE` | Session cookie for Colossus transcript scraping (Wordfence-gated) |
| `SNAPTRADE_CLIENT_ID` | SnapTrade Client ID (from snaptrade.com dashboard) — Portfolio tab |
| `SNAPTRADE_CONSUMER_KEY` | SnapTrade Consumer Key — pair with Client ID, treat as a secret |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL` | Auto-injected by Vercel KV |

## 14. Important design decisions (don't undo these without thought)

- **WSB is the only podcast in `today` tab.** It's tagged `tab: "today"` in sources.ts but lives in `PODCAST_SOURCE_IDS`. The news-only cron skips it (WSB only has a morning episode).
- **Topic dedup excludes podcasts and substacks.** They're unique analyses, not coverage of the same event — deduping would drop genuinely distinct content.
- **`source.tab` is the routing source of truth**, not `cadence`. Fun items also include `cadence === "fun"` as a backup matcher for legacy items.
- **Item `kind` ("breaking" vs "feature")** is what splits Today from Features. Both come from sources tagged `tab: "today"`. Set by Claude during enrichment.
- **Item `relevant: false`** routes news to Other News instead of Today. Set by Claude when the story isn't equity-research-relevant.
- **Acquired uses `defaultCadence: "weekly"`** with a 60-day TTL so Ferrari/long-tail episodes don't fall off between releases.
- **Apollo Sløk's correct sender is `agm@apollo.com`**, not the analyst's personal address.
- **Manual refresh button (`/api/refresh`) sets `sendEmail: false`** so iterating during the day doesn't spam recipients.
- **Dashboard default tab is `overview`**, not `today`.
- **Portfolio tab is fully separate from the news pipeline.** Doesn't run on crons, doesn't use Claude. SnapTrade hosts the brokerage OAuth — we never see passwords. `snaptrade:user.userSecret` is a credential (treat like an API key). Disconnect uses `authentication.deleteSnapTradeUser`, which revokes every linked brokerage at once.

## 15. Common gotchas

- **Anthropic credits**: when the balance hits zero the pipeline catches the 402 and writes `credits_status`. The Overview tab shows a red banner. Refill at https://console.anthropic.com/settings/billing — the banner clears on the next successful enrichment.
- **Gmail app password is 16 chars**. If you paste a longer string it's wrong (probably copied with spaces or a different prefix).
- **Colossus cookie expires**. If transcripts start truncating to ~1k chars, the cookie is stale. Re-grab from devtools and update `COLOSSUS_COOKIE`.
- **RSS feeds occasionally cap at fewer items than `RSS_ITEMS_PER_FEED`**. Each feed only returns what the publisher exposes.
- **Adding a new source**: edit `lib/sources.ts` and redeploy. Source IDs are kebab-case and used as KV cache keys, so don't rename existing ones without migrating.
- **Type-check before committing**: `npx tsc --noEmit`. CI doesn't currently block on this.
- **Dark mode** flips at hour ≥ 19 or < 7 (local browser time), via `components/ThemeManager.tsx`. Uses `suppressHydrationWarning` on `<html>` to avoid SSR flash.
- **SnapTrade Connection Portal URLs expire in 5 min.** If the user lingers on the connect page they need to click "Connect" again to get a fresh URL. The portal redirects back to `/?tab=portfolio&connected=1` after success.
- **SnapTrade brokerage data is brokerage-delayed.** Robinhood pushes prices once per minute or so during market hours, much slower after-hours. The "Refresh" button just re-fetches what SnapTrade has cached — it doesn't force the brokerage to repoll.
- **SnapTrade returns HTTP 410 for deprecated endpoints.** `getAllUserHoldings`, `getUserHoldings`, and `listUserAccounts` are all dead — use the connection-scoped chain instead: `connections.listBrokerageAuthorizations` → `connections.listBrokerageAuthorizationAccounts` → `accountInformation.getUserAccountPositions` + `getUserAccountBalance` per account. `lib/snaptrade.ts:refreshPortfolio` already does this. If a future SDK upgrade marks more endpoints `@deprecated`, expect them to start returning 410 soon after.

## 16. Outstanding ideas / known gaps

- No CI yet (no GitHub Actions). Type-check + build verification runs only on Vercel's deploy.
- No tests.
- Trends Debunked corpus uses both fresh items AND the full existing KV pool — can drift if not regenerated for too long.
- Click tracking endpoint (`/api/click`) exists but click history isn't yet folded back into scoring.
- Mobile layout works but isn't deeply tuned (3-column grid collapses to 1).

---

If you're a new Claude session: read `lib/pipeline.ts` first to orient, then `lib/sources.ts` and `lib/config.ts`. Most edits the user asks for will be in those three files plus `components/Dashboard.tsx`.
