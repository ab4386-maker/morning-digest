"use client";

import { useState } from "react";

// 3-step rating control. Each step is a personalization signal sent into the next
// Claude enrichment pass: 1 = downrank (push similar to Other News), 2 = neutral,
// 3 = love (boost similar). The hover label exposes that meaning so the choice
// isn't a guess about "what does 2 stars mean."
const LABELS: Record<1 | 2 | 3, { label: string; tooltip: string }> = {
  1: { label: "demote", tooltip: "Don't show me stuff like this — pushes similar items to Other News" },
  2: { label: "meh", tooltip: "Neutral — no boost or demote" },
  3: { label: "love", tooltip: "More like this — boosts similar items in future ingests" },
};

export function RatingStars({
  itemId,
  initial,
}: {
  itemId: string;
  initial?: number;
}) {
  const [rating, setRating] = useState<number>(initial ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const submit = async (value: 1 | 2 | 3) => {
    setSaving(true);
    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, rating: value }),
      });
      if (res.ok) setRating(value);
    } finally {
      setSaving(false);
    }
  };

  const display = (hover || rating) as 0 | 1 | 2 | 3;
  const activeLabel = display > 0 ? LABELS[display as 1 | 2 | 3] : null;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {([1, 2, 3] as const).map((n) => {
        const filled = n <= display;
        // Color the active button by intent: red for demote, amber for love, slate for meh.
        const color =
          n === 1
            ? filled ? "text-red-500" : "text-stone-300 hover:text-red-400"
            : n === 2
              ? filled ? "text-stone-500 dark:text-stone-300" : "text-stone-300 hover:text-stone-400"
              : filled ? "text-amber-400" : "text-stone-300 hover:text-amber-300";
        return (
          <button
            key={n}
            type="button"
            disabled={saving}
            title={LABELS[n].tooltip}
            onMouseEnter={() => setHover(n)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              submit(n);
            }}
            className={`text-base leading-none transition ${color} disabled:opacity-50`}
            aria-label={`Rate ${n} — ${LABELS[n].label}`}
          >
            ★
          </button>
        );
      })}
      {activeLabel && (
        <span className="ml-1 text-[10px] uppercase tracking-wide text-stone-400">
          {activeLabel.label}
        </span>
      )}
    </div>
  );
}
