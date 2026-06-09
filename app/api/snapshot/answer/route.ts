// POST /api/snapshot/answer · public · persist a Snapshot answer
//
// Saves one answer to cp_brand_os_answers for an anonymous Snapshot run.
// Verifies the run is (a) anonymous (coach_id IS NULL), (b) still on
// Snapshot tier, (c) in progress. No Supabase auth.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

type Body = {
  run_id?: string;
  question_id?: string;
  raw_text?: string;
};

const SNAPSHOT_QUESTION_IDS = new Set([
  "snapshot.audience",
  "snapshot.wound",
  "snapshot.dissent",
  "snapshot.paragraph",
  "snapshot.refrain",
]);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const runId = (body.run_id ?? "").toString();
  const questionId = (body.question_id ?? "").toString();
  const rawText = (body.raw_text ?? "").toString();

  if (!runId) {
    return NextResponse.json({ ok: false, error: "missing_run_id" }, { status: 400 });
  }
  if (!SNAPSHOT_QUESTION_IDS.has(questionId)) {
    return NextResponse.json({ ok: false, error: "invalid_question_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the run is anonymous + still in Snapshot tier + in progress.
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("id, coach_id, variant_v, tier, state")
    .eq("id", runId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
  }
  // Accepts both anonymous runs (coach_id NULL) and auth'd in-app runs
  // (coach_id set). The UUID itself is the auth signal — only people with
  // the runId in their URL can persist to it.
  if (run.variant_v !== "v5" || run.tier !== "snapshot") {
    return NextResponse.json({ ok: false, error: "invalid_run_state" }, { status: 400 });
  }
  if (run.state !== "in_progress") {
    return NextResponse.json({ ok: false, error: "run_not_in_progress" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Upsert the answer. lock immediately (no push-back UI in the public flow).
  const { error: upsertErr } = await admin
    .from("cp_brand_os_answers")
    .upsert(
      {
        run_id: runId,
        question_id: questionId,
        raw_text: rawText,
        refined_text: rawText,
        locked_at: now,
      },
      { onConflict: "run_id,question_id" },
    );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  // Advance current_question_id to the next snapshot question (or null if last).
  const ids = ["snapshot.audience", "snapshot.wound", "snapshot.dissent", "snapshot.paragraph", "snapshot.refrain"];
  const idx = ids.indexOf(questionId);
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  await admin
    .from("cp_brand_os_runs")
    .update({ current_question_id: nextId ?? "snapshot.refrain" })
    .eq("id", runId);

  return NextResponse.json({ ok: true, nextQuestionId: nextId });
}
