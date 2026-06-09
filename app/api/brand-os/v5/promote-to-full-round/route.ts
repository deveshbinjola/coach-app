// POST /api/brand-os/v5/promote-to-full-round
//
// Brand OS is free. The Snapshot reveal CTA flips tier='snapshot' →
// 'full_round' on the same run, no payment. The runner page picks up
// at round.landing_state on the next render.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

type Body = { run_id?: string };

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const runId = (body.run_id ?? "").toString();
  if (!runId) {
    return NextResponse.json({ ok: false, error: "missing_run_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cp_brand_os_runs")
    .update({
      tier: "full_round",
      current_module: "round",
      current_question_id: "round.landing_state",
    })
    .eq("id", runId)
    .eq("coach_id", user.id)
    .eq("variant_v", "v5")
    .eq("tier", "snapshot")
    .eq("state", "in_progress");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
