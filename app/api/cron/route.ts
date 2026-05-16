import { NextResponse } from "next/server";
import { runIngest } from "@/lib/pipeline";

// Vercel Hobby caps function duration at 300s. Our ingest typically completes in 30-60s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel cron sets an Authorization: Bearer <CRON_SECRET> header.
  // If CRON_SECRET is configured, require it. (In dev there's no secret so anyone with
  // the URL can trigger; that's fine locally.)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // ?mode=full (8am: refresh everything) or ?mode=news-only (afternoon: skip podcasts + trends)
  const mode =
    new URL(req.url).searchParams.get("mode") === "news-only" ? "news-only" : "full";

  try {
    const result = await runIngest({ mode });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] ingest failed:", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
