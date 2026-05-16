import fs from "node:fs";
import path from "node:path";
import type {
  CreditsStatus,
  DigestItem,
  EarningsGrid,
  EarningsIndex,
  LastUpdated,
  OverviewBundle,
  Rating,
  RatingsMap,
  TrendsBundle,
  UsageStats,
} from "./types";

export type { CreditsStatus } from "./types"; // re-export for back-compat with existing imports

// In production (Vercel), KV_REST_API_URL is set and we use Vercel KV.
// Locally, we fall back to the data/*.json files so dev iteration stays fast.
const useKv = !!process.env.KV_REST_API_URL;

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_PATH = path.join(DATA_DIR, "digest.json");
const TRENDS_PATH = path.join(DATA_DIR, "trends.json");
const LAST_UPDATED_PATH = path.join(DATA_DIR, "last-updated.json");
const RATINGS_PATH = path.join(DATA_DIR, "ratings.json");

const KV_DIGEST_KEY = "digest";
const KV_TRENDS_KEY = "trends";
const KV_LAST_UPDATED_KEY = "last_updated";
const KV_RATINGS_KEY = "ratings";
const KV_OVERVIEW_KEY = "overview";
const OVERVIEW_PATH = path.join(DATA_DIR, "overview.json");
const KV_CREDITS_KEY = "credits_status";
const CREDITS_PATH = path.join(DATA_DIR, "credits-status.json");
const KV_USAGE_KEY = "usage_stats";
const USAGE_PATH = path.join(DATA_DIR, "usage-stats.json");

async function getKv() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

export async function readItems(): Promise<DigestItem[]> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<DigestItem[]>(KV_DIGEST_KEY)) ?? [];
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw) as DigestItem[];
  } catch {
    return [];
  }
}

export async function writeItems(items: DigestItem[]): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    await kv.set(KV_DIGEST_KEY, items);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2));
}

export async function readTrends(): Promise<TrendsBundle | null> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<TrendsBundle>(KV_TRENDS_KEY)) ?? null;
  }
  try {
    const raw = fs.readFileSync(TRENDS_PATH, "utf-8");
    return JSON.parse(raw) as TrendsBundle;
  } catch {
    return null;
  }
}

export async function writeTrends(bundle: TrendsBundle): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    await kv.set(KV_TRENDS_KEY, bundle);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TRENDS_PATH, JSON.stringify(bundle, null, 2));
}

export async function readLastUpdated(): Promise<LastUpdated> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<LastUpdated>(KV_LAST_UPDATED_KEY)) ?? {};
  }
  try {
    const raw = fs.readFileSync(LAST_UPDATED_PATH, "utf-8");
    return JSON.parse(raw) as LastUpdated;
  } catch {
    return {};
  }
}

export async function writeLastUpdated(updates: LastUpdated): Promise<void> {
  const current = await readLastUpdated();
  const merged = { ...current, ...updates };
  if (useKv) {
    const kv = await getKv();
    await kv.set(KV_LAST_UPDATED_KEY, merged);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LAST_UPDATED_PATH, JSON.stringify(merged, null, 2));
}

export async function readRatings(): Promise<RatingsMap> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<RatingsMap>(KV_RATINGS_KEY)) ?? {};
  }
  try {
    const raw = fs.readFileSync(RATINGS_PATH, "utf-8");
    return JSON.parse(raw) as RatingsMap;
  } catch {
    return {};
  }
}

export async function upsertRating(itemId: string, rating: Rating): Promise<void> {
  const current = await readRatings();
  current[itemId] = rating;
  if (useKv) {
    const kv = await getKv();
    await kv.set(KV_RATINGS_KEY, current);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RATINGS_PATH, JSON.stringify(current, null, 2));
}

// ── CREDITS STATUS (flag when Anthropic API rejects for billing reasons) ──

export async function readCreditsStatus(): Promise<CreditsStatus> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<CreditsStatus>(KV_CREDITS_KEY)) ?? null;
  }
  try {
    const raw = fs.readFileSync(CREDITS_PATH, "utf-8");
    return JSON.parse(raw) as CreditsStatus;
  } catch {
    return null;
  }
}

