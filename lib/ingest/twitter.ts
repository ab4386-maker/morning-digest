import type { DigestItem, Source } from "../types";
import {
  TWITTER_LOOKBACK_HOURS,
  TWITTER_SKIP_REPLIES,
  TWITTER_TWEETS_PER_ACCOUNT,
} from "../config";

// Minimal subset of socialdata.tools' tweet schema we actually use.
type SDTweet = {
  id_str: string;
  full_text?: string | null;
  text?: string | null;
  tweet_created_at: string;
  type?: string;
  in_reply_to_screen_name?: string | null;
  in_reply_to_status_id_str?: string | null;
  is_quote_status?: boolean;
  quoted_status?: { full_text?: string | null; user?: { screen_name?: string } | null } | null;
  favorite_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?: number;
  views_count?: number;
  user?: { screen_name?: string; name?: string; followers_count?: number };
};

type SDResponse = { tweets?: SDTweet[]; next_cursor?: string | null };

// Builds the fullContent body Claude sees during enrichment. Includes the original
// tweet plus the quoted tweet's text when present (so quoted-RT context isn't lost).
function buildBody(t: SDTweet): string {
  const original = (t.full_text ?? t.text ?? "").trim();
  const quoted = t.quoted_status?.full_text?.trim();
  const quotedAuthor = t.quoted_status?.user?.screen_name;
  if (quoted) {
    return `${original}\n\nQUOTED @${quotedAuthor ?? "unknown"}: ${quoted}`;
  }
  return original;
}

// First line of the tweet, capped at ~120 chars. Tweets have no titles, so this is
// what shows in the card header / the Dashboard preview.
function buildTitle(text: string): string {
  const firstLine = (text.split(/\n/)[0] ?? text).trim();
  if (firstLine.length <= 120) return firstLine;
  // Cut at last word boundary before 120 chars.
  const cut = firstLine.slice(0, 120);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "…";
}

// Provisional importance — Claude rewrites later. We use engagement as a weak prior:
// a tweet with 1000+ likes from a curated investor account is more likely worth
// reading than one with 5. Saturates fast.
function provisionalImportance(t: SDTweet, sourceWeight: number): number {
  const likes = t.favorite_count ?? 0;
  const reposts = t.retweet_count ?? 0;
  const engagement = likes + reposts * 2;
  // 0 likes → 0.4x weight; 100 → 0.7x; 1000 → 0.95x; 10K+ → 1.0x.
  const engBoost = Math.min(1, 0.4 + 0.6 * Math.log10(Math.max(1, engagement + 1)) / 4);
  return Math.round(sourceWeight * engBoost);
}

export async function ingestTwitter(source: Source): Promise<DigestItem[]> {
  if (source.kind !== "twitter" || !source.twitterUsername) return [];

  const apiKey = process.env.SOCIALDATA_API_KEY;
  if (!apiKey) {
    console.error(`  [twitter] SOCIALDATA_API_KEY not set — skipping ${source.name}`);
    return [];
  }

  const username = source.twitterUsername;
  // `from:USERNAME` returns the account's tweets only. Latest=chronological, not "top".
  const url = `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(
    `from:${username}`
  )}&type=Latest`;

  let data: SDResponse;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`  [twitter] ${source.name} HTTP ${res.status}`);
      return [];
    }
    data = (await res.json()) as SDResponse;
  } catch (e) {
    console.error(`  [twitter] ${source.name} fetch failed: ${(e as Error).message}`);
    return [];
  }

  const now = Date.now();
  const lookbackMs = TWITTER_LOOKBACK_HOURS * 3600_000;
  const cap = source.itemsPerFeed ?? TWITTER_TWEETS_PER_ACCOUNT;

  const tweets = (data.tweets ?? [])
    .filter((t) => {
      if (TWITTER_SKIP_REPLIES && t.type === "reply") return false;
      const ts = new Date(t.tweet_created_at).getTime();
      if (Number.isNaN(ts)) return false;
      return now - ts <= lookbackMs;
    })
    .slice(0, cap);

  return tweets.map((t): DigestItem => {
    const body = buildBody(t);
    const ts = new Date(t.tweet_created_at).getTime();
    const hoursOld = (now - ts) / 3600_000;
    const cadence = hoursOld < 24 ? "today" : "weekly";
    return {
      id: `tw-${username}-${t.id_str}`,
      sourceId: source.id,
      sourceName: source.name,
      title: buildTitle(body),
      url: `https://x.com/${username}/status/${t.id_str}`,
      publishedAt: t.tweet_created_at,
      cadence,
      bullets: [],
      importance: provisionalImportance(t, source.weight),
      fullContent: body,
    };
  });
}
