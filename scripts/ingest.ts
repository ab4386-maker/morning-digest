// Local + GitHub Actions entry point for runIngest.
// Env loading is automatic: tsx auto-injects .env.local when present (local dev),
// and GitHub Actions secrets are set as process.env directly (CI). No dotenv needed.
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
