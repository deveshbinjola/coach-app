#!/usr/bin/env node
// Self-healing loop, P1: write a fix proposal back to a bug report.
// The nightly agent calls this AFTER it opens a PR, so the row reflects the
// proposed fix. It never sets status to 'fixed' — only a human merge does that.
//
// Usage:
//   node scripts/bug-triage-update.mjs --id <uuid> --status triaged \
//        --branch fix/bug-<id> --pr https://github.com/.../pull/123 \
//        --notes "Root cause: ... Fix: ..."
//
// Allowed --status values for the agent: triaged, in_progress, wont_fix, duplicate.
// (open -> the agent leaves it; fixed -> reserved for human merge.)

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const id = arg("--id");
if (!id) {
  console.error("--id <uuid> is required.");
  process.exit(1);
}

const AGENT_STATUSES = new Set(["triaged", "in_progress", "wont_fix", "duplicate"]);

const patch = { updated_at: new Date().toISOString() };
const status = arg("--status");
if (status) {
  if (!AGENT_STATUSES.has(status)) {
    console.error(`Refusing status '${status}'. The agent may only set: ${[...AGENT_STATUSES].join(", ")}. 'fixed' is reserved for human merge.`);
    process.exit(1);
  }
  patch.status = status;
}
const branch = arg("--branch");
if (branch) patch.fix_branch = branch;
const pr = arg("--pr");
if (pr) patch.fix_pr_url = pr;
const notes = arg("--notes");
if (notes) patch.fix_notes = notes;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { error } = await supabase.from("cp_bug_reports").update(patch).eq("id", id);

if (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, id, patch }));
