// POST /api/v1/webhooks/leads/[token] — public-ish inbound lead webhook.
//
// Auth: the token in the URL is the credential. Same pattern as Stripe
// webhook secrets, GitHub webhook URLs, etc. — third-party tools rarely
// support custom Authorization headers, so we put the secret in the path.
//
// Coaches generate one of these per source via /settings → Webhooks. Paste
// the URL into Tally / Typeform / Calendly / any tool that POSTs JSON.
//
// This handler tries hard to extract a lead from arbitrary payloads:
//   1. Direct mapping if the JSON has Coach Platform field names
//   2. Case-insensitive label matching for Tally's `data.fields[]` shape
//   3. Field-type matching for Typeform's `form_response.answers[]` shape
//   4. Fallback: dump the whole payload into notes so nothing is lost
//
// On success the lead is INSERTed → Phase 11 trigger fires auto-draft.
// Returns the inserted lead row so coaches can verify in their tool's
// webhook log.

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = 'edge';

type LeadSource =
  | "ig"
  | "linkedin"
  | "referral"
  | "quiz"
  | "in_person"
  | "podcast"
  | "newsletter"
  | "other";

const SOURCES: LeadSource[] = [
  "ig",
  "linkedin",
  "referral",
  "quiz",
  "in_person",
  "podcast",
  "newsletter",
  "other",
];

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const admin = createAdminClient();

  // Look up the endpoint by token. Inactive endpoints reject silently with
  // 404 — we don't tell unauthenticated callers whether the token used to
  // be valid.
  const { data: endpoint } = await admin
    .from("cp_webhook_endpoints")
    .select("id, coach_id, default_source, default_source_detail, active")
    .eq("token", params.token)
    .eq("active", true)
    .maybeSingle();

  if (!endpoint) {
    return new Response(
      JSON.stringify({ error: "Endpoint not found or inactive" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lead = extractLead(payload);
  if (!lead.full_name) {
    return new Response(
      JSON.stringify({
        error:
          "Could not extract a name from the payload. Send `full_name` at the top level, or for Tally/Typeform make sure a field is labeled 'Name'.",
        received_keys: Object.keys(payload ?? {}),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  // Resolve source: payload.source if explicitly sent and valid; otherwise
  // the endpoint's default_source.
  const source: LeadSource =
    typeof payload.source === "string" &&
    SOURCES.includes(payload.source as LeadSource)
      ? (payload.source as LeadSource)
      : (endpoint.default_source as LeadSource);

  const source_detail =
    (typeof payload.source_detail === "string" && payload.source_detail.trim()) ||
    endpoint.default_source_detail ||
    null;

  const { data: inserted, error: insErr } = await admin
    .from("cp_leads")
    .insert({
      coach_id: endpoint.coach_id,
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone,
      source,
      source_detail,
      temperature: lead.temperature ?? "warm",
      pain_signal: lead.pain_signal ?? [],
      notes: lead.notes,
      status: "new" as const,
      auto_draft_eligible: true,
    })
    .select("id, full_name, email, source, status, created_at")
    .single();

  if (insErr) {
    return new Response(
      JSON.stringify({ error: "Insert failed", details: insErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Bump the endpoint's stats. Fire-and-forget — failure here doesn't
  // affect the caller.
  admin
    .from("cp_webhook_endpoints")
    .update({
      last_used_at: new Date().toISOString(),
      total_received: (await currentTotal(admin, endpoint.id)) + 1,
    })
    .eq("id", endpoint.id)
    .then(() => {});

  // Phase 11 trigger fires auto-draft on insert. We don't have to invoke
  // anything here — the DB-level trigger handles it.

  return new Response(
    JSON.stringify({ ok: true, lead: inserted }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}

// ---------- payload extraction ----------

type ExtractedLead = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  temperature?: "on_fire" | "hot" | "warm" | "cold" | "dormant";
  pain_signal?: string[];
};

/** Try (in order):
 *  1. Coach Platform's own field names at top level
 *  2. Common aliases (name, fullName, emailAddress)
 *  3. Tally's data.fields[] shape with case-insensitive label matching
 *  4. Typeform's form_response.answers[] shape
 *  5. Fall back to JSON-stringified payload in notes
 */
function extractLead(p: any): ExtractedLead {
  // 1+2. Direct + alias mapping at top level.
  let full_name: string | null =
    asString(p.full_name) ?? asString(p.fullName) ?? asString(p.name) ?? null;
  let email: string | null =
    asString(p.email) ??
    asString(p.email_address) ??
    asString(p.emailAddress) ??
    null;
  let phone: string | null =
    asString(p.phone) ??
    asString(p.phone_number) ??
    asString(p.phoneNumber) ??
    null;
  let notes: string | null =
    asString(p.notes) ??
    asString(p.message) ??
    asString(p.description) ??
    null;

  // First+last fallback (some forms split the name).
  if (!full_name) {
    const first = asString(p.first_name) ?? asString(p.firstName) ?? "";
    const last = asString(p.last_name) ?? asString(p.lastName) ?? "";
    const combined = `${first} ${last}`.trim();
    if (combined) full_name = combined;
  }

  // 3. Tally pattern — `data.fields[]` with `label` + `value`.
  if (Array.isArray(p?.data?.fields)) {
    for (const f of p.data.fields) {
      const label = String(f?.label ?? "").toLowerCase();
      const value = asString(f?.value) ?? asString(f?.answer) ?? null;
      if (!value) continue;
      if (!full_name && /^(full ?name|name)$/i.test(label)) full_name = value;
      else if (!email && /e-?mail/.test(label)) email = value;
      else if (!phone && /phone|tel/.test(label)) phone = value;
      else if (!notes && /(message|notes?|tell|describe|comments?)/.test(label))
        notes = value;
    }
  }

  // 4. Typeform pattern — `form_response.answers[]` with `field.type` +
  //    type-specific fields.
  if (Array.isArray(p?.form_response?.answers)) {
    for (const a of p.form_response.answers) {
      const t = a?.field?.type;
      if (!email && t === "email" && a.email) email = String(a.email);
      else if (!phone && (t === "phone_number" || t === "phone") && a.phone_number)
        phone = String(a.phone_number);
      else if (!full_name && t === "short_text" && a.text) {
        // Typeform doesn't tag a "name" field — we guess based on the
        // first short_text answer. Coach can always edit later.
        full_name = String(a.text);
      } else if (!notes && t === "long_text" && a.text) {
        notes = String(a.text);
      }
    }
  }

  // 5. Last-resort safety net — preserve the raw payload in notes so
  //    nothing is lost. Coach can fix the field mapping in their tool.
  if (!notes) {
    try {
      notes = JSON.stringify(p, null, 2).slice(0, 4000);
    } catch {
      /* unstringifiable — leave null */
    }
  }

  // Optional structured fields (some tools can pass these).
  const temperature =
    typeof p.temperature === "string" &&
    ["on_fire", "hot", "warm", "cold", "dormant"].includes(p.temperature)
      ? (p.temperature as ExtractedLead["temperature"])
      : undefined;
  const pain_signal = Array.isArray(p.pain_signal)
    ? p.pain_signal.filter((x: unknown) => typeof x === "string")
    : undefined;

  return { full_name, email, phone, notes, temperature, pain_signal };
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

async function currentTotal(admin: any, endpointId: string): Promise<number> {
  const { data } = await admin
    .from("cp_webhook_endpoints")
    .select("total_received")
    .eq("id", endpointId)
    .single();
  return Number(data?.total_received ?? 0);
}
