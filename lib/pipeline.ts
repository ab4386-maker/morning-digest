import { SOURCES } from "./sources";
import { ingestRss } from "./ingest/rss";
import { ingestEmail } from "./ingest/email";
import { fetchTranscript } from "./ingest/transcript";
import { enrichMarketsItems, enrichFunItems } from "./rank";
import { dedupItems } from "./dedup";
import { synthesizeTrends } from "./synthesize";
import { synthesizeOverview } from "./synthesize-overview";
import { sendOverviewEmail } from "./email-sender";
import { effectiveImportance } from "./scoring";
import {
  readItems,
  readLastUpdated,
  readOverview,
  readRatings,
  readTrends,
  writeCreditsStatus,
  writeItems,
  writeLastUpdated,
  writeOverview,
  writeTrends,
} from "./store";
import { buildPreferenceMemory, renderPreferenceAddendum } from "./preferences";
import type { DigestItem, LastUpdated, Trend } from "./types";
import {
  BREAKING_TODAY_FLOOR,
  CAPS,
  MAX_PER_SOURCE_READS,
  MIN_FUN_SCORE,
  MIN_MARKETS_SCORE,
  PODCAST_SOURCE_IDS,
  TRENDS_REFRESH_DAYS,
  TTL_HOURS,
} from "./config";

export type IngestMode = "full" | "news-only";

export type IngestOptions = {
  forceTrends?: boolean;
  dedupOnly?: boolean;
  // "full" runs everything (8am). "news-only" skips breakdowns + trends (afternoon runs).
  mode?: IngestMode;
  // Whether to send the Overview email after generating it. Default false so manual
  // ingest runs (re-fires, deploys, local dev) don't spam your inbox. Set true only
  // for scheduled Vercel cron invocations.
  sendEmail?: boolean;
};

export type IngestResult = {
  written: number;
  today: number;
  other: number;
  reads: number;
  breakdowns: number;
  fun: number;
  re: number;
  trendsRegenerated: boolean;
  mode: IngestMode;
};

