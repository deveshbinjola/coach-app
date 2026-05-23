// scripts/funnel-baseline.mjs
//
// Prints the current onboarding funnel drop-off table from cp_funnel_events.
// Run after at least one week of data:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/funnel-baseline.mjs
//
// Reuses lib/funnel.ts via a tiny inline import of the compiled logic is not
// possible from .mjs without a build step, so this script re-implements the
// SAME ordered stages. Keep FUNNEL_STAGES in sync with lib/funnel.ts.

import { createClient } from "@supabase/supabase-js";

const FUNNEL_STAGES = [
  "signup_completed",
  "brand_os_started",
  "brand_os_completed",
  "reality_questions_completed",
  "content_created",
];

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("cp_funnel_events")
  .select("coach_id, name, created_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const events = data ?? [];
const DAY_MS = 24 * 60 * 60 * 1000;
const coachesWith = (name) => new Set(events.filter((e) => e.name === name).map((e) => e.coach_id));

const perStage = FUNNEL_STAGES.map((s) => coachesWith(s));
const start = perStage[0].size || 0;
const pct = (p, w) => (w <= 0 ? 0 : Math.round((p / w) * 100));

console.log("\n=== Onboarding Funnel Baseline ===");
console.log(`Total signups: ${start}\n`);
console.log("Stage".padEnd(30), "Coaches".padEnd(9), "%Start".padEnd(8), "DropFromPrev");
FUNNEL_STAGES.forEach((stage, i) => {
  const coaches = perStage[i].size;
  const prev = i === 0 ? coaches : perStage[i - 1].size;
  const drop = i === 0 ? 0 : pct(prev - coaches, prev);
  console.log(stage.padEnd(30), String(coaches).padEnd(9), `${pct(coaches, start)}%`.padEnd(8), `${drop}%`);
});

// Derived
const started = coachesWith("brand_os_started");
const completed = coachesWith("brand_os_completed");
let abandoned = 0;
for (const c of started) if (!completed.has(c)) abandoned += 1;

const signupAt = new Map();
for (const e of events) {
  if (e.name !== "signup_completed") continue;
  const t = Date.parse(e.created_at);
  const cur = signupAt.get(e.coach_id);
  if (cur === undefined || t < cur) signupAt.set(e.coach_id, t);
}
const returned = new Set();
for (const e of events) {
  if (e.name !== "app_opened") continue;
  const s = signupAt.get(e.coach_id);
  if (s !== undefined && Date.parse(e.created_at) - s >= 7 * DAY_MS) returned.add(e.coach_id);
}

console.log(`\nBrand OS abandoned (started, never completed): ${abandoned}`);
console.log(`Returned day 7+: ${returned.size} / ${start} (${pct(returned.size, start)}%)`);
console.log("");
