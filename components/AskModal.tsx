"use client";

import { useEffect, useRef, useState } from "react";
import type { DigestItem } from "@/lib/types";

type ChatTurn = { role: "user" | "assistant"; content: string };

export function AskModal({
  item,
  onClose,
}: {
  item: DigestItem;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [hasFullArticle, setHasFullArticle] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;

    const newHistory: ChatTurn[] = [...history, { role: "user", content: q }];
    setHistory(newHistory);
    setQuestion("");
    setPending(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, question: q, history }),
      });
      const data = await res.json();
      if (data.ok) {
        setHistory([...newHistory, { role: "assistant", content: data.answer }]);
        setHasFullArticle(data.hasFullArticle);
      } else {
        setHistory([
          ...newHistory,
          { role: "assistant", content: `Error: ${data.error ?? "unknown"}` },
        ]);
      }
    } catch (err) {
      setHistory([
        ...newHistory,
        { role: "assistant", content: `Network error: ${(err as Error).message}` },
      ]);
    } finally {
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex h-[min(85vh,720px)] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500">
              {item.sourceName}
            </p>
            <h2 className="mt-1 truncate text-sm font-semibold text-stone-900">{item.title}</h2>
            {hasFullArticle !== null && (
              <p className="mt-1 text-[11px] text-stone-400">
                {hasFullArticle
                  ? "Context: full article body"
                  : "Context: summary only (source RSS gives teaser; full article behind paywall)"}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {history.length === 0 && (
            <div className="space-y-2 text-sm text-stone-500">
              <p>Ask anything about this article. Examples:</p>
              <ul className="space-y-1 pl-4 text-[13px]">
                <li>— What&apos;s the bear case?</li>
                <li>— How would this affect my long in [ticker]?</li>
                <li>— Who&apos;s the most exposed name in this trend?</li>
                <li>— Translate this for someone unfamiliar with the sector</li>
              </ul>
            </div>
          )}
          {history.map((turn, i) => (
            <div
              key={i}
              className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                turn.role === "user"
                  ? "ml-8 bg-stone-100 text-stone-900"
                  : "mr-8 bg-blue-50 text-stone-800"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                {turn.role === "user" ? "You" : "Claude"}
              </p>
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          ))}
          {pending && (
            <div className="mr-8 rounded-lg bg-blue-50 px-3.5 py-2.5 text-sm text-stone-500">
              Thinking…
            </div>
          )}
        </div>

        <form onSubmit={send} className="border-t p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about this article…"
              disabled={pending}
              className="flex-1 rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-stone-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pending || !question.trim()}
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
