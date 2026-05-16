"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PortfolioSnapshot } from "@/lib/types";

export function PortfolioView({
  snapshot,
  connected,
  snapTradeConfigured,
}: {
  snapshot: PortfolioSnapshot | null;
  connected: boolean;
  snapTradeConfigured: boolean;
}) {
  if (!snapTradeConfigured) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
        <p className="font-medium text-stone-900 dark:text-stone-50">SnapTrade not configured.</p>
        <p className="mt-2">
          Sign up at{" "}
          <a
            href="https://snaptrade.com"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-stone-900 dark:hover:text-stone-100"
          >
            snaptrade.com
          </a>
          , then add <code className="font-mono text-xs">SNAPTRADE_CLIENT_ID</code> and{" "}
          <code className="font-mono text-xs">SNAPTRADE_CONSUMER_KEY</code> to{" "}
          <code className="font-mono text-xs">.env.local</code> and your Vercel project.
        </p>
      </div>
    );
  }

  if (!connected) {
    return <ConnectPanel hasSnapshot={false} />;
  }

  // Connected but no snapshot yet — first load after the SnapTrade callback.
  // Auto-trigger a refresh so the user doesn't have to click anything.
  if (!snapshot) {
    return <FirstSyncPanel />;
  }

  return <PortfolioDashboard snapshot={snapshot} />;
}

function FirstSyncPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected") === "1";
  const [busy, setBusy] = useState(justConnected);  // auto-spin if we just came back from SnapTrade
  const [err, setErr] = useState<string | null>(null);
  const triggered = useRef(false);

  const refresh = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/portfolio/refresh", { method: "POST" });
      const data = await res.json();
      if (data.ok) router.refresh();
      else {
        setErr(data.error ?? "refresh failed");
        setBusy(false);
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (justConnected && !triggered.current) {
      triggered.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justConnected]);

  return (
    <div className="rounded-lg border bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
      <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-50">
        Brokerage connected
      </h2>
      <p className="mt-2 max-w-prose text-sm text-stone-600 dark:text-stone-400">
        {busy
          ? "Pulling holdings from SnapTrade — first sync after connecting takes 10-30 seconds while the brokerage responds."
          : "Click Refresh to load your positions for the first time."}
      </p>
      <button
        onClick={refresh}
        disabled={busy}
        className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        {busy ? "↻ Loading holdings…" : "↻ Load holdings"}
      </button>
      {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}

function ConnectPanel({ hasSnapshot }: { hasSnapshot: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/portfolio/connect", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.assign(data.url);
      } else {
        setErr(data.error ?? "Could not get connect URL");
        setBusy(false);
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
      <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-50">
        Connect your brokerage
      </h2>
      <p className="mt-2 max-w-prose text-sm text-stone-600 dark:text-stone-400">
        Read-only link to Robinhood (or any of 20+ brokerages) via SnapTrade. We never see your
        password — SnapTrade hosts the login and gives us back tokens that can only read positions
        and balances. Disconnect any time.
      </p>
      <button
        onClick={connect}
        disabled={busy}
        className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        {busy ? "Opening SnapTrade…" : hasSnapshot ? "Reconnect brokerage" : "Connect Robinhood"}
      </button>
      {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}

function PortfolioDashboard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshErr(null);
    try {
      const res = await fetch("/api/portfolio/refresh", { method: "POST" });
      const data = await res.json();
      if (data.ok) router.refresh();
      else setRefreshErr(data.error ?? "refresh failed");
    } catch (e) {
      setRefreshErr((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect brokerage? This revokes SnapTrade's access — you'll need to reconnect to see holdings again.")) return;
    const res = await fetch("/api/portfolio/disconnect", { method: "POST" });
    if (res.ok) router.refresh();
  };

  const generated = new Date(snapshot.generatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const pnlPct =
    snapshot.totalCostBasis > 0 ? snapshot.totalUnrealizedPnl / snapshot.totalCostBasis : null;

  return (
    <div className="space-y-6">
      {/* Header / KPI strip */}
      <div className="rounded-lg border bg-white p-5 dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <Kpi label="Total Value" value={fmtUsd(snapshot.totalValue)} large />
            <Kpi label="Equity" value={fmtUsd(snapshot.totalEquity)} />
            <Kpi label="Cash" value={fmtUsd(snapshot.totalCash)} />
            <Kpi
              label="Unrealized P&L"
              value={fmtSignedUsd(snapshot.totalUnrealizedPnl)}
              sub={pnlPct != null ? fmtPct(pnlPct) : undefined}
              tone={
                snapshot.totalUnrealizedPnl > 0
                  ? "pos"
                  : snapshot.totalUnrealizedPnl < 0
                    ? "neg"
                    : "neutral"
              }
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <button
                onClick={refresh}
                disabled={refreshing}
                className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {refreshing ? "↻ Refreshing…" : "↻ Refresh"}
              </button>
              <button
                onClick={disconnect}
                className="rounded-md border px-3 py-1.5 text-xs font-medium text-stone-500 transition hover:text-red-600 dark:border-stone-700 dark:text-stone-500 dark:hover:text-red-400"
              >
                Disconnect
              </button>
            </div>
            <p className="text-[11px] text-stone-400">Last refreshed {generated}</p>
            {refreshErr && <p className="text-[11px] text-red-600 dark:text-red-400">{refreshErr}</p>}
          </div>
        </div>
      </div>

      {/* Accounts */}
      {snapshot.accounts.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Accounts ({snapshot.accounts.length})
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.accounts.map((a) => (
              <div
                key={a.id}
                className="rounded-md border bg-white p-3 dark:border-stone-700 dark:bg-stone-900"
              >
                <p className="text-xs text-stone-500 dark:text-stone-400">{a.institution}</p>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-50">{a.name}</p>
                <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-stone-600 dark:text-stone-400">
                  <span>Equity {fmtUsd(a.equity)}</span>
                  <span>Cash {fmtUsd(a.cash)}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-50">
                  {fmtUsd(a.total)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Positions table */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Positions ({snapshot.positions.length})
        </h3>
        {snapshot.positions.length === 0 ? (
          <p className="rounded-lg border bg-white p-6 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
            No positions — brokerage may still be syncing. Try Refresh in a minute.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white dark:border-stone-700 dark:bg-stone-900">
            <table className="w-full text-sm">
              <thead className="border-b text-[11px] uppercase tracking-wider text-stone-500 dark:border-stone-700 dark:text-stone-400">
                <tr>
                  <Th>Symbol</Th>
                  <Th right>Units</Th>
                  <Th right>Price</Th>
                  <Th right>Market Value</Th>
                  <Th right>Weight</Th>
                  <Th right>Cost Basis</Th>
                  <Th right>Unrealized P&L</Th>
                </tr>
              </thead>
              <tbody>
                {snapshot.positions.map((p) => (
                  <tr
                    key={`${p.accountId}-${p.symbol}`}
                    className="border-b last:border-0 dark:border-stone-800"
                  >
                    <Td>
                      <span className="font-semibold text-stone-900 dark:text-stone-50">
                        {p.symbol}
                      </span>
                      {p.description && (
                        <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">
                          {p.description}
                        </span>
                      )}
                    </Td>
                    <Td right>{fmtUnits(p.units)}</Td>
                    <Td right>{fmtUsd(p.price)}</Td>
                    <Td right>{fmtUsd(p.marketValue)}</Td>
                    <Td right>{fmtPct(p.weight)}</Td>
                    <Td right>{p.costBasis != null ? fmtUsd(p.costBasis) : "—"}</Td>
                    <Td right>
                      {p.unrealizedPnl != null ? (
                        <span
                          className={
                            p.unrealizedPnl > 0
                              ? "text-green-600 dark:text-green-400"
                              : p.unrealizedPnl < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-stone-600 dark:text-stone-400"
                          }
                        >
                          {fmtSignedUsd(p.unrealizedPnl)}
                          {p.unrealizedPnlPct != null && (
                            <span className="ml-1 text-[11px] opacity-70">
                              ({fmtPct(p.unrealizedPnlPct)})
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  large,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  large?: boolean;
  tone?: "pos" | "neg" | "neutral";
}) {
  const toneClass =
    tone === "pos"
      ? "text-green-600 dark:text-green-400"
      : tone === "neg"
        ? "text-red-600 dark:text-red-400"
        : "text-stone-900 dark:text-stone-50";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className={`mt-0.5 ${large ? "text-2xl" : "text-lg"} font-semibold ${toneClass}`}>
        {value}
      </p>
      {sub && <p className={`text-xs ${toneClass} opacity-80`}>{sub}</p>}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-3 py-2.5 align-top ${right ? "text-right tabular-nums" : "text-left"}`}>
      {children}
    </td>
  );
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtSignedUsd(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${fmtUsd(Math.abs(n))}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtUnits(n: number): string {
  // Show 4 decimals for fractional shares, integer otherwise.
  return Number.isInteger(n) ? n.toString() : n.toFixed(4);
}
