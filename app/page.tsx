import { Dashboard } from "@/components/Dashboard";
import {
  readAllEarningsGrids,
  readCreditsStatus,
  readItems,
  readLastUpdated,
  readOverview,
  readRatings,
  readTrends,
  readUsageStats,
} from "@/lib/store";
import { MOCK_ITEMS } from "@/lib/mock-data";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [items, trendsBundle, lastUpdated, ratings, earningsGrids, overviewBundle, creditsStatus, usageStats] =
    await Promise.all([
      readItems(),
      readTrends(),
      readLastUpdated(),
      readRatings(),
      readAllEarningsGrids(),
      readOverview(),
      readCreditsStatus(),
      readUsageStats(),
    ]);

  const gmailConfigured = !!process.env.GMAIL_APP_PASSWORD;

  return (
    <Dashboard
      items={items.length > 0 ? items : MOCK_ITEMS}
      trends={trendsBundle?.trends ?? []}
      trendsUpdatedAt={trendsBundle?.generatedAt ?? null}
      lastUpdated={lastUpdated}
      sources={SOURCES}
      ratings={ratings}
      earningsGrids={earningsGrids}
      overview={overviewBundle?.overview ?? null}
      overviewGeneratedAt={overviewBundle?.generatedAt ?? null}
      creditsStatus={creditsStatus}
      usageStats={usageStats}
      gmailConfigured={gmailConfigured}
    />
  );
}
