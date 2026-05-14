// /trial/[token]/output/[runId]
//
// Standalone Brand OS deliverable page for trial buyers. Uses admin
// client + token validation; no Supabase auth required.

import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";
import { Badge } from "@/components/ui";
import SynthesisRenderer from "@/components/brand-os/SynthesisRenderer";
import TrialHeader from "@/components/brand-os/TrialHeader";
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
      <TrialHeader email={defaultEmail} />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-8 sm:py-10 space-y-8 print:max-w-none print:py-4">

        <section className="border-b border-[var(--border)] pb-6 space-y-2">
          <Badge tone="brand" size="xs" uppercase>
            Brand OS · {run.variant === "mvp" ? "Quick Start" : "Full Run"}
          </Badge>
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

        {/* Post-Brand-OS invitation. Frames the platform as where the
            Brand OS does its work — not as a "trial to sell." */}
        <section className="rounded-[var(--r-lg)] border-2 border-[var(--brand-strong)] bg-[linear-gradient(135deg,var(--brand-soft)_0%,var(--surface-elevated)_100%)] p-6 sm:p-8 space-y-5 print:hidden">
          <Badge tone="brand" size="xs" uppercase>You finished Brand OS</Badge>
          <h2 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
            Did that feel like you?
          </h2>
          <p className="text-[color:var(--text)] leading-relaxed text-[length:var(--t-body)]">
            If yes, there's more. Your Brand OS is the fuel. The platform is where it does the work — <strong>drafts in your voice</strong>, <strong>replies to your leads</strong>, <strong>notes for the clients you already have</strong>.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            <UpsellCard
              eyebrow="Studio"
              title="Drafts that sound like you."
              body="Every post, every caption, every newsletter — runs through your voice DNA before it lands in front of you."
            />
            <UpsellCard
              eyebrow="Inbox"
              title="Reply to leads in your voice."
              body="AI drafts the response from your samples. You edit. You send. Seconds, not hours."
            />
            <UpsellCard
              eyebrow="Clients"
              title="One room per paying buyer."
              body="Session prep, notes, content built for them. All in one place. Powered by your DNA."
            />
          </div>

          <div className="pt-3 border-t border-[color-mix(in_srgb,var(--brand)_25%,var(--border))] flex items-center justify-between flex-wrap gap-3">
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Free for 14 days · No card · Your Brand OS is yours forever
            </p>
            <a
              href="/login?upgrade=trial"
              className="inline-flex items-center justify-center h-11 px-6 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-body)] font-bold hover:bg-[color-mix(in_srgb,var(--brand)_85%,black)] transition"
            >
              Explore the platform →
            </a>
          </div>
        </section>

      </main>
    </div>
  );
}

function UpsellCard({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[var(--surface-elevated)] p-4 space-y-1.5">
      <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--brand-strong)]">
        {eyebrow}
      </p>
      <p className="font-bold text-[color:var(--text)] leading-snug">{title}</p>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

