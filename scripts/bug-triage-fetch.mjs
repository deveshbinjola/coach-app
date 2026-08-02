#!/usr/bin/env node
// Self-healing loop, P1: list the open bug queue for the nightly agent.
// Reads with the service role so it sees every coach's reports (bypasses RLS).
//
// Usage:  node scripts/bug-triage-fetch.mjs [--limit N] [--severity high]
// Output: JSON { count, reports: [...] } to stdout. Oldest first.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const limit = Number(arg("--limit", "10"));
const severity = arg("--severity");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

let query = supabase
  .from("cp_bug_reports")
  .select("id, coach_id, title, description, severity, status, page_url, console_error, created_at")
  .eq("status", "open")
  .order("created_at", { ascending: true })
  .limit(limit);

if (severity) query = query.eq("severity", severity);

const { data, error } = await query;

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

console.log(JSON.stringify({ count: data.length, reports: data }, null, 2));
