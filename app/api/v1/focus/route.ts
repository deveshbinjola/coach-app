// GET /api/v1/focus: the same urgency x score ranking Command Center uses.
// The agent's primary "what should I do now" surface.
//
// Returns the top N (default 8) non-terminal leads ranked by:
//   1. SLA priority (overdue > warning > on_pace, terminal excluded)
//   2. score (computed from temperature, discovery, pain count, recency)
//   3. SLA hours-elapsed (longer = more urgent within bucket)

import { NextRequest } from "next/server";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { computeLeadScore } from "@/lib/lead-score";
import { assessSla, type SlaState } from "@/lib/lead-sla";
import type { Lead } from "@/lib/types";

export const runtime = 'edge';

const SLA_PRIORITY: Record<SlaState, number> = {
  overdue: 3,
  warning: 2,
  on_pace: 1,
  not_applicable: 0,
};

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "8", 10) || 8, 1),
    50
  );

  const admin = createAdminClient();
  const { data: leads, error } = await admin
    .from("cp_leads")
    .select("*")
    .eq("coach_id", auth.coachId)
    .not("status", "in", "(client,closed_lost)");

  if (error) return apiError(error.message, 500);

  const now = Date.now();
  const ranked = (leads ?? [])
    .map((l: Lead) => ({ lead: l, score: computeLeadScore(l, now), sla: assessSla(l) }))
    .filter((e) => e.sla.state !== "not_applicable")
    .sort((a, b) => {
      const rA = SLA_PRIORITY[a.sla.state] * 10000 + a.score;
      const rB = SLA_PRIORITY[b.sla.state] * 10000 + b.score;
      if (rB !== rA) return rB - rA;
      return (b.sla.hoursElapsed ?? 0) - (a.sla.hoursElapsed ?? 0);
    })
    .slice(0, limit);

  return apiOk({
    focus: ranked.map(({ lead, score, sla }) => ({
      lead,
      score,
      sla_state: sla.state,
      sla_hours_elapsed: sla.hoursElapsed,
      sla_label: sla.label,
    })),
    total_active: leads?.length ?? 0,
    generated_at: new Date(now).toISOString(),
  });
}
