import { NextResponse } from "next/server";
import { refreshPortfolio } from "@/lib/snaptrade";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/portfolio/refresh
// Pulls latest holdings from every connected brokerage account, writes the snapshot to KV,
// and returns it so the UI can re-render without a full page refresh.
export async function POST() {
  try {
    const snapshot = await refreshPortfolio();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
