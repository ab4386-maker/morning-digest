"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EarningsGrid } from "@/lib/types";

export function EarningsView({ grids }: { grids: EarningsGrid[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(grids[0]?.id ?? null);
  const selected = grids.find((g) => g.id === selectedId) ?? grids[0];

  return (
    <div className="space-y-6">
      <UploadPanel />

      {grids.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
          No earnings grids uploaded yet. Upload an AlphaSense Generative Grid xlsx export above
          to render it here.
        </p>
      ) : (
        <>
          {grids.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {grids.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                    g.id === selected?.id
                      ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                >
                  {g.gridName}
                  <span className="ml-1.5 text-[10px] opacity-70">
                    ({g.companies.length})
                  </span>
                </button>
              ))}
            </div>
          )}

          {selected && <GridView grid={selected} />}
        </>
      )}
    </div>
  );
}

function UploadPanel() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/earnings/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        setMsg(
          `✓ Parsed "${data.gridName}" — ${data.companyCount} companies, ${data.columnCount} columns`
        );
        router.refresh();
      } else {
        setMsg(`Error: ${data.error ?? "upload failed"}`);
      }
    } catch (e) {
      setMsg(`Network error: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <label className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-50">Upload AlphaSense Grid</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Export your Generative Grid as xlsx, then drop or browse it here. Renders instantly — no
            API tokens used.
          </p>
        </div>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
          className="text-xs text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-stone-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-stone-700 disabled:opacity-40 dark:text-stone-300 dark:file:bg-stone-100 dark:file:text-stone-900 dark:hover:file:bg-stone-200"
        />
      </label>
      {msg && <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">{msg}</p>}
    </div>
  );
}

function GridView({ grid }: { grid: EarningsGrid }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  const uploaded = new Date(grid.uploadedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const summaryCols = grid.columnHeaders.filter((c) => c !== "Document" && grid.summary[c]);
  const dataCols = grid.columnHeaders.filter((c) => c !== "Document");

  const filtered = filter
    ? grid.companies.filter(
        (c) =>
          c.ticker?.toLowerCase().includes(filter.toLowerCase()) ||
          c.company?.toLowerCase().includes(filter.toLowerCase())
      )
    : grid.companies;

  const onDelete = async () => {
    if (!confirm(`Delete grid "${grid.gridName}"?`)) return;
    await fetch(`/api/earnings/${grid.id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <article className="space-y-5">
      <header className="flex items-end justify-between border-b pb-3 dark:border-stone-700">
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{grid.gridName}</h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            {grid.companies.length} companies · {dataCols.length} columns · uploaded {uploaded}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="text-xs text-stone-400 hover:text-red-600 dark:text-stone-500 dark:hover:text-red-400"
        >
          Delete
        </button>
      </header>

      {summaryCols.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Cross-Company Themes (AlphaSense Summary)
          </h3>
          <div className="space-y-2">
            {summaryCols.map((col) => {
              const isOpen = expandedSummary === col;
              return (
                <div key={col} className="overflow-hidden rounded-md border bg-white dark:border-stone-700 dark:bg-stone-900">
                  <button
                    onClick={() => setExpandedSummary(isOpen ? null : col)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800"
                  >
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-50">{col}</span>
                    <span className="text-xs text-stone-400 dark:text-stone-500">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-stone-50 px-4 py-3 text-[13px] leading-relaxed text-stone-700 whitespace-pre-wrap dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
                      {grid.summary[col]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Per Company ({filtered.length}{filtered.length !== grid.companies.length ? ` of ${grid.companies.length}` : ""})
          </h3>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by ticker or name…"
            className="w-48 rounded-md border px-2.5 py-1 text-xs outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-500"
          />
        </div>
        <div className="space-y-2">
          {filtered.map((c, idx) => {
            const key = `${idx}-${c.ticker ?? c.rawDocument}`;
            const isOpen = expandedCompany === key;
            return (
              <div key={key} className="overflow-hidden rounded-md border bg-white dark:border-stone-700 dark:bg-stone-900">
                <button
                  onClick={() => setExpandedCompany(isOpen ? null : key)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                      {c.ticker ?? "?"}
                    </span>
                    <span className="ml-2 text-sm text-stone-700 dark:text-stone-300">{c.company ?? ""}</span>
                  </div>
                  <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">
                    {c.callDate ?? ""}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-stone-400 dark:text-stone-500">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-950">
                    {dataCols.map((col) => {
                      const v = c.cells[col];
                      if (!v) return null;
                      return (
                        <div key={col}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                            {col}
                          </p>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-700 whitespace-pre-wrap dark:text-stone-300">
                            {v}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </article>
  );
}
