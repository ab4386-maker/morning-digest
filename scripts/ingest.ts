import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { runIngest } from "../lib/pipeline";

runIngest({
  forceTrends: process.argv.includes("--force-trends"),
  dedupOnly: process.argv.includes("--dedup-only"),
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
