import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { DigestItem, Source } from "../types";
import { FULL_CONTENT_MAX_CHARS } from "../config";

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

type FetchedEmail = {
  uid: number;
  subject: string;
  fromAddress: string;
  date: Date;
  text: string;
  html?: string;
};

// Pulls emails received in the last `lookbackHours` from senders matching the source's emailSender.
// emailSender match is a substring check (e.g., "noreply@news.bloomberg.com" or "ft@newsletters.ft.com").
async function fetchEmailsFromSender(
  emailSender: string,
  lookbackHours: number
): Promise<FetchedEmail[]> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return [];

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const results: FetchedEmail[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - lookbackHours * 3600000);
      // Gmail IMAP supports SEARCH on FROM and SINCE
      const uids = await client.search({ from: emailSender, since });
      if (!uids || uids.length === 0) return [];
      // Cap to last 10 to avoid runaway cost
      const recent = uids.slice(-10);
      for await (const msg of client.fetch(recent, { source: true, envelope: true, internalDate: true })) {
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          const rawDate = parsed.date ?? msg.internalDate ?? new Date();
          const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
          results.push({
            uid: msg.uid,
            subject: parsed.subject ?? "(no subject)",
            fromAddress: parsed.from?.text ?? emailSender,
            date,
            text: parsed.text ?? "",
            html: parsed.html || undefined,
          });
        } catch {
          // skip unparseable
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
  return results;
}

export async function ingestEmail(source: Source): Promise<DigestItem[]> {
  if (source.kind !== "email" || !source.emailSender) return [];

  // Lookback windows similar to RSS: news-frequency sources get 48h, weekly sources 14d.
  const lookbackHours = source.defaultCadence === "weekly" ? 14 * 24 : 48;
  let emails: FetchedEmail[];
  try {
    emails = await fetchEmailsFromSender(source.emailSender, lookbackHours);
  } catch (e) {
    console.error(`  [email] ${source.name} failed: ${(e as Error).message}`);
    return [];
  }

  const now = Date.now();
  return emails.map((email) => {
    const ts = email.date.getTime();
    const hoursOld = (now - ts) / 3600000;
    const cadence =
      source.defaultCadence === "weekly" ? "weekly" : hoursOld < 36 ? "today" : "weekly";
    const importance = Math.round(source.weight * Math.max(0.15, 1 - hoursOld / 96));

    // Prefer text body; fall back to stripping HTML
    const rawBody = (email.text && email.text.length > 200 ? email.text : stripHtml(email.html ?? ""))
      .replace(/[ \t]+/g, " ")
      .trim();
    const sentences = rawBody.split(/(?<=[.!?])\s+/).filter(Boolean);
    const bullets = sentences.slice(0, 3);
    if (bullets.length === 0) bullets.push("(email body unavailable — click through to read)");
    const fullContent = rawBody.slice(0, FULL_CONTENT_MAX_CHARS) || undefined;

    // Construct URL for "click through" — many newsletter emails have a canonical web link
    // we could parse out, but for now route to the source's sender domain as a fallback.
    return {
      id: `${source.id}-${email.uid}`,
      sourceId: source.id,
      sourceName: source.name,
      title: email.subject,
      url: extractCanonicalLink(email.html) ?? `mailto:${source.emailSender}`,
      publishedAt: email.date.toISOString(),
      cadence,
      bullets,
      importance,
      fullContent,
    } satisfies DigestItem;
  });
}

// Try to pull a "view in browser" link from the email HTML so click-through works
function extractCanonicalLink(html: string | undefined): string | null {
  if (!html) return null;
  // Common patterns: "view in browser", "view online", etc.
  const patterns = [
    /href="([^"]+)"[^>]*>\s*(?:view (?:this )?(?:email |message )?(?:online|in (?:your )?browser))/i,
    /href="([^"]+)"[^>]*>\s*(?:read more|read the full)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  // First link in HTML as a last resort
  const first = html.match(/href="(https?:\/\/[^"]+)"/);
  return first ? first[1] : null;
}
