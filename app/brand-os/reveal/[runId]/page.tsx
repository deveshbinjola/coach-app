// /brand-os/reveal/[runId] · the Snapshot reveal · v5
//
// After the coach completes the 5 Snapshot questions, SnapshotRunner routes
// here. We hydrate the SnapshotReveal payload from cp_brand_os_runs columns
// (archetype, voice_profile, pillars) populated by snapshot-generator.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SnapshotRevealClient from "@/components/brand-os/SnapshotRevealClient";
import type { SnapshotPayload } from "@/components/brand-os/SnapshotReveal";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  coach_id: string;
  archetype: SnapshotPayload["archetype"] | null;
  voice_profile: { texture?: [string, string, string]; archetype_statement?: string; the_move?: string } | null;
  pillars: { cornerstone?: string; edge?: string; teaching?: string } | null;
};

export default async function SnapshotRevealPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, coach_id, archetype, voice_profile, pillars")
    .eq("id", params.runId)
    .eq("coach_id", user.id)
    .maybeSingle<RunRow>();

  if (!run) notFound();
  if (!run.archetype || !run.voice_profile) {
    // Snapshot generator hasn't run yet. Bounce to the runner.
    redirect(`/brand-os/run/${params.runId}`);
  }

  const firstName = userDisplayName(user.user_metadata)?.split(/[\s.]/)[0];

  const payload: SnapshotPayload = {
    firstName,
    archetype: run.archetype,
    archetypeStatement: run.voice_profile.archetype_statement ?? "",
    voiceTexture: (run.voice_profile.texture ?? ["GROUNDED", "DIRECT", "POETIC"]) as [string, string, string],
    theMoveYouMissed: run.voice_profile.the_move ?? "",
    pillarSeeds: {
      cornerstone: run.pillars?.cornerstone ?? "",
      edge: run.pillars?.edge ?? "",
      teaching: run.pillars?.teaching ?? "",
    },
  };

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <SnapshotRevealClient runId={params.runId} payload={payload} />
    </div>
  );
}
