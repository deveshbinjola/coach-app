// /trial/[token]/run/[runId]
//
// Standalone Brand OS quiz page for $7 trip-wire buyers. No Supabase
// auth — the URL token is the credential. Reads everything via the
// admin client, scoped to the token's coach_id.

import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import BrandOsRunner from "@/components/brand-os/BrandOsRunner";
import TrialHeader from "@/components/brand-os/TrialHeader";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";
import {
  getQuestion,
  nextQuestionId,
  MODULE_ORDER,
  MVP_QUESTION_IDS,
  BRAND_OS_QUESTIONS,
} from "@/lib/brand-os/questions";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TrialRunPage({
  params,
}: {
  params: { token: string; runId: string };
}) {
  const verify = await verifyTrialToken(params.token);
  if (!verify.ok) redirect(`/brand-os/trial/expired?reason=${verify.reason}`);
  const { coachId } = verify.payload;

  const admin = createAdminClient();

  // Pull the run — admin-scoped read, gate by coach_id.
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("*")
    .eq("id", params.runId)
    .eq("coach_id", coachId)
    .maybeSingle();
  if (!run) notFound();

  // Already done → output page (token-scoped).
  if (run.state === "complete") {
    redirect(`/trial/${params.token}/output/${params.runId}`);
  }

  const startId = run.variant === "mvp" ? MVP_QUESTION_IDS[0] : BRAND_OS_QUESTIONS[0].id;
  const currentId = (run.current_question_id as string | null) ?? startId;
  const currentQ = getQuestion(currentId);
  if (!currentQ) notFound();
  const nextId = nextQuestionId(currentId, run.variant as "mvp" | "full");

  const { data: answers } = await admin
    .from("cp_brand_os_answers")
    .select("question_id, raw_text, refined_text, locked_at")
    .eq("run_id", params.runId);

  // Data isolation: trial buyers never see platform voice profile data,
  // even when their email matches an existing platform account. Trial
  // mode is a fresh, standalone experience — they paste samples in
  // Signal Q1 directly.
  const voiceSources: Array<{
    id: string;
    source_type: string;
    title: string;
    transcript: string;
    created_at: string;
  }> = [];

  // Pull email for the header.
  const { data: coachRow } = await admin
    .from("cp_coaches")
    .select("email")
    .eq("id", coachId)
    .maybeSingle();
  const buyerEmail = (coachRow?.email as string | null) ?? "";

  const totalQuestions = run.variant === "mvp" ? MVP_QUESTION_IDS.length : BRAND_OS_QUESTIONS.length;
  const lockedCount = (answers ?? []).filter((a) => a.locked_at).length;
  const progressPct = Math.round((lockedCount / totalQuestions) * 100);

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <TrialHeader email={buyerEmail} />
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
          trialToken={params.token}
          trialBasePath={`/trial/${params.token}`}
        />
      </main>
    </div>
  );
}

