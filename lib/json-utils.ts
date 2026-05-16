// Robust JSON extraction from Claude responses.
//
// Claude sometimes wraps responses in ```json fences, adds trailing prose ("Here's the
// summary..."), or has minor whitespace artifacts. These helpers find the first balanced
// JSON value of the expected shape and parse just that.

/** Strip leading/trailing markdown code fences. */
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```[\s\S]*$/i, "")
    .trim();
}

/**
 * Find the first balanced `[...]` substring, parse it as a JSON array, return the value.
 * Returns null on failure. Use when Claude is supposed to return an array at the top level.
 */
export function parseJsonArray(text: string): unknown[] | null {
  const value = extractBalanced(stripFences(text), "[", "]");
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Find the first balanced `{...}` substring, parse it as a JSON object, return the value.
 * Returns null on failure. Use when Claude is supposed to return an object at the top level.
 */
export function parseJsonObject<T = unknown>(text: string): T | null {
  const value = extractBalanced(stripFences(text), "{", "}");
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Walk through `s` starting at the first `open` char, tracking depth (ignoring chars inside
 * string literals), and return the substring from that opening through its matching close.
 */
function extractBalanced(s: string, open: "[" | "{", close: "]" | "}"): string | null {
  const start = s.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
