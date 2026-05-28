// lib/funnel-log.ts
//
// Server-side, fire-and-forget funnel event logger. Callers use:
//   void logFunnelEvent(coachId, "signup_completed");
// Never await it in the request path and never let it throw — telemetry
// must not break a user flow. Writes via the service-role admin client
// (the table has no authenticated INSERT policy by design).

import { createAdminClient } from "@/lib/supabase-admin";
import { isFunnelEvent, type FunnelEventName } from "@/lib/funnel";
import { checkSequenceTriggers } from "@/lib/sequence-triggers";

type LeadContext = {
  id: string;
  coach_id: string;
  email: string | null;
};

export async function logFunnelEvent(
  coachId: string | null | undefined,
  name: FunnelEventName,
  meta: Record<string, unknown> = {},
  /** Optional lead context for sequence trigger detection. */
  lead?: LeadContext,
): Promise<void> {
  if (!coachId || !isFunnelEvent(name)) return;
  try {
    const admin = createAdminClient();
    await admin.from("cp_funnel_events").insert({ coach_id: coachId, name, meta });

    // Fire sequence triggers for quiz completion events.
    if (name === "quiz_completed" && lead) {
      void checkSequenceTriggers(coachId, "quiz_completed", lead);
    }
  } catch (err) {
    console.warn("[funnel] log failed:", name, err);
  }
}
