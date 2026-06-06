"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next, error: serverError }: { next: string; error?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(serverError ?? null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(next || "/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Wrong password");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <input
        type="password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !password}
        className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        {submitting ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
