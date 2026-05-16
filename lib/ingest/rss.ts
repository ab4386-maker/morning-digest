import Parser from "rss-parser";
import type { DigestItem, Source } from "../types";
import { FULL_CONTENT_MAX_CHARS, RSS_ITEMS_PER_FEED, RSS_LOOKBACK_DAYS } from "../config";

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: ["content:encoded", "description"],
  },
});

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function ingestRss(source: Source): Promise<DigestItem[]> {
  if (source.kind !== "rss" || !source.url) return [];

  let feed;
  try {
    feed = await parser.parseURL(source.url);
  } catch (e) {
    console.error(`  [rss] ${source.name} failed: ${(e as Error).message}`);
    return [];
  }

  const now = Date.now();
  const cutoff = now - RSS_LOOKBACK_DAYS * 86400000;

  const cap = source.itemsPerFeed ?? RSS_ITEMS_PER_FEED;
  return feed.items
    .filter((item) => {
      const ts = item.pubDate ? new Date(item.pubDate).getTime() : 0;
      return ts > cutoff;
    })
    .slice(0, cap)
    .map((item) => {
      const ts = item.pubDate ? new Date(item.pubDate).getTime() : now;
      const hoursOld = (now - ts) / 3600000;
      // Weekly-by-nature sources stay in weekly; otherwise <24h is today, >=24h is weekly.
      const cadence =
        source.defaultCadence === "weekly" ? "weekly" : hoursOld < 24 ? "today" : "weekly";
      const importance = Math.round(source.weight * Math.max(0.15, 1 - hoursOld / 96));

      const anyItem = item as unknown as Record<string, unknown>;
      const rawContent =
        anyItem["content:encoded"] ||
        item.content ||
        anyItem.description ||
        item.contentSnippet ||
        "";
      const text = stripHtml(String(rawContent));
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      const bullets = sentences.slice(0, 3);
      if (bullets.length === 0) bullets.push("(preview unavailable — click through to read)");
      // Store up to FULL_CONTENT_MAX_CHARS of the full content for the Ask-about-this feature.
      // Substacks give us the full post here; paywalled news just gives us the teaser.
      const fullContent = text.slice(0, FULL_CONTENT_MAX_CHARS) || undefined;

      return {
        id: `${source.id}-${item.guid || item.link || Math.random().toString(36)}`,
        sourceId: source.id,
        sourceName: source.name,
        title: item.title || "(untitled)",
        url: item.link || source.url || "",
        publishedAt: new Date(ts).toISOString(),
        cadence,
        bullets,
        importance,
        fullContent,
      } satisfies DigestItem;
    });
}