const SOURCE_TAB_MAP = new Map(SOURCES.map((s) => [s.id, s.tab]));
const tabOf = (item: DigestItem) => SOURCE_TAB_MAP.get(item.sourceId);

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator — composes the named helpers below.
// ─────────────────────────────────────────────────────────────────────────────
export async function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  const mode: IngestMode = opts.mode ?? "full";
  console.log(`[pipeline] starting at ${new Date().toISOString()} (mode=${mode})`);
  assertEnvReady();

  if (opts.dedupOnly) return runDedupOnly(mode);

  const existing = await readItems();
  const existingUrls = new Set(existing.map((i) => i.url));
  console.log(`[pipeline] carrying forward ${existing.length} existing items`);

  // 1. Fetch raw items (RSS + Email), split by category
  const { marketsRaw, funRaw } = await fetchAllSources(mode);

  // 2. Filter to truly-new items, hydrate transcripts for podcasts
  const newMarkets = marketsRaw.filter((i) => !existingUrls.has(i.url));
  const newFun = funRaw.filter((i) => !existingUrls.has(i.url));
  console.log(
    `[pipeline] enriching ${newMarkets.length} new markets items, ${newFun.length} new fun items`
  );
  await hydrateTranscripts(newMarkets);

  // 3. Build personalization addendum from ratings, then enrich via Claude
  const preferenceAddendum = renderPreferenceAddendum(buildPreferenceMemory(await readRatings()));
  if (preferenceAddendum) {
    console.log(`[pipeline] applying user feedback memory (${preferenceAddendum.length} chars)`);
  }
  const { enrichedMarkets, enrichedFun } = await enrichWithCreditTracking(
    newMarkets,
    newFun,
    preferenceAddendum
  );
  const enrichedFunTagged = enrichedFun.map((i) => ({ ...i, cadence: "fun" as const }));

  // 4. Merge + filter + topic-dedup → final survivors
  const survivors = await mergeFilterAndDedupe(existing, enrichedMarkets, enrichedFunTagged);

  // 5. Route by tab + cap → finalItems → write to KV
  const route = routeAndCap(survivors);
  await writeItems(route.finalItems);
  logRouteSummary(route);

  // 6. Update per-tab timestamps
  const stamp = new Date().toISOString();
  const tabStamps = computeTabStamps(stamp, mode);

  // 7. Trends Debunked (full mode only, weekly cadence)
  const trendsRegenerated = await maybeRegenerateTrends({
    mode,
    forceTrends: opts.forceTrends,
    stamp,
    enrichedMarkets,
    enrichedFunTagged,
    existing,
    tabStamps,
  });

  // 8. Overview synthesis + email (email only if explicitly requested — typically scheduled cron)
  await synthesizeAndEmailOverview(route.finalItems, stamp, mode, opts.sendEmail ?? false);

  await writeLastUpdated(tabStamps);

  return {
    written: route.finalItems.length,
    today: route.today.length,
    other: route.other.length,
    reads: route.reads.length,
    breakdowns: route.breakdowns.length,
    fun: route.fun.length,
    re: route.re.length,
    trendsRegenerated,
    mode,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (one job each, in pipeline order)
// ─────────────────────────────────────────────────────────────────────────────

function assertEnvReady(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
}

async function runDedupOnly(mode: IngestMode): Promise<IngestResult> {
  console.log(`[pipeline] --dedup-only: no fetch, no enrich, just dedup`);
  const current = await readItems();
  const deduped = await dedupItems(current);
  await writeItems(deduped);
  return {
    written: deduped.length, today: 0, other: 0, reads: 0, breakdowns: 0, fun: 0, re: 0,
    trendsRegenerated: false, mode,
  };
}

async function fetchAllSources(
  mode: IngestMode
): Promise<{ marketsRaw: DigestItem[]; funRaw: DigestItem[] }> {
  const marketsRaw: DigestItem[] = [];
  const funRaw: DigestItem[] = [];

  for (const source of SOURCES) {
    // Skip all podcasts (incl. WSB) on the afternoon run — they only publish daily/weekly.
    if (mode === "news-only" && PODCAST_SOURCE_IDS.has(source.id)) continue;

    if (source.kind === "rss") {
      console.log(`[pipeline] ${source.name}…`);
      const items = await ingestRss(source);
      console.log(`  -> ${items.length} items`);
      if (source.category === "fun") funRaw.push(...items);
      else marketsRaw.push(...items);
    } else if (source.kind === "email") {
      if (!process.env.GMAIL_APP_PASSWORD) continue; // skip if Gmail not configured
      console.log(`[pipeline] ${source.name} (email)…`);
      const items = await ingestEmail(source);
      console.log(`  -> ${items.length} emails`);
      if (source.category === "fun") funRaw.push(...items);
      else marketsRaw.push(...items);
    }
  }

  return { marketsRaw, funRaw };
}

/**
 * For new podcast items hosted on acquired.fm or colossus.com, fetch the full
 * transcript and attach it as fullContent. Parallel — transcript fetches are
 * network-bound and the cron has tight time limits.
 */
async function hydrateTranscripts(newMarkets: DigestItem[]): Promise<void> {
  const jobs = newMarkets
    .filter(
      (i) =>
        PODCAST_SOURCE_IDS.has(i.sourceId) &&
        (i.url.includes("acquired.fm") || i.url.includes("colossus.com"))
    )
    .map(async (item) => {
      const transcript = await fetchTranscript(item.url);
      if (transcript) {
        item.fullContent = transcript;
        console.log(`[pipeline] transcript ${item.sourceName}: ${transcript.length} chars`);
      }
    });
  await Promise.all(jobs);
}

/**
 * Wraps the enrichment calls with credit-exhausted detection. On billing-related
 * errors, sets a KV flag so the Overview tab can render a banner. On success,
 * clears any stale flag.
 */
async function enrichWithCreditTracking(
  newMarkets: DigestItem[],
  newFun: DigestItem[],
  preferenceAddendum: string = ""
): Promise<{ enrichedMarkets: DigestItem[]; enrichedFun: DigestItem[] }> {
  try {
    const enrichedMarkets = await enrichMarketsItems(newMarkets, preferenceAddendum);
    const enrichedFun = await enrichFunItems(newFun);
    await writeCreditsStatus(null); // clear any stale credit warning
    return { enrichedMarkets, enrichedFun };
  } catch (err) {
    if (isCreditExhaustedError(err)) {
      const e = err as { message?: string };
      console.error(`[pipeline] Anthropic credits exhausted — flagging on dashboard`);
      await writeCreditsStatus({
        exhausted: true,
        detectedAt: new Date().toISOString(),
        message: e.message ?? "Anthropic API rejected request — likely out of credits.",
      });
    }
    throw err;
  }
}

/**
 * Combines existing + newly-enriched items, dedupes by URL (keeping higher score),
 * filters by TTL + min-score, runs Claude topic dedup on the news subset.
 */
async function mergeFilterAndDedupe(
  existing: DigestItem[],
  enrichedMarkets: DigestItem[],
  enrichedFun: DigestItem[]
): Promise<DigestItem[]> {
  // Merge + URL dedupe (higher score wins)
  const byUrl = new Map<string, DigestItem>();
  for (const item of [...existing, ...enrichedMarkets, ...enrichedFun]) {
    const ex = byUrl.get(item.url);
    if (!ex || ex.importance < item.importance) byUrl.set(item.url, item);
  }

  // TTL + min-score filter
  const now = Date.now();
  const survivors = [...byUrl.values()].filter((i) => {
    const ageH = (now - new Date(i.publishedAt).getTime()) / 3600000;
    if (ageH > TTL_HOURS[i.cadence]) return false;
    const min = i.cadence === "fun" ? MIN_FUN_SCORE : MIN_MARKETS_SCORE;
    return i.importance >= min;
  });
  // Sort by recency-adjusted importance so the per-tab caps in routeAndCap surface
  // the most relevant + freshest items (not just the highest raw Claude score).
  // decayFactor is 1.0 for the first 48h, then tapers to 0.45 over ~30 days.
  survivors.sort((a, b) => effectiveImportance(b, now) - effectiveImportance(a, now));

  // Topic dedup pass — ONLY on real news items.
  // Exclude podcasts (including WSB) and substacks — they're unique analyses, not coverage.
  const isNewsArticle = (i: DigestItem) =>
    tabOf(i) === "today" && !PODCAST_SOURCE_IDS.has(i.sourceId);
  const newsSurvivors = survivors.filter(isNewsArticle);
  const passThrough = survivors.filter((i) => !isNewsArticle(i));
  console.log(`[pipeline] dedup on ${newsSurvivors.length} news (passing ${passThrough.length})`);
  const dedupedNews = await dedupItems(newsSurvivors);
  return [...dedupedNews, ...passThrough];
}

type RouteResult = {
  today: DigestItem[];
  other: DigestItem[];
  reads: DigestItem[];
  breakdowns: DigestItem[];
  fun: DigestItem[];
  re: DigestItem[];
  finalItems: DigestItem[];
};

/**
 * Routes items to tabs based on source.tab + relevant flag, caps per tab.
 * Today = relevant news; Other = irrelevant news; Reads/Breakdowns/Fun = per source.tab.
 */
function routeAndCap(survivors: DigestItem[]): RouteResult {
  // Today bucket = any Today-tagged item that's either L/S-relevant OR a substantive
  // breaking news item (regardless of relevance). The "substantive breaking but not
  // relevant" carve-out is what lets Ebola / rail strike / leadership-decap-style
  // stories appear in Today rather than getting buried in Other News.
  const goesToToday = (i: DigestItem): boolean => {
    if (tabOf(i) !== "today") return false;
    if (i.relevant !== false) return true;
    return (i.kind ?? "breaking") === "breaking" && i.importance >= BREAKING_TODAY_FLOOR;
  };
  const today = survivors.filter(goesToToday).slice(0, CAPS.today);
  const other = survivors
    .filter((i) => tabOf(i) === "today" && !goesToToday(i))
    .slice(0, CAPS.other);
  // Substacks tab: apply a per-source cap before the overall cap so prolific
  // sources (a16z, which publishes daily) don't crowd out weekly substacks
  // (Citrini, Clouded Judgement, Irrational Analysis, MBI Deep Dives).
  const readsRaw = survivors.filter((i) => tabOf(i) === "reads");
  const readsPerSource = new Map<string, number>();
  const readsDiverse: DigestItem[] = [];
  for (const item of readsRaw) {
    const count = readsPerSource.get(item.sourceId) ?? 0;
    if (count >= MAX_PER_SOURCE_READS) continue;
    readsPerSource.set(item.sourceId, count + 1);
    readsDiverse.push(item);
  }
  const reads = readsDiverse.slice(0, CAPS.reads);
  const breakdowns = survivors
    .filter((i) => tabOf(i) === "breakdowns")
    .slice(0, CAPS.breakdowns);
  const fun = survivors
    .filter((i) => tabOf(i) === "fun" || i.cadence === "fun")
    .slice(0, CAPS.fun);
  const re = survivors.filter((i) => tabOf(i) === "re").slice(0, CAPS.re);

  return {
    today, other, reads, breakdowns, fun, re,
    finalItems: [...today, ...other, ...reads, ...breakdowns, ...fun, ...re],
  };
}

function logRouteSummary(r: RouteResult): void {
  console.log(
    `[pipeline] wrote ${r.finalItems.length} items (${r.today.length} today, ${r.other.length} other, ${r.reads.length} reads, ${r.breakdowns.length} breakdowns, ${r.fun.length} fun, ${r.re.length} re)`
  );
}

function computeTabStamps(stamp: string, mode: IngestMode): LastUpdated {
  const stamps: LastUpdated = { today: stamp, other: stamp, reads: stamp, fun: stamp, re: stamp };
  if (mode === "full") stamps.breakdowns = stamp;
  return stamps;
}

/**
 * Trends Debunked is full-mode only. Regenerates if forced, missing, or stale (>TRENDS_REFRESH_DAYS).
 * Mutates tabStamps in-place to mark the trends update timestamp.
 */
async function maybeRegenerateTrends(args: {
  mode: IngestMode;
  forceTrends: boolean | undefined;
  stamp: string;
  enrichedMarkets: DigestItem[];
  enrichedFunTagged: DigestItem[];
  existing: DigestItem[];
  tabStamps: LastUpdated;
}): Promise<boolean> {
  if (args.mode !== "full") return false;

  const existingTrends = await readTrends();
  const ageDays = existingTrends
    ? (Date.now() - new Date(existingTrends.generatedAt).getTime()) / 86400000
    : Infinity;
  const shouldRegen = args.forceTrends || !existingTrends || ageDays >= TRENDS_REFRESH_DAYS;

  if (!shouldRegen) {
    console.log(`[pipeline] trends fresh (${ageDays.toFixed(1)}d old) — skipping`);
    return false;
  }

  console.log(`[pipeline] synthesizing trends…`);
  const corpus = [...args.enrichedMarkets, ...args.enrichedFunTagged, ...args.existing].sort(
    (a, b) => b.importance - a.importance
  );
  const trends: Trend[] = await synthesizeTrends(corpus);
  if (trends.length === 0) return false;

  await writeTrends({ generatedAt: args.stamp, trends });
  args.tabStamps.trends = args.stamp;
  console.log(`[pipeline] wrote ${trends.length} trends`);
  return true;
}

/**
 * Single Claude call to synthesize the 1-2 min briefing, then email it.
 * Failures are logged but don't block the cron.
 */
async function synthesizeAndEmailOverview(
  finalItems: DigestItem[],
  stamp: string,
  mode: IngestMode,
  shouldEmail: boolean
): Promise<void> {
  try {
    console.log(`[pipeline] synthesizing overview briefing…`);
    const existingTrendsBundle = await readTrends();
    // For evening (news-only) runs: load the morning overview so the synth knows
    // what the user already read and can focus on net new / developing stories.
    // Full mode (8am) is the fresh start of the day — no prior context needed.
    const priorBundle = mode === "news-only" ? await readOverview() : null;
    if (priorBundle) {
      console.log(`[pipeline] passing morning overview (${priorBundle.generatedAt}) as context`);
    }
    const overview = await synthesizeOverview(
      finalItems,
      existingTrendsBundle?.trends ?? [],
      SOURCES,
      priorBundle?.overview ?? null,
      priorBundle?.generatedAt ?? null
    );
    if (overview) {
      await writeOverview({ generatedAt: stamp, overview });
      console.log(`[pipeline] wrote overview briefing`);
      if (shouldEmail) {
        await sendOverviewEmail(overview, mode);
      } else {
        console.log(`[pipeline] skipping email (sendEmail=false — manual ingest)`);
      }
    }
  } catch (e) {
    console.error(`[pipeline] overview synthesis failed: ${(e as Error).message}`);
  }
}

/**
 * Detect Anthropic billing/credit errors. Patterns we've seen in 400/402/429s:
 *   "Your credit balance is too low", "insufficient_quota", "credit_balance_too_low"
 */
function isCreditExhaustedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    message?: string;
    status?: number;
    error?: { type?: string; message?: string };
  };
  const msg = (e.message ?? e.error?.message ?? "").toLowerCase();
  const type = (e.error?.type ?? "").toLowerCase();
  if (e.status === 402) return true;
  if (
    msg.includes("credit balance") ||
    msg.includes("credit_balance") ||
    msg.includes("insufficient_quota")
  )
    return true;
  if (type === "invalid_request_error" && msg.includes("credit")) return true;
  return false;
}
