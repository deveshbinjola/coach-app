#!/usr/bin/env node
// One-shot codemod for the interior design convergence.
//
// Maps Tailwind's default gray scale onto the app's semantic tokens. The
// mapping is SEMANTIC, not mechanical: gray-600 and gray-700 both become
// --text-muted because the token system has three text tiers, not nine. That
// collapse is the point. The old code had two parallel colour systems and the
// gray one was invisible to every theme change.
//
// Deliberately NOT handled here (they need a human read, not a rule):
//   bg-white      sometimes a surface, sometimes intentional on a dark panel
//   text-white    usually correct on a brand-filled button
//   red/green/*   semantic intent varies (danger vs brand vs decoration)
//
// Usage: node scripts/converge-tokens.mjs <file...>   (--dry to preview)

import { readFileSync, writeFileSync } from "node:fs";

const SCALES = "(?:gray|slate|zinc|neutral|stone)";

/** [property, shade-pattern, replacement] */
const RULES = [
  ["text", "(?:900|800)", "text-[color:var(--text)]"],
  ["text", "(?:700|600)", "text-[color:var(--text-muted)]"],
  ["text", "(?:500|400)", "text-[color:var(--text-faint)]"],
  ["text", "(?:300|200)", "text-[color:var(--text-faint)]"],

  ["bg", "(?:50|100)", "bg-[var(--surface-deep)]"],
  ["bg", "(?:200|300)", "bg-[var(--border)]"],
  ["bg", "(?:800|900)", "bg-[var(--navy)]"],

  ["border", "100", "border-[var(--border-faint)]"],
  ["border", "(?:200|300)", "border-[var(--border)]"],
  ["border", "(?:400|500|600)", "border-[var(--border-strong)]"],

  ["divide", "100", "divide-[var(--border-faint)]"],
  ["divide", "(?:200|300)", "divide-[var(--border)]"],

  ["ring", "(?:200|300)", "ring-[var(--border)]"],
];

// Radius: the app defines --r-sm/md/lg/xl and these bypassed it.
const RADIUS = [
  [/\brounded-lg\b/g, "rounded-[var(--r-md)]"],
  [/\brounded-xl\b/g, "rounded-[var(--r-lg)]"],
  [/\brounded-2xl\b/g, "rounded-[var(--r-xl)]"],
];

const dry = process.argv.includes("--dry");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));

let grand = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before;
  let n = 0;

  for (const [prop, shades, replacement] of RULES) {
    // Keep any variant prefix (hover:, md:, group-hover:, dark:, focus-visible:).
    const re = new RegExp(`((?:[a-z-]+:)*)\\b${prop}-${SCALES}-${shades}\\b`, "g");
    after = after.replace(re, (_m, prefix) => {
      n++;
      return prefix + replacement;
    });
  }
  for (const [re, replacement] of RADIUS) {
    after = after.replace(re, () => { n++; return replacement; });
  }

  if (n && !dry) writeFileSync(file, after);
  if (n) console.log(`${dry ? "would fix" : "fixed"} ${String(n).padStart(3)}  ${file}`);
  grand += n;
}
console.log(`\n${dry ? "would change" : "changed"} ${grand} classes across ${files.length} files`);
