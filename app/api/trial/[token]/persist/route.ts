// POST /api/trial/[token]/persist
//
// Single proxy endpoint for every database write the Brand OS runner
// needs to make. Validates the trial token, verifies that the resource
// being written belongs to the token's coach, then performs the write
// with the admin client.
//
// The runner sends { op, ... } payloads:
//   - upsert_answer  { run_id, question_id, module, raw_text }
//   - lock_answer    { run_id, question_id }
//   - set_current_question { run_id, current_question_id, current_module }
//   - complete_run   { run_id }
//   - set_audience   { run_id, audience }
//   - log_pushback   { run_id, module, question_id, user_original,
//                      option_a, option_b, action, override_reason? }

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";

export const runtime = "edge";

type Op =
  | { op: "upsert_answer"; run_id: string; question_id: string; module: string; raw_text: string }
  | { op: "lock_answer"; run_id: string; question_id: string }
  | { op: "set_current_question"; run_id: string; current_question_id: string; current_module: string }
  | { op: "complete_run"; run_id: string }
  | { op: "set_audience"; run_id: string; audience: "M" | "W" | "X" }
  | {
      op: "log_pushback";
      run_id: string;
      module: string;
      question_id: string;
      user_original: string;
      option_a?: string;
      option_b?: string;
      action: "pick_a" | "pick_b" | "override";
      override_reason?: string;
    };

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const verify = await verifyTrialToken(params.token);
  if (!verify.ok) {
    return NextResponse.json({ error: "invalid_token", reason: verify.reason }, { status: 401 });
  }
  const { coachId } = verify.payload;

  let body: Op;
  try {
    body = (await request.json()) as Op;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Every op references a run_id. Verify it belongs to this token's coach
  // ONCE up-front, then perform the write. Cheap, prevents cross-coach leakage.
  const runId = (body as { run_id?: string }).run_id;
  if (!runId) return NextResponse.json({ error: "missing_run_id" }, { status: 400 });
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("id, coach_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  if (run.coach_id !== coachId) {
    return NextResponse.json({ error: "run_not_yours" }, { status: 403 });
  }

  const now = new Date().toISOString();

  switch (body.op) {
    case "upsert_answer": {
      const { error } = await admin
        .from("cp_brand_os_answers")
        .upsert({
          run_id: body.run_id,
          module: body.module,
          question_id: body.question_id,
          raw_text: body.raw_text,
          updated_at: now,
        }, { onConflict: "run_id,question_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "lock_answer": {
      const { error } = await admin
        .from("cp_brand_os_answers")
        .update({ locked_at: now })
        .eq("run_id", body.run_id)
        .eq("question_id", body.question_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "set_current_question": {
      const { error } = await admin
        .from("cp_brand_os_runs")
        .update({
          current_question_id: body.current_question_id,
          current_module: body.current_module,
        })
        .eq("id", body.run_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "complete_run": {
      const { error } = await admin
        .from("cp_brand_os_runs")
        .update({ state: "complete", completed_at: now })
        .eq("id", body.run_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "set_audience": {
      const { error } = await admin
        .from("cp_brand_os_runs")
        .update({ audience: body.audience })
        .eq("id", body.run_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "log_pushback": {
      const { error } = await admin.from("cp_brand_os_pushbacks").insert({
        run_id: body.run_id,
        module: body.module,
        question_id: body.question_id,
        user_original: body.user_original,
        option_a: body.option_a ?? "",
        option_b: body.option_b ?? "",
        action: body.action,
        override_reason: body.override_reason ?? null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown_op" }, { status: 400 });
  }
}
