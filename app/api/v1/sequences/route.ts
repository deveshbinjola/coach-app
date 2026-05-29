// GET  /api/v1/sequences     — list coach's sequences with stats
// POST /api/v1/sequences     — create a new draft sequence

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const CreateSequenceSchema = z.object({
  name: z.string().min(1).max(200),
  trigger_type: z.enum(["quiz_completed", "status_change"]),
  trigger_config: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();

  // Fetch sequences with step count.
  const { data: sequences, error } = await admin
    .from("cp_sequences")
    .select("*")
    .eq("coach_id", auth.coachId)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  // Fetch step counts per sequence.
  const seqIds = (sequences ?? []).map((s: { id: string }) => s.id);
  let stepCounts: Record<string, number> = {};
  if (seqIds.length > 0) {
    const { data: steps } = await admin
      .from("cp_sequence_steps")
      .select("sequence_id")
      .in("sequence_id", seqIds);

    stepCounts = (steps ?? []).reduce(
      (acc: Record<string, number>, s: { sequence_id: string }) => {
        acc[s.sequence_id] = (acc[s.sequence_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  // Fetch enrollment stats per sequence.
  let enrollmentStats: Record<string, { enrolled: number; completed: number; failed: number }> = {};
  if (seqIds.length > 0) {
    const { data: enrollments } = await admin
      .from("cp_sequence_enrollments")
      .select("sequence_id, status")
      .in("sequence_id", seqIds);

    enrollmentStats = (enrollments ?? []).reduce(
      (acc: Record<string, { enrolled: number; completed: number; failed: number }>, e: { sequence_id: string; status: string }) => {
        if (!acc[e.sequence_id]) acc[e.sequence_id] = { enrolled: 0, completed: 0, failed: 0 };
        acc[e.sequence_id]!.enrolled++;
        if (e.status === "completed") acc[e.sequence_id]!.completed++;
        if (e.status === "failed") acc[e.sequence_id]!.failed++;
        return acc;
      },
      {} as Record<string, { enrolled: number; completed: number; failed: number }>
    );
  }

  const enriched = (sequences ?? []).map((seq: Record<string, unknown>) => ({
    ...seq,
    step_count: stepCounts[seq.id as string] ?? 0,
    stats: enrollmentStats[seq.id as string] ?? { enrolled: 0, completed: 0, failed: 0 },
  }));

  return apiOk({ sequences: enriched });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, CreateSequenceSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_sequences")
    .insert({
      coach_id: auth.coachId,
      name: parsed.data.name,
      trigger_type: parsed.data.trigger_type,
      trigger_config: parsed.data.trigger_config,
      is_active: false,
    })
    .select("*")
    .single();

  if (error || !data) return apiError(error?.message ?? "Insert failed", 500);
  return apiOk({ sequence: data }, 201);
}
