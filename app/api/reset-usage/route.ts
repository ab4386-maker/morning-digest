import { NextResponse } from "next/server";
import { resetUsage } from "@/lib/usage-tracker";

export const dynamic = "force-dynamic";

// POST /api/reset-usage — zeros the running Claude token tally.
// Call this after refilling your Anthropic credits so the dashboard estimate
// reflects spend since the latest top-up.
export async function POST() {
  await resetUsage();
  return NextResponse.json({ ok: true });
}
