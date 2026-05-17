import Anthropic from "@anthropic-ai/sdk";
import type { DigestItem, Overview, Source, TabId, Trend } from "./types";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Generates a cohesive 1-2 minute briefing across all tabs as bulleted sections.
 * Voice: smart-friend-telling-you-what's-happening, not buyside note.
 * Single Haiku call, ~$0.015 per run.
 *
 * If `priorOverview` is provided (typically the morning briefing being passed into
 * the 6pm run), the prompt instructs Claude to focus on NET NEW items and material
 * developments — not rehash what the user already read.
 */
export async function synthesizeOverview(
  items: DigestItem[],
  trends: Trend[],
  sources: Source[],
  priorOverview: Overview | null = null,
  priorGeneratedAt: string | null = null
): Promise<Overview | null> {
  if (items.length === 0) return null;

  const sourceTabMap = new Map(sources.map((s) => [s.id, s.tab]));
  const tabOf = (i: DigestItem): TabId | undefined => sourceTabMap.get(i.sourceId);

  const today = items.filter(
    (i) => tabOf(i) === "today" && i.relevant !== false && (i.kind ?? "breaking") === "breaking"
  );
  const features = items.filter(
    (i) => tabOf(i) === "today" && i.relevant !== false && i.kind === "feature"
  );
  // ALSO include high-importance items from Other News (relevant=false) so major world
  // events not in the L/S filter still surface in the overview if they're substantial.
  const otherMajor = items
    .filter((i) => tabOf(i) === "today" && i.relevant === false && i.importance >= 60)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
  const substacks = items.filter((i) => tabOf(i) === "reads");
  const podcasts = items.filter((i) => tabOf(i) === "breakdowns");
  const fun = items.filter((i) => tabOf(i) === "fun" || i.cadence === "fun");

  const fmt = (xs: DigestItem[], cap: number) =>
    xs
      .sort((a, b) => b.importance - a.importance)
      .slice(0, cap)
      .map((i) => `[${i.sourceName}] ${i.title}${i.tldr ? ` — ${i.tldr}` : ""}`)
      .join("\n");

  const trendsList = trends
    .slice(0, 4)
    .map((t) => `${t.title} — ${t.tldr}`)
    .join("\n");

  // Only include the prior-overview context if it's from earlier today (within last 18h).
  // Older overviews would create false "you already saw this" signal.
  let priorContext = "";
  if (priorOverview && priorGeneratedAt) {
    const ageH = (Date.now() - new Date(priorGeneratedAt).getTime()) / 3600000;
    if (ageH < 18) {
      const priorTime = new Date(priorGeneratedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      });
      const priorRendered = (Object.keys(priorOverview) as (keyof Overview)[])
        .filter((k) => (priorOverview[k]?.length ?? 0) > 0)
        .map((k) => `${String(k).toUpperCase()}:\n${priorOverview[k].map((b) => `  - ${b}`).join("\n")}`)
        .join("\n\n");
      priorContext = `

────────────────────────────────────────────────────────────────────────
EVENING UPDATE MODE — the user already read the morning briefing at ${priorTime} ET.
This is the same day's 6pm refresh. Your job: surface what's NEW or has materially
DEVELOPED since the morning briefing below. Do NOT rehash bullets the user already
saw. If an item is genuinely the same story with no new angle, skip it. If a story
has progressed (e.g., new data, new reaction, new players), call that out
explicitly with phrasing like "Update on…" or "New: …".

Aim for a SHORTER briefing if there's less truly new ground — 5-8 today bullets
is fine if only that much is genuinely fresh. Quality > quantity.

MORNING BRIEFING (already sent to user at ${priorTime} ET — do not repeat unless materially developed):

${priorRendered}
────────────────────────────────────────────────────────────────────────

`;
    }
  }

  const prompt = `${priorContext}You are writing a 1-2 minute briefing — think Axios Morning meets The Daily meets a smart friend giving you the rundown. Goal: someone wakes up, opens this, and knows what happened across the news landscape without having to check 10 apps.

Voice: **clear, conversational, lightly punchy**. NOT corporate or academic. NOT buyside jargon. Just a smart friend telling you what's going on. Cite names, numbers, and specifics — but explain anything obscure inline. Use active voice.

Output STRICT JSON only. No code fences. Each section is an array of short bullet strings (~15-25 words each). Use this EXACT key structure:

{
  "today": ["bullet 1", "bullet 2", ...],
  "features": [...],
  "substacks": [...],
  "podcasts": [...],
  "trends": [...],
  "fun": [...]
}

Section length guidance:
- today: 7-10 bullets — the biggest news that broke today/recently. INCLUDE major world events (geopolitics, conflicts, major elections, regulatory bombshells, natural disasters, headline-grabbing political stories) — not just finance/L/S items. If it's the kind of thing every news app is leading with, include it.
- features: 5-7 bullets — bigger analytical reads worth knowing about
- substacks: 3-5 bullets — what independent writers are arguing this week
- podcasts: 3-4 bullets — episodes worth listening to + why
- trends: 2-3 bullets — pointer to current trend explainers
- fun: 1-2 bullets — one share-worthy item from the soccer / quirky bucket

Each bullet should be **self-contained** — readable in isolation. Don't refer to "the article above" or assume context from other bullets. Lead with the punchy point, not the source.

Items follow, grouped by section:

=== TODAY: BREAKING NEWS (finance + investing focus) ===
${fmt(today, 15) || "(no items)"}

=== TODAY: MAJOR WORLD/POLITICAL EVENTS (NOT in user's L/S filter, but headline-worthy) ===
${otherMajor.map((i) => `[${i.sourceName}] ${i.title}${i.tldr ? ` — ${i.tldr}` : ""}`).join("\n") || "(no items)"}

=== FEATURES (analytical news pieces) ===
${fmt(features, 10) || "(no items)"}

=== SUBSTACKS (independent analyst writeups) ===
${fmt(substacks, 8) || "(no items)"}

=== PODCASTS (deep-dive episodes) ===
${fmt(podcasts, 8) || "(no items)"}

=== TRENDS DEBUNKED ===
${trendsList || "(no trends)"}

=== FUN ===
${fmt(fun, 5) || "(no items)"}

Return ONLY the JSON object, no fences, no commentary.`;

  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const block = resp.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```[\s\S]*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<Overview>;
    const asArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim().length > 0) : [];
    return {
      today: asArray(parsed.today),
      features: asArray(parsed.features),
      substacks: asArray(parsed.substacks),
      podcasts: asArray(parsed.podcasts),
      trends: asArray(parsed.trends),
      fun: asArray(parsed.fun),
    };
  } catch (e) {
    console.error("[overview] parse failed:", (e as Error).message);
    console.error("Excerpt:", text.slice(0, 400));
    return null;
  }
}
