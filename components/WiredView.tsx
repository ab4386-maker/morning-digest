"use client";

import type { DigestItem, Source, TabId } from "@/lib/types";

// Friendly headings for known tabs. Tabs not listed here show their raw id (uppercased)
// so a newly-added tab appears in Wired without needing this map updated.
const TAB_LABELS: Partial<Record<TabId, string>> = {
  today: "→ Today / Features / Other News",
  reads: "→ Substacks",
  breakdowns: "→ Podcasts",
  re: "→ RE",
  fun: "→ Fun",
  other: "→ Other News",
};

// Display order for known tabs. Anything not listed gets appended in
// first-seen order from the sources array, so new tabs show up automatically.
const TAB_ORDER: TabId[] = ["today", "reads", "breakdowns", "re", "fun", "other"];

const UNCLASSIFIED = "__unclassified__";

export function WiredView({
  sources,
  items,
  gmailConfigured,
}: {
  sources: Source[];
  items: DigestItem[];
  gmailConfigured: boolean;
}) {
  // Pre-compute the newest item per source ID so freshness lookup is O(1).
  const newestBySource = new Map<string, number>();
  for (const item of items) {
    const ts = new Date(item.publishedAt).getTime();
    const existing = newestBySource.get(item.sourceId);
    if (existing === undefined || ts > existing) {
      newestBySource.set(item.sourceId, ts);
    }
  }

  // Group sources by tab (or UNCLASSIFIED), preserving first-seen tab order.
  const grouped = new Map<string, Source[]>();
  for (const s of sources) {
    const key = s.tab ?? UNCLASSIFIED;
    const bucket = grouped.get(key) ?? [];
    bucket.push(s);
    grouped.set(key, bucket);
  }

  // Render in TAB_ORDER first, then any unknown tabs in first-seen order, then unclassified last.
  const orderedKeys: string[] = [];
  for (const t of TAB_ORDER) if (grouped.has(t)) orderedKeys.push(t);
  for (const k of grouped.keys()) {
    if (k === UNCLASSIFIED) continue;
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }
  if (grouped.has(UNCLASSIFIED)) orderedKeys.push(UNCLASSIFIED);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <p className="text-sm text-stone-600 dark:text-stone-300">
        Every source wired into your digest, grouped by which tab its items land in. Add a new
        one with the <strong>+ Add source</strong> button. Freshness tells you when each source
        last contributed an item — silent staleness is usually a sign of a broken feed or
        expired cookie.
      </p>

      {orderedKeys.map((key) => (
        <SourceGroup
          key={key}
          title={titleFor(key)}
          sources={grouped.get(key) ?? []}
          newestBySource={newestBySource}
          gmailConfigured={gmailConfigured}
        />
      ))}
    </div>
  );
}

function titleFor(key: string): string {
  if (key === UNCLASSIFIED) return "Unclassified";
  return TAB_LABELS[key as TabId] ?? `→ ${key.toUpperCase()}`;
}

function SourceGroup({
  title,
  sources,
  newestBySource,
  gmailConfigured,
}: {
  title: string;
  sources: Source[];
  newestBySource: Map<string, number>;
  gmailConfigured: boolean;
}) {
  if (sources.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {title}
      </h2>
      <ul className="divide-y rounded-lg border bg-white dark:divide-stone-700 dark:border-stone-700 dark:bg-stone-900">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-50">{s.name}</p>
              <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                {s.url ?? s.emailSender ?? "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FreshnessBadge lastTs={newestBySource.get(s.id)} kind={s.kind} />
              <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                {s.kind}
              </span>
              <StatusBadge kind={s.kind} gmailConfigured={gmailConfigured} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "12h ago" / "2d ago" / "—" — colored by staleness.
 * Green: <24h. Yellow: 24-72h. Red: >72h or no items at all (broken feed?).
 */
function FreshnessBadge({ lastTs, kind }: { lastTs: number | undefined; kind: string }) {
  // For email sources without GMAIL configured, don't show stale-red — they're just not wired.
  if (lastTs === undefined) {
    return (
      <span
        className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-500"
        title="No items from this source in current digest"
      >
        —
      </span>
    );
  }

  const ageH = (Date.now() - lastTs) / 3600000;
  const label =
    ageH < 1
      ? "just now"
      : ageH < 24
      ? `${Math.round(ageH)}h ago`
      : `${Math.round(ageH / 24)}d ago`;

  let className: string;
  if (ageH < 24) {
    className = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  } else if (ageH < 72) {
    className = "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  } else {
    className = "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
  }

  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${className}`}
      title={`Newest item from this source: ${new Date(lastTs).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ kind, gmailConfigured }: { kind: string; gmailConfigured: boolean }) {
  if (kind === "rss") {
    return (
      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        live
      </span>
    );
  }
  if (kind === "email") {
    if (gmailConfigured) {
      return (
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          live
        </span>
      );
    }
    return (
      <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        pending Gmail
      </span>
    );
  }
  return (
    <span className="rounded bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
      planned
    </span>
  );
}
