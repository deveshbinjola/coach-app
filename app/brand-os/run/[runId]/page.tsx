// Brand OS Agent v2 — quiz runner.
//
// One question at a time. Auto-saves on every keystroke (debounced in the
// client). The server resolves the current question based on the run's
// current_question_id; the client handles advance / back / push-back.

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import BrandOsRunner from "@/components/brand-os/BrandOsRunner";
import SnapshotRunnerClient from "@/components/brand-os/SnapshotRunnerClient";
import FullRoundRunnerClient from "@/components/brand-os/FullRoundRunnerClient";
import {
  getQuestion,
  nextQuestionId,
  MODULE_ORDER,
  MVP_QUESTION_IDS,
  BRAND_OS_QUESTIONS,
} from "@/lib/brand-os/questions";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function BrandOsRunPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("*")
    .eq("id", params.runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) notFound();

  // Already complete → go to output.
  if (run.state === "complete") redirect(`/brand-os/run/${params.runId}/output`);

  // v5 dispatch happens server-side, before legacy quiz data is loaded.
  // SnapshotRunner / FullRoundRunner own their own state and persistence.
  const variantV = (run.variant_v as "legacy" | "v5" | null) ?? "legacy";
  const tier = (run.tier as "snapshot" | "full_round" | null) ?? null;
  if (variantV === "v5") {
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <Header
          email={user.email ?? ""}
          name={userDisplayName(user.user_metadata)}
          avatarUrl={userAvatarUrl(user.user_metadata)}
        />
        <main className="max-w-2xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
          {tier === "full_round" ? (
            <FullRoundRunnerClient
              runId={params.runId}
              audience={run.audience as "M" | "W" | "X"}
            />
          ) : (
            <SnapshotRunnerClient
              runId={params.runId}
              audience={run.audience as "M" | "W" | "X"}
            />
          )}
        </main>
      </div>
    );
  }

  // Resolve current question. If null/missing, start at the first question
  // of the variant.
  const startId = run.variant === "mvp" ? MVP_QUESTION_IDS[0] : BRAND_OS_QUESTIONS[0].id;
  const currentId = (run.current_question_id as string | null) ?? startId;
  const currentQ = getQuestion(currentId);
  if (!currentQ) notFound();

  const nextId = nextQuestionId(currentId, run.variant as "mvp" | "full");

  // Pull all existing answers so the client can prefill + show progress.
  const { data: answers } = await supabase
    .from("cp_brand_os_answers")
    .select("question_id, raw_text, refined_text, locked_at")
    .eq("run_id", params.runId);

  // Signal Module needs to know whether the coach already has voice samples
  // from /voice setup — if yes, we can offer "use these" instead of forcing
  // them to paste again. We only need the surface fields here.
  const { data: voiceSources } = await supabase
    .from("cp_voice_training_sources")
    .select("id, source_type, title, transcript, created_at")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Compute progress.
  const totalQuestions = run.variant === "mvp" ? MVP_QUESTION_IDS.length : BRAND_OS_QUESTIONS.length;
  const lockedCount = (answers ?? []).filter((a) => a.locked_at).length;
  const progressPct = Math.round((lockedCount / totalQuestions) * 100);

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-2xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <BrandOsRunner
          runId={params.runId}
          variant={run.variant as "mvp" | "full"}
          audience={run.audience as "M" | "W" | "X"}
          currentQuestionId={currentId}
          nextQuestionId={nextId}
          answers={(answers ?? []).map((a) => ({
            question_id: a.question_id,
            raw_text: a.raw_text,
            refined_text: a.refined_text,
            locked_at: a.locked_at,
          }))}
          totalQuestions={totalQuestions}
          lockedCount={lockedCount}
          progressPct={progressPct}
          moduleOrder={MODULE_ORDER}
          voiceSources={(voiceSources ?? []).map((s) => ({
            id: s.id as string,
            source_type: s.source_type as string,
            title: s.title as string,
            transcript: s.transcript as string,
            created_at: s.created_at as string,
          }))}
        />
      </main>
    </div>
  );
}
