// lib/sequence-triggers.ts
//
// Trigger detection + enrollment for automation sequences.
//
// Called fire-and-forget from existing API routes:
//   - lib/funnel-log.ts (quiz_completed)
//   - app/api/v1/leads/[id]/route.ts (status_change)
//
// Uses the admin client (service role) because it runs in contexts
// that may not have a user JWT (e.g., webhook routes).

import { createAdminClient } from "@/lib/supabase-admin";

type TriggerType = "quiz_completed" | "status_change";

type LeadContext = {
  id: string;
  coach_id: string;
  email: string | null;
};

type TriggerMeta = Record<string, unknown>;

/**
 * Check active sequences for a coach, match against the trigger event,
 * and enroll the lead if guards pass.
 *
 * Designed to be called fire-and-forget: `void checkSequenceTriggers(...)`.
 * Never throws — errors are logged and swallowed.
 */
export async function checkSequenceTriggers(
  coachId: string,
  triggerType: TriggerType,
  lead: LeadContext,
  triggerMeta: TriggerMeta = {},
): Promise<void> {
  // Guard: lead must have an email for send_email actions.
  if (!lead.email) return;

  try {
    const admin = createAdminClient();

    // 1. Find active sequences matching this trigger type for this coach.
    const { data: sequences, error: seqErr } = await admin
      .from("cp_sequences")
      .select("id, trigger_config")
      .eq("coach_id", coachId)
      .eq("trigger_type", triggerType)
      .eq("is_active", true);

    if (seqErr || !sequences || sequences.length === 0) return;

    for (const seq of sequences) {
      // 2. Match trigger_config against the event metadata.
      const config = (seq.trigger_config ?? {}) as Record<string, unknown>;
      if (!matchesTriggerConfig(triggerType, config, triggerMeta)) continue;

      // 3. Check if lead is already actively enrolled in this sequence.
      //    The partial unique index also enforces this, but checking first
      //    avoids a noisy constraint violation error in logs.
      const { data: existing } = await admin
        .from("cp_sequence_enrollments")
        .select("id")
        .eq("sequence_id", seq.id)
        .eq("lead_id", lead.id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) continue;

      // 4. Get the first step (position = 1) and its delay.
      const { data: firstStep } = await admin
        .from("cp_sequence_steps")
        .select("id, delay_minutes")
        .eq("sequence_id", seq.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstStep) continue; // Sequence has no steps — skip.

      // 5. Enroll: insert with execute_at = now() + delay.
      const delayMs = (firstStep.delay_minutes ?? 0) * 60 * 1000;
      const executeAt = new Date(Date.now() + delayMs).toISOString();

      await admin.from("cp_sequence_enrollments").insert({
        sequence_id: seq.id,
        lead_id: lead.id,
        coach_id: coachId,
        current_step_id: firstStep.id,
        status: "active",
        execute_at: executeAt,
      });
    }
  } catch (err) {
    // Fire-and-forget: never throw. Log for debugging.
    console.warn("[sequence-triggers] enrollment failed:", err);
  }
}

/**
 * Pure function: does the sequence's trigger_config match the event metadata?
 *
 * Exported for unit testing.
 */
export function matchesTriggerConfig(
  triggerType: TriggerType,
  config: Record<string, unknown>,
  meta: TriggerMeta,
): boolean {
  if (triggerType === "quiz_completed") {
    // quiz_completed fires on any quiz completion — config is always {}.
    return true;
  }

  if (triggerType === "status_change") {
    // If config specifies a to_status, it must match the event's to_status.
    // If config is empty, any status change matches.
    if (config.to_status && config.to_status !== meta.to_status) {
      return false;
    }
    return true;
  }

  return false;
}
