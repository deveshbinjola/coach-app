// GET   /api/v1/leads/[id]  — fetch a single lead with its message history.
// PATCH /api/v1/leads/[id]  — update mutable fields. Phase 10 — agents can
//                              now move leads through the pipeline without
//                              the dashboard.

import { NextRequest } from "next/server";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();

  const [{ data: lead, error: leadErr }, { data: messages }] = await Promise.all([
    admin
      .from("cp_leads")
      .select("*")
      .eq("id", params.id)
      .eq("coach_id", auth.coachId)
      .maybeSingle(),
    admin
      .from("cp_lead_messages")
      .select("*")
      .eq("lead_id", params.id)
      .eq("coach_id", auth.coachId)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (leadErr) return apiError(leadErr.message, 500);
  if (!lead) return apiError("Lead not found", 404);

  return apiOk({ lead, messages: messages ?? [] });
}

// Whitelist of fields the API allows agents to update. Anything else is
// silently dropped. Notably we DON'T allow: id, coach_id, full_name (too
// destructive), created_at/updated_at (system-managed), auto_draft_eligible
// (avoid retroactive trigger surprises), referred_by_lead_id (relationship
// integrity), tags (separate endpoint later).
const PATCHABLE_FIELDS = [
  "status",
  "temperature",
  "source",
  "source_detail",
  "email",
  "phone",
  "notes",
  "pain_signal",
  "next_honest_action",
  "discovery_call_completed",
  "income_band",
  "readiness_signal",
  "fit_notes",
  "next_followup_at",
  "last_contact_at",
  "disqualified_reason",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write"))
    return apiError("write scope required", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  // Build the patch from whitelisted fields only.
  const patch: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] !== undefined) {
      patch[field] = body[field];
    }
  }
  if (Object.keys(patch).length === 0) {
    return apiError(
      `No patchable fields in body. Allowed: ${PATCHABLE_FIELDS.join(", ")}`,
      400
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_leads")
    .update(patch)
    .eq("id", params.id)
    .eq("coach_id", auth.coachId) // RLS-equivalent guard at app level
    .select("*")
    .single();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Lead not found", 404);

  return apiOk({ lead: data });
}
