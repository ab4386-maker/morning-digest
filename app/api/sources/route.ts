import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url: string | undefined = body.url;
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  // v1: log only. v2: persist to DB and have the cron job pull from it.
  console.log("[add source]", url);
  return NextResponse.json({ ok: true });
}
