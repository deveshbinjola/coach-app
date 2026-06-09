// /brand-os/unlock/[runId] · the hour-24 Kahneman question · v5
//
// After the 24-hour hold expires, the coach lands here. We show two pieces:
// their three sentences (placeholder for now; future v5 captures these
// during the Plan tier) and the agent-polished draft. The coach picks
// whichever is "more them". The choice unlocks the export.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import UnlockCheckClient from "@/components/brand-os/UnlockCheckClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  coach_id: string;
  hold_until: string | null;
  unlocked_at: string | null;
  held_draft: { body?: string } | null;
};

export default async function UnlockPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, coach_id, hold_until, unlocked_at, held_draft")
    .eq("id", params.runId)
    .eq("coach_id", user.id)
    .maybeSingle<RunRow>();

  if (!run) notFound();
  if (run.unlocked_at) {
    redirect(`/brand-os/run/${params.runId}/output`);
  }

  // If hold has not yet expired, bounce back to the hold screen.
  if (run.hold_until && new Date(run.hold_until).getTime() > Date.now()) {
    redirect(`/brand-os/hold/${params.runId}`);
  }

  // Pull round.landing_state answer for the "three sentences" slot.
  // (Until a dedicated three-sentence capture lands, this stands in.)
  const { data: landing } = await supabase
    .from("cp_brand_os_answers")
    .select("refined_text, raw_text")
    .eq("run_id", params.runId)
    .eq("question_id", "round.landing_state")
    .maybeSingle();
  const threeSentences = (landing?.refined_text ?? landing?.raw_text ?? "").toString();

  const agentDraft = run.held_draft?.body ?? "";

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <UnlockCheckClient
        runId={params.runId}
        threeSentences={threeSentences}
        agentDraft={agentDraft}
      />
    </div>
  );
}
