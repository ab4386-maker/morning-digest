import * as XLSX from "xlsx";
import type { EarningsCompanyRow, EarningsGrid } from "./types";

/**
 * Parses an AlphaSense Generative Grid xlsx export.
 *
 * Expected structure:
 *   Row 0: Grid title (e.g., "Copy of Max transcript")
 *   Row 1: Column headers (Document, Company Name, Business Overview, etc.)
 *   Row 2: Prompts row (first cell = "Prompts", rest = prompt text per column)
 *   Row 3: Summary row (first cell = "Summary", rest = AlphaSense aggregated themes)
 *   Row 4+: Per-company rows
 */
export function parseEarningsXlsx(buffer: Buffer, fileName: string): EarningsGrid {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // Get as 2D array of cell values
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  if (rows.length < 4) {
    throw new Error("xlsx looks malformed — fewer than 4 rows");
  }

  const gridName = String(rows[0]?.[0] ?? fileName.replace(/\.xlsx$/i, ""));
  const headerRow = rows[1] as unknown[];
  const promptsRow = rows[2] as unknown[];
  const summaryRow = rows[3] as unknown[];

  // Column names (skip column 0 which is "Document")
  const columnHeaders: string[] = headerRow
    .map((c) => String(c ?? "").trim())
    .filter((c) => c.length > 0);

  const prompts: Record<string, string> = {};
  const summary: Record<string, string> = {};
  for (let j = 1; j < columnHeaders.length; j++) {
    const col = columnHeaders[j];
    const prompt = String(promptsRow[j] ?? "").trim();
    const summ = String(summaryRow[j] ?? "").trim();
    if (prompt) prompts[col] = prompt;
    if (summ) summary[col] = summ;
  }

  // Companies start at row 4
  const companies: EarningsCompanyRow[] = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rawDocument = String(row[0] ?? "").trim();
    if (!rawDocument) continue;

    const parsed = parseDocumentCell(rawDocument);
    const cells: Record<string, string> = {};
    for (let j = 1; j < columnHeaders.length; j++) {
      const col = columnHeaders[j];
      const val = String(row[j] ?? "").trim();
      if (val) cells[col] = val;
    }

    companies.push({
      rawDocument,
      ticker: parsed.ticker,
      company: parsed.company,
      callDate: parsed.callDate,
      cells,
    });
  }

  return {
    id: cryptoRandomId(),
    uploadedAt: new Date().toISOString(),
    fileName,
    gridName,
    columnHeaders,
    prompts,
    summary,
    companies,
  };
}

// Parse cells like:
//   "AMAT Applied Materials Inc\nApplied Materials, Inc., Q2 2026 Earnings Call, May 14, 2026\n14 May 26 • Event Transcript"
function parseDocumentCell(text: string): { ticker?: string; company?: string; callDate?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};

  // First line: "AMAT Applied Materials Inc" — split on first space
  const firstLine = lines[0];
  const firstSpace = firstLine.indexOf(" ");
  const ticker = firstSpace > 0 ? firstLine.slice(0, firstSpace) : firstLine;
  const company = firstSpace > 0 ? firstLine.slice(firstSpace + 1) : undefined;

  // Second line: "Applied Materials, Inc., Q2 2026 Earnings Call, May 14, 2026"
  // Extract trailing date if present
  let callDate: string | undefined;
  if (lines[1]) {
    const dateMatch = lines[1].match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/);
    if (dateMatch) callDate = dateMatch[0];
  }

  return { ticker, company, callDate };
}

function cryptoRandomId(): string {
  // 12-char hex ID — KV keys stay readable, collision risk is negligible at our volume
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
