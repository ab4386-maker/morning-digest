"use client";

import { useState } from "react";
import type { Trend } from "@/lib/types";

export function TrendCard({ trend }: { trend: Trend }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-lg border bg-white p-5 transition hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:shadow-stone-700/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left"
      >
        <h2 className="font-serif text-[20px] font-semibold leading-[1.2] tracking-[-0.012em] text-stone-900 dark:text-stone-50">
          {trend.title}
        </h2>
        <p className="mt-2 font-serif text-[15px] font-medium leading-snug text-stone-700 dark:text-stone-300">
          {trend.tldr}
        </p>
        {!open && (
          <p className="mt-3 text-xs uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Click to read full breakdown ↓
          </p>
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t pt-4 dark:border-stone-700">
          <Section label="What's happening" body={trend.whatsHappening} />
          <Section label="Why it matters" body={trend.whyItMatters} />
          <Section label="The backstory" body={trend.backstory} />
          <Section label="What's next" body={trend.whatsNext} />
          {trend.consensusVsReality && (
            <Section label="Consensus vs reality" body={trend.consensusVsReality} highlight />
          )}
        </div>
      )}
    </article>
  );
}

function Section({
  label,
  body,
  highlight,
}: {
  label: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <h3
        className={`text-[11px] font-semibold uppercase tracking-wider ${
          highlight
            ? "text-blue-700 dark:text-blue-400"
            : "text-stone-500 dark:text-stone-400"
        }`}
      >
        {label}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{body}</p>
    </div>
  );
}
