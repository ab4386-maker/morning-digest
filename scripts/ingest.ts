// Local + GitHub Actions entry point for runIngest.
//
// Local: loads .env.local with `override: true` so values in the file win over
//   any conflicting shell env vars (a common gotcha is an empty
//   `export ANTHROPIC_API_KEY=` in ~/.zshrc silently overriding the real key).
// CI: skips file loading entirely — GitHub Actions injects secrets as process.env.
import fs from "node:fs";
if (fs.existsSync(".env.local")) {
  // Lazy require so CI doesn't need the dotenv package if it weren't installed.
  // (dotenv IS in devDependencies, so this works either way; the guard is belt-and-suspenders.)
  const dotenv = require("dotenv");
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
