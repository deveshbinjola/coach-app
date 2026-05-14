// POST /api/coach/import-leads
//
// Quick paste-or-CSV importer used from the onboarding card. Coach drops
// rows (name + optional email + optional notes) and we create cp_leads
// rows in one round trip.
//
// Body: { rows: string[], asClients?: boolean }
//   - asClients=true sets status='client' for the client-list path
//   - asClients=false (default) sets status='new'
//
// Parse rules per row:
//   "Name"                          → just a name
//   "Name, email@x.com"             → name + email
//   "Name, email@x.com, notes…"     → name + email + notes
//   "Name | email@x.com | notes"    → pipe also accepted
//   "Name\temail@x.com\tnotes"      → tab also accepted (CSV paste)
//
// Skips blank lines and dedupes by (full_name + email) within the batch.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

const MAX_ROWS = 200;

type ParsedRow = { full_name: string; email: string | null; notes: string | null };

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rows?: unknown; asClients?: unknown };
  try {
    body = (await request.json()) as { rows?: unknown; asClients?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows must be an array of strings" }, { status: 400 });
  }
  const asClients = body.asClients === true;
  const inputRows = (body.rows as unknown[]).filter((r): r is string => typeof r === "string").slice(0, MAX_ROWS);

  // Parse + dedupe.
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  for (const raw of inputRows) {
    const row = parseRow(raw);
    if (!row) continue;
    const key = `${row.full_name.toLowerCase()}|${(row.email ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(row);
  }
  if (parsed.length === 0) {
    return NextResponse.json({ error: "No valid rows. Each row needs at least a name." }, { status: 400 });
  }

  // Insert.
  const now = new Date().toISOString();
  const inserts = parsed.map((r) => ({
    coach_id: user.id,
    full_name: r.full_name,
    email: r.email,
    phone: null,
    source: "manual" as const,
    source_detail: asClients ? "Imported as client (onboarding)" : "Imported (onboarding)",
    referred_by_lead_id: null,
    status: asClients ? "client" : "new",
    temperature: asClients ? "hot" : "warm",
    notes: r.notes,
    tags: asClients ? ["onboarding-import", "client-import"] : ["onboarding-import"],
    pain_signal: [],
    discovery_call_completed: asClients,
    // Suppress auto-draft for bulk imports — these aren't fresh signals.
    auto_draft_eligible: false,
    last_contact_at: null,
    next_followup_at: null,
    next_honest_action: null,
    income_band: null,
    readiness_signal: null,
    fit_notes: null,
    disqualified_reason: null,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("cp_leads")
    .insert(inserts)
    .select("id, full_name, email, status");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: data?.length ?? 0,
    skipped_dupes: inputRows.length - parsed.length,
    as_clients: asClients,
  });
}

function parseRow(raw: string): ParsedRow | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Split on tab > pipe > comma in that priority — tab/pipe are less
  // ambiguous if names contain commas like "Smith, John".
  const sep = trimmed.includes("\t") ? "\t" : trimmed.includes("|") ? "|" : ",";
  const parts = trimmed.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const name = parts[0];
  if (!name) return null;

  // Find first part that looks like an email.
  const emailIdx = parts.findIndex((p, i) => i > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
  const email = emailIdx >= 0 ? parts[emailIdx] : null;

  // Notes = everything else after name (and after email if present).
  const noteParts = parts.filter((_, i) => i !== 0 && i !== emailIdx);
  const notes = noteParts.length > 0 ? noteParts.join(", ") : null;

  return { full_name: name.slice(0, 200), email: email ? email.slice(0, 200) : null, notes: notes ? notes.slice(0, 1000) : null };
}
