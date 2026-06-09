// /brand-os/hold/[runId] · the 24-hour Tartt integration hold · v5
//
// After the coach finishes the Full Round, FullRoundRunner sets hold_until
// and routes here. The HoldScreen renders a live countdown. Coach can read
// the draft inline but the .md export endpoint returns 423 until hold expires.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import HoldScreenClient from "@/components/brand-os/HoldScreenClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  coach_id: string;
  hold_until: string | null;
  unlocked_at: string | null;
};

export default async function HoldPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, coach_id, hold_until, unlocked_at")
    .eq("id", params.runId)
    .eq("coach_id", user.id)
    .maybeSingle<RunRow>();

  if (!run) notFound();

  // Already unlocked. Bounce to the output.
  if (run.unlocked_at) {
    redirect(`/brand-os/run/${params.runId}/output`);
  }

  // No hold set yet means the Full Round generator hasn't finished.
  if (!run.hold_until) {
    redirect(`/brand-os/run/${params.runId}`);
  }

  // Hold already expired but unlock check not done. Route to unlock.
  if (new Date(run.hold_until).getTime() < Date.now()) {
    redirect(`/brand-os/unlock/${params.runId}`);
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <HoldScreenClient runId={params.runId} holdUntil={run.hold_until} />
    </div>
  );
}
