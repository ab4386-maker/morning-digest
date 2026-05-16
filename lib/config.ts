// Centralized tunable knobs. Edit here, not scattered across pipeline/rank/dedup.
import type { Cadence } from "./types";

// ── INGEST CAPS (max items per tab written to KV) ──
export const CAPS = {
  today: 25,
  other: 25,
  reads: 15,
  breakdowns: 15,
  fun: 12,
  re: 15,
} as const;

// ── SCORE FLOORS (filter out below) ──
export const MIN_MARKETS_SCORE = 30;
export const MIN_FUN_SCORE = 25;

// ── ROLLING CORPUS TTL (items older than this age out before display) ──
// "today" tab feels stale when the same article sits for 2+ days. 48h is a hard cap;
// anything still important enough to surface gets re-evaluated by the next ingest.
export const TTL_HOURS: Record<Cadence, number> = {
  today: 48, // hard 2-day cap — forces daily-publishing sources (WSJ, Bisnow, etc.) to rotate
  weekly: 60 * 24, // 60 days — monthly podcasts like Acquired stay across release cycles
  fun: 30 * 24,
};

// ── RSS FETCH ──
export const RSS_LOOKBACK_DAYS = 45; // items older than this never enter the pipeline
// Per-fetch ceiling per source. Tradeoff:
//   higher = Claude (not feed order) picks what's important, more API cost + cron runtime
//   lower  = faster crons, but high-volume feeds (Bisnow, Bloomberg, NYT) lose articles
// 10 is the middle ground that keeps Vercel Hobby's 60s cron limit comfortable while
// still capturing more than the original 8. Bump back up after Vercel Pro upgrade.
export const RSS_ITEMS_PER_FEED = 10;
export const TRANSCRIPT_MAX_CHARS = 60000;
export const FULL_CONTENT_MAX_CHARS = 30000;

// ── CLAUDE ENRICHMENT ──
export const ENRICH_BATCH_SIZE = 5;
// Concurrency 2 keeps us under Tier 1's 10K output-tokens/minute cap with headroom for
// the bigger per-feed item counts (RSS_ITEMS_PER_FEED=25) + the feedback memory addendum.
// Bump to 3 only after upgrading to a higher Anthropic tier.
export const ENRICH_CONCURRENCY = 2;
export const ENRICH_MAX_TOKENS = 8000;

// ── DEDUP ──
export const DEDUP_MAX_TOKENS = 4000;

// ── TRENDS ──
export const TRENDS_REFRESH_DAYS = 7;

// ── PODCAST IDS — excluded from news-only mode and from news dedup pool ──
export const PODCAST_SOURCE_IDS = new Set([
  "wsb",
  "acquired",
  "business-breakdowns",
  "invest-like-the-best",
  "all-in",
]);

// ── DEPLOYED URL (used in email footers) ──
export const DASHBOARD_URL = "https://morning-digest-plum.vercel.app";
