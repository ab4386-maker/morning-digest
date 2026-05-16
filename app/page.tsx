import { Dashboard } from "@/components/Dashboard";
import {
  readAllEarningsGrids,
  readCreditsStatus,
  readItems,
  readLastUpdated,
  readOverview,
  readPortfolio,
  readRatings,
  readSnapTradeUser,
  readTrends,
} from "@/lib/store";
import { MOCK_ITEMS } from "@/lib/mock-data";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [
    items,
    trendsBundle,
    lastUpdated,
    ratings,
    earningsGrids,
    overviewBundle,
    creditsStatus,
    portfolio,
    snapTradeUser,
  ] = await Promise.all([
    readItems(),
    readTrends(),
    readLastUpdated(),
    readRatings(),
    readAllEarningsGrids(),
    readOverview(),
    readCreditsStatus(),
    readPortfolio(),
    readSnapTradeUser(),
  ]);

  const gmailConfigured = !!process.env.GMAIL_APP_PASSWORD;
  const snapTradeConfigured =
    !!process.env.SNAPTRADE_CLIENT_ID && !!process.env.SNAPTRADE_CONSUMER_KEY;

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
      gmailConfigured={gmailConfigured}
      portfolio={portfolio}
      portfolioConnected={!!snapTradeUser}
      snapTradeConfigured={snapTradeConfigured}
    />
  );
}
