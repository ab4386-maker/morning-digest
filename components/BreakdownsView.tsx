"use client";

import type { DigestItem, RatingsMap, Source } from "@/lib/types";
import { DigestBlock } from "./DigestBlock";

// Ordered podcast sections for the Business Breakdowns / Podcasts tab.
// Items from sources not in this list fall through to "Other" at the bottom.
const BREAKDOWN_SECTIONS: { id: string; name: string }[] = [
  { id: "business-breakdowns", name: "Business Breakdowns" },
  { id: "all-in", name: "All-In" },
  { id: "acquired", name: "Acquired" },
  { id: "invest-like-the-best", name: "Invest Like the Best" },
];

export function BreakdownsView({
  items,
  ratings,
  sources,
}: {
  items: DigestItem[];
  ratings: RatingsMap;
  sources: Source[];
}) {
  const grouped = new Map<string, DigestItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.sourceId) ?? [];
    arr.push(item);
    grouped.set(item.sourceId, arr);
  }

  const knownIds = new Set(BREAKDOWN_SECTIONS.map((s) => s.id));
  const otherSourceIds = [...grouped.keys()].filter((id) => !knownIds.has(id));
  const sourceLookup = new Map(sources.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-10">
      {BREAKDOWN_SECTIONS.map((section) => {
        const sectionItems = grouped.get(section.id) ?? [];
        if (sectionItems.length === 0) return null;
        return (
          <SourceSection key={section.id} title={section.name} items={sectionItems} ratings={ratings} />
        );
      })}
      {otherSourceIds.map((sid) => {
        const sectionItems = grouped.get(sid) ?? [];
        if (sectionItems.length === 0) return null;
        return (
          <SourceSection
            key={sid}
            title={sourceLookup.get(sid) ?? sid}
            items={sectionItems}
            ratings={ratings}
          />
        );
      })}
    </div>
  );
}

function SourceSection({
  title,
  items,
  ratings,
}: {
  title: string;
  items: DigestItem[];
  ratings: RatingsMap;
}) {
  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between border-b pb-2">
        <h2 className="text-base font-semibold tracking-tight text-stone-900">{title}</h2>
        <span className="text-[11px] uppercase tracking-wider text-stone-400">
          {items.length} {items.length === 1 ? "episode" : "episodes"}
        </span>
      </header>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <DigestBlock key={item.id} item={item} initialRating={ratings[item.id]?.rating} />
        ))}
      </div>
    </section>
  );
}
