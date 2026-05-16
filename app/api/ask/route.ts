import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readItems } from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ChatTurn = { role: "user" | "assistant"; content: string };

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export async function POST(req: Request) {
  let body: { itemId?: string; question?: string; history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { itemId, question, history = [] } = body;
  if (!itemId || !question) {
    return NextResponse.json({ error: "itemId and question required" }, { status: 400 });
  }

  const items = await readItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }

  const hasFullArticle = !!item.fullContent && item.fullContent.length > 500;
  const sectionsBlock =
    item.sections && item.sections.length > 0
      ? `STRUCTURED ANALYST NOTE:\n${item.sections.map((s) => `${s.label}: ${s.body}`).join("\n\n")}\n\n`
      : "";
  const articleContext = `TITLE: ${item.title}
SOURCE: ${item.sourceName}
PUBLISHED: ${item.publishedAt}
URL: ${item.url}

${item.tldr ? `TL;DR: ${item.tldr}\n\n` : ""}${sectionsBlock}${
    item.bullets.length > 0 ? `KEY POINTS:\n${item.bullets.map((b) => `- ${b}`).join("\n")}\n\n` : ""
  }${item.whyItMatters ? `WHY IT MATTERS: ${item.whyItMatters}\n\n` : ""}${
    hasFullArticle
      ? `FULL ARTICLE BODY:\n${item.fullContent}`
      : `(Full article body not available — this source's RSS only gives a teaser. Answer from the title + tl;dr + bullets above, and acknowledge when a question requires details not in this excerpt.)`
  }`;

  const system = `You are a research assistant for a college student in a long/short equity investing club. They want sharp, substantive answers — buyside-note voice, not "the article reports that…" fluff. Be specific with numbers, mechanisms, and read-throughs when the source supports it. Acknowledge when something isn't in the source rather than guessing.

You're answering questions about the following article:

${articleContext}`;

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: question },
  ];

  try {
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system,
      messages,
    });
    const block = resp.content.find((b) => b.type === "text");
    const answer = block && block.type === "text" ? block.text : "";
    return NextResponse.json({ ok: true, answer, hasFullArticle });
  } catch (e) {
    console.error("[ask] error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
