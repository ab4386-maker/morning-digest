import { NextResponse } from "next/server";
import { disconnect } from "@/lib/snaptrade";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// POST /api/portfolio/disconnect
// Deletes the SnapTrade user, which revokes every brokerage authorization, and clears local KV.
// Safe no-op if nothing is connected.
export async function POST() {
  try {
    await disconnect();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
