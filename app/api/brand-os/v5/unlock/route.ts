// POST /api/brand-os/v5/unlock · the hour-24 unlock check · v5
//
// Coach picks "three sentences" or "agent draft" in the unlock check. We set
// cp_brand_os_runs.unlocked_at = NOW(), record which choice they made, and
// from this moment the .md export endpoint returns the file.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const runId = (body?.run_id ?? "").toString();
  const winner = (body?.winner ?? "").toString();

  if (!runId) return NextResponse.json({ ok: false, error: "missing_run_id" }, { status: 400 });
  if (winner !== "three_sentences" && winner !== "agent_draft") {
    return NextResponse.json({ ok: false, error: "invalid_winner" }, { status: 400 });
  }

  // Verify the run belongs to this coach.
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, coach_id, hold_until, unlocked_at, voice_profile")
    .eq("id", runId)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!run) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Idempotent: if already unlocked, return success.
  if (run.unlocked_at) {
    return NextResponse.json({ ok: true, already_unlocked: true });
  }

  // Verify the hold has actually expired.
  if (run.hold_until && new Date(run.hold_until).getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: "hold_not_expired" }, { status: 403 });
  }

  // Update with the winner stamped in voice_profile.
  const voiceProfile = (run.voice_profile ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  await supabase
    .from("cp_brand_os_runs")
    .update({
      unlocked_at: now,
      voice_profile: {
        ...voiceProfile,
        unlock_winner: winner,
        unlocked_at: now,
      },
    })
    .eq("id", runId);

  return NextResponse.json({ ok: true });
}
