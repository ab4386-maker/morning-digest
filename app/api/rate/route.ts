import { NextResponse } from "next/server";
import { readItems, upsertRating } from "@/lib/store";
import type { Rating } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { itemId?: string; rating?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { itemId, rating } = body;
  if (!itemId || ![1, 2, 3].includes(rating ?? 0)) {
    return NextResponse.json(
      { error: "itemId required + rating must be 1..3 (1=demote, 2=meh, 3=love)" },
      { status: 400 }
    );
  }

  const items = await readItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }

  const record: Rating = {
    rating: rating as 1 | 2 | 3,
    ratedAt: new Date().toISOString(),
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    title: item.title,
    tldr: item.tldr,
    importance: item.importance,
    cadence: item.cadence,
    relevant: item.relevant,
    url: item.url,
    publishedAt: item.publishedAt,
  };

  await upsertRating(itemId, record);
  return NextResponse.json({ ok: true });
}
