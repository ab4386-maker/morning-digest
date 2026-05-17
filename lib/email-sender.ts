import nodemailer from "nodemailer";
import type { Overview } from "./types";
import { DASHBOARD_URL } from "./config";

// News-only (6pm) skips podcast ingestion entirely, so the "podcasts" section in
// an evening email would be stale copy from the morning run. Drop it from the
// evening render — same data still surfaces on the dashboard's Podcasts tab.
const ALL_SECTIONS: { key: keyof Overview; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "features", label: "Features" },
  { key: "substacks", label: "Substacks" },
  { key: "podcasts", label: "Podcasts" },
  { key: "trends", label: "Trends Debunked" },
  { key: "fun", label: "Fun" },
];

function sectionsFor(mode: "full" | "news-only"): typeof ALL_SECTIONS {
  if (mode === "news-only") return ALL_SECTIONS.filter((s) => s.key !== "podcasts");
  return ALL_SECTIONS;
}

export async function sendOverviewEmail(
  overview: Overview,
  mode: "full" | "news-only"
): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.log("[email] Gmail creds not set — skipping email send");
    return;
  }

  // Default: send to the digest gmail itself. Override via EMAIL_RECIPIENT env var.
  // Supports multiple recipients comma-separated: "a@x.com, b@y.com"
  const recipientRaw = process.env.EMAIL_RECIPIENT || user;
  const recipient = recipientRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

  const isAM = mode === "full";
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const subject = `${isAM ? "Morning" : "Evening"} Digest — ${dateStr}`;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"Abhi's Daily Digest" <${user}>`,
      to: recipient,
      subject,
      html: renderHtml(overview, isAM, dateStr, mode),
      text: renderPlainText(overview, isAM, dateStr, mode),
    });
    console.log(`[email] Sent ${subject} to ${recipient}`);
  } catch (e) {
    console.error(`[email] send failed: ${(e as Error).message}`);
  }
}

function renderHtml(overview: Overview, isAM: boolean, dateStr: string, mode: "full" | "news-only"): string {
  const greeting = isAM ? "Morning Digest" : "Evening Digest";
  const sections = sectionsFor(mode)
    .filter((s) => overview[s.key]?.length > 0)
    .map((s) => {
      const items = overview[s.key]
        .map((b) => `<li style="margin-bottom: 8px; line-height: 1.55;">${escapeHtml(b)}</li>`)
        .join("");
      return `
        <div style="margin-bottom: 28px;">
          <h2 style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #57534e; margin: 0 0 10px 0;">
            ${s.label}
          </h2>
          <ul style="margin: 0; padding-left: 18px; color: #1c1917; font-size: 14.5px;">
            ${items}
          </ul>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background: #fafaf9; margin: 0; padding: 20px 0;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 32px 36px;">
    <div style="border-bottom: 1px solid #e7e5e4; padding-bottom: 16px; margin-bottom: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 4px 0; color: #1c1917;">${greeting}</h1>
      <p style="margin: 0; font-size: 13px; color: #78716c;">${dateStr} · ~1-2 min read</p>
    </div>
    ${sections}
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e7e5e4;">
      <a href="${DASHBOARD_URL}" style="color: #1e40af; font-size: 13px; text-decoration: none;">
        Open the full dashboard →
      </a>
    </div>
  </div>
</body>
</html>`;
}

function renderPlainText(overview: Overview, isAM: boolean, dateStr: string, mode: "full" | "news-only"): string {
  const greeting = isAM ? "MORNING DIGEST" : "EVENING DIGEST";
  const sections = sectionsFor(mode)
    .filter((s) => overview[s.key]?.length > 0)
    .map((s) => {
      const items = overview[s.key].map((b) => `  • ${b}`).join("\n");
      return `${s.label.toUpperCase()}\n${items}`;
    })
    .join("\n\n");
  return `${greeting} — ${dateStr}\n~1-2 min read\n\n${sections}\n\n—\nOpen the full dashboard: ${DASHBOARD_URL}\n`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
