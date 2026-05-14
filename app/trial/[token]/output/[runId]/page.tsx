// /trial/[token]/output/[runId]
//
// Standalone Brand OS deliverable page for trial buyers. Uses admin
// client + token validation; no Supabase auth required.

import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";
import { Badge } from "@/components/ui";
import SynthesisRenderer from "@/components/brand-os/SynthesisRenderer";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TrialOutputPage({
  params,
}: {
  params: { token: string; runId: string };
}) {
  const verify = await verifyTrialToken(params.token);
  if (!verify.ok) redirect(`/brand-os/trial/expired?reason=${verify.reason}`);
  const { coachId } = verify.payload;

  const admin = createAdminClient();
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("id, audience, variant, completed_at, synthesis_json")
    .eq("id", params.runId)
    .eq("coach_id", coachId)
    .maybeSingle();
  if (!run) notFound();

  const audience = run.audience as "M" | "W" | "X";
  const synthesis = (run.synthesis_json ?? null) as BrandOsSynthesis | null;
  const { data: coachRow } = await admin
    .from("cp_coaches")
    .select("email")
    .eq("id", coachId)
    .maybeSingle();
  const defaultEmail = (coachRow?.email as string | null) ?? "";

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <TrialHeader token={params.token} />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-8 sm:py-10 space-y-8 print:max-w-none print:py-4">

        <section className="border-b border-[var(--border)] pb-6 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="brand" size="xs" uppercase>
              Brand OS · {run.variant === "mvp" ? "Quick Start" : "Full Run"}
            </Badge>
            <Badge tone="muted" size="xs" uppercase>Audience {audience}</Badge>
            <Badge tone="muted" size="xs" uppercase>Trial access</Badge>
          </div>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            Your Brand OS
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            {run.completed_at ? `Completed ${new Date(run.completed_at).toLocaleDateString()}` : "Draft"}
            {" · "}A working deliverable. Download, print, or paste into the AI of your choice.
          </p>
        </section>

        <SynthesisRenderer
          runId={run.id}
          initialSynthesis={synthesis}
          defaultEmail={defaultEmail}
          trialToken={params.token}
        />

        {/* Trial-tier upgrade prompt — points back into the platform with
            a real sign-up flow when the buyer is ready. */}
        <section className="rounded-[var(--r-lg)] border-2 border-[var(--brand-strong)] bg-[linear-gradient(135deg,var(--brand-soft)_0%,var(--surface-elevated)_100%)] p-6 sm:p-8 space-y-4 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="brand" size="xs" uppercase>You finished Brand OS</Badge>
            <Badge tone="muted" size="xs" uppercase>What's next</Badge>
          </div>
          <h2 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
            Want the rest of the platform free for 10 days?
          </h2>
          <p className="text-[color:var(--text)] leading-relaxed">
            Your Brand OS gave you the fuel. The full platform turns it into <strong>drafts that sound like you</strong>, a <strong>lead inbox</strong> in your voice, and a <strong>client room</strong> for every paying buyer.
          </p>
          <a
            href="/login?upgrade=trial"
            className="inline-flex items-center justify-center h-11 px-6 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-body)] font-bold hover:bg-[color-mix(in_srgb,var(--brand)_85%,black)] transition"
          >
            Start 10-day free trial →
          </a>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No card on file. You'll log in with the email tied to your $7 purchase.
          </p>
        </section>

      </main>
    </div>
  );
}

function TrialHeader({ token }: { token: string }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 sm:px-8 flex items-center justify-between gap-3 print:hidden">
      <a href={`/trial/${token}`} className="flex items-center gap-2 text-[color:var(--text)] font-bold">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-[var(--brand-strong)] text-[color:var(--surface)] font-extrabold text-sm">B</span>
        <span>Brand OS</span>
      </a>
      <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-mono">
        Trial access · save this URL
      </span>
    </header>
  );
}
