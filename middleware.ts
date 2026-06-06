import { NextRequest, NextResponse } from "next/server";

// Single shared password gate. Anyone with the password sets a long-lived signed
// cookie and never sees the gate again on that browser. Everything else is blocked.
//
// Paths left open:
//   /login                — the password form itself
//   /api/auth/*           — login/logout endpoints (set/clear the cookie)
//   /api/cron/*           — Vercel/cron-job.org hits these with X-Trigger-Secret
//                           (the route itself enforces that header; no cookie needed)
//   /_next/*, /favicon    — Next.js internals + static assets must remain reachable
//
// All other routes (including the dashboard, /api/refresh, /api/ask, /api/rate,
// /api/earnings/*, /api/portfolio/*) require the cookie.

const COOKIE_NAME = "site_auth";
const OPEN_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/cron",
  "/_next",
  "/favicon",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // If no SITE_PASSWORD is set in the environment, leave the site fully open
  // (useful for local dev when you don't want to bother with the form).
  if (!process.env.SITE_PASSWORD) return NextResponse.next();

  // Open paths bypass the gate.
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Cookie holds the password directly (low-stakes — single shared password
  // for a personal dashboard). We compare to the env var on each request.
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && token === process.env.SITE_PASSWORD) return NextResponse.next();

  // Not authed → redirect HTML requests to /login, return 401 for everything else
  // (so fetch() callers like RefreshButton see a clean failure mode).
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return new NextResponse("Unauthorized", { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
