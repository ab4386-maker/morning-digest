import Anthropic from "@anthropic-ai/sdk";
import type { Cadence, DigestItem, ItemKind } from "./types";
import { USER_PROFILE, FUN_PROFILE } from "./profile";
import { ENRICH_BATCH_SIZE, ENRICH_CONCURRENCY, ENRICH_MAX_TOKENS } from "./config";
import { parseJsonArray } from "./json-utils";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

type Enrichment = {
  id: string;
  score: number;
  tldr: string;
  bullets: string[];
  cadence?: Cadence;
  whyItMatters?: string;
  relevant?: boolean;
  kind?: ItemKind;
  sections?: { label: string; body: string }[];
};

function buildMarketsPrompt(items: DigestItem[]) {
  return `${USER_PROFILE}

For each news item below, produce:

1. A relevance score (0-100) per the guidance above. Apply the trend boost aggressively.
2. **"relevant": true | false** — broader than just L/S setups. Default to TRUE.
   - relevant=true: anything a smart investor would want to know about — market moves, earnings, M&A, macro (rates/Fed/credit/oil/FX), sector trends, alt-manager moves, AND major geopolitical (US-China, Iran, conflicts with oil/FX/equity implications) AND major Trump/White House/policy announcements with sector implications AND viral/share-worthy investing pieces.
   - relevant=false ONLY when clearly off-topic and pollutes Today: regional commodity-price hike stories, single-company drama with no analytical hook, lifestyle/food/health, regional crime, sports/celebrity, paid family leave at random companies, hyper-local US news without national stakes, hyper-niche human-interest.
   - When in doubt: relevant=true. Better to include borderline geopolitical/policy than dump it to Other.
3. A "cadence":
   - "today" = active, developing news (even if 30-40h old, if still unfolding)
   - "weekly" = background context, deep dives, slower-moving structural pieces

3b. A "kind" — distinguishes time-sensitive MAJOR events from longer-form analysis. **Default strongly to "feature" — be conservative on "breaking".**
   - "breaking" — ONLY for: Fed/FOMC announcements, CPI/jobs prints, major M&A (>$5B announced), big-tech earnings (MSFT/META/GOOGL/AMZN/NVDA/AAPL/TSLA) on print day, single-stock moves >5% on news, geopolitical shocks (US strikes, conflict escalation, sanctions), bankruptcy/distress at major names, regulatory bombshells. Things where someone would say "have you heard what happened today?" — and the answer is a specific event, not a thesis.
   - "feature" — everything else from news sources: sector analysis (e.g., "Demand for skin injectables fails to sag" — that's a Galderma earnings READ-THROUGH, not breaking event), trend pieces, structural reads, profile pieces, "X reports Y" routine earnings without significant move, China-policy backgrounders, "consensus vs reality" framing, second-order trade ideas, anything analytical or evergreen.
   When in doubt → ALWAYS feature. A reader scrolling Today should see ~5-15 items max per morning, all of which would move portfolios.
4. A "tldr": 1-2 sentences (≤30 words) — the punchy hook leading with the SO-WHAT, not the headline restated.
5. A 3-bullet supporting summary. Each bullet 1-2 sentences. Buyside-note voice: facts, numbers, implication. No "the article reports that…" fluff.

**IMPORTANT — when an item has a "body" field with actual article/transcript content, BASE YOUR SUMMARY ON THAT CONTENT, not on the title alone.** For substack writeups, capture the actual argument the author made.

** PODCAST EPISODES — also output "sections" array (in addition to the 3 bullets) **
When the source is "Business Breakdowns", "Acquired", "Invest Like the Best", or "All-In" AND the body is >3000 chars, output a "sections" array with 4-6 structured analyst-note sections. Pick the structure based on episode type:

A) **Company deep-dive** (titles like "Opendoor: Q1 Earnings", "Givaudan: Magic Ingredients", "PriceSmart", "Ferrari"):
   - Label: "Business Overview" — what they do, scale, market position (2-3 sentences)
   - Label: "Setup / Backdrop" — sector/macro context + why this name now
   - Label: "Thesis" — bull case, what makes this interesting
   - Label: "Key Risks" — what could go wrong
   - Label: "Catalysts" — what would unlock or break the thesis
   - Label: "Additional Considerations" — comp set, valuation framing, management quality, anything else worth flagging

B) **Interview / themes-driven episode** (titles like "Brian Chesky - AI Founder Mode", "Paul Tudor Jones - Lessons", "Spencer Pratt", All-In weekly):
   - Label: "Who & What" — guest + episode hook (1-2 sentences)
   - Label: "Key Themes" — 2-3 main ideas explored
   - Label: "Notable Takes" — specific insights, contrarian views, or quotable lines
   - Label: "Where it Matters for Markets" — read-through to sectors, names, or trades
   - Label: "Caveats" — anything to skeptically discount (if relevant)

Each section body: 2-3 sentences. Buyside-note voice. Cite specific facts/numbers from the transcript where possible. If a section truly doesn't apply, omit it rather than padding.
6. If score >= 70 AND relevant=true, add "whyItMatters": one short line tying to work (e.g., "potential L/S setup vs sector ETF", "macro read for credit names", "comp for X sector"). Otherwise omit.

CROSS-SOURCE DEDUPLICATION — apply aggressively:
If two or more items cover the same underlying story across different outlets (e.g., WSJ Markets and WSJ World both reporting on Iran-US talks; or Bloomberg and FT both writing up the same Apollo private credit news), score the SINGLE most substantive one highly and score the duplicates UNDER 35 so they get filtered out. Pick the version with the most analysis or unique angle, not just the one published first. Same applies if a podcast episode and a news article both cover the same story — pick one.

Return ONLY a JSON array. No commentary, no markdown fences. Format:
[{"id":"...","score":N,"relevant":true|false,"cadence":"today|weekly","kind":"breaking|feature","tldr":"...","bullets":["...","...","..."],"whyItMatters":"...","sections":[{"label":"...","body":"..."}]}]
(omit "sections" entirely for non-podcast items)

Items (each with age in hours):
${items
  .map((i) => {
    const ageH = Math.round((Date.now() - new Date(i.publishedAt).getTime()) / 3600000);
    // For podcasts + substacks with real transcript/article body, pass a generous excerpt
    // so the summary reflects actual content instead of just the headline.
    const bodyExcerpt = i.fullContent && i.fullContent.length > 1000
      ? `\nbody: ${i.fullContent.slice(0, 8000)}`
      : "";
    return `--- id: ${i.id}
source: ${i.sourceName}
age: ${ageH}h
title: ${i.title}
preview: ${i.bullets.slice(0, 3).join(" ")}${bodyExcerpt}`;
  })
  .join("\n\n")}`;
}

