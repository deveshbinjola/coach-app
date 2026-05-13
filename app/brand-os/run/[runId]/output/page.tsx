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

      </main>
    </div>
  );
}
