"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CreditsStatus, Overview, UsageStats } from "@/lib/types";

const SECTIONS: { key: keyof Overview; label: string; tone: "primary" | "secondary" | "tertiary" }[] = [
  { key: "today", label: "Today", tone: "primary" },
  { key: "features", label: "Features", tone: "primary" },
  { key: "substacks", label: "Substacks", tone: "secondary" },
  { key: "podcasts", label: "Podcasts", tone: "secondary" },
  { key: "trends", label: "Trends Debunked", tone: "tertiary" },
  { key: "fun", label: "Fun", tone: "tertiary" },
];

// Haiku 4.5 pricing for the corner-widget cost estimate
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;

export function OverviewView({
  overview,
  generatedAt,
  creditsStatus,
  usageStats,
}: {
  overview: Overview | null;
  generatedAt: string | null;
  creditsStatus: CreditsStatus;
  usageStats: UsageStats | null;
}) {
  if (!overview) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="rounded-lg border bg-white p-6 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
          Briefing will be generated on the next ingest run. The 8am and 6pm crons synthesize a
          1-2 min read across all tabs.
        </p>
      </div>
    );
  }

  const stamp = generatedAt
    ? new Date(generatedAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="relative mx-auto max-w-3xl">
      <UsageWidget usageStats={usageStats} />

      {creditsStatus?.exhausted && (
        <div className="mb-5 rounded-lg border-2 border-red-600 bg-red-50 p-5 dark:bg-red-950/50">
          <p className="text-lg font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
            ⚠ Anthropic API credits exhausted
          </p>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            New ingests can't generate summaries until you refill. Top up at{" "}
            <a
              href="https://console.anthropic.com/settings/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              console.anthropic.com/settings/billing
            </a>
            . Detected{" "}
            {new Date(creditsStatus.detectedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
        </div>
      )}

      <p className="mb-6 text-xs text-stone-400">
        Last synthesized {stamp} · ~1-2 min read · regenerates 8am + 6pm ET · also emailed
      </p>

      <article className="space-y-8 rounded-lg border bg-white p-8 dark:border-stone-700 dark:bg-stone-900">
        {SECTIONS.map(({ key, label, tone }) => {
          const bullets = overview[key];
          if (!bullets || bullets.length === 0) return null;
          return (
            <section key={key}>
              <h2
                className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  tone === "primary"
                    ? "text-red-700 dark:text-red-400"
                    : tone === "secondary"
                    ? "text-stone-700 dark:text-stone-300"
                    : "text-stone-500 dark:text-stone-400"
                }`}
              >
                {label}
              </h2>
              <ul
                className={`space-y-2.5 leading-[1.55] text-stone-800 dark:text-stone-200 ${
                  tone === "primary"
                    ? "font-serif text-[16.5px]"
                    : "font-serif text-[15px]"
                }`}
              >
                {bullets.map((b, i) => (
                  <li key={i} className="pl-4 -indent-4">
                    <span className="mr-2 text-stone-400">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </article>
    </div>
  );
}

function UsageWidget({ usageStats }: { usageStats: UsageStats | null }) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  if (!usageStats || usageStats.totalCalls === 0) return null;

  const cost =
    (usageStats.totalInputTokens / 1_000_000) * HAIKU_INPUT_PER_M +
    (usageStats.totalOutputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M;
  const since = new Date(usageStats.resetAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const onReset = async () => {
    if (!confirm("Reset usage counter? Do this after you refill Anthropic credits.")) return;
    setResetting(true);
    try {
      await fetch("/api/reset-usage", { method: "POST" });
      router.refresh();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="float-right ml-3 mb-3 rounded-md border bg-white px-3 py-2 text-right text-[11px] leading-tight text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
      <p className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">
        ≈ ${cost.toFixed(2)}
      </p>
      <p>API spend since {since}</p>
      <p className="text-[10px] text-stone-400">{usageStats.totalCalls} Claude calls</p>
      <button
        onClick={onReset}
        disabled={resetting}
        className="mt-1 text-[10px] uppercase tracking-wider text-stone-400 hover:text-blue-600 disabled:opacity-40"
      >
        {resetting ? "…" : "Reset"}
      </button>
    </div>
  );
}
