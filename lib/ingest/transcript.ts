import * as cheerio from "cheerio";
import { TRANSCRIPT_MAX_CHARS } from "../config";

/**
 * Fetch and extract the transcript text from a podcast episode page.
 * Returns the transcript text, or null if not found.
 *
 * Supports:
 * - acquired.fm/episodes/<slug> — full transcript below the player
 * - colossus.com/episode/<slug> — full transcript for Business Breakdowns + Invest Like the Best
 */
export async function fetchTranscript(url: string): Promise<string | null> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    };
    // Send our authenticated session cookie when hitting colossus.com so we
    // see the full transcript instead of just the gated intro.
    if (host.includes("colossus.com") && process.env.COLOSSUS_COOKIE) {
      headers["Cookie"] = process.env.COLOSSUS_COOKIE;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    if (host.includes("acquired.fm")) return extractAcquired(html);
    if (host.includes("colossus.com")) {
      const body = extractColossus(html);
      // If we sent a cookie but got back the gated <1500-char intro, warn — cookie likely expired.
      if (body && body.length < 1500 && process.env.COLOSSUS_COOKIE) {
        console.warn(
          `[transcript] colossus returned only ${body.length} chars with cookie set — cookie may be expired`
        );
      }
      return body;
    }
    return null;
  } catch (e) {
    console.error(`[transcript] failed for ${url}:`, (e as Error).message);
    return null;
  }
}

function extractAcquired(html: string): string | null {
  const $ = cheerio.load(html);
  // Acquired puts the transcript inside <div class="episode-rich-text mb-2xl w-richtext">
  // which sits inside #transcript on the page (display:none until user clicks).
  let body = $("#transcript .episode-rich-text").text();
  if (!body || body.length < 500) {
    // Fallback: any element with class containing episode-rich-text
    body = $(".episode-rich-text").first().text();
  }
  body = normalize(body);
  return body.length > 500 ? body.slice(0, TRANSCRIPT_MAX_CHARS) : null;
}

function extractColossus(html: string): string | null {
  const $ = cheerio.load(html);
  // Real transcript body is inside .transcript__content; .transcript alone catches just the TOC sidebar.
  let body = $(".transcript__content").text();
  if (!body || body.length < 500) body = $("article").text();
  body = normalize(body);
  return body.length > 500 ? body.slice(0, TRANSCRIPT_MAX_CHARS) : null;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
