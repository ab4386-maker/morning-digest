import type { UsageStats } from "./types";
import { readUsageStats, writeUsageStats } from "./store";

// Haiku 4.5 pricing (per million tokens). Update if/when model or pricing changes.
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;

/**
 * Add the usage from a single Claude call to the running tally.
 * Called from every place we hit Anthropic (rank, dedup, synthesize, synthesize-overview).
 * Best-effort — failures don't block ingest.
 */
export async function trackUsage(usage: { input_tokens: number; output_tokens: number }): Promise<void> {
  try {
    const current = (await readUsageStats()) ?? emptyStats();
    await writeUsageStats({
      totalInputTokens: current.totalInputTokens + usage.input_tokens,
      totalOutputTokens: current.totalOutputTokens + usage.output_tokens,
      totalCalls: current.totalCalls + 1,
      resetAt: current.resetAt,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[usage] tracking failed:", (e as Error).message);
  }
}

/**
 * Reset the running tally — call after refilling credits.
 */
export async function resetUsage(): Promise<void> {
  await writeUsageStats(emptyStats());
}

export function estimateCostUsd(stats: UsageStats): number {
  return (
    (stats.totalInputTokens / 1_000_000) * HAIKU_INPUT_PER_M +
    (stats.totalOutputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M
  );
}

function emptyStats(): UsageStats {
  const now = new Date().toISOString();
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCalls: 0,
    resetAt: now,
    lastUpdated: now,
  };
}
