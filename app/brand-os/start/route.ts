// POST /brand-os/start — create a new run and redirect into it.
//
// Form-posted from the landing page. We need the variant (mvp|full). The
// audience signal is captured as the first question of the run (preflight.audience),
// so we initialize the run with a placeholder and let the UI lock the audience
// when the coach answers the pre-flight question.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const form = await request.formData();
  const variant = form.get("variant") === "mvp" ? "mvp" : "full";

  // Pre-flight default audience = X (Mixed). Locks to M/W/X on first answer.
  // Pulls the coach's existing voice_profile_slug as a memo so we can match it
  // up post-run.
  const { data: coachRow } = await supabase
    .from("cp_coaches")
    .select("voice_profile_slug, audience_serves")
    .eq("id", user.id)
    .maybeSingle();
  const profileSlug = (coachRow as { voice_profile_slug?: string } | null)?.voice_profile_slug ?? null;
  const audienceServes = (coachRow as { audience_serves?: string } | null)?.audience_serves;

  // Pre-populate audience signal if the coach already answered onboarding.
  const initialAudience: "M" | "W" | "X" =
    audienceServes === "men"   ? "M"
    : audienceServes === "women" ? "W"
    : "X";

  const { data: created, error } = await supabase
    .from("cp_brand_os_runs")
    .insert({
      coach_id: user.id,
      variant,
      audience: initialAudience,
      voice_profile_slug: profileSlug,
      current_module: "preflight",
      current_question_id: "preflight.audience",
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.redirect(new URL(`/brand-os?error=${encodeURIComponent(error?.message ?? "create_failed")}`, request.url));
  }

  return NextResponse.redirect(new URL(`/brand-os/run/${created.id}`, request.url), { status: 303 });
}
