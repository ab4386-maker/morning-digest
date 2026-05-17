"use client";

import { useMemo, useState } from "react";
import type {
  CreditsStatus,
  DigestItem,
  EarningsGrid,
  LastUpdated,
  Overview,
  PortfolioSnapshot,
  RatingsMap,
  Source,
  TabId,
  Trend,
} from "@/lib/types";
import { effectiveImportance } from "@/lib/scoring";
import { BREAKING_TODAY_FLOOR } from "@/lib/config";

import { DigestBlock } from "./DigestBlock";
import { WiredView } from "./WiredView";
import { EarningsView } from "./EarningsView";
import { OverviewView } from "./OverviewView";
import { GroupedView } from "./GroupedView";
import { TrendsView } from "./TrendsView";
import { TabButton } from "./TabButton";
import { AddSourcePanel } from "./AddSourcePanel";
import { RefreshButton } from "./RefreshButton";
import { PortfolioView } from "./PortfolioView";

type Tab = TabId | "features" | "trends" | "wired" | "earnings" | "overview" | "portfolio";

// Tabs that don't display a "last updated" line under the nav.
const NO_UPDATED_LINE: Set<Tab> = new Set(["wired", "earnings", "overview", "portfolio"]);

// Tabs that only get a once-daily refresh (8am, full mode).
const DAILY_ONLY_TABS: Set<Tab> = new Set(["breakdowns", "trends"]);

// Tabs that show the Score/Source sort toggle. Custom-view tabs (overview, earnings,
// portfolio, wired, trends) don't get the toggle since they don't render a card grid.
const SORTABLE_TABS: Set<Tab> = new Set([
  "today",
  "features",
  "other",
  "reads",
  "breakdowns",
  "fun",
  "re",
]);

type SortMode = "score" | "source";

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
  gmailConfigured,
  portfolio,
  portfolioConnected,
  snapTradeConfigured,
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
  gmailConfigured: boolean;
  portfolio: PortfolioSnapshot | null;
  portfolioConnected: boolean;
  snapTradeConfigured: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showAddSource, setShowAddSource] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("score");

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
        <TabButton active={tab === "re"} onClick={() => setTab("re")}>RE</TabButton>
        <TabButton active={tab === "fun"} onClick={() => setTab("fun")}>Fun</TabButton>
        <TabButton active={tab === "earnings"} onClick={() => setTab("earnings")}>Earnings</TabButton>
        <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>Portfolio</TabButton>
        <TabButton active={tab === "wired"} onClick={() => setTab("wired")}>Wired</TabButton>
      </nav>

      <UpdatedLine ts={tabUpdatedAt(tab)} tab={tab} />

      {SORTABLE_TABS.has(tab) && visible.length > 0 && (
        <SortToggle mode={sortMode} onChange={setSortMode} />
      )}

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
          trends={trends}
          trendsUpdatedAt={trendsUpdatedAt}
          earningsGrids={earningsGrids}
          sortMode={sortMode}
          gmailConfigured={gmailConfigured}
          portfolio={portfolio}
          portfolioConnected={portfolioConnected}
          snapTradeConfigured={snapTradeConfigured}
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

  // Today rule (mirrors pipeline.ts:routeAndCap): breaking items appear in Today
  // even when relevant=false, as long as importance >= BREAKING_TODAY_FLOOR. This
  // covers major world events (pandemics, infrastructure strikes, geopolitical
  // shocks) that aren't directly L/S setups but belong in the morning briefing.
  const inToday = (i: DigestItem): boolean => {
    if (tabOf(i) !== "today" || kindOf(i) !== "breaking") return false;
    if (i.relevant !== false) return true;
    return i.importance >= BREAKING_TODAY_FLOOR;
  };

  let filtered: DigestItem[];
  switch (tab) {
    case "today":
      filtered = items.filter(inToday);
      break;
    case "features":
      filtered = items.filter(
        (i) => tabOf(i) === "today" && i.relevant !== false && kindOf(i) === "feature"
      );
      break;
    case "other":
      // Anything tab=today that didn't make Today or Features. Catches: relevant=false
      // features, relevant=false low-importance breakings, and items without kind set.
      filtered = items.filter(
        (i) =>
          tabOf(i) === "today" &&
          !inToday(i) &&
          !(i.relevant !== false && kindOf(i) === "feature")
      );
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
    case "re":
      filtered = items.filter((i) => tabOf(i) === "re");
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
  trends,
  trendsUpdatedAt,
  earningsGrids,
  gmailConfigured,
  portfolio,
  portfolioConnected,
  snapTradeConfigured,
  sortMode,
}: {
  tab: Tab;
  visible: DigestItem[];
  allItems: DigestItem[];
  ratings: RatingsMap;
  sources: Source[];
  overview: Overview | null;
  overviewGeneratedAt: string | null;
  creditsStatus: CreditsStatus;
  trends: Trend[];
  trendsUpdatedAt: string | null;
  earningsGrids: EarningsGrid[];
  gmailConfigured: boolean;
  portfolio: PortfolioSnapshot | null;
  portfolioConnected: boolean;
  snapTradeConfigured: boolean;
  sortMode: SortMode;
}) {
  if (tab === "overview") {
    return (
      <OverviewView
        overview={overview}
        generatedAt={overviewGeneratedAt}
        creditsStatus={creditsStatus}
      />
    );
  }
  if (tab === "earnings") return <EarningsView grids={earningsGrids} />;
  if (tab === "portfolio")
    return (
      <PortfolioView
        snapshot={portfolio}
        connected={portfolioConnected}
        snapTradeConfigured={snapTradeConfigured}
      />
    );
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

  // Card-grid tabs (today / features / other / reads / breakdowns / fun / re). When
  // sortMode === "source" the user explicitly asked for source-grouped sections;
  // otherwise the default is a flat grid ranked by importance.
  if (sortMode === "source") {
    return <GroupedView items={visible} ratings={ratings} sources={sources} />;
  }
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((item) => (
        <DigestBlock key={item.id} item={item} initialRating={ratings[item.id]?.rating} />
      ))}
    </div>
  );
}

function SortToggle({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  const btn = (id: SortMode, label: string) => {
    const active = mode === id;
    return (
      <button
        type="button"
        onClick={() => onChange(id)}
        className={`px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition ${
          active
            ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
            : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="mb-4 flex justify-end">
      <div className="inline-flex overflow-hidden rounded-md border border-stone-200 dark:border-stone-700">
        {btn("score", "Score")}
        {btn("source", "Source")}
      </div>
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
