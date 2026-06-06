import { NextResponse } from "next/server";

const COOKIE_NAME = "site_auth";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — clears the auth cookie. Optional helper; the user can
// also just clear cookies in their browser. Not currently wired to any UI.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
