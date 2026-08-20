// lib/lead-import.ts
//
// Pure helpers for the onboarding lead step. No I/O — the POST to
// /api/coach/import-leads lives in the component, because the two surfaces
// that import leads (the welcome step and the orphaned /onboarding cards)
// want different UI after success. What they SHOULD share is the parsing and
// the reflection, which is the part with actual logic in it, so that is what
// lives here and what the tests cover.

/** Split a pasted block into trimmed, non-empty rows. */
export function parseRows(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** The name is whatever comes before the first comma. "Marcus, asked twice"
 *  -> "Marcus". Rows with no comma are all name. */
export function leadName(row: string): string {
  const head = row.split(",")[0]?.trim() ?? "";
  return head;
}

/** Everything after the first comma, lowercased, for pattern matching. */
function noteOf(row: string): string {
  const idx = row.indexOf(",");
  return idx === -1 ? "" : row.slice(idx + 1).toLowerCase();
}

// Ordered most-specific first. The first row that matches any pattern wins,
// so the coach gets a line about a real person rather than a generic count.
//
// NOTE ON PRONOUNS: these lines never assume the lead's gender. The coach
// typed a name and a fragment; we know nothing else about them.
const PATTERNS: Array<{ test: RegExp; line: (name: string) => string }> = [
  {
    test: /\b(asked|asks|asking|twice|again|keeps?\s+bringing)\b/,
    line: (n) => `${n} already asked. That's not a cold lead. That's someone waiting.`,
  },
  {
    test: /\b(quiet|ghost(ed)?|stopped|dropped\s*off|went\s*cold|no\s*reply|never\s*replied)\b/,
    line: (n) => `${n} went quiet. That usually isn't a no. It's usually life.`,
  },
  {
    test: /\b(old\s*client|past\s*client|former|used\s*to|worked\s*with|ex-?client)\b/,
    line: (n) => `${n} already knows what you're like to work with. That's the shortest distance you have.`,
  },
];

/** The assistant's line after an import. Reflects the coach's own words back
 *  where it can, and counts honestly where it can't. Never celebrates. */
export function reflectOnRows(rows: string[]): string {
  for (const row of rows) {
    const name = leadName(row);
    if (!name) continue;
    const note = noteOf(row);
    if (!note) continue;
    for (const p of PATTERNS) {
      if (p.test.test(note)) return p.line(name);
    }
  }
  const n = rows.length;
  if (n === 0) return "";
  if (n === 1) return "One name. That's one conversation you can pick back up.";
  return `${n} names. That's ${n} conversations you can pick back up.`;
}

/** Shown under the reflection on every path. Hands off to the daily brief so
 *  the loop closes on a real trigger rather than a manufactured one. */
export const IMPORT_HANDOFF =
  "They're in your Leads room now. Tomorrow morning I'll tell you who to start with.";
