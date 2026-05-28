// GET /api/v1/sequences/[id]/steps  — list steps for a sequence
// PUT /api/v1/sequences/[id]/steps  — batch replace all steps

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const StepSchema = z.object({
  position: z.number().int().min(1),
  delay_minutes: z.number().int().min(0).default(0),
  action_type: z.string().default("send_email"),
  content_mode: z.enum(["template", "ai_draft"]),
  action_config: z.record(z.unknown()).default({}),
  ai_prompt: z.string().max(2000).nullable().default(null),
});

const BatchReplaceSchema = z.object({
  steps: z.array(StepSchema).min(0).max(20),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .eq("coach_id", auth.coachId)
    .order("position", { ascending: true });

  if (error) return apiError(error.message, 500);
  return apiOk({ steps: data ?? [] });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, BatchReplaceSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();

  // Verify sequence belongs to coach.
  const { data: seq } = await admin
    .from("cp_sequences")
    .select("id")
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .maybeSingle();

  if (!seq) return apiError("Sequence not found", 404);

  // Delete existing steps, insert new ones.
  await admin
    .from("cp_sequence_steps")
    .delete()
    .eq("sequence_id", params.id)
    .eq("coach_id", auth.coachId);

  if (parsed.data.steps.length > 0) {
    const rows = parsed.data.steps.map((step) => ({
      ...step,
      sequence_id: params.id,
      coach_id: auth.coachId,
    }));

    const { error: insertErr } = await admin
      .from("cp_sequence_steps")
      .insert(rows);

    if (insertErr) return apiError(insertErr.message, 500);
  }

  // Return the fresh list.
  const { data: fresh } = await admin
    .from("cp_sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .order("position", { ascending: true });

  return apiOk({ steps: fresh ?? [] });
}
