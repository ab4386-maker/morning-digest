"use client";

import type { DigestItem, RatingsMap, Source } from "@/lib/types";
import { effectiveImportance } from "@/lib/scoring";
import { DigestBlock } from "./DigestBlock";

/**
 * Renders items grouped by source. Sections appear in the order their sources are
 * defined in `sources` (i.e., lib/sources.ts order). Within each section, items are
 * still sorted by effectiveImportance — so source grouping is the outer organization
 * but quality ranking still drives intra-source order.
 *
 * Used by any tab that supports the "sort by source" toggle (today, features, other,
 * reads, breakdowns, re, fun). Toggling back to "sort by score" gives the default grid.
 */
export function GroupedView({
  items,
  ratings,
  sources,
}: {
  items: DigestItem[];
  ratings: RatingsMap;
  sources: Source[];
}) {
  // Stable preferred order from sources.ts; anything not listed lands at the end.
  const sourceOrder = new Map(sources.map((s, idx) => [s.id, idx]));
  const sourceLookup = new Map(sources.map((s) => [s.id, s.name]));

  const grouped = new Map<string, DigestItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.sourceId) ?? [];
    arr.push(item);
    grouped.set(item.sourceId, arr);
  }

  const now = Date.now();
  const orderedSourceIds = [...grouped.keys()].sort((a, b) => {
    const ai = sourceOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bi = sourceOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  return (
    <div className="space-y-10">
      {orderedSourceIds.map((sid) => {
        const sectionItems = grouped.get(sid) ?? [];
        if (sectionItems.length === 0) return null;
        const sorted = [...sectionItems].sort(
          (a, b) => effectiveImportance(b, now) - effectiveImportance(a, now)
        );
        return (
          <section key={sid}>
            <header className="mb-4 flex items-baseline justify-between border-b pb-2 dark:border-stone-700">
              <h2 className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                {sourceLookup.get(sid) ?? sid}
              </h2>
              <span className="text-[11px] uppercase tracking-wider text-stone-400">
                {sorted.length} {sorted.length === 1 ? "item" : "items"}
              </span>
            </header>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((item) => (
                <DigestBlock key={item.id} item={item} initialRating={ratings[item.id]?.rating} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
