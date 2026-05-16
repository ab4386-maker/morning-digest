export type Cadence = "today" | "weekly" | "fun";
export type Category = "markets" | "fun";
export type TabId = "today" | "reads" | "breakdowns" | "fun" | "other";
// Sub-classification for news items so Today stays strict (breaking only)
// and feature/analysis articles route to their own tab.
export type ItemKind = "breaking" | "feature";

// Items from "reads" sources with importance >= this threshold are also surfaced in Today.
export const PROMOTE_TO_TODAY_THRESHOLD = 80;

export type LastUpdated = Partial<Record<TabId | "trends", string>>;

// User-provided 1-5 rating with item snapshot so we can recalibrate after the item rolls off
export type Rating = {
  rating: 1 | 2 | 3 | 4 | 5;
  ratedAt: string;
  // snapshot fields for offline analysis
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

// Running tally of Anthropic API token usage. Each Claude call adds to this.
// Reset via /api/reset-usage when user refills credits.
export type UsageStats = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  resetAt: string; // ISO date — usage counted since this timestamp
  lastUpdated: string;
};

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
