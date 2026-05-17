"use client";

import type { CreditsStatus, Overview } from "@/lib/types";

const SECTIONS: { key: keyof Overview; label: string; tone: "primary" | "secondary" | "tertiary" }[] = [
  { key: "today", label: "Today", tone: "primary" },
  { key: "features", label: "Features", tone: "primary" },
  { key: "re", label: "Real Estate", tone: "primary" },
  { key: "substacks", label: "Substacks", tone: "secondary" },
  { key: "podcasts", label: "Podcasts", tone: "secondary" },
  { key: "trends", label: "Trends Debunked", tone: "tertiary" },
  { key: "fun", label: "Fun", tone: "tertiary" },
];

export function OverviewView({
  overview,
  generatedAt,
  creditsStatus,
}: {
  overview: Overview | null;
  generatedAt: string | null;
  creditsStatus: CreditsStatus;
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
