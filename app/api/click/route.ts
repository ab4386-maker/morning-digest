import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  // v1: log to console. v2: persist to DB so ranking can use click signal.
  console.log("[click]", id);
  return NextResponse.json({ ok: true });
}
