// GET /trial/[token]
//
// Entry point for the standalone Brand OS trip-wire path. The token is a
// signed bearer credential — we decode it, verify the signature, look up
// the buyer's run state, and redirect into Brand OS.
//
// First visit: auto-creates a Full Brand OS run.
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

  // Look up the buyer's runs. Trial buyers always run the Full variant.
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

  // Completed → output page (token-scoped)
  if (complete) {
    return NextResponse.redirect(new URL(`/trial/${token}/output/${complete.id}`, _request.url));
  }

  // In progress → resume
  if (inProgress) {
    return NextResponse.redirect(new URL(`/trial/${token}/run/${inProgress.id}`, _request.url));
  }

  // No run yet → create a new Full run and drop them in.
  const { data: coach } = await admin
    .from("cp_coaches")
    .select("audience_serves, voice_profile_slug")
    .eq("id", coachId)
    .maybeSingle();
  const audienceServes = (coach as { audience_serves?: string } | null)?.audience_serves;
  const initialAudience: "M" | "W" | "X" =
    audienceServes === "men"   ? "M"
    : audienceServes === "women" ? "W"
    : "X";
  const profileSlug = (coach as { voice_profile_slug?: string } | null)?.voice_profile_slug ?? null;

  const { data: created, error: createErr } = await admin
    .from("cp_brand_os_runs")
    .insert({
      coach_id: coachId,
      variant: "full",
      audience: initialAudience,
      voice_profile_slug: profileSlug,
      current_module: "preflight",
      current_question_id: "preflight.audience",
    })
    .select("id")
    .single();
  if (createErr || !created) {
    console.error("[trial/[token]] run create failed:", createErr);
    return NextResponse.redirect(new URL(`/brand-os/trial/expired?reason=run_create_failed`, _request.url));
  }

  return NextResponse.redirect(new URL(`/trial/${token}/run/${created.id}`, _request.url));
}
