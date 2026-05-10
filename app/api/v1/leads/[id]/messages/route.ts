// POST /api/v1/leads/[id]/messages — log an inbound or outbound message
// against a specific lead. The agent's primary write surface for keeping
// the conversation history accurate.

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  parseBody,
  nonEmptyString,
  MessageChannelSchema,
  MessageDirectionSchema,
  MessagePurposeSchema,
} from "@/lib/api-validation";

export const runtime = 'edge';

const LogMessageSchema = z.object({
  content: nonEmptyString(10000),
  direction: MessageDirectionSchema,
  channel: MessageChannelSchema.optional().default("other"),
  ai_drafted: z.boolean().optional().default(false),
  synced_from: z.string().max(64).optional().default("api"),
  purpose: MessagePurposeSchema.nullable().optional().default(null),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, LogMessageSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);
  const body = parsed.data;

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
      channel: body.channel,
      direction: body.direction,
      content: body.content,
      ai_drafted: body.ai_drafted,
      synced_from: body.synced_from,
      sent_at: body.direction === "outbound" ? new Date().toISOString() : null,
      purpose: body.purpose,
    })
    .select("*")
    .single();

  if (error || !data) return apiError(error?.message ?? "Insert failed", 500);

  // If outbound, update lead.last_contact_at + bump status from 'new'.
  if (body.direction === "outbound") {
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
