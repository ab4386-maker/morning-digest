import { NextResponse } from "next/server";
import { runIngest } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 6pm ET fire — skips podcasts (Breakdowns tab) and trends synthesis.
// Refreshes Today, Reads, Other, Fun with the latest news.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Email only on scheduled Vercel cron invocations. See /api/cron/full for details.
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const url = new URL(req.url);
  const sendEmail = ua.includes("vercel-cron") || url.searchParams.get("email") === "true";

  try {
    const result = await runIngest({ mode: "news-only", sendEmail });
    return NextResponse.json({ ok: true, sendEmail, ...result });
  } catch (e) {
    console.error("[cron news-only] failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
