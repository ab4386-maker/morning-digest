"use client";

import type { Trend } from "@/lib/types";
import { TrendCard } from "./TrendCard";

export function TrendsView({ trends, updatedAt }: { trends: Trend[]; updatedAt: string | null }) {
  if (trends.length === 0) {
    return (
      <p className="rounded-lg border bg-white p-6 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
        No trends synthesized yet. Run the cron with mode=full to generate.
      </p>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="space-y-4">
        {trends.map((t) => (
          <TrendCard key={t.id} trend={t} />
        ))}
      </div>
    </div>
  );
}
