// GET /trial/[token]
//
// Entry point for the standalone Brand OS trip-wire path. The token is a
// signed bearer credential — we decode it, verify the signature, look up
// the buyer's run state, and redirect into Brand OS.
//
// First visit: redirects to the variant picker (/trial/[token]/start) so
// the buyer chooses Quick Start MVP vs Full run.
// Return visit: routes to the resume URL (in-progress run) or output page
// (completed run).
//
// Failure modes redirect to /brand-os/trial/expired.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";

export const runtime = "edge";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const verify = await verifyTrialToken(token);
  if (!verify.ok) {
    return NextResponse.redirect(new URL(`/brand-os/trial/expired?reason=${verify.reason}`, _request.url));
  }
  const { coachId } = verify.payload;

  // Look up the buyer's runs.
  const admin = createAdminClient();
  const { data: runs } = await admin
    .from("cp_brand_os_runs")
    .select("id, state, variant, synthesis_json, synthesized_at, started_at, current_question_id")
    .eq("coach_id", coachId)
    .order("started_at", { ascending: false })
    .limit(5);

  const rows = (runs ?? []) as Array<{
    id: string;
    state: string | null;
    variant: string | null;
    synthesis_json: unknown;
    synthesized_at: string | null;
    started_at: string;
    current_question_id: string | null;
  }>;

  const complete   = rows.find((r) => r.state === "complete" && r.synthesis_json);
  const inProgress = rows.find((r) => r.state === "active" || r.state === null || r.state === "draft");
  const anyRun     = rows[0];

  // Completed → output page (token-scoped)
  if (complete) {
    return NextResponse.redirect(new URL(`/trial/${token}/output/${complete.id}`, _request.url));
  }

  // In progress → resume
  if (inProgress) {
    return NextResponse.redirect(new URL(`/trial/${token}/run/${inProgress.id}`, _request.url));
  }

  // Run exists but in an unexpected state (e.g. "synthesizing", "complete"
  // without synthesis_json) → send to the runner so it can recover rather
  // than looping between /start and this route.
  if (anyRun) {
    return NextResponse.redirect(new URL(`/trial/${token}/run/${anyRun.id}`, _request.url));
  }

  // No run yet → let the buyer choose Quick Start MVP vs Full run.
  return NextResponse.redirect(new URL(`/trial/${token}/start`, _request.url));
}
