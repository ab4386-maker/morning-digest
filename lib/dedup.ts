import Anthropic from "@anthropic-ai/sdk";
import type { DigestItem } from "./types";
import { DEDUP_MAX_TOKENS } from "./config";
import { parseJsonObject } from "./json-utils";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Post-merge topic dedup. Catches duplicates that survive within-batch dedup
 * (especially across ingests — an 8am story + a 3pm follow-up on the same event).
 *
 * Returns the same item set with duplicates dropped (the most substantive of each
 * cluster survives). One Claude Haiku call, ~$0.005 per run.
 */
export async function dedupItems(items: DigestItem[]): Promise<DigestItem[]> {
  if (items.length < 3) return items;

  const prompt = buildDedupPrompt(items);
  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: DEDUP_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const block = resp.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : '{"drop":[]}';
  const parsed = parseJsonObject<{ drop?: string[] }>(text);
  if (parsed === null) {
    console.error("[dedup] failed to parse drop list, keeping all items");
    console.error("Response excerpt:", text.slice(0, 300));
    return items;
  }

  const dropSet = new Set(parsed.drop ?? []);
  const survivors = items.filter((i) => !dropSet.has(i.id));
  console.log(
    `[dedup] dropped ${items.length - survivors.length} of ${items.length} as topical duplicates`
  );
  return survivors;
}

function buildDedupPrompt(items: DigestItem[]): string {
  const itemLines = items
    .map(
      (i) =>
        `id=${i.id} | src=${i.sourceName} | score=${i.importance} | "${i.title}"${
          i.tldr ? ` — ${i.tldr.slice(0, 120)}` : ""
        }`
    )
    .join("\n");

  return `Below is a list of news / podcast / writeup items from the past few days. Find clusters where 2+ items cover the SAME underlying story or event. **Be aggressive — when in doubt, mark duplicates.**

CORE RULE: If two items share the same primary subject (same company + same event, same deal, same person + same incident, same data print), they are DUPLICATES. Worked examples:
- "Federal Prosecutors Probe BlackRock Private-Credit Fund" (WSJ) + "US federal prosecutors scrutinise BlackRock private credit fund" (FT) → DUPLICATES (same probe, same target)
- "Trump-Xi summit takeaways" + "Five Takeaways From the Trump-Xi Summit" → DUPLICATES
- WSJ + Bloomberg + FT all covering the same earnings print, M&A announcement, Fed decision, geopolitical event → DUPLICATES
- Opinion column + news piece + follow-up on the same incident → DUPLICATES
- A podcast episode that just rehashes news already in the list → DUPLICATE
- Multiple articles about the same VAR moment, match controversy, or transfer

What does NOT count as a cluster:
- Different framings of an industry-level trend (e.g., two pieces on "SaaS pricing models" from different angles — these are sector reads, not duplicates)
- A trend explainer + a specific company in that trend
- Two different companies in the same sector (e.g., Givaudan piece vs PriceSmart piece — different businesses)

For each cluster, KEEP the single most substantive item (highest score, best analysis, or most unique angle). Mark all OTHERS in the cluster as "drop." A typical batch of 20-30 news items should have 4-8 items dropped — don't be shy.

Return ONLY this JSON shape, no markdown fences:
{"drop": ["id1", "id2", ...]}

If nothing duplicates, return: {"drop": []}

Items:
${itemLines}`;
}
