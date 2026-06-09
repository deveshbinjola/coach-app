// /brand-os/start-snapshot · auto-creates a v5 Snapshot run for the
// signed-in coach and redirects them directly into Question 1.
//
// Used by the post-call email (Card 02 · "Start Brand OS"). After the
// magic-link signin, the auth callback respects ?next=/brand-os/start-snapshot
// and lands them here. This page provisions the run and bounces them
// into the runner so they never see the Brand OS landing picker.
//
// Idempotent: if the coach already has a v5 Snapshot run in progress,
// we resume it instead of starting a new one.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { logFunnelEvent } from "@/lib/funnel-log";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function StartSnapshotPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/brand-os/start-snapshot");

  // Resume any in-progress v5 Snapshot run before creating a new one.
  const { data: existing } = await supabase
    .from("cp_brand_os_runs")
    .select("id")
    .eq("coach_id", user.id)
    .eq("variant_v", "v5")
    .eq("tier", "snapshot")
    .eq("state", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    redirect(`/brand-os/run/${existing.id}`);
  }

  // Pull coach's voice profile + audience for the new run.
  const { data: coachRow } = await supabase
    .from("cp_coaches")
    .select("voice_profile_slug, audience_serves")
    .eq("id", user.id)
    .maybeSingle();
  const profileSlug = (coachRow as { voice_profile_slug?: string } | null)?.voice_profile_slug ?? null;
  const audienceServes = (coachRow as { audience_serves?: string } | null)?.audience_serves;
  const initialAudience: "M" | "W" | "X" =
    audienceServes === "men" ? "M"
    : audienceServes === "women" ? "W"
    : "X";

  const { data: created, error } = await supabase
    .from("cp_brand_os_runs")
    .insert({
      coach_id: user.id,
      variant: "designed",
      variant_v: "v5",
      tier: "snapshot",
      audience: initialAudience,
      voice_profile_slug: profileSlug,
      current_module: "snapshot",
      current_question_id: "snapshot.audience",
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(`/brand-os?error=${encodeURIComponent(error?.message ?? "snapshot_create_failed")}`);
  }

  void logFunnelEvent(user.id, "brand_os_started", { variant: "designed", variant_v: "v5", tier: "snapshot", source: "post_call_email" });

  redirect(`/brand-os/run/${created!.id}`);
}
