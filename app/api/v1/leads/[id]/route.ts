// GET   /api/v1/leads/[id]  — fetch a single lead with its message history.
// PATCH /api/v1/leads/[id]  — update mutable fields. Phase 10 — agents can
//                              now move leads through the pipeline without
//                              the dashboard.

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  parseBody,
  LeadSourceSchema,
  LeadStatusSchema,
  LeadTemperatureSchema,
  PainSignalSchema,
} from "@/lib/api-validation";

export const runtime = 'edge';

// PATCH body schema. Every field optional — caller can patch one or many.
// Fields NOT here (id, coach_id, full_name, created_at, auto_draft_eligible,
// referred_by_lead_id, tags) are intentionally not patchable via the API.
const PatchLeadSchema = z
  .object({
    status: LeadStatusSchema.optional(),
    temperature: LeadTemperatureSchema.optional(),
    source: LeadSourceSchema.optional(),
    source_detail: z.string().max(500).nullable().optional(),
    email: z.string().max(320).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    pain_signal: z.array(PainSignalSchema).max(10).optional(),
    next_honest_action: z.string().max(500).nullable().optional(),
    discovery_call_completed: z.boolean().optional(),
    income_band: z.enum(["under_5k", "5k_to_15k", "15k_plus", "unknown"]).nullable().optional(),
    readiness_signal: z.enum(["browsing", "interested", "ready", "buying"]).nullable().optional(),
    fit_notes: z.string().max(2000).nullable().optional(),
    next_followup_at: z.string().datetime().nullable().optional(),
    last_contact_at: z.string().datetime().nullable().optional(),
    disqualified_reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "must include at least one patchable field",
  });

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write"))
    return apiError("write scope required", 403);

  const parsed = await parseBody(request, PatchLeadSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);
  // .strict() above means unknown keys reject with a clear error,
  // so we can pass the validated object straight through to the
  // update call as the patch.
  const patch = parsed.data;

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
