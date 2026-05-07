// POST /api/v1/leads/[id]/messages — log an inbound or outbound message
// against a specific lead. The agent's primary write surface for keeping
// the conversation history accurate.

import { NextRequest } from "next/server";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

const VALID_DIRECTIONS = ["inbound", "outbound", "draft"] as const;
const VALID_CHANNELS = [
  "email",
  "dm_ig",
  "dm_linkedin",
  "sms",
  "call",
  "other",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (typeof body?.content !== "string" || body.content.trim().length === 0) {
    return apiError("content (string) is required", 400);
  }
  const direction = body.direction;
  if (!VALID_DIRECTIONS.includes(direction)) {
    return apiError(
      `direction must be one of: ${VALID_DIRECTIONS.join(", ")}`,
      400
    );
  }
  const channel = body.channel ?? "other";
  if (!VALID_CHANNELS.includes(channel)) {
    return apiError(
      `channel must be one of: ${VALID_CHANNELS.join(", ")}`,
      400
    );
  }

  const admin = createAdminClient();

  // Verify the lead belongs to this coach before inserting. Otherwise an
  // attacker with a key could log messages on a lead UUID they guessed.
  const { data: lead } = await admin
    .from("cp_leads")
    .select("id")
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .maybeSingle();
  if (!lead) return apiError("Lead not found", 404);

  const { data, error } = await admin
    .from("cp_lead_messages")
    .insert({
      lead_id: params.id,
      coach_id: auth.coachId,
      channel,
      direction,
      content: body.content.trim(),
      ai_drafted: Boolean(body.ai_drafted ?? false),
      synced_from: typeof body.synced_from === "string" ? body.synced_from : "api",
      sent_at: direction === "outbound" ? new Date().toISOString() : null,
      purpose: typeof body.purpose === "string" ? body.purpose : null,
    })
    .select("*")
    .single();

  if (error || !data) return apiError(error?.message ?? "Insert failed", 500);

  // If outbound, update lead.last_contact_at + bump status from 'new'.
  if (direction === "outbound") {
    await admin
      .from("cp_leads")
      .update({
        last_contact_at: new Date().toISOString(),
        status: "contacted",
      })
      .eq("id", params.id)
      .eq("coach_id", auth.coachId)
      .eq("status", "new"); // only auto-bump from 'new' — don't downgrade
  }

  return apiOk({ message: data }, 201);
}
