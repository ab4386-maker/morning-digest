import { randomUUID } from "node:crypto";
import { Snaptrade } from "snaptrade-typescript-sdk";
import type {
  PortfolioAccount,
  PortfolioPosition,
  PortfolioSnapshot,
  SnapTradeUser,
} from "./types";
import {
  readSnapTradeUser,
  writePortfolio,
  writeSnapTradeUser,
  deleteSnapTradeUser as clearStoredUser,
  deletePortfolio,
} from "./store";

// Lazy client — never construct at module load (Vercel's build step has no env vars).
let _client: Snaptrade | null = null;
function client(): Snaptrade {
  if (_client) return _client;
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) {
    throw new Error("SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set");
  }
  _client = new Snaptrade({ clientId, consumerKey });
  return _client;
}

// Register the SnapTrade user on first call, then reuse the stored secret forever.
async function ensureUser(): Promise<SnapTradeUser> {
  const existing = await readSnapTradeUser();
  if (existing) return existing;

  const userId = `abhi-${randomUUID()}`;
  const res = await client().authentication.registerSnapTradeUser({ userId });
  const data = res.data;
  if (!data.userId || !data.userSecret) {
    throw new Error("SnapTrade registerSnapTradeUser returned no credentials");
  }
  const user: SnapTradeUser = {
    userId: data.userId,
    userSecret: data.userSecret,
    createdAt: new Date().toISOString(),
  };
  await writeSnapTradeUser(user);
  return user;
}

// Returns a one-time Connection Portal URL the user opens to link a brokerage.
// URLs expire in 5 minutes. The portal redirects back to `redirectUrl` after success.
export async function generateConnectUrl(redirectUrl: string): Promise<string> {
  const user = await ensureUser();
  const res = await client().authentication.loginSnapTradeUser({
    userId: user.userId,
    userSecret: user.userSecret,
    broker: "ROBINHOOD",
    immediateRedirect: false,
    customRedirect: redirectUrl,
    connectionType: "read",
  });
  // Response is `EncryptedResponse | LoginRedirectURI`; we want the redirect form.
  const data = res.data as { redirectURI?: string };
  if (!data.redirectURI) {
    throw new Error("SnapTrade loginSnapTradeUser returned no redirectURI");
  }
  return data.redirectURI;
}

// Pulls holdings from every connected brokerage account, aggregates into one snapshot,
// stores in KV, and returns it. Throws if no SnapTrade user exists.
//
// Uses the connection-scoped endpoints (listBrokerageAuthorizations → listBrokerageAuthorizationAccounts
// → getUserAccountPositions + getUserAccountBalance) because the older `getAllUserHoldings`
// endpoint was deprecated and now returns HTTP 410.
export async function refreshPortfolio(): Promise<PortfolioSnapshot> {
  const user = await readSnapTradeUser();
  if (!user) throw new Error("Not connected to SnapTrade — call /api/portfolio/connect first");

  const sdk = client();
  const auth = { userId: user.userId, userSecret: user.userSecret };

  // 1) Active brokerage connections
  const connsRes = await sdk.connections.listBrokerageAuthorizations(auth);
  const conns = (connsRes.data ?? []).filter((c) => !c.disabled && c.id);

  // 2) Per-connection account list — flatten into a single array of {account, connection}
  const accountsNested = await Promise.all(
    conns.map(async (conn) => {
      const r = await sdk.connections.listBrokerageAuthorizationAccounts({
        ...auth,
        authorizationId: conn.id!,
      });
      return (r.data ?? []).map((a) => ({ account: a, conn }));
    })
  );
  const accounts = accountsNested.flat();

  // 3) Per-account positions + balances in parallel
  const enriched = await Promise.all(
    accounts.map(async ({ account, conn }) => {
      const [posRes, balRes] = await Promise.all([
        sdk.accountInformation.getUserAccountPositions({ ...auth, accountId: account.id }),
        sdk.accountInformation.getUserAccountBalance({ ...auth, accountId: account.id }),
      ]);
      return { account, conn, positions: posRes.data ?? [], balances: balRes.data ?? [] };
    })
  );

  const positions: PortfolioPosition[] = [];
  const accountSummaries: PortfolioAccount[] = [];
  let totalCash = 0;
  let totalEquity = 0;
  let totalCostBasis = 0;
  let totalUnrealizedPnl = 0;

  for (const { account, conn, positions: acctPositions, balances } of enriched) {
    const accountId = account.id;
    const institution =
      conn.brokerage?.name ?? account.institution_name ?? "Brokerage";
    const name = account.name ?? account.number ?? "Account";
    const number = account.number;

    // Cash — sum USD balances only (most personal accounts are single-currency)
    let accountCash = 0;
    for (const bal of balances) {
      const code = bal.currency?.code ?? "USD";
      if (code === "USD") accountCash += bal.cash ?? 0;
    }

    let accountEquity = 0;
    for (const p of acctPositions) {
      const symbol = p.symbol?.symbol?.symbol;
      const units = p.units ?? 0;
      const price = p.price ?? 0;
      if (!symbol || units === 0) continue;
      const marketValue = units * price;
      const avg = p.average_purchase_price ?? undefined;
      const costBasis = avg != null ? avg * units : undefined;
      const unrealizedPnl =
        p.open_pnl != null
          ? p.open_pnl
          : costBasis != null
            ? marketValue - costBasis
            : undefined;
      const unrealizedPnlPct =
        costBasis != null && costBasis !== 0 && unrealizedPnl != null
          ? unrealizedPnl / costBasis
          : undefined;

      positions.push({
        symbol,
        description: p.symbol?.symbol?.description ?? undefined,
        units,
        price,
        marketValue,
        costBasis,
        unrealizedPnl,
        unrealizedPnlPct,
        weight: 0, // filled below once we know totalEquity
        accountId,
        currency: p.symbol?.symbol?.currency?.code ?? "USD",
        type: p.symbol?.symbol?.type?.description ?? undefined,
      });

      accountEquity += marketValue;
      if (costBasis != null) totalCostBasis += costBasis;
      if (unrealizedPnl != null) totalUnrealizedPnl += unrealizedPnl;
    }

    totalCash += accountCash;
    totalEquity += accountEquity;
    accountSummaries.push({
      id: accountId,
      name,
      institution,
      number,
      cash: accountCash,
      equity: accountEquity,
      total: accountCash + accountEquity,
    });
  }

  // Compute weights and sort positions by market value desc
  if (totalEquity > 0) {
    for (const p of positions) p.weight = p.marketValue / totalEquity;
  }
  positions.sort((a, b) => b.marketValue - a.marketValue);

  const snapshot: PortfolioSnapshot = {
    generatedAt: new Date().toISOString(),
    totalEquity,
    totalCash,
    totalValue: totalEquity + totalCash,
    totalCostBasis,
    totalUnrealizedPnl,
    accounts: accountSummaries,
    positions,
  };
  await writePortfolio(snapshot);
  return snapshot;
}

// Fully disconnect: delete the SnapTrade user (which revokes every brokerage authorization)
// and clear local KV state. Safe no-op if not connected.
export async function disconnect(): Promise<void> {
  const user = await readSnapTradeUser();
  if (user) {
    try {
      await client().authentication.deleteSnapTradeUser({ userId: user.userId });
    } catch {
      // If SnapTrade rejects (user already gone, network), still clear local state.
    }
  }
  await clearStoredUser();
  await deletePortfolio();
}
