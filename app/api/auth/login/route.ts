import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "site_auth";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const dynamic = "force-dynamic";

// POST /api/auth/login — body: {password}. On success sets a long-lived cookie
// containing the password value itself (single-password gate, no user accounts).
// Middleware compares the cookie to SITE_PASSWORD on every request.
export async function POST(req: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Site password not configured" }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  if (body.password !== expected) {
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return res;
}
