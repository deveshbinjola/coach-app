// POST /api/v1/sequences/[id]/activate  — activate or deactivate a sequence
//
// Body: { active: true } or { active: false }
// Guards: at least 1 step with valid content required for activation.

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const ActivateSchema = z.object({
  active: z.boolean(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, ActivateSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();

  // Verify sequence belongs to coach.
  const { data: seq } = await admin
    .from("cp_sequences")
    .select("id, is_active")
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .maybeSingle();

  if (!seq) return apiError("Sequence not found", 404);

  if (parsed.data.active) {
    // Activation guard: at least 1 step with valid content.
    const { data: steps } = await admin
      .from("cp_sequence_steps")
      .select("id, content_mode, action_config, ai_prompt")
      .eq("sequence_id", params.id);

    if (!steps || steps.length === 0) {
      return apiError("Cannot activate: sequence has no steps", 422);
    }

    // Each step must have content — template needs subject+body, ai_draft needs prompt.
    for (const step of steps) {
      if (step.content_mode === "template") {
        const config = (step.action_config ?? {}) as Record<string, unknown>;
        if (!config.subject || !config.body_html) {
          return apiError(
            "Cannot activate: template step missing subject or body",
            422
          );
        }
      } else if (step.content_mode === "ai_draft") {
        if (!step.ai_prompt) {
          return apiError(
            "Cannot activate: AI draft step missing prompt",
            422
          );
        }
      }
    }
  }

  // Update is_active.
  const { data, error } = await admin
    .from("cp_sequences")
    .update({ is_active: parsed.data.active })
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .select("*")
    .single();

  if (error) return apiError(error.message, 500);
  return apiOk({ sequence: data });
}
