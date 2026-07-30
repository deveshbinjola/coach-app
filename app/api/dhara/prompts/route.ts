import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getBusinessPulse } from "@/lib/ambient";
import { buildStarterPrompts, tailoredGreeting, type DharaStats } from "@/lib/dhara/prompts";
import { hasBeenInterviewed, interviewOpener } from "@/lib/dhara/interview";
import type { CoachMemory } from "@/lib/dhara/memory";
import { userFirstName } from "@/lib/user-display";

export const runtime = "edge";

// Reverse-engineers tailored starter prompts from the coach's actual data.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const countOf = async (table: string, build?: (q: any) => any) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("coach_id", user.id);
    if (build) q = build(q);
    const { count } = await q;
    return count ?? 0;
  };

  const [pulse, leads, clients, quizzes, painRows] = await Promise.all([
    getBusinessPulse(user.id, now),
    countOf("cp_leads"),
    countOf("cp_leads", (q) => q.eq("status", "client")),
    countOf("cp_funnels"),
    supabase.from("cp_leads").select("primary_pain_point_id").eq("coach_id", user.id).not("primary_pain_point_id", "is", null),
  ]);

  // Top pain point by lead count.
  let topPainPoint: { name: string; count: number } | null = null;
  const tally = new Map<string, number>();
  for (const r of (painRows.data ?? []) as Array<{ primary_pain_point_id: string }>) {
    tally.set(r.primary_pain_point_id, (tally.get(r.primary_pain_point_id) ?? 0) + 1);
  }
  if (tally.size > 0) {
    const [topId, topN] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const { data: pt } = await supabase.from("cp_pain_points").select("name").eq("id", topId).eq("coach_id", user.id).maybeSingle();
    if (pt?.name) topPainPoint = { name: pt.name as string, count: topN };
  }

  const slipping = pulse.quietList.concat(pulse.heroItem ? [pulse.heroItem] : [])
    .filter((i) => i.source === "overdue").map((i) => i.leadName ?? "").filter(Boolean);

  const stats: DharaStats = {
    revenueCents: pulse.metrics.revenue.amount,
    leads,
    clients,
    quizzes,
    draftsReady: pulse.daySummary.draftsReady,
    topPainPoint,
    slipping,
  };

  // A coach the assistant has never met gets interviewed instead of
  // greeted. Starter prompts are suppressed so the one question on screen
  // is the only thing to answer.
  const { data: memRows } = await supabase
    .from("cp_coach_memory")
    .select("source, status")
    .eq("coach_id", user.id)
    .eq("status", "active");
  const interviewed = hasBeenInterviewed(
    (memRows ?? []) as Array<{ source: CoachMemory["source"]; status: CoachMemory["status"] }>,
  );

  if (!interviewed) {
    return NextResponse.json({
      prompts: [],
      greeting: interviewOpener(userFirstName(user.email, user.user_metadata)),
    });
  }

  return NextResponse.json({ prompts: buildStarterPrompts(stats), greeting: tailoredGreeting(stats) });
}
