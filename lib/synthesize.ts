import Anthropic from "@anthropic-ai/sdk";
import type { DigestItem, Trend } from "./types";
import { trackUsage } from "./usage-tracker";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYNTHESIZE_PROMPT = `You are writing the "Trends Debunked" section for a college student in a long/short equity investing club. They are sharp but want context, not jargon. Assume a smart middle-schooler reading level: define terms inline, use plain English, but don't dumb down the substance.

Your job: from the news items below (and from your general knowledge of what's happening in markets right now), identify 4-6 trends/themes that a curious investor should genuinely understand this week. Examples of the kind of trends to surface:
- "Why oil prices are whipsawing right now"
- "What's happening in private credit and why software-lending shops are bleeding"
- "Why commercial real estate office values keep getting marked down"
- "AI capex: is it a real economy supercycle or a circular Nvidia trade?"
- "Why consumer credit delinquencies are diverging by income"
- "Housing turnover is at a 30-year low — what breaks the logjam?"
- "Semis: the bull case has split into two — leading-edge vs. mature-node"
- "Consensus vs reality" angles on crowded narratives

The trends should reflect what's ACTUALLY hot right now based on the news items provided AND your knowledge — don't force a trend just because there's one news item; only include something if it's genuinely a multi-month theme.

For each trend, return:
{
  "id": "kebab-case-slug",
  "title": "Plain-English title, ideally posed as a question or claim",
  "tldr": "One sentence (≤25 words) capturing the whole story",
  "whatsHappening": "2-3 sentences. What's actually going on right now, in plain language.",
  "whyItMatters": "2-3 sentences. Why a curious investor should care — link to portfolios, sectors, or daily life.",
  "backstory": "3-4 sentences. The setup — how did we get here? Define any necessary terms inline (e.g., 'BDCs (publicly traded business-development companies that lend to mid-sized businesses)').",
  "whatsNext": "2-3 sentences. Short-term (next 1-3 months) AND long-term (1-3 years) implications. Be specific where possible.",
  "consensusVsReality": "Optional. If there's a crowded narrative being challenged, name it: 'Most people think X — but here's what's actually happening.' 2-3 sentences. Omit if not applicable."
}

Return ONLY a JSON array, no fences. Aim for ~250-400 words across all body fields per trend.

News items providing context:
`;

export async function synthesizeTrends(items: DigestItem[]): Promise<Trend[]> {
  const corpus = items
    .slice(0, 30)
    .map((i) => `[${i.sourceName}] ${i.title}: ${i.tldr ?? i.bullets[0] ?? ""}`)
    .join("\n");

  const prompt = `${SYNTHESIZE_PROMPT}${corpus}`;

  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });
  await trackUsage({
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
  });

  const block = resp.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "[]";
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Trend[];
  } catch (e) {
    console.error("[synthesize] failed to parse:", (e as Error).message);
    console.error("Response excerpt:", text.slice(0, 800));
    return [];
  }
}
