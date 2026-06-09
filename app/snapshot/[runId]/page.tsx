// /snapshot/[runId] · public · the runner page (no auth)
//
// Server component. Loads the run via admin client (UUID = credential),
// hydrates PublicSnapshotRunner with audience + first name + current question.
// Routes here from /snapshot landing (after email gate).

import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import PublicSnapshotRunner from "@/components/snapshot/PublicSnapshotRunner";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function PublicSnapshotRun({ params }: { params: { runId: string } }) {
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("id, coach_id, claimed_at, variant_v, tier, state, audience, first_name_for_claim, current_question_id, archetype")
    .eq("id", params.runId)
    .maybeSingle();

  if (!run) notFound();

  // Defense: if the run was claimed by a coach already, bounce to the
  // in-app version so they continue logged in.
  if (run.coach_id || run.claimed_at) {
    redirect(`/brand-os/run/${params.runId}`);
  }

  if (run.variant_v !== "v5" || run.tier !== "snapshot") {
    notFound();
  }

  // If generator already ran, jump to the reveal.
  if (run.archetype) {
    redirect(`/snapshot/reveal/${params.runId}`);
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <span className="font-display text-lg font-bold text-[color:var(--text)]">
            Brand OS
          </span>
          <span className="text-xs uppercase tracking-wider text-[color:var(--text-faint)]">
            Snapshot · free
          </span>
        </div>
      </header>
      <main>
        <PublicSnapshotRunner
          runId={params.runId}
          audience={(run.audience as "M" | "W" | "X") ?? "X"}
          firstName={run.first_name_for_claim as string | null}
          startQuestionId={(run.current_question_id as string | null) ?? undefined}
        />
      </main>
    </div>
  );
}
