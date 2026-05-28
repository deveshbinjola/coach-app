// GET    /api/v1/sequences/[id]  — fetch a single sequence with steps
// PATCH  /api/v1/sequences/[id]  — update sequence metadata
// DELETE /api/v1/sequences/[id]  — delete a sequence (cascades steps + enrollments)

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const PatchSequenceSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    trigger_type: z.enum(["quiz_completed", "status_change"]).optional(),
    trigger_config: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "must include at least one field to update",
  });

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();

  const [{ data: sequence, error: seqErr }, { data: steps }] = await Promise.all([
    admin
      .from("cp_sequences")
      .select("*")
      .eq("id", params.id)
      .eq("coach_id", auth.coachId)
      .maybeSingle(),
    admin
      .from("cp_sequence_steps")
      .select("*")
      .eq("sequence_id", params.id)
      .eq("coach_id", auth.coachId)
      .order("position", { ascending: true }),
  ]);

  if (seqErr) return apiError(seqErr.message, 500);
  if (!sequence) return apiError("Sequence not found", 404);

  return apiOk({ sequence, steps: steps ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, PatchSequenceSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_sequences")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .select("*")
    .single();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Sequence not found", 404);

  return apiOk({ sequence: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const admin = createAdminClient();
  const { error } = await admin
    .from("cp_sequences")
    .delete()
    .eq("id", params.id)
    .eq("coach_id", auth.coachId);

  if (error) return apiError(error.message, 500);
  return apiOk({ deleted: true });
}
