import { NextResponse } from "next/server";
import { runIngest } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 8am ET fire — refreshes everything including podcasts and weekly trends.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Email only on scheduled Vercel cron invocations. Manual curls (deploys, dev,
  // re-fires) skip email so we don't spam the inbox. Vercel cron requests have
  // `User-Agent: vercel-cron/1.0`. Manual override via ?email=true.
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const url = new URL(req.url);
  const sendEmail = ua.includes("vercel-cron") || url.searchParams.get("email") === "true";

  try {
    const result = await runIngest({ mode: "full", sendEmail });
    return NextResponse.json({ ok: true, sendEmail, ...result });
  } catch (e) {
    console.error("[cron full] failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
