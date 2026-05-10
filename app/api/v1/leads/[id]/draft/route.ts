// POST /api/v1/leads/[id]/draft — invoke the Auto-Response Engine on demand.
//
// Use case: an agent has a lead and wants a fresh first-response draft (or
// the lead's auto-draft was discarded / never fired and the agent needs
// one now). The function does the same idempotency checks the inline
// trigger does — won't duplicate a pending draft.
//
// Returns the same shape as the auto-draft-response Edge Function:
//   - { ok: true, lead_id, channel, draft_length } on success
//   - { skipped: "<reason>" } when a no-op (already drafted, no voice
//     profile, auto_draft disabled, etc.)

import { NextRequest } from "next/server";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = 'edge';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write"))
    return apiError("write scope required", 403);

  const admin = createAdminClient();

  // Belt-and-suspenders: confirm the lead belongs to this coach before
  // firing the function. The function itself also validates this, but a
  // pre-check gives us a cleaner 404 instead of a generic skip.
  const { data: lead } = await admin
    .from("cp_leads")
    .select("id")
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .maybeSingle();
  if (!lead) return apiError("Lead not found", 404);

  // Service-role invoke. The Edge Function checks scopes, voice profile,
  // existing-draft-dedup, and returns a structured response either way.
  const { data, error } = await admin.functions.invoke(
    "auto-draft-response",
    { body: { lead_id: params.id } }
  );
  if (error) return apiError(error.message, 502);

  return apiOk(data ?? { ok: true });
}
