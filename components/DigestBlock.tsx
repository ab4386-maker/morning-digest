"use client";

import { useState } from "react";
import type { DigestItem } from "@/lib/types";
import { effectiveImportance } from "@/lib/scoring";
import { AskModal } from "./AskModal";
import { RatingStars } from "./RatingStars";

export function DigestBlock({ item, initialRating }: { item: DigestItem; initialRating?: number }) {
  const score = effectiveImportance(item);
  const [askOpen, setAskOpen] = useState(false);

  const onTitleClick = async () => {
    try {
      await fetch(`/api/click?id=${encodeURIComponent(item.id)}`, { method: "POST" });
    } catch {
      // best-effort
    }
  };

  const published = new Date(item.publishedAt);
  const hoursAgo = Math.round((Date.now() - published.getTime()) / 3600000);
  const ago = hoursAgo < 1 ? "just now" : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`;

  return (
    <>
      <article className="rounded-lg border bg-white p-4 transition hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:shadow-stone-700/30">
        <header className="mb-2 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-stone-500">
              {item.sourceName}
            </span>
            <span className="text-xs text-stone-400">·</span>
            <span className="text-xs text-stone-400">{ago}</span>
          </div>
          <span
            className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600"
            title={`relevance ${item.importance} · effective (after recency decay) ${score}`}
          >
            {score}
          </span>
        </header>

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onTitleClick}
          className="block font-serif text-[17px] font-semibold leading-[1.25] tracking-[-0.011em] text-stone-900 hover:text-red-700 dark:text-stone-50 dark:hover:text-red-400"
        >
          {item.title}
        </a>

        {item.tldr && (
          <p className="mt-2.5 font-serif text-[14px] font-medium leading-snug text-stone-800 dark:text-stone-200">{item.tldr}</p>
        )}

        {item.sections && item.sections.length > 0 ? (
          <div className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-stone-700">
            {item.sections.map((s, i) => (
              <div key={i}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  {s.label}
                </p>
                <p className="mt-0.5 text-stone-600">{s.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-stone-600 dark:text-stone-300">
            {item.bullets.map((b, i) => (
              <li key={i} className="pl-4 -indent-4">
                <span className="mr-2 text-stone-400">•</span>
                {b}
              </li>
            ))}
          </ul>
        )}

        {item.whyItMatters && (
          <p className="mt-3 border-t pt-3 text-xs italic text-stone-500">
            <span className="font-medium not-italic text-stone-600">Why it matters:</span>{" "}
            {item.whyItMatters}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <RatingStars itemId={item.id} initial={initialRating} />
          <button
            onClick={() => setAskOpen(true)}
            className="text-[11px] font-medium uppercase tracking-wider text-stone-500 hover:text-blue-700"
          >
            Ask about this →
          </button>
        </div>
      </article>

      {askOpen && <AskModal item={item} onClose={() => setAskOpen(false)} />}
    </>
  );
}
