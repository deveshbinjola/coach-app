// POST /api/trial/[token]/start — create a Brand OS run with the chosen variant.
//
// Posted from the variant picker page (/trial/[token]/start). Trial buyers
// paid for the $7 trip-wire and get to choose: the Quick Start MVP or the
// Full run. We verify the token, create the run with the picked variant,
// and redirect into the token-scoped runner.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const verify = await verifyTrialToken(token);
  if (!verify.ok) {
    return NextResponse.redirect(
      new URL(`/brand-os/trial/expired?reason=${verify.reason}`, request.url)
    );
  }
  const { coachId } = verify.payload;

  const form = await request.formData();
  const variant = form.get("variant") === "mvp" ? "mvp" : "full";

  const admin = createAdminClient();

  // If a run already exists, don't create a duplicate — bounce back through
  // the entry route, which routes to resume/output.
  const { data: existing } = await admin
    .from("cp_brand_os_runs")
    .select("id")
    .eq("coach_id", coachId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.redirect(new URL(`/trial/${token}`, request.url), { status: 303 });
  }

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
      variant,
      audience: initialAudience,
      voice_profile_slug: profileSlug,
      current_module: "preflight",
      current_question_id: "preflight.audience",
    })
    .select("id")
    .single();
  if (createErr || !created) {
    console.error("[api/trial/[token]/start] run create failed:", createErr);
    return NextResponse.redirect(
      new URL(`/brand-os/trial/expired?reason=run_create_failed`, request.url)
    );
  }

  return NextResponse.redirect(
    new URL(`/trial/${token}/run/${created.id}`, request.url),
    { status: 303 }
  );
}
