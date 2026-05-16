// Local + GitHub Actions entry point for runIngest. In CI we don't have .env.local —
// secrets are injected via GitHub Actions secrets, so dotenv loading is only attempted
// (and silently skipped) if the file is missing.
import dotenv from "dotenv";
import fs from "node:fs";
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local", override: true });
}

import { runIngest } from "../lib/pipeline";
import type { IngestMode } from "../lib/pipeline";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const value = (flag: string): string | undefined => {
  const prefix = `${flag}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
};

const mode = (value("--mode") ?? "full") as IngestMode;
if (mode !== "full" && mode !== "news-only") {
  console.error(`Invalid --mode=${mode}. Must be "full" or "news-only".`);
  process.exit(2);
}

runIngest({
  mode,
  sendEmail: has("--send-email"),
  forceTrends: has("--force-trends"),
  dedupOnly: has("--dedup-only"),
})
  .then((result) => {
    console.log(`[ingest] ${JSON.stringify(result)}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
