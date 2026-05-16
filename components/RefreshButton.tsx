"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Header button that triggers a full ingest on demand. Useful when news breaks
 * between scheduled crons. Skips email (manual refresh shouldn't spam inbox).
 *
 * Typical runtime: 60-120 seconds. Button shows elapsed seconds so the user
 * knows it's working.
 */
export function RefreshButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "refresh failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setRunning(false);
      setElapsed(0);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={run}
        disabled={running}
        className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
        title="Trigger a fresh ingest now (no email sent)"
      >
        {running ? `↻ Refreshing… ${elapsed}s` : "↻ Refresh now"}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
