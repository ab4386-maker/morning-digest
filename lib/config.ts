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
export const TTL_HOURS: Record<Cadence, number> = {
  today: 60, // active news lingers ~2.5 days
  weekly: 60 * 24, // 60 days — monthly podcasts like Acquired stay across release cycles
  fun: 30 * 24,
};

// ── RSS FETCH ──
export const RSS_LOOKBACK_DAYS = 45; // items older than this never enter the pipeline
export const RSS_ITEMS_PER_FEED = 8; // ceiling per source per fetch
export const TRANSCRIPT_MAX_CHARS = 60000;
export const FULL_CONTENT_MAX_CHARS = 30000;

// ── CLAUDE ENRICHMENT ──
export const ENRICH_BATCH_SIZE = 5;
export const ENRICH_CONCURRENCY = 3; // Tier 1 rate-limit safe (10k output tok/min)
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
