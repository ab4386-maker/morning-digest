"use client";

import { useState } from "react";

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

  const submit = async (value: number) => {
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

  const display = hover || rating;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
      title="Rate 1-5 — used to recalibrate ranking"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={saving}
          onMouseEnter={() => setHover(n)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            submit(n);
          }}
          className={`text-base leading-none transition ${
            n <= display ? "text-amber-400" : "text-stone-300 hover:text-amber-300"
          } disabled:opacity-50`}
          aria-label={`Rate ${n}`}
        >
          ★
        </button>
      ))}
      {rating > 0 && !hover && (
        <span className="ml-1 text-[10px] text-stone-400">rated</span>
      )}
    </div>
  );
}
