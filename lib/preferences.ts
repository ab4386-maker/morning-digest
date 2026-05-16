import type { Rating, RatingsMap } from "./types";

// Cap how many rated examples we ship per pass. Title + tldr ≈ 60-120 tokens each,
// so 8 of each keeps the addendum ~1K tokens — most recent ratings dominate signal
// anyway and the addendum is now inside a cached system prefix, so each token
// counts toward both cache write cost AND every subsequent batch's cache read.
const MAX_EXAMPLES_PER_BUCKET = 8;

// Half-life on rating freshness — older ratings still count but newer ones rank first.
function recency(r: Rating): number {
  return new Date(r.ratedAt).getTime();
}

export type PreferenceMemory = {
  loved: Rating[];   // 3-star — boost similar
  demoted: Rating[]; // 1-star — push similar to Other News
};

export function buildPreferenceMemory(ratings: RatingsMap): PreferenceMemory {
  const all = Object.values(ratings).sort((a, b) => recency(b) - recency(a));
  return {
    loved: all.filter((r) => r.rating === 3).slice(0, MAX_EXAMPLES_PER_BUCKET),
    demoted: all.filter((r) => r.rating === 1).slice(0, MAX_EXAMPLES_PER_BUCKET),
  };
}

// Render the addendum injected into Claude's enrichment prompt. Returns "" when
// the user has no useful signal yet, so the prompt is unchanged for cold-start.
export function renderPreferenceAddendum(mem: PreferenceMemory): string {
  if (mem.loved.length === 0 && mem.demoted.length === 0) return "";
  const fmt = (r: Rating) =>
    `- [${r.sourceName}] ${r.title}${r.tldr ? ` — ${r.tldr}` : ""}`;
  const sections: string[] = [];
  if (mem.loved.length > 0) {
    sections.push(
      `USER LOVED THESE (3★ — boost up to +10 on items resembling these in topic, framing, or analytical angle):\n${mem.loved.map(fmt).join("\n")}`
    );
  }
  if (mem.demoted.length > 0) {
    sections.push(
      `USER DOWNRANKED THESE (1★ — for items resembling these, subtract up to 15 from the score AND set relevant=false so they route to Other News rather than Today):\n${mem.demoted.map(fmt).join("\n")}`
    );
  }
  return `\n\n── USER FEEDBACK MEMORY ──\nApply these as a personalization layer ON TOP OF the tier rubric. The rubric is the baseline; this nudges within ±15 points and can flip the relevant flag for demoted-look-alikes. Pattern-match on substance (topic, sector angle, type of analysis), not just exact phrasing.\n\n${sections.join("\n\n")}\n── END USER FEEDBACK ──`;
}
