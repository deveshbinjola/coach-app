// POST /brand-os/start — create a new run and redirect into it.
//
// Form-posted from the landing page. We need the variant (mvp|full|designed).
// The audience signal is captured as the first question of the run, so we
// initialize the run with a placeholder and let the UI lock the audience
// when the coach answers the pre-flight question.
//
// v5 (2026-06-06): New runs default to variant='designed', variant_v='v5',
// and tier='snapshot'. The coach starts on the free 5-question Snapshot. The
// $7 payment via tripwire-provision flips tier='full_round' later.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { logFunnelEvent } from "@/lib/funnel-log";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const form = await request.formData();
  const rawVariant = (form.get("variant") ?? "").toString();
  // Default new runs to the v5 designed variant. Legacy variants only when
  // explicitly requested (admin / staging tests).
  const variant: "mvp" | "full" | "designed" =
    rawVariant === "mvp" ? "mvp"
    : rawVariant === "full" ? "full"
    : "designed";

  const rawTier = (form.get("tier") ?? "").toString();
  const tier: "snapshot" | "full_round" | null =
    rawTier === "full_round" ? "full_round"
    : variant === "designed" ? "snapshot"
    : null;

  const variant_v: "v5" | "legacy" = variant === "designed" ? "v5" : "legacy";

  // Pre-flight default audience = X (Mixed). Locks to M/W/X on first answer.
  const { data: coachRow } = await supabase
    .from("cp_coaches")
    .select("voice_profile_slug, audience_serves")
    .eq("id", user.id)
    .maybeSingle();
  const profileSlug = (coachRow as { voice_profile_slug?: string } | null)?.voice_profile_slug ?? null;
  const audienceServes = (coachRow as { audience_serves?: string } | null)?.audience_serves;

  const initialAudience: "M" | "W" | "X" =
    audienceServes === "men"   ? "M"
    : audienceServes === "women" ? "W"
    : "X";

  // First question depends on the tier. For v5 snapshot, start at the new
  // snapshot.audience prompt. For legacy, keep the existing preflight start.
  const firstQuestionId =
    variant_v === "v5" && tier === "snapshot" ? "snapshot.audience"
    : variant_v === "v5" && tier === "full_round" ? "round.landing_state"
    : "preflight.audience";

  const firstModule =
    variant_v === "v5" && tier === "snapshot" ? "snapshot"
    : variant_v === "v5" && tier === "full_round" ? "round"
    : "preflight";

  const { data: created, error } = await supabase
    .from("cp_brand_os_runs")
    .insert({
      coach_id: user.id,
      variant,
      variant_v,
      tier,
      audience: initialAudience,
      voice_profile_slug: profileSlug,
      current_module: firstModule,
      current_question_id: firstQuestionId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.redirect(new URL(`/brand-os?error=${encodeURIComponent(error?.message ?? "create_failed")}`, request.url));
  }
  void logFunnelEvent(user.id, "brand_os_started", { variant, variant_v, tier });

  return NextResponse.redirect(new URL(`/brand-os/run/${created.id}`, request.url), { status: 303 });
}
