import type { DigestItem } from "./types";

// Recency decay — but flat within the same day so signal quality drives sort, not timestamps.
// A trend piece from 8h ago should NOT be outranked by a routine headline from 1h ago.
function decayFactor(ageHours: number): number {
  if (ageHours < 48) return 1.0;           // same day(ish) — no penalty
  if (ageHours < 24 * 4) return 0.92;      // 2-4 days
  if (ageHours < 24 * 7) return 0.82;      // 4-7 days
  if (ageHours < 24 * 14) return 0.72;     // 1-2 weeks
  if (ageHours < 24 * 30) return 0.55;     // 2-4 weeks
  return 0.45;                             // older than 30 days
}

export function effectiveImportance(item: DigestItem, now: number = Date.now()): number {
  const ageH = (now - new Date(item.publishedAt).getTime()) / 3600000;
  return Math.round(item.importance * decayFactor(ageH));
}
