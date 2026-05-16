import { NextResponse } from "next/server";
import { generateConnectUrl } from "@/lib/snaptrade";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// POST /api/portfolio/connect
// Returns { url } — the SnapTrade Connection Portal link the client should redirect to.
// Body (optional): { redirectUrl?: string } — where SnapTrade sends the user after connect.
export async function POST(req: Request) {
  let body: { redirectUrl?: string } = {};
  try { body = await req.json(); } catch {}

  // Default redirect: send the user back to the Portfolio tab on whatever host they came from.
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const redirectUrl = body.redirectUrl ?? `${origin}/?tab=portfolio&connected=1`;

  try {
    const url = await generateConnectUrl(redirectUrl);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