export async function writeCreditsStatus(status: CreditsStatus): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    if (status === null) await kv.del(KV_CREDITS_KEY);
    else await kv.set(KV_CREDITS_KEY, status);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (status === null) {
    try { fs.unlinkSync(CREDITS_PATH); } catch {}
  } else {
    fs.writeFileSync(CREDITS_PATH, JSON.stringify(status, null, 2));
  }
}

// ── USAGE STATS (running Claude token tally) ──

export async function readUsageStats(): Promise<UsageStats | null> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<UsageStats>(KV_USAGE_KEY)) ?? null;
  }
  try {
    const raw = fs.readFileSync(USAGE_PATH, "utf-8");
    return JSON.parse(raw) as UsageStats;
  } catch {
    return null;
  }
}

export async function writeUsageStats(stats: UsageStats): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    await kv.set(KV_USAGE_KEY, stats);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE_PATH, JSON.stringify(stats, null, 2));
}

// ── OVERVIEW (Claude-synthesized morning briefing) ──

export async function readOverview(): Promise<OverviewBundle | null> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<OverviewBundle>(KV_OVERVIEW_KEY)) ?? null;
  }
  try {
    const raw = fs.readFileSync(OVERVIEW_PATH, "utf-8");
    return JSON.parse(raw) as OverviewBundle;
  } catch {
    return null;
  }
}

export async function writeOverview(bundle: OverviewBundle): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    await kv.set(KV_OVERVIEW_KEY, bundle);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OVERVIEW_PATH, JSON.stringify(bundle, null, 2));
}

// ── EARNINGS GRIDS ──

const EARNINGS_INDEX_KEY = "earnings:index";
const EARNINGS_INDEX_PATH = path.join(DATA_DIR, "earnings-index.json");
const earningsKvKey = (id: string) => `earnings:${id}`;
const earningsFsPath = (id: string) => path.join(DATA_DIR, `earnings-${id}.json`);

export async function readEarningsIndex(): Promise<EarningsIndex> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<EarningsIndex>(EARNINGS_INDEX_KEY)) ?? [];
  }
  try {
    const raw = fs.readFileSync(EARNINGS_INDEX_PATH, "utf-8");
    return JSON.parse(raw) as EarningsIndex;
  } catch {
    return [];
  }
}

export async function readEarningsGrid(id: string): Promise<EarningsGrid | null> {
  if (useKv) {
    const kv = await getKv();
    return (await kv.get<EarningsGrid>(earningsKvKey(id))) ?? null;
  }
  try {
    const raw = fs.readFileSync(earningsFsPath(id), "utf-8");
    return JSON.parse(raw) as EarningsGrid;
  } catch {
    return null;
  }
}

export async function readAllEarningsGrids(): Promise<EarningsGrid[]> {
  const index = await readEarningsIndex();
  const grids = await Promise.all(index.map((id) => readEarningsGrid(id)));
  return grids.filter((g): g is EarningsGrid => g !== null);
}

export async function writeEarningsGrid(grid: EarningsGrid): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    await kv.set(earningsKvKey(grid.id), grid);
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(earningsFsPath(grid.id), JSON.stringify(grid, null, 2));
  }
  // Update the index — append new ID (most recent last)
  const index = await readEarningsIndex();
  if (!index.includes(grid.id)) {
    index.push(grid.id);
    if (useKv) {
      const kv = await getKv();
      await kv.set(EARNINGS_INDEX_KEY, index);
    } else {
      fs.writeFileSync(EARNINGS_INDEX_PATH, JSON.stringify(index, null, 2));
    }
  }
}

export async function deleteEarningsGrid(id: string): Promise<void> {
  if (useKv) {
    const kv = await getKv();
    await kv.del(earningsKvKey(id));
  } else {
    try { fs.unlinkSync(earningsFsPath(id)); } catch {}
  }
  const index = await readEarningsIndex();
  const filtered = index.filter((x) => x !== id);
  if (useKv) {
    const kv = await getKv();
    await kv.set(EARNINGS_INDEX_KEY, filtered);
  } else {
    fs.writeFileSync(EARNINGS_INDEX_PATH, JSON.stringify(filtered, null, 2));
  }
}