function buildFunPrompt(items: DigestItem[]) {
  return `${FUN_PROFILE}

For each item below, produce:
1. A score (0-100) — be generous on share-worthy soccer/quirky-finance content; 60+ is fine for a decent read.
2. A "tldr": 1-2 punchy sentences capturing the hook.
3. A 3-bullet summary. Conversational, like telling a friend. Not corporate.

CROSS-SOURCE DEDUPLICATION — apply aggressively:
If two or more items cover the same underlying event (same VAR incident, same transfer story, same match drama, same finance-meme), score the SINGLE most substantive/share-worthy one highly and score the duplicates UNDER 35. Pick the version with the best take or most unique angle, not just the first published. An opinion column + a news piece + a follow-up about the same incident are still duplicates — only one survives.

Return ONLY a JSON array, no fences:
[{"id":"...","score":N,"tldr":"...","bullets":["...","...","..."]}]

Items:
${items
  .map(
    (i) =>
      `--- id: ${i.id}
source: ${i.sourceName}
title: ${i.title}
preview: ${i.bullets.slice(0, 3).join(" ")}`
  )
  .join("\n\n")}`;
}

async function runEnrich(prompt: string): Promise<Enrichment[]> {
  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: ENRICH_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });
  const block = resp.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "[]";
  const parsed = parseJsonArray(text);
  if (parsed === null) {
    console.error("[rank] failed to parse response:");
    console.error(text.slice(0, 500));
    return [];
  }
  return parsed as Enrichment[];
}

function applyEnrichments(items: DigestItem[], enrichments: Enrichment[]): DigestItem[] {
  const map = new Map(enrichments.map((e) => [e.id, e]));
  return items.map((item) => {
    const e = map.get(item.id);
    if (!e) return item;
    return {
      ...item,
      importance: e.score,
      cadence: e.cadence ?? item.cadence,
      tldr: e.tldr,
      bullets: e.bullets && e.bullets.length > 0 ? e.bullets : item.bullets,
      whyItMatters: e.whyItMatters,
      relevant: e.relevant,
      kind: e.kind,
      sections: e.sections && e.sections.length > 0 ? e.sections : undefined,
    };
  });
}

// Splits items into ENRICH_BATCH_SIZE-sized batches and runs ENRICH_CONCURRENCY in parallel.
// Tunable knobs live in lib/config.ts.
async function enrichInBatches(
  items: DigestItem[],
  promptBuilder: (batch: DigestItem[]) => string
): Promise<DigestItem[]> {
  const batches: DigestItem[][] = [];
  for (let i = 0; i < items.length; i += ENRICH_BATCH_SIZE) {
    batches.push(items.slice(i, i + ENRICH_BATCH_SIZE));
  }
  console.log(
    `[rank] enriching ${batches.length} batches in parallel (concurrency ${ENRICH_CONCURRENCY})`
  );
  const results: DigestItem[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(ENRICH_CONCURRENCY, batches.length) }, async () => {
      while (true) {
        const myIdx = cursor++;
        if (myIdx >= batches.length) return;
        const batch = batches[myIdx];
        const offset = myIdx * ENRICH_BATCH_SIZE;
        const enrichments = await runEnrich(promptBuilder(batch));
        const enriched = applyEnrichments(batch, enrichments);
        enriched.forEach((item, j) => {
          results[offset + j] = item;
        });
      }
    })
  );
  return results;
}

export async function enrichMarketsItems(items: DigestItem[]): Promise<DigestItem[]> {
  if (items.length === 0) return items;
  return enrichInBatches(items, buildMarketsPrompt);
}

export async function enrichFunItems(items: DigestItem[]): Promise<DigestItem[]> {
  if (items.length === 0) return items;
  return enrichInBatches(items, buildFunPrompt);
}
