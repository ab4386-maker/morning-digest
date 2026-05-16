import type { DigestItem } from "./types";

// Recency decay tuned to rotate routine articles within ~2 days while letting genuinely
// high-quality pieces survive 36-48h. Worked example with the 48h "today" TTL:
//   - Tier 1 (score 90) at 36h:  90 × 0.85 = 76  → still beats a fresh score-70
//   - Tier 3 (score 65) at 36h:  65 × 0.85 = 55  → loses to anything fresh ≥ 56
//   - Anything past 48h is filtered by TTL before this ever runs (for cadence="today")
function decayFactor(ageHours: number): number {
  if (ageHours < 24) return 1.0;           // first day — no penalty
  if (ageHours < 36) return 0.85;          // mild penalty 24-36h
  if (ageHours < 48) return 0.65;          // 36-48h — has to be high-quality to stay
  // ── Below only applies to weekly/fun cadences (today is filtered by TTL) ──
  if (ageHours < 24 * 7) return 0.55;      // 2-7 days
  if (ageHours < 24 * 14) return 0.45;     // 1-2 weeks
  if (ageHours < 24 * 30) return 0.35;     // 2-4 weeks
  return 0.25;                             // older than 30 days
}

export function effectiveImportance(item: DigestItem, now: number = Date.now()): number {
  const ageH = (now - new Date(item.publishedAt).getTime()) / 3600000;
  return Math.round(item.importance * decayFactor(ageH));
}
