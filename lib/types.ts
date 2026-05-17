export type Cadence = "today" | "weekly" | "fun";
export type Category = "markets" | "fun";
export type TabId = "today" | "reads" | "breakdowns" | "fun" | "other" | "re";
// Sub-classification for news items so Today stays strict (breaking only)
// and feature/analysis articles route to their own tab.
export type ItemKind = "breaking" | "feature";

// Items from "reads" sources with importance >= this threshold are also surfaced in Today.
export const PROMOTE_TO_TODAY_THRESHOLD = 80;

export type LastUpdated = Partial<Record<TabId | "trends", string>>;

// 3-star rating used as a personalization signal for Claude's enrichment scoring:
//   3 = love (boost similar items), 2 = meh (neutral), 1 = bad (demote similar / push to Other).
// Item snapshot is preserved so the signal stays useful after the item itself rolls off.
export type Rating = {
  rating: 1 | 2 | 3;
  ratedAt: string;
  sourceId: string;
  sourceName: string;
  title: string;
  tldr?: string;
  importance: number;
  cadence: Cadence;
  relevant?: boolean;
  url: string;
  publishedAt: string;
};

export type RatingsMap = Record<string, Rating>;

// Earnings grid uploaded from AlphaSense Generative Grid xlsx export
export type EarningsCompanyRow = {
  rawDocument: string;       // Full "Document" column value (multi-line)
  ticker?: string;           // Parsed from doc, e.g., "AMAT"
  company?: string;          // e.g., "Applied Materials, Inc."
  callDate?: string;         // e.g., "May 14, 2026"
  cells: Record<string, string>;  // All other column values
};

export type EarningsGrid = {
  id: string;
  uploadedAt: string;
  fileName: string;
  gridName: string;          // e.g., "Copy of Max transcript"
  columnHeaders: string[];   // User's column names beyond Document
  prompts: Record<string, string>;  // Prompts row keyed by column
  summary: Record<string, string>;  // AlphaSense Summary row keyed by column
  companies: EarningsCompanyRow[];
};

// KV index — list of grid IDs in upload order (most recent last)
export type EarningsIndex = string[];

// Overview — Claude-synthesized 1-2 min morning briefing across all tabs.
// Each section is an array of short bullet strings (4-7 per section).
export type Overview = {
  today: string[];
  features: string[];
  re: string[];
  substacks: string[];
  podcasts: string[];
  trends: string[];
  fun: string[];
};

export type OverviewBundle = {
  generatedAt: string;
  overview: Overview;
};

// Set when the pipeline detects an Anthropic billing/credit error.
// Cleared on the next successful enrichment.
export type CreditsStatus = {
  exhausted: boolean;
  detectedAt: string;
  message: string;
} | null;

export type Trend = {
  id: string;
  title: string;
  tldr: string;
  whatsHappening: string;
  whyItMatters: string;
  backstory: string;
  whatsNext: string;
  consensusVsReality?: string;
};

export type TrendsBundle = {
  generatedAt: string;
  trends: Trend[];
};

export type Source = {
  id: string;
  name: string;
  kind: "rss" | "email" | "scrape" | "twitter";
  url?: string;
  emailSender?: string;
  weight: number;
  defaultCadence?: Cadence;
  category?: Category;
  tab?: TabId;
  // Optional per-fetch cap override. Falls back to RSS_ITEMS_PER_FEED in config.ts
  // when unset. Bump for high-volume / high-priority feeds; trim for low-priority.
  itemsPerFeed?: number;
};

// ── PORTFOLIO (SnapTrade-backed brokerage read-only view) ──

// Per-user SnapTrade credentials. Created once on first connect; persisted in KV.
export type SnapTradeUser = {
  userId: string;
  userSecret: string;
  createdAt: string;
};

export type PortfolioPosition = {
  symbol: string;            // e.g., "NVDA"
  description?: string;      // company name from brokerage
  units: number;             // share count (can be fractional)
  price: number;             // last known mark
  marketValue: number;       // units * price
  costBasis?: number;        // average_purchase_price * units (if available)
  unrealizedPnl?: number;    // open_pnl from brokerage, or computed
  unrealizedPnlPct?: number; // unrealizedPnl / costBasis
  weight: number;            // marketValue / portfolio totalEquity
  accountId: string;         // SnapTrade account id (so multi-account aggregation can be debugged)
  currency: string;          // ISO code
  type?: string;             // SecurityType label (e.g., "Common Stock", "Crypto")
};

export type PortfolioAccount = {
  id: string;
  name: string;              // e.g., "Individual" or "Roth IRA"
  institution: string;       // e.g., "Robinhood"
  number?: string;           // masked account number
  cash: number;              // USD cash sitting in account
  equity: number;            // sum of position market values in this account
  total: number;             // cash + equity
};

export type PortfolioSnapshot = {
  generatedAt: string;
  totalEquity: number;       // sum of all position market values across accounts
  totalCash: number;         // sum of all account cash
  totalValue: number;        // totalEquity + totalCash
  totalCostBasis: number;    // sum of costBasis where known (used for unrealized P&L %)
  totalUnrealizedPnl: number;
  accounts: PortfolioAccount[];
  positions: PortfolioPosition[];  // already sorted by weight desc
};

export type DigestItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string;
  cadence: Cadence;
  tldr?: string;
  bullets: string[];
  importance: number;
  whyItMatters?: string;
  clicks?: number;
  // For news items: Claude judgment on whether this is L/S-relevant or general "other news"
  relevant?: boolean;
  // For news items: "breaking" = event-driven from last ~24h; "feature" = analysis/trend piece.
  // Routes to Today vs Features tab.
  kind?: ItemKind;
  // Full RSS content body (stripped of HTML). For substacks this is the full post;
  // for paywalled news this is the teaser. Used by the Ask-about-this feature.
  fullContent?: string;
  // For podcast items with transcripts: structured analyst-note sections
  // (Business Overview / Thesis / Risks / etc.). Rendered in place of bullets when present.
  sections?: { label: string; body: string }[];
};
