"use client";

import { useMemo, useState } from "react";
import type {
  CreditsStatus,
  DigestItem,
  EarningsGrid,
  LastUpdated,
  Overview,
  RatingsMap,
  Source,
  TabId,
  Trend,
  UsageStats,
} from "@/lib/types";
import { effectiveImportance } from "@/lib/scoring";

import { DigestBlock } from "./DigestBlock";
import { WiredView } from "./WiredView";
import { EarningsView } from "./EarningsView";
import { OverviewView } from "./OverviewView";
import { BreakdownsView } from "./BreakdownsView";
import { TrendsView } from "./TrendsView";
import { TabButton } from "./TabButton";
import { AddSourcePanel } from "./AddSourcePanel";
import { RefreshButton } from "./RefreshButton";

type Tab = TabId | "features" | "trends" | "wired" | "earnings" | "overview";

// Tabs that don't display a "last updated" line under the nav.
const NO_UPDATED_LINE: Set<Tab> = new Set(["wired", "earnings", "overview"]);

// Tabs that only get a once-daily refresh (8am, full mode).
const DAILY_ONLY_TABS: Set<Tab> = new Set(["breakdowns", "trends"]);

export function Dashboard({
  items,
  trends,
  trendsUpdatedAt,
  lastUpdated,
  sources,
  ratings,
  earningsGrids,
  overview,
  overviewGeneratedAt,
  creditsStatus,
  usageStats,
  gmailConfigured,
}: {
  items: DigestItem[];
  trends: Trend[];
  trendsUpdatedAt: string | null;
  lastUpdated: LastUpdated;
  sources: Source[];
  ratings: RatingsMap;
  earningsGrids: EarningsGrid[];
  overview: Overview | null;
  overviewGeneratedAt: string | null;
  creditsStatus: CreditsStatus;
  usageStats: UsageStats | null;
  gmailConfigured: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showAddSource, setShowAddSource] = useState(false);

  const sourceTabMap = useMemo(() => {
    const m = new Map<string, TabId | undefined>();
    sources.forEach((s) => m.set(s.id, s.tab));
    return m;
  }, [sources]);

  const visible = useMemo(
    () => filterItemsForTab(items, tab, sourceTabMap),
    [items, tab, sourceTabMap]
  );

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const tabUpdatedAt = (t: Tab): string | null => {
    if (t === "trends") return trendsUpdatedAt;
    if (NO_UPDATED_LINE.has(t)) return null;
    // Features tab pulls from the same items pool as today/other, so reuse the today stamp.
    if (t === "features") return lastUpdated["today"] ?? null;
    return lastUpdated[t as TabId] ?? null;
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[28px] font-bold tracking-[-0.02em] text-stone-900 dark:text-stone-50">
            Abhi&apos;s Daily Digest
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">{todayLabel}</p>
        </div>
        <div className="flex items-start gap-2">
          <RefreshButton />
          <button
            onClick={() => setShowAddSource((v) => !v)}
            className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {showAddSource ? "Close" : "+ Add source"}
          </button>
        </div>
      </header>

      {showAddSource && <AddSourcePanel onClose={() => setShowAddSource(false)} />}

      <nav className="mb-3 flex flex-wrap gap-1 border-b">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
        <TabButton active={tab === "today"} onClick={() => setTab("today")}>Today</TabButton>
        <TabButton active={tab === "features"} onClick={() => setTab("features")}>Features</TabButton>
        <TabButton active={tab === "reads"} onClick={() => setTab("reads")}>Substacks</TabButton>
        <TabButton active={tab === "breakdowns"} onClick={() => setTab("breakdowns")}>Podcasts</TabButton>
        <TabButton active={tab === "trends"} onClick={() => setTab("trends")}>Trends Debunked</TabButton>
        <TabButton active={tab === "other"} onClick={() => setTab("other")}>Other News</TabButton>
        <TabButton active={tab === "fun"} onClick={() => setTab("fun")}>Fun</TabButton>
        <TabButton active={tab === "earnings"} onClick={() => setTab("earnings")}>Earnings</TabButton>
        <TabButton active={tab === "wired"} onClick={() => setTab("wired")}>Wired</TabButton>
      </nav>

      <UpdatedLine ts={tabUpdatedAt(tab)} tab={tab} />

      <main>
        <TabContent
          tab={tab}
          visible={visible}
          allItems={items}
          ratings={ratings}
          sources={sources}
          overview={overview}
          overviewGeneratedAt={overviewGeneratedAt}
          creditsStatus={creditsStatus}
          usageStats={usageStats}
          trends={trends}
          trendsUpdatedAt={trendsUpdatedAt}
          earningsGrids={earningsGrids}
          gmailConfigured={gmailConfigured}
        />
      </main>

      <footer className="mt-12 border-t pt-4 text-xs text-stone-400">
        Items ranked by importance — combination of source weight, recency, and (over time) your click history.
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the items that should render on a given tab, sorted by effective importance.
 * For back-compat: items missing `kind` default to "breaking".
 */
function filterItemsForTab(
  items: DigestItem[],
  tab: Tab,
  sourceTabMap: Map<string, TabId | undefined>
): DigestItem[] {
  const tabOf = (item: DigestItem) => sourceTabMap.get(item.sourceId);
  const kindOf = (i: DigestItem) => i.kind ?? "breaking";
  const now = Date.now();

  let filtered: DigestItem[];
  switch (tab) {
    case "today":
      // Strict: breaking news only. Substacks stay in Substacks — no promotion.
      filtered = items.filter(
        (i) => tabOf(i) === "today" && i.relevant !== false && kindOf(i) === "breaking"
      );
      break;
    case "features":
      filtered = items.filter(
        (i) => tabOf(i) === "today" && i.relevant !== false && kindOf(i) === "feature"
      );
      break;
    case "other":
      filtered = items.filter((i) => tabOf(i) === "today" && i.relevant === false);
      break;
    case "reads":
      filtered = items.filter((i) => tabOf(i) === "reads");
      break;
    case "breakdowns":
      filtered = items.filter((i) => tabOf(i) === "breakdowns");
      break;
    case "fun":
      filtered = items.filter((i) => tabOf(i) === "fun" || i.cadence === "fun");
      break;
    default:
      return [];
  }

  return filtered.sort((a, b) => effectiveImportance(b, now) - effectiveImportance(a, now));
}

/**
 * Renders the appropriate view component for the current tab. Centralized here
 * so the main Dashboard layout stays compact.
 */
function TabContent({
  tab,
  visible,
  allItems,
  ratings,
  sources,
  overview,
  overviewGeneratedAt,
  creditsStatus,
  usageStats,
  trends,
  trendsUpdatedAt,
  earningsGrids,
  gmailConfigured,
}: {
  tab: Tab;
  visible: DigestItem[];
  allItems: DigestItem[];
  ratings: RatingsMap;
  sources: Source[];
  overview: Overview | null;
  overviewGeneratedAt: string | null;
  creditsStatus: CreditsStatus;
  usageStats: UsageStats | null;
  trends: Trend[];
  trendsUpdatedAt: string | null;
  earningsGrids: EarningsGrid[];
  gmailConfigured: boolean;
}) {
  if (tab === "overview") {
    return (
      <OverviewView
        overview={overview}
        generatedAt={overviewGeneratedAt}
        creditsStatus={creditsStatus}
        usageStats={usageStats}
      />
    );
  }
  if (tab === "earnings") return <EarningsView grids={earningsGrids} />;
  if (tab === "trends") return <TrendsView trends={trends} updatedAt={trendsUpdatedAt} />;
  if (tab === "wired")
    return <WiredView sources={sources} items={allItems} gmailConfigured={gmailConfigured} />;

  if (visible.length === 0) {
    return (
      <p className="rounded-lg border bg-white p-6 text-sm text-stone-500">
        Nothing here yet. The ingest runs at 8am and 6pm ET.
      </p>
    );
  }

  if (tab === "breakdowns") {
    return <BreakdownsView items={visible} ratings={ratings} sources={sources} />;
  }

  // Default grid layout for today / features / other / reads / fun
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((item) => (
        <DigestBlock key={item.id} item={item} initialRating={ratings[item.id]?.rating} />
      ))}
    </div>
  );
}

function UpdatedLine({ ts, tab }: { ts: string | null; tab: Tab }) {
  if (NO_UPDATED_LINE.has(tab)) return <div className="mb-6" />;
  const cadence = DAILY_ONLY_TABS.has(tab)
    ? "refreshes 8am ET daily"
    : "refreshes 8am + 6pm ET daily";
  const text = ts
    ? `Last updated ${new Date(ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })} · ${cadence}`
    : `Not yet updated · ${cadence}`;
  return <p className="mb-6 text-xs text-stone-400">{text}</p>;
}
