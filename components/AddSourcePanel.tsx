"use client";

import { useState } from "react";

export function AddSourcePanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        setMsg("Added. Will appear in tomorrow's digest.");
        setUrl("");
        setTimeout(onClose, 1200);
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg(err.error ?? "Could not add source.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-lg border bg-white p-4">
      <label className="block text-xs font-medium text-stone-600">
        Substack URL, RSS feed, or website
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.substack.com"
          className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <button
          type="submit"
          disabled={submitting || !url}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-stone-500">{msg}</p>}
    </form>
  );
}
