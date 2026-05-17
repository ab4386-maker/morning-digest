import { NextResponse } from "next/server";

// Lightweight trigger endpoint hit by cron-job.org on a schedule. Validates a
// shared secret, then immediately POSTs to GitHub's workflow_dispatch API to fire
// the ingest workflow. Returns in <2s so cron-job.org's HTTP timeout is happy.
// The actual ingest runs on GitHub Actions infra (no Vercel 60s cap).
//
// cron-job.org config:
//   URL: https://morning-digest-plum.vercel.app/api/cron/trigger
//   Method: POST
//   Headers: X-Trigger-Secret: <CRON_TRIGGER_SECRET>
//   Body (8am job):  {"mode":"full"}
//   Body (6pm job):  {"mode":"news-only"}
//   Schedule: 7:45 AM ET and 5:45 PM ET (15 min earlier so it lands by xx:00)

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const REPO_OWNER = "ab4386-maker";
const REPO_NAME = "morning-digest";
const WORKFLOW_FILE = "ingest.yml";

export async function POST(req: Request) {
  // 1) Auth
  const expected = process.env.CRON_TRIGGER_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const provided = req.headers.get("x-trigger-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Parse mode from body — default to "full" so a bare ping does the right thing
  let mode: "full" | "news-only" = "full";
  try {
    const body = (await req.json()) as { mode?: string };
    if (body.mode === "news-only") mode = "news-only";
  } catch {
    /* empty body is fine */
  }

  // 3) Dispatch the workflow via GitHub API
  const ghToken = process.env.GH_WORKFLOW_DISPATCH_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: "GH_WORKFLOW_DISPATCH_TOKEN not set" }, { status: 500 });
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: "main",
      // The workflow's workflow_dispatch inputs (defined in ingest.yml). Boolean
      // workflow inputs must be passed as strings via the GitHub API.
      inputs: { mode, send_email: "true" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[cron/trigger] GitHub dispatch failed: ${res.status} ${text}`);
    return NextResponse.json(
      { ok: false, status: res.status, error: text.slice(0, 200) },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, mode, triggeredAt: new Date().toISOString() });
}
