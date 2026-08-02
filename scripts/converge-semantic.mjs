#!/usr/bin/env node
// Second pass: the semantic colour families (danger / warning / success / info).
//
// Split from the gray pass because these carry MEANING, so the mapping had to
// be read rather than derived. red = danger, amber = warning, green/emerald =
// success, blue = info. Shade collapses to the token's three slots: fill, soft
// background, border.
import { readFileSync, writeFileSync } from "node:fs";

const RULES = [
  // danger
  [/((?:[a-z-]+:)*)\btext-red-(?:600|700|800|900)\b/g, "$1text-[color:var(--danger)]"],
  [/((?:[a-z-]+:)*)\btext-red-(?:400|500)\b/g,         "$1text-[color:var(--danger)]"],
  [/((?:[a-z-]+:)*)\bbg-red-(?:50|100)\b/g,            "$1bg-[var(--danger-soft)]"],
  [/((?:[a-z-]+:)*)\bbg-red-(?:500|600|700)\b/g,       "$1bg-[var(--danger)]"],
  [/((?:[a-z-]+:)*)\bborder-red-(?:100|200|300)\b/g,   "$1border-[var(--danger-border)]"],
  [/((?:[a-z-]+:)*)\bborder-red-(?:400|500|600)\b/g,   "$1border-[var(--danger)]"],
  [/((?:[a-z-]+:)*)\bring-red-[0-9]+\b/g,              "$1ring-[var(--danger)]"],

  // warning
  [/((?:[a-z-]+:)*)\btext-amber-(?:600|700|800|900|950)\b/g, "$1text-[color:var(--warning)]"],
  [/((?:[a-z-]+:)*)\btext-(?:amber|yellow|orange)-[0-9]+\b/g, "$1text-[color:var(--warning)]"],
  [/((?:[a-z-]+:)*)\bbg-(?:amber|yellow|orange)-(?:50|100)\b/g, "$1bg-[var(--warning-soft)]"],
  [/((?:[a-z-]+:)*)\bbg-(?:amber|yellow|orange)-[0-9]+\b/g,  "$1bg-[var(--warning)]"],
  [/((?:[a-z-]+:)*)\bborder-(?:amber|yellow|orange)-[0-9]+\b/g, "$1border-[var(--warning-border)]"],

  // success
  [/((?:[a-z-]+:)*)\btext-(?:green|emerald)-[0-9]+\b/g,   "$1text-[color:var(--success)]"],
  [/((?:[a-z-]+:)*)\bbg-(?:green|emerald)-(?:50|100)\b/g, "$1bg-[var(--success-soft)]"],
  [/((?:[a-z-]+:)*)\bbg-(?:green|emerald)-[0-9]+\b/g,     "$1bg-[var(--success)]"],
  [/((?:[a-z-]+:)*)\bborder-(?:green|emerald)-[0-9]+\b/g, "$1border-[var(--success)]"],

  // info
  [/((?:[a-z-]+:)*)\btext-(?:blue|indigo)-[0-9]+\b/g,   "$1text-[color:var(--info)]"],
  [/((?:[a-z-]+:)*)\bbg-(?:blue|indigo)-(?:50|100)\b/g, "$1bg-[var(--info-soft)]"],
  [/((?:[a-z-]+:)*)\bborder-(?:blue|indigo)-[0-9]+\b/g, "$1border-[var(--info)]"],
];

const dry = process.argv.includes("--dry");
let grand = 0;
for (const file of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  const before = readFileSync(file, "utf8");
  let after = before, n = 0;
  for (const [re, rep] of RULES) {
    after = after.replace(re, (...a) => { n++; return a[1] + rep.slice(2); });
  }
  if (n && !dry) writeFileSync(file, after);
  if (n) console.log(`${String(n).padStart(3)}  ${file}`);
  grand += n;
}
console.log(`\n${grand} semantic classes across ${process.argv.slice(2).filter(a=>!a.startsWith("--")).length} files`);
