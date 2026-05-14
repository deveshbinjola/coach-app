// Brand OS Agent v2 — final output page.
//
// Hands off rendering to <SynthesisRenderer />, a client component that
// lazily POSTs to /api/brand-os/synthesize on first visit, caches the
// result on cp_brand_os_runs.synthesis_json, and renders a visual
// deliverable (Positioning → Voice DNA → Buyer Mirror → Pillars →
// Keywords → Hooks → Strengths/Gaps → Next Steps).
//
// Toolbar inside the renderer ships Print/PDF, Download .md, Copy as MD,
// Email (via Resend), and Regenerate.

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { Badge } from "@/components/ui";
import SynthesisRenderer from "@/components/brand-os/SynthesisRenderer";
import TrialUpgradeBanner from "@/components/brand-os/TrialUpgradeBanner";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function BrandOsOutputPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, audience, variant, completed_at, synthesis_json")
    .eq("id", params.runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) notFound();

  const audience = run.audience as "M" | "W" | "X";
  const synthesis = (run.synthesis_json ?? null) as BrandOsSynthesis | null;

  // Plan-aware: $7 trip-wire buyers (plan='trial') see the platform
  // upgrade banner. Full coaches on MVP see the existing "go deeper"
  // Full Run upsell.
  const { data: coachRow } = await supabase
    .from("cp_coaches")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const isTrialTier = (coachRow?.plan as string | null) === "trial";

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-8 sm:py-10 space-y-8 print:max-w-none print:py-4">

        {/* Header */}
        <section className="border-b border-[var(--border)] pb-6 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="brand" size="xs" uppercase>
              Brand OS · {run.variant === "mvp" ? "Quick Start" : "Full Run"}
            </Badge>
            <Badge tone="muted" size="xs" uppercase>Audience {audience}</Badge>
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
          defaultEmail={user.email ?? ""}
        />

        {/* $7 tripwire buyers — surface the 10-day free platform trial. */}
        {isTrialTier && <TrialUpgradeBanner />}

        {/* MVP completers on the full platform — surface the Full Run
            upgrade without yanking them away from the deliverable they
            just opened. (Trial-tier coaches don't see this — they get
            the platform upgrade above instead.) */}
        {run.variant === "mvp" && !isTrialTier && (
          <section className="rounded-[var(--r-lg)] border-2 border-dashed border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[var(--surface-elevated)] p-5 sm:p-6 print:hidden">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 space-y-1">
                <Badge tone="brand" size="xs" uppercase>You finished the MVP</Badge>
                <h2 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
                  Want to go deeper?
                </h2>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed max-w-xl">
                  The MVP covers <strong>positioning, voice, and 3 pillars</strong>. The Full Run adds <strong>Funnel</strong>, <strong>Distribution</strong>, and a <strong>45-day Pólya calendar</strong> — 6 modules, ~60 questions. Your MVP answers carry over.
                </p>
              </div>
              <a
                href="/brand-os#start-full"
                className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] border-2 border-[var(--brand-strong)] bg-[var(--brand-soft)] text-[color:var(--text)] text-[length:var(--t-body)] font-bold hover:bg-[var(--brand)] hover:text-[color:var(--surface)] transition whitespace-nowrap"
              >
                Run Full Brand OS →
              </a>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
