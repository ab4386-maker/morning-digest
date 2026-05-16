import { NextResponse } from "next/server";
import { runIngest } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/refresh — manually triggers a full ingest from the dashboard "Refresh" button.
// No CRON_SECRET required — this is for the personal dashboard's own UI to call. We pass
// sendEmail=false so manual refreshes don't spam your inbox.
export async function POST() {
  try {
    const result = await runIngest({ mode: "full", sendEmail: false });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[refresh] failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
